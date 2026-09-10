"use client";

import { useState } from "react";
import { Stamp, CheckCircle2, Lock, ChevronDown, Undo2, ClipboardCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { PrLineView } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { ApprovalTrail } from "./ApprovalTrail";

/** The standing approval queue.
 *
 *  Every submitted item nobody has decided yet, oldest first, and nothing
 *  else. There is no urgency column, no deadline and no ageing (D21): the
 *  whole list gets read either way, and a priority field only teaches people
 *  to mark everything urgent.
 *
 *  The decision is a checkbox (D28). Not a vocabulary of five statuses that
 *  nobody could tell apart — approved, or not yet. What used to be expressed
 *  by picking a different word is expressed here by two separate things: the
 *  amount, which may be reduced before ticking, and the trail, which keeps
 *  every tick and un-tick with a name and a time against it.
 *
 *  Approval and payment never share a card. Deciding what we buy and deciding
 *  what leaves the bank are different authorities held by different people
 *  (D24), and a screen that mixes them teaches that they are one act.
 */
export default function ApprovalsPage() {
  const { hasAuthority } = useSession();
  const { toast } = useToast();
  const [queue, reloadQueue] = useLoad(() => procurement.queue(), []);
  const [decided, reloadDecided] = useLoad(() => procurement.decidedLines(), []);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /* The tick has to stay down while the write is in flight. A checkbox that
     springs back for half a second reads as "it did not take". */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [trailOpen, setTrailOpen] = useState<string | null>(null);
  const mayDecide = hasAuthority("approve_goods");

  function amountFor(l: PrLineView) {
    return amounts[l.id] ?? l.item_total;
  }

  async function decide(l: PrLineView, approved: boolean) {
    setBusy(l.id);
    if (approved) setTicked((t) => ({ ...t, [l.id]: true }));
    const res = await procurement.approveLine({
      line_no: l.line_no_full,
      approved,
      approved_amount: approved ? amountFor(l) : null,
    });
    setBusy(null);
    if (res.error) {
      /* Refusals are shown, never swallowed: 422 above the requested amount,
         403 without the authority, 409 on a line already decided or removed. */
      toast(res.error.status === 403 ? "critical" : "warning", "Not recorded", res.error.message);
      setTicked((t) => ({ ...t, [l.id]: false }));
      return;
    }
    toast(
      "success",
      approved ? `Approved ${formatIDR(amountFor(l))}` : "Un-approved",
      l.description,
    );
    reloadQueue();
    reloadDecided();
  }

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Approvals"
        description="Every item anyone has asked for that nobody has decided yet — oldest first. Nothing ages out and nothing is marked urgent: an item stays here until it is approved or the person who asked no longer needs it."
      />

      {!mayDecide && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-[13px] text-slate-700">
            <strong>You can read this queue but not decide it.</strong> Approving
            goods is a single authority, held by the CEO, and it is separate from
            having access to procurement (D19, D24). The controls are not shown
            rather than shown and disabled — and if the request were made anyway,
            the API refuses it and records the refusal.
          </p>
        </div>
      )}

      <Loaded state={queue} onRetry={reloadQueue}>
        {(lines) => {
          /* Grouped by the submission it arrived in, because that is how the
             person who filed it will talk about it — not because the document
             decides anything (D48). */
          const groups = new Map<string, PrLineView[]>();
          for (const l of lines) {
            const g = groups.get(l.doc_no) ?? [];
            g.push(l);
            groups.set(l.doc_no, g);
          }
          const total = lines.reduce((s, l) => s + l.item_total, 0);

          return (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-card">
                <p className="text-sm text-slate-600">
                  <span className="text-2xl font-bold tracking-tight text-slate-800">{lines.length}</span>{" "}
                  item{lines.length === 1 ? "" : "s"} waiting
                </p>
                <p className="tabular-nums text-sm text-slate-500">{formatIDR(total)} requested</p>
                <span className="ml-auto"><SourceBadge state={queue} /></span>
              </div>

              {lines.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing is waiting"
                  description="Every submitted item has been decided. New requests appear here the moment they are submitted."
                />
              ) : (
                <div className="space-y-4">
                  {[...groups.entries()].map(([docNo, rows]) => (
                    <Card key={docNo}>
                      <CardHeader
                        title={docNo}
                        subtitle={`${rows[0].requested_by_name}${rows[0].project_code ? ` · ${rows[0].project_code}` : ""}${rows[0].submitted_at ? ` · submitted ${rows[0].submitted_at.slice(0, 10)}` : ""}`}
                        icon={ClipboardCheck}
                        action={
                          <span className="tabular-nums text-sm text-slate-500">
                            {formatIDR(rows.reduce((s, l) => s + l.item_total, 0))}
                          </span>
                        }
                      />
                      <ul className="divide-y divide-slate-100">
                        {rows.map((l) => {
                          const amount = amountFor(l);
                          const reduced = amount < l.item_total;
                          return (
                            <li key={l.id} className="px-5 py-4">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-800">{l.description}</p>
                                  {/* Without this line an approver is deciding a
                                      price with no idea what the job is. */}
                                  {l.purpose ? (
                                    <p className="mt-0.5 text-[13px] text-slate-600">{l.purpose}</p>
                                  ) : (
                                    <p className="mt-0.5 text-[13px] text-amber-700">
                                      No note on what this is for.
                                    </p>
                                  )}
                                  <p className="mt-1 font-mono text-[10px] text-slate-400">
                                    {l.line_no_full}
                                    {l.qty != null && ` · ${formatNumber(l.qty)} ${l.uom ?? ""} × ${formatIDR(l.unit_price ?? 0)}`}
                                    {l.vendor_name && ` · ${l.vendor_name}`}
                                    {l.need_by && ` · needed by ${l.need_by}`}
                                  </p>
                                </div>

                                <div className="w-full sm:w-56">
                                  <p className="text-right tabular-nums text-sm text-slate-500">
                                    asked {formatIDR(l.item_total)}
                                  </p>
                                  {mayDecide ? (
                                    <>
                                      <label htmlFor={`amt-${l.id}`} className="mt-1.5 block text-right text-xs text-slate-500">
                                        Approve this much
                                      </label>
                                      <MoneyInput
                                        id={`amt-${l.id}`}
                                        value={amount}
                                        ceiling={l.item_total}
                                        onChange={(v) => setAmounts((a) => ({ ...a, [l.id]: v }))}
                                        className="mt-1"
                                      />
                                      <label className="mt-2 flex items-center justify-end gap-2 text-sm text-slate-700">
                                        <input
                                          id={`ok-${l.id}`}
                                          type="checkbox"
                                          checked={ticked[l.id] ?? false}
                                          disabled={busy === l.id}
                                          onChange={() => decide(l, true)}
                                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                                        />
                                        {busy === l.id ? "Recording…" : "Approved"}
                                      </label>
                                      {reduced && (
                                        <p className="mt-1 text-right text-[11px] text-brand-700">
                                          {formatIDR(l.item_total - amount)} less than asked
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="mt-1 text-right text-[11px] text-slate-400">
                                      waiting for the CEO
                                    </p>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Loaded>

      {/* Decided, and undoable. A decision that cannot be unmade is a trap. */}
      <Card className="mt-6">
        <CardHeader
          title="Decided recently"
          subtitle="Every tick and un-tick is kept — the current answer is one row of the trail, not the whole story."
          icon={Stamp}
          action={<SourceBadge state={decided} />}
        />
        <Loaded state={decided} onRetry={reloadDecided}>
          {(rows) => rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Nothing decided yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((l) => (
                <li key={l.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-slate-800">{l.description}</p>
                      <p className="font-mono text-[10px] text-slate-400">
                        {l.line_no_full} · {l.requested_by_name}
                      </p>
                    </div>
                    <Badge tone={l.approval?.approved ? "green" : "slate"}>
                      {l.approval?.approved
                        ? `approved ${formatIDR(l.approval.approved_amount ?? l.item_total)}`
                        : "not approved"}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTrailOpen(trailOpen === l.id ? null : l.id)}
                      >
                        Trail
                        <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", trailOpen === l.id && "rotate-180")} />
                      </Button>
                      {mayDecide && l.approval?.approved && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Undo2}
                          disabled={busy === l.id}
                          onClick={() => decide(l, false)}
                        >
                          Un-approve
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Un-ticking a line money has already reached is allowed and
                      says so: the honest result is a line that reads "paid,
                      not approved", which is a real corner the board keeps in
                      view rather than a state we refuse to enter (A6). */}
                  {mayDecide && l.approval?.approved && l.coverage.covered > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      {formatIDR(l.coverage.covered)} has already been paid against this
                      item. Un-approving it does not pull the money back — it moves the
                      line to <em>paid, not approved</em> on the requests board.
                    </p>
                  )}
                  {trailOpen === l.id && (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <ApprovalTrail lineNo={l.line_no_full} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Loaded>
      </Card>
    </div>
  );
}
