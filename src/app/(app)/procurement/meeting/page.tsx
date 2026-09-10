"use client";

import { useState } from "react";
import {
  Users, Send, Circle, Clock, AlertTriangle, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { PrLineView } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { LineDrawer } from "../pr/LineDrawer";
import { MoneyPanel } from "./MoneyPanel";
import { QuickAdd } from "./QuickAdd";

/** The leadership meeting, as a screen.
 *
 *  Everything here answers one of four questions, in the order a meeting asks
 *  them (D74):
 *
 *    1. What is waiting for a decision, and what would saying yes cost?
 *    2. What did we already approve that has not been paid?
 *    3. Is the money there — and if not, how much has to move into BCA 271?
 *    4. What else do we need? (added here, on the spot)
 *
 *  It is deliberately NOT the requests board. That board is the working
 *  surface — requesting, editing, attaching, paying — and it stays that way.
 *  This one is read in a room, once a week, by people deciding. Same data,
 *  same services; a different question.
 */
export default function MeetingBoardPage() {
  const { can, hasAuthority } = useSession();
  const { toast } = useToast();
  const [lines, reload] = useLoad(() => procurement.listOpenLines(), []);
  const [selected, setSelected] = useState<PrLineView | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [amountDraft, setAmountDraft] = useState<Record<string, number>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const mayDecide = hasAuthority("approve_goods");
  const mayAsk = can("procurement.create");

  const qtyOf = (l: PrLineView) => qtyDraft[l.id] ?? l.qty ?? 0;
  const amountOf = (l: PrLineView) => amountDraft[l.id] ?? l.item_total;

  /** Quantity and money move together: approving 40 of 60 litres approves
   *  two-thirds of the price, and asking a person to do that arithmetic in
   *  their head is how an approval ends up disagreeing with itself. */
  function setQty(l: PrLineView, v: number) {
    setQtyDraft((d) => ({ ...d, [l.id]: v }));
    if (l.unit_price != null) setAmountDraft((d) => ({ ...d, [l.id]: Math.round(v * l.unit_price!) }));
  }

  async function approve(l: PrLineView) {
    setBusy(l.id);
    setTicked((t) => ({ ...t, [l.id]: true }));
    const res = await procurement.approveLine({
      line_no: l.line_no_full,
      approved: true,
      approved_qty: l.qty != null ? qtyOf(l) : null,
      approved_amount: amountOf(l),
    });
    setBusy(null);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not approved", res.error.message);
      setTicked((t) => ({ ...t, [l.id]: false }));
      return;
    }
    toast("success", `Approved ${formatIDR(amountOf(l))}`, l.description);
    reload();
  }

  async function askOnChat(rows: PrLineView[]) {
    const askable = rows.filter((l) => !l.approval?.approved && !l.removed_at && !l.pending_request);
    if (askable.length === 0) {
      toast("warning", "Nothing to send", "Everything here is decided already or already waiting for an answer.");
      return;
    }
    setSending(true);
    const res = await procurement.requestApproval({ line_nos: askable.map((l) => l.line_no_full) });
    setSending(false);
    if (res.error) { toast("warning", "Not sent", res.error.message); return; }
    toast(
      "success",
      `Sent ${res.data.items.length} item(s) as ${res.data.batch_no}`,
      `${formatIDR(res.data.requested_total)} for ${res.data.sent_to_email} to decide`,
    );
    reload();
  }

  /* Shared by both tables — the meeting reads the same three things about
     every item, whichever pile it is in. */
  const itemColumn: Column<PrLineView> = {
    key: "item",
    header: "Item",
    className: "whitespace-normal",
    render: (l) => {
      const meta = [l.line_no_full, l.requested_by_name, l.project_code, l.vendor_name]
        .filter(Boolean).join(" · ");
      return (
        <div className="max-w-[420px] whitespace-normal break-words">
          <p className="font-medium leading-snug text-slate-800">{l.description}</p>
          {l.purpose
            ? <p className="text-[12px] leading-snug text-slate-500">{l.purpose}</p>
            : <p className="text-[12px] leading-snug text-amber-700">No note on what this is for.</p>}
          <p className="truncate font-mono text-[10px] text-slate-400" title={meta}>{meta}</p>
          {l.note?.instructions && (
            <p className="mt-1 rounded bg-brand-50 px-2 py-1 text-[12px] leading-snug text-brand-900">
              {l.note.instructions}
            </p>
          )}
        </div>
      );
    },
  };

  const waitingColumns: Column<PrLineView>[] = [
    itemColumn,
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (l) => (
        <span className="whitespace-nowrap text-[12px] text-slate-600">
          {l.qty != null ? `${formatNumber(l.qty)} ${l.uom ?? ""}` : "—"}
        </span>
      ),
    },
    {
      key: "asked",
      header: "Asked for",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums font-medium text-slate-800">{formatIDR(l.item_total)}</p>
          {l.coverage.covered > 0 && (
            <p className="text-[11px] font-medium text-rose-600">
              {formatIDR(l.coverage.covered)} already paid
            </p>
          )}
        </div>
      ),
    },
    {
      key: "decision",
      header: "Decision",
      className: "whitespace-normal",
      render: (l) => {
        if (!mayDecide) {
          return (
            <div className="space-y-0.5">
              <StatusPill kind="line" status={l.status} />
              {l.pending_request && (
                <p className="text-[11px] text-slate-500">
                  asked {l.pending_request.sent_to_email.split("@")[0]} on chat
                </p>
              )}
            </div>
          );
        }
        return (
          <div className="w-[188px] space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {l.qty != null && (
              <div className="flex items-center gap-1.5">
                <NumberInput
                  id={`mq-${l.id}`}
                  size="sm"
                  value={qtyOf(l)}
                  onChange={(v) => setQty(l, v)}
                  min={0}
                  max={l.qty ?? undefined}
                  className="w-20 text-right"
                />
                <span className="text-[11px] text-slate-400">of {formatNumber(l.qty)} {l.uom ?? ""}</span>
              </div>
            )}
            <MoneyInput
              id={`ma-${l.id}`}
              size="sm"
              value={amountOf(l)}
              ceiling={l.item_total}
              onChange={(v) => setAmountDraft((d) => ({ ...d, [l.id]: v }))}
            />
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                id={`mok-${l.id}`}
                type="checkbox"
                checked={ticked[l.id] ?? false}
                disabled={busy === l.id}
                onChange={() => approve(l)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {busy === l.id ? "Recording…" : "Approve"}
            </label>
            {l.pending_request && (
              <p className="text-[11px] text-slate-500">
                asked on chat · {new Date(l.pending_request.sent_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        );
      },
    },
  ];

  const payColumns: Column<PrLineView>[] = [
    itemColumn,
    {
      key: "approved",
      header: "Approved",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums text-slate-700">
            {formatIDR(l.approval?.approved_amount ?? l.item_total)}
          </p>
          {l.approval && (
            <p className="text-[11px] text-slate-400">
              {l.approval.recorded_by_email.split("@")[0]} · {l.approval.channel}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "topay",
      header: "To pay",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums font-semibold text-slate-800">{formatIDR(l.coverage.remaining)}</p>
          {l.coverage.covered > 0 && (
            <p className="text-[11px] text-slate-500">{formatIDR(l.coverage.covered)} paid so far</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (l) => <StatusPill kind="line" status={l.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Meeting board"
        description="What is waiting to be decided, what has already been approved and not paid, and whether BCA 271 can cover it. Read in the room; the working detail lives on the requests board."
        actions={
          <Link href="/procurement/pr">
            <Button variant="outline" icon={ExternalLink}>Requests board</Button>
          </Link>
        }
      />

      <Loaded state={lines} onRetry={reload}>
        {(all) => {
          const waiting = all.filter((l) => !l.approval?.approved && !l.removed_at);
          const toPay = all.filter((l) => l.approval?.approved && !l.coverage.settled && !l.removed_at);
          const paidUnapproved = waiting.filter((l) => l.coverage.covered > 0);
          const waitingTotal = waiting.reduce((s, l) => s + l.item_total, 0);
          const payTotal = toPay.reduce((s, l) => s + l.coverage.remaining, 0);

          return (
            <>
              <MoneyPanel lines={all} />

              {paidUnapproved.length > 0 && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <strong>Money moved before anyone approved it</strong> on{" "}
                    {paidUnapproved.length} item(s), {formatIDR(paidUnapproved.reduce((s, l) => s + l.coverage.covered, 0))} in
                    total. They are in the first list, still waiting for a yes — paying
                    something is not deciding it.
                  </span>
                </p>
              )}

              <Card className="mb-5">
                <CardHeader
                  title="Waiting for a decision"
                  subtitle={`${waiting.length} item(s) · ${formatIDR(waitingTotal)} asked for. Nothing moves until these are decided.`}
                  icon={Circle}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge state={lines} />
                      {mayAsk && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Send}
                          disabled={sending}
                          onClick={() => askOnChat(waiting)}
                        >
                          {sending ? "Sending…" : "Ask on Chat"}
                        </Button>
                      )}
                      {mayAsk && <QuickAdd onAdded={reload} />}
                    </div>
                  }
                />
                <DataTable
                  dense
                  columns={waitingColumns}
                  rows={waiting}
                  rowKey={(l) => l.id}
                  onRowClick={setSelected}
                  empty="Everything has been decided."
                />
              </Card>

              <Card>
                <CardHeader
                  title="Approved — waiting for payment"
                  subtitle={`${toPay.length} item(s) · ${formatIDR(payTotal)} still to pay. This is the money that has to be in BCA 271.`}
                  icon={Clock}
                />
                <DataTable
                  dense
                  columns={payColumns}
                  rows={toPay}
                  rowKey={(l) => l.id}
                  onRowClick={setSelected}
                  empty="Nothing approved is waiting for payment."
                  footer={
                    toPay.length > 0 ? (
                      <tr>
                        <td className="px-4 py-2.5 text-[13px] text-slate-600" colSpan={2}>
                          {toPay.length} item(s) to pay
                        </td>
                        <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800")}>
                          {formatIDR(payTotal)}
                        </td>
                        <td />
                      </tr>
                    ) : undefined
                  }
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      <LineDrawer
        line={selected}
        onClose={() => setSelected(null)}
        onChanged={(l) => { setSelected(l); reload(); }}
        onRemove={async (l) => {
          const res = await procurement.removeLine({ line_no: l.line_no_full });
          if (res.error) { toast("warning", "Not removed", res.error.message); return; }
          toast("success", "Removed", `${l.line_no_full} is no longer needed.`);
          setSelected(null);
          reload();
        }}
      />
    </div>
  );
}
