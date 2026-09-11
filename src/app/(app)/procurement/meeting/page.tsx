"use client";

import { useState } from "react";
import {
  Send, Circle, Clock, AlertTriangle, ExternalLink, Check,
} from "lucide-react";
import Link from "next/link";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { Link2 as LinkIcon } from "lucide-react";
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
  /* Ticking marks an intention, not a decision. Nothing is written until the
     one confirm at the top — so a meeting can go through the list, change its
     mind twice, and see the total before anything is committed (D77). */
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

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

  function toggle(l: PrLineView) {
    setPicked((p) => ({ ...p, [l.id]: !p[l.id] }));
  }

  /** Approve everything ticked, in one act.
   *
   *  Only for somebody who actually holds the authority. For everybody else
   *  the same selection goes to the approver's chat instead — the meeting
   *  usually runs on a laptop that is not theirs, and recording their yes
   *  under whoever logged in is the mistake the chat route exists to prevent
   *  (D69).
   */
  async function approveSelected(rows: PrLineView[]) {
    setBusy(true);
    let done = 0;
    for (const l of rows) {
      const res = await procurement.approveLine({
        line_no: l.line_no_full,
        approved: true,
        approved_qty: l.qty != null ? qtyOf(l) : null,
        approved_amount: amountOf(l),
      });
      if (res.error) {
        toast(res.error.status === 403 ? "critical" : "warning", `Not approved · ${l.line_no_full}`, res.error.message);
        continue;
      }
      done += 1;
    }
    setBusy(false);
    if (done > 0) {
      toast("success", `Approved ${done} item(s)`, formatIDR(rows.reduce((s, l) => s + amountOf(l), 0)));
      setPicked({});
      reload();
    }
  }

  async function sendSelected(rows: PrLineView[]) {
    const askable = rows.filter((l) => !l.pending_request);
    if (askable.length === 0) {
      toast("warning", "Nothing to send", "Every item you picked is already waiting for an answer.");
      return;
    }
    setBusy(true);
    const res = await procurement.requestApproval({ line_nos: askable.map((l) => l.line_no_full) });
    setBusy(false);
    if (res.error) { toast("warning", "Not sent", res.error.message); return; }
    toast(
      "success",
      `Sent ${res.data.items.length} item(s) as ${res.data.batch_no}`,
      `${formatIDR(res.data.requested_total)} for ${res.data.sent_to_email} to decide`,
    );
    setPicked({});
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
          {/* The refusal exists in the API either way; saying it here means
              nobody meets it mid-meeting (D125). */}
          {!l.has_support && !l.approval?.approved && (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-amber-700">
              <LinkIcon className="h-3 w-3 shrink-0" />
              Nothing behind it yet — needs the shop link, the invoice or the bill.
            </p>
          )}
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
      key: "pick",
      header: "Pick",
      className: "whitespace-normal",
      render: (l) => {
        const on = picked[l.id] ?? false;
        return (
          /* Stops the click from opening the drawer: the row is a link, these
             controls are not. */
          <div className="w-[196px] space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
              <input
                id={`pick-${l.id}`}
                type="checkbox"
                checked={on}
                onChange={() => toggle(l)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {mayDecide ? "Approve this" : "Include in the ask"}
            </label>

            {/* The amounts only matter once it is picked, and showing four
                fields per row on a list nobody has ticked is noise. */}
            {on && (
              <>
                {l.qty != null && (
                  <div className="flex items-center gap-1.5">
                    <NumberInput
                      id={`mq-${l.id}`}
                      size="sm"
                      value={qtyOf(l)}
                      onChange={(v) => setQty(l, v)}
                      min={0}
                      className="w-20 text-right"
                    />
                    <span className="text-[11px] text-slate-400">of {formatNumber(l.qty)} {l.uom ?? ""}</span>
                  </div>
                )}
                <MoneyInput
                  id={`ma-${l.id}`}
                  size="sm"
                  value={amountOf(l)}
                  onChange={(v) => setAmountDraft((d) => ({ ...d, [l.id]: v }))}
                />
                {amountOf(l) !== l.item_total && (
                  <p className={cn(
                    "text-[11px]",
                    amountOf(l) > l.item_total ? "text-amber-700" : "text-brand-700",
                  )}>
                    {formatIDR(Math.abs(amountOf(l) - l.item_total))}{" "}
                    {amountOf(l) > l.item_total ? "more" : "less"} than asked
                  </p>
                )}
              </>
            )}

            {!on && <StatusPill kind="line" status={l.status} />}
            {l.pending_request && (
              <p className="text-[11px] text-slate-500">
                asked {l.pending_request.sent_to_email.split("@")[0]} on chat ·{" "}
                {new Date(l.pending_request.sent_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
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
      /* Both statuses in this list mean "approved, not paid" — the card says
         so in its title. The only thing that separates them is whether the
         line sits in a payment round, so that is what the column shows;
         printing two different words for one meaning is how a board teaches
         people to ignore a column (D123). */
      render: (l) => (
        <div className="whitespace-nowrap">
          <StatusPill kind="line" status={l.status} />
          <p className="mt-0.5 text-[11px] text-slate-500">
            {l.round_no === null
              ? "no money earmarked for it yet"
              : l.status === "WAITING FOR PAYMENT"
                ? <>cash is in the account · {l.round_no}</>
                : <>waiting on funding · {l.round_no}</>}
          </p>
        </div>
      ),
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

          const chosen = waiting.filter((l) => picked[l.id]);
          const chosenBare = chosen.filter((l) => !l.has_support);
          /* What is being approved and what still has to be paid are two
             different numbers, and on this board they are only the same when
             none of the picked lines has been paid already. A line bought
             first and approved later commits no new money: approving it is
             recording a decision about money that has gone (D124). */
          const chosenApproved = chosen.reduce((s, l) => s + amountOf(l), 0);
          const chosenTotal = chosen.reduce(
            (s, l) => s + Math.max(amountOf(l) - l.coverage.covered, 0), 0,
          );
          const chosenAlreadyPaid = chosenApproved - chosenTotal;

          return (
            <>
              <MoneyPanel lines={all} />

              {/* The confirm sits ABOVE the lists, with the total on it: a
                  meeting ticks its way down the page and then looks up to see
                  what it just committed to. Ticking writes nothing (D77). */}
              {chosen.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 shadow-card">
                  <p className="text-[13px] text-brand-900">
                    <span className="text-xl font-bold tabular-nums">{chosen.length}</span>{" "}
                    item{chosen.length === 1 ? "" : "s"} picked
                  </p>
                  <p className="text-[13px] text-brand-900">
                    <span className="text-xl font-bold tabular-nums">{formatIDR(chosenTotal)}</span>{" "}
                    to pay if this goes through
                    {chosenAlreadyPaid > 0 && (
                      <span className="block text-[12px] text-brand-800">
                        {formatIDR(chosenApproved)} approved, of which{" "}
                        <strong className="tabular-nums">{formatIDR(chosenAlreadyPaid)}</strong> has
                        already left the account — approving it commits nothing more.
                      </span>
                    )}
                  </p>
                  {chosenBare.length > 0 && (
                    <p className="w-full text-[12px] text-amber-800">
                      {chosenBare.length === 1
                        ? "One of these has no document behind it and will be refused: "
                        : `${chosenBare.length} of these have no document behind them and will be refused: `}
                      {chosenBare.map((l) => l.line_no_full).join(", ")}. Attach the link or the
                      invoice on the requests board first.
                    </p>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPicked({})} disabled={busy}>
                      Clear
                    </Button>
                    {mayDecide ? (
                      <Button size="sm" icon={Check} disabled={busy} onClick={() => approveSelected(chosen)}>
                        {busy ? "Recording…" : `Approve ${chosen.length} · ${formatIDR(chosenApproved)}`}
                      </Button>
                    ) : (
                      <Button size="sm" icon={Send} disabled={busy || !mayAsk} onClick={() => sendSelected(chosen)}>
                        {busy ? "Sending…" : `Send ${chosen.length} to the approver on Chat`}
                      </Button>
                    )}
                  </div>
                  {!mayDecide && (
                    <p className="w-full text-[12px] text-brand-800">
                      You are not the approver, so this does not record a yes — it puts the
                      list in their chat, and their answer is recorded as theirs.
                    </p>
                  )}
                </div>
              )}

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
                {/* The total belongs at the top: it is the answer, and the
                    rows underneath are the working. */}
                {toPay.length > 0 && (
                  <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                    <span className="text-[13px] text-slate-600">{toPay.length} item(s) to pay</span>
                    <span className="text-lg font-bold tabular-nums tracking-tight text-slate-800">
                      {formatIDR(payTotal)}
                    </span>
                  </div>
                )}
                <DataTable
                  dense
                  columns={payColumns}
                  rows={toPay}
                  rowKey={(l) => l.id}
                  onRowClick={setSelected}
                  empty="Nothing approved is waiting for payment."
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      <LineDrawer
        line={selected}
        others={lines.status === "ready" ? lines.data : undefined}
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
