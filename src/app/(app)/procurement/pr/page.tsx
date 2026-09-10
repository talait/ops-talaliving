"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ClipboardList, Plus, CheckCircle2, Clock, AlertTriangle, Circle, FileText,
  Scale, MessageSquareQuote, Send,
} from "lucide-react";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import {
  MEETING_STATE_LABEL, VARIANCE_REASON_LABEL,
  type PrLineView, type MeetingState, type VarianceReason,
} from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { LineDrawer } from "./LineDrawer";
import { FundingBar } from "./FundingBar";

/** The requests board — and the approval queue, which is the same board.
 *
 *  A purchase request is a collection of items somebody wants to buy, from as
 *  many suppliers as it takes, and the ITEM is what everyone tracks (D48). A
 *  line stays here until it is settled or no longer needed, so "it comes back
 *  at the next leadership meeting" needs no machinery.
 *
 *  Approving used to be a second screen. It is not a second subject: the CEO
 *  reads the same list everyone else reads and ticks the ones he agrees with
 *  (D67). Two screens meant two lists that could disagree about what is
 *  outstanding, and a CEO who approved something the board had already moved
 *  on from.
 */

const STATE_META: Record<MeetingState, { icon: typeof Circle; tone: string; chip: string }> = {
  neither: { icon: Circle, tone: "text-amber-600", chip: "data-[on=true]:border-amber-300 data-[on=true]:bg-amber-50" },
  approved_unpaid: { icon: Clock, tone: "text-brand-600", chip: "data-[on=true]:border-brand-300 data-[on=true]:bg-brand-50" },
  paid_unapproved: { icon: AlertTriangle, tone: "text-rose-600", chip: "data-[on=true]:border-rose-300 data-[on=true]:bg-rose-50" },
  settled: { icon: CheckCircle2, tone: "text-emerald-600", chip: "data-[on=true]:border-emerald-300 data-[on=true]:bg-emerald-50" },
};

const STATE_ORDER: MeetingState[] = ["neither", "approved_unpaid", "paid_unapproved", "settled"];

