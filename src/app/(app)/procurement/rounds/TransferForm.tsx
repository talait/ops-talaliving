"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { MoneyInput } from "@/components/ui/money-input";
import { useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { accounting, procurement } from "@/demo/api";
import type { AccountBalance } from "@/services/accounting/contracts";
import type { RoundSummary } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";

/** Recording that the money moved — as two ledger legs and one round update.
 *
 *  A transfer between our own accounts is two rows, not one: out of the
 *  leadership account, into BCA 271. The old system recorded it once, on
 *  whichever side somebody happened to be looking at, and the two accounts
 *  then disagreed by exactly the amount that had moved.
 *
 *  The screen composes both services rather than either one reaching into the
 *  other (ADR-004): accounting writes the legs, procurement records that the
 *  round was funded. What it deliberately does NOT do is mark anything paid —
 *  money reaching our own account is not a vendor being paid (A10).
 */
export function TransferForm({
  round, onDone,
}: {
  round: RoundSummary;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [accounts] = useLoad(() => accounting.listAccounts(), []);
  const [fromId, setFromId] = useState("");
  const [amount, setAmount] = useState(round.to_transfer || round.requested_total);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const rows: AccountBalance[] = accounts.status === "ready" ? accounts.data : [];
  const sources = rows.filter((a) => a.custody === "leadership");
  const target = rows.find((a) => a.code === "BCA 271");

  useEffect(() => {
    setFromId((cur) => cur || sources[0]?.account_id || "");
  }, [sources]);

  useEffect(() => {
    setAmount(round.to_transfer || round.requested_total);
  }, [round.round_no, round.to_transfer, round.requested_total]);

  async function record() {
    if (!target) { toast("critical", "No paying account", "BCA 271 is not in the account list."); return; }
    setBusy(true);
    const label = `Round ${round.round_no} funding`;

    /* Out of the leadership account first: if the second leg fails, the books
       show money that left and has not landed, which is a state somebody can
       see and correct. The reverse would show money appearing from nowhere. */
    const out = await accounting.postTransaction({
      trx_date: date, account_id: fromId, direction: "OUT", amount_idr: amount,
      type_code: "CASHFLOW", description: `${label} — transfer to BCA 271`,
      source_ref: `round:${round.round_no}:out`,
    });
    if (out.error) {
      setBusy(false);
      toast(out.error.status === 403 ? "critical" : "warning", "Not recorded", out.error.message);
      return;
    }

    const inLeg = await accounting.postTransaction({
      trx_date: date, account_id: target.account_id, direction: "IN", amount_idr: amount,
      type_code: "CASHFLOW", description: `${label} — from ${rows.find((a) => a.account_id === fromId)?.code ?? "leadership"}`,
      source_ref: `round:${round.round_no}:in`,
    });
    if (inLeg.error) {
      setBusy(false);
      toast("critical", "Half recorded", `${out.data.trx_no} left the leadership account but the receiving leg failed: ${inLeg.error.message}`);
      return;
    }

    const res = await procurement.transferRound(round.round_no, {
      amount, trx_no: inLeg.data.trx_no,
    });
    setBusy(false);
    if (res.error) {
      toast("warning", "Ledger written, round unchanged", `${inLeg.data.trx_no} is posted. ${res.error.message}`);
      return;
    }
    toast("success", `Transferred ${formatIDR(amount)}`, `${inLeg.data.trx_no} — no item is paid by this`);
    onDone();
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="tf-date" className="block text-xs text-slate-500">Date</label>
          <input
            id="tf-date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="tf-from" className="block text-xs text-slate-500">From</label>
          <select
            id="tf-from" value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
          >
            {sources.map((a) => (
              <option key={a.account_id} value={a.account_id}>{a.code} — {formatIDR(a.balance)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tf-amount" className="block text-xs text-slate-500">Amount</label>
          <MoneyInput id="tf-amount" value={amount} onChange={setAmount} className="mt-1" />
        </div>
        <div className="flex items-end">
          <Button size="sm" icon={ArrowRightLeft} className="w-full" disabled={busy || !fromId || amount <= 0} onClick={record}>
            {busy ? "Recording…" : "Record the transfer"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Writes both legs — out of the leadership account, into BCA 271 — and
        marks the round funded. It marks nothing paid: money reaching our own
        account is not a vendor being paid.
      </p>
    </div>
  );
}