export default function RequestsBoardPage() {
  const { can, hasAuthority } = useSession();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<MeetingState | "">("");
  const [showSettled, setShowSettled] = useState(false);
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [selected, setSelected] = useState<PrLineView | null>(null);
  /* The decision in progress, per line: how much of it, and for how much. */
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [amountDraft, setAmountDraft] = useState<Record<string, number>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [lines, reload] = useLoad(
    () => (showSettled ? procurement.listAllLines() : procurement.listOpenLines()),
    [showSettled],
  );
  /* Loaded apart from the board because a difference outlives the line: the
     plywood that closed Rp 180.000 cheaper is off the open board and still
     part of the answer to "does this keep happening". */
  const [variances, reloadVariances] = useLoad(() => procurement.listVariances(), []);
  const mayEdit = can("procurement.create");
  const mayDecide = hasAuthority("approve_goods");

  function refresh() {
    reload();
    reloadVariances();
  }

  function matches(l: PrLineView) {
    if (stateFilter && l.meeting_state !== stateFilter) return false;
    if (varianceOnly && !l.variance.material) return false;
    if (!q) return true;
    const n = q.toLowerCase();
    return l.description.toLowerCase().includes(n)
      || (l.purpose ?? "").toLowerCase().includes(n)
      || (l.vendor_name ?? "").toLowerCase().includes(n)
      || l.line_no_full.toLowerCase().includes(n)
      || l.requested_by_name.toLowerCase().includes(n);
  }

  async function removeLine(l: PrLineView) {
    const res = await procurement.removeLine({ line_no: l.line_no_full });
    if (res.error) { toast("warning", "Not removed", res.error.message); return; }
    toast("success", "Removed", `${l.line_no_full} is no longer needed.`);
    setSelected(null);
    refresh();
  }

  const qtyOf = (l: PrLineView) => qtyDraft[l.id] ?? l.qty ?? 0;
  const amountOf = (l: PrLineView) => amountDraft[l.id] ?? l.item_total;

  /** Quantity and money move together: approving 40 of 60 litres approves
   *  two-thirds of the price, and making a person do that in their head is
   *  how an approval ends up disagreeing with itself. */
  function setQty(l: PrLineView, v: number) {
    setQtyDraft((d) => ({ ...d, [l.id]: v }));
    if (l.unit_price != null) {
      setAmountDraft((d) => ({ ...d, [l.id]: Math.round(v * l.unit_price!) }));
    }
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
      /* Refusals are shown, never swallowed: 422 above what was asked, 403
         without the authority, 409 on a line already decided or removed. */
      toast(res.error.status === 403 ? "critical" : "warning", "Not approved", res.error.message);
      setTicked((t) => ({ ...t, [l.id]: false }));
      return;
    }
    toast("success", `Approved ${formatIDR(amountOf(l))}`, l.description);
    refresh();
  }

  /** Send the undecided lines to the approver's chat.
   *
   *  The meeting runs on one laptop and the approver is rarely the person
   *  holding it. Ticking here would record the wrong name; asking in chat
   *  records the right one, because the answer is authenticated by Google
   *  rather than by this session (D69).
   */
  async function askForApproval(rows: PrLineView[]) {
    const pending = rows.filter((l) => !l.approval?.approved && !l.removed_at && !l.pending_request);
    if (pending.length === 0) {
      toast("warning", "Nothing to send", "Everything here is either decided already or already waiting for an answer.");
      return;
    }
    setSending(true);
    const res = await procurement.requestApproval({ line_nos: pending.map((l) => l.line_no_full) });
    setSending(false);
    if (res.error) { toast("warning", "Not sent", res.error.message); return; }
    toast(
      "success",
      `Sent ${res.data.length} to chat`,
      res.data.length ? `Waiting on ${res.data[0].sent_to_email}` : "",
    );
    refresh();
  }

  const columns: Column<PrLineView>[] = [
    {
      key: "item",
      header: "Item",
      className: "whitespace-normal",
      render: (l) => {
        const meta = [l.line_no_full, l.requested_by_name, l.project_code, l.vendor_name]
          .filter(Boolean).join(" · ");
        return (
        /* The wrap constraint lives here, not on the <td>: Tailwind emits
           `whitespace-nowrap` after `whitespace-normal`, so the cell class
           wins and a long line runs under the next column. */
        <div className="max-w-[420px] whitespace-normal break-words">
          <p className="font-medium leading-snug text-slate-800">{l.description}</p>
          {/* The purpose is the reason this board is scannable at all. Without
              it, forty lines are forty prices and no decisions. */}
          {l.purpose && <p className="text-[12px] leading-snug text-slate-500">{l.purpose}</p>}
          {/* One line, truncated, with the whole string on hover: the
              provenance is worth having on the row and not worth two lines
              of it on every row. */}
          <p
            className="truncate font-mono text-[10px] text-slate-400"
            title={meta}
          >
            {meta}
          </p>
          {/* Leadership's own words, on the row rather than a click away —
              an instruction nobody sees is not an instruction. */}
          {l.note?.instructions && (
            <p className="mt-1 flex gap-1.5 rounded bg-brand-50 px-2 py-1 text-[12px] leading-snug text-brand-900">
              <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0" />
              {l.note.instructions}
            </p>
          )}
          {l.note?.remark && !l.note.instructions && (
            <p className="mt-1 text-[12px] italic leading-snug text-slate-500">{l.note.remark}</p>
          )}
          </div>
        );
      },
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap text-[12px] text-slate-600">
          {l.qty != null ? `${formatNumber(l.qty)} ${l.uom ?? ""}` : "—"}
          {l.approval?.approved && l.approval.approved_qty != null && l.approval.approved_qty !== l.qty && (
            <span className="block text-[11px] text-brand-700">approved {formatNumber(l.approval.approved_qty)}</span>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums font-medium text-slate-800">{formatIDR(l.item_total)}</p>
          {l.approval?.approved && l.approval.approved_amount !== l.item_total && (
            <p className="text-[11px] text-brand-700">approved {formatIDR(l.approval.approved_amount ?? 0)}</p>
          )}
          {/* Not what we asked — what actually left the bank. */}
          {l.variance.material && (
            <p className={cn(
              "text-[11px] font-medium",
              l.variance.kind === "over" ? "text-rose-600" : "text-amber-700",
            )}>
              paid {formatIDR(l.variance.paid)} · {l.variance.kind === "over" ? "+" : "−"}
              {formatIDR(Math.abs(l.variance.delta))}
              {!l.variance.explanation && " · unexplained"}
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
        const undecided = !l.approval?.approved && !l.removed_at;

        if (!(mayDecide && undecided)) {
          return (
            <div className="space-y-0.5">
              <StatusPill kind="line" status={l.status} />
              {l.coverage.covered > 0 && !l.coverage.settled && (
                <p className="text-[11px] text-slate-500">{formatIDR(l.coverage.remaining)} still owed</p>
              )}
              {l.variance.material && !l.variance.explanation && (
                <p className="text-[11px] font-medium text-rose-600">needs an explanation</p>
              )}
              {/* The question has left the room and is waiting on a person,
                  which is a different kind of waiting from "nobody has looked
                  at it" — so the board says which. */}
              {l.pending_request && !l.approval?.approved && (
                <p className="text-[11px] text-slate-500">
                  asked {l.pending_request.sent_to_email.split("@")[0]} on chat ·{" "}
                  {new Date(l.pending_request.sent_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          );
        }

        return (
          /* Stops the click from opening the drawer: the row is a link, and
             these controls are not. */
          <div className="w-[188px] space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {l.qty != null && (
              <div className="flex items-center gap-1.5">
                <NumberInput
                  id={`aq-${l.id}`}
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
              id={`aa-${l.id}`}
              size="sm"
              value={amountOf(l)}
              ceiling={l.item_total}
              onChange={(v) => setAmountDraft((d) => ({ ...d, [l.id]: v }))}
            />
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                id={`ok-${l.id}`}
                type="checkbox"
                checked={ticked[l.id] ?? false}
                disabled={busy === l.id}
                onChange={() => approve(l)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {busy === l.id ? "Recording…" : "Approve"}
            </label>
            {l.coverage.covered > 0 && (
              <p className="text-[11px] text-rose-600">already paid, never approved</p>
            )}
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

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Requests"
        description="Everything anyone has asked to buy that is not finished yet, and the decision on each one. An item stays here until it is settled or no longer needed."
        actions={
          <>
            <Link href="/procurement/pr/documents">
              <Button variant="outline" icon={FileText}>Submissions</Button>
            </Link>
            {mayEdit && (
              <Link href="/procurement/pr/new">
                <Button icon={Plus}>New request</Button>
              </Link>
            )}
          </>
        }
      />

      <Loaded state={lines} onRetry={reload}>
        {(all) => {
          const counts = STATE_ORDER.map((s) => ({
            state: s,
            rows: all.filter((l) => l.meeting_state === s),
          }));
          const source = varianceOnly && variances.status === "ready" ? variances.data : all;
          const rows = source.filter(matches);
          const paidUnapproved = counts.find((c) => c.state === "paid_unapproved")!.rows.length;

          return (
            <>
              <FundingBar lines={all} />

              {/* The four questions a leadership meeting asks, as filters
                  rather than as four large cards — the board itself is what
                  people came to read. */}
              <div className="mb-4 flex flex-wrap gap-2">
                {counts.map(({ state, rows: r }) => {
                  const meta = STATE_META[state];
                  const Icon = meta.icon;
                  const on = stateFilter === state;
                  return (
                    <button
                      key={state}
                      data-on={on}
                      onClick={() => setStateFilter(on ? "" : state)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-card transition-colors hover:border-slate-300",
                        meta.chip,
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", meta.tone)} />
                      <span className="font-semibold text-slate-800">{r.length}</span>
                      <span className="text-slate-600">{MEETING_STATE_LABEL[state]}</span>
                      <span className="tabular-nums text-[11px] text-slate-400">
                        {/* Approved lines count at what was approved, not at
                            what was asked — now that a decision can cut both
                            the quantity and the price, the asked figure is the
                            wrong total to put beside "approved". */}
                        {formatIDR(r.reduce((s, l) => s + (
                          l.approval?.approved ? l.approval.approved_amount ?? l.item_total : l.item_total
                        ), 0))}
                      </span>
                    </button>
                  );
                })}
                <VarianceChip
                  rows={variances.status === "ready" ? variances.data : []}
                  active={varianceOnly}
                  onToggle={() => setVarianceOnly((v) => !v)}
                />
              </div>

              {paidUnapproved > 0 && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <strong>Money moved before anyone approved it</strong> on {paidUnapproved} item(s).
                    They are still in the list below, still waiting for a yes — paying something
                    is not deciding it.
                  </span>
                </p>
              )}

              <Card>
                <CardHeader
                  title={
                    varianceOnly ? "Paid ≠ approved"
                      : stateFilter ? MEETING_STATE_LABEL[stateFilter] : "All open items"
                  }
                  subtitle={mayDecide
                    ? "One row per item. Change the quantity or the amount, then tick — approval can only reduce."
                    : "One row per item, not per document, across every submission and every supplier."}
                  icon={ClipboardList}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {mayEdit && rows.some((l) => !l.approval?.approved && !l.removed_at && !l.pending_request) && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Send}
                          disabled={sending}
                          onClick={() => askForApproval(rows)}
                        >
                          {sending ? "Sending…" : "Ask on Chat"}
                        </Button>
                      )}
                      <SourceBadge state={lines} />
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          id="show-settled"
                          type="checkbox"
                          checked={showSettled}
                          onChange={(e) => setShowSettled(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        Include finished
                      </label>
                      <input
                        id="line-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Item, purpose, vendor…"
                        className="h-9 w-44 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  }
                />
                <DataTable
                  dense
                  columns={columns}
                  rows={rows}
                  rowKey={(l) => l.id}
                  onRowClick={setSelected}
                  empty={q || stateFilter || varianceOnly ? "Nothing matches those filters." : "Nothing outstanding."}
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      <LineDrawer
        line={selected}
        onClose={() => setSelected(null)}
        onChanged={(l) => { setSelected(l); refresh(); }}
        onRemove={removeLine}
      />
    </div>
  );
}

/** Differences between approved and paid, counted by kind.
 *
 *  The application will not say whether one gap was an input error or a staff
 *  error — it cannot know, and a field that guesses gets believed. It counts
 *  the kinds instead: one Rp 200.000 gap is noise, twelve tagged "vendor price
 *  differed" against one supplier is a supplier who quotes badly.
 */
function VarianceChip({
  rows, active, onToggle,
}: {
  rows: PrLineView[];
  active: boolean;
  onToggle: () => void;
}) {
  if (rows.length === 0) return null;
  const unexplained = rows.filter((l) => !l.variance.explanation);
  const total = rows.reduce((s, l) => s + Math.abs(l.variance.delta), 0);

  const byReason = new Map<VarianceReason, number>();
  for (const l of rows) {
    const r = l.variance.explanation?.reason;
    if (r) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  const kinds = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${VARIANCE_REASON_LABEL[r]} ×${n}`)
    .join(" · ");

  return (
    <button
      data-on={active}
      onClick={onToggle}
      title={kinds || "None explained yet"}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-card transition-colors hover:border-slate-300",
        "data-[on=true]:border-amber-300 data-[on=true]:bg-amber-50",
      )}
    >
      <Scale className="h-3.5 w-3.5 text-slate-500" />
      <span className="font-semibold text-slate-800">{rows.length}</span>
      <span className="text-slate-600">paid ≠ approved</span>
      <span className="tabular-nums text-[11px] text-slate-400">{formatIDR(total)}</span>
      {unexplained.length > 0 && (
        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
          {unexplained.length} unexplained
        </span>
      )}
    </button>
  );
}
