"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ClipboardList, Plus, CheckCircle2, Clock, AlertTriangle, Circle, FileText,
} from "lucide-react";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import {
  MEETING_STATE_LABEL, type PrLineView, type MeetingState,
} from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { LineDrawer } from "./LineDrawer";

/** The requests board.
 *
 *  A purchase request is a collection of items somebody wants to buy — from as
 *  many suppliers as it takes — and the ITEM is what everyone actually tracks.
 *  So this page lists lines, not documents (owner, 2026-09-11).
 *
 *  The consequence worth noticing: a line stays here until it is settled or
 *  removed, so "it comes back at the next leadership meeting" needs no
 *  machinery. The old system moved unpaid lines into a fresh document to make
 *  them reappear, because its surface was a spreadsheet with one tab per
 *  submission. Nothing has to be carried forward when nothing was ever
 *  filed away.
 */

const STATE_META: Record<MeetingState, { icon: typeof Circle; tone: string; ring: string }> = {
  settled: { icon: CheckCircle2, tone: "text-emerald-600", ring: "ring-emerald-200 bg-emerald-50" },
  approved_unpaid: { icon: Clock, tone: "text-brand-600", ring: "ring-brand-200 bg-brand-50" },
  paid_unapproved: { icon: AlertTriangle, tone: "text-rose-600", ring: "ring-rose-200 bg-rose-50" },
  neither: { icon: Circle, tone: "text-amber-600", ring: "ring-amber-200 bg-amber-50" },
};

const STATE_ORDER: MeetingState[] = ["neither", "approved_unpaid", "paid_unapproved", "settled"];

export default function RequestsBoardPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<MeetingState | "">("");
  const [showSettled, setShowSettled] = useState(false);
  const [selected, setSelected] = useState<PrLineView | null>(null);

  const [lines, reload] = useLoad(
    () => (showSettled ? procurement.listAllLines() : procurement.listOpenLines()),
    [showSettled],
  );
  const mayEdit = can("procurement.create");

  function matches(l: PrLineView) {
    if (stateFilter && l.meeting_state !== stateFilter) return false;
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
    reload();
  }

  const columns: Column<PrLineView>[] = [
    {
      key: "item",
      header: "Item",
      className: "whitespace-normal",
      render: (l) => (
        <div className="max-w-[250px]">
          <p className="font-medium text-slate-800">{l.description}</p>
          {/* The purpose is the reason this row is scannable at all. Without it
              a board of 40 lines is 40 prices and no decisions. */}
          {l.purpose && <p className="mt-0.5 text-[13px] text-slate-500">{l.purpose}</p>}
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {l.line_no_full} · {l.requested_by_name}
            {l.project_code && ` · ${l.project_code}`}
          </p>
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      className: "whitespace-normal",
      render: (l) => (
        <div className="max-w-[130px]">
          {l.vendor_name
            ? <span className="text-[13px] text-slate-600">{l.vendor_name}</span>
            : <span className="text-slate-300">not decided</span>}
        </div>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (l) => l.qty != null
        ? <span className="whitespace-nowrap text-[13px] text-slate-600">{formatNumber(l.qty)} {l.uom}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (l) => (
        <div>
          <p className="tabular-nums font-medium text-slate-800">{formatIDR(l.item_total)}</p>
          {l.approval?.approved && l.approval.approved_amount !== l.item_total && (
            <p className="text-[11px] text-brand-700">approved {formatIDR(l.approval.approved_amount ?? 0)}</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (l) => (
        <div className="space-y-1">
          <StatusPill kind="line" status={l.status} />
          {l.coverage.covered > 0 && !l.coverage.settled && (
            <p className="text-[11px] text-slate-500">{formatIDR(l.coverage.remaining)} still owed</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Requests"
        description="Everything anyone has asked to buy that is not finished yet — across every submission and every supplier. An item stays on this board until it is settled or no longer needed."
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
          const rows = all.filter(matches);
          return (
            <>
              {/* The four questions a leadership meeting actually asks, in the
                  order they get asked. Each one filters the board. */}
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {counts.map(({ state, rows: r }) => {
                  const meta = STATE_META[state];
                  const Icon = meta.icon;
                  const active = stateFilter === state;
                  return (
                    <button
                      key={state}
                      onClick={() => setStateFilter(active ? "" : state)}
                      className={cn(
                        "rounded-xl border bg-white px-4 py-4 text-left shadow-card transition-colors",
                        active ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset", meta.ring)}>
                        <Icon className={cn("h-4 w-4", meta.tone)} />
                      </span>
                      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-800">{r.length}</p>
                      <p className="text-sm text-slate-600">{MEETING_STATE_LABEL[state]}</p>
                      <p className="mt-1 tabular-nums text-xs text-slate-400">
                        {formatIDR(r.reduce((s, l) => s + l.item_total, 0))}
                      </p>
                    </button>
                  );
                })}
              </div>

              {counts.find((c) => c.state === "paid_unapproved")!.rows.length > 0 && (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <p className="text-[13px] text-rose-800">
                    <strong>Money moved before anyone approved it</strong> on{" "}
                    {counts.find((c) => c.state === "paid_unapproved")!.rows.length} line(s).
                    Kept in its own corner on purpose — folding it in with everything
                    else in progress is exactly how it stays invisible.
                  </p>
                </div>
              )}

              <Card>
                <CardHeader
                  title={stateFilter ? MEETING_STATE_LABEL[stateFilter] : "All open items"}
                  subtitle="One row per item, not per document. An item from last month's submission sits beside one from today, because that is how it will be discussed."
                  icon={ClipboardList}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
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
                  columns={columns}
                  rows={rows}
                  rowKey={(l) => l.id}
                  onRowClick={setSelected}
                  empty={q || stateFilter ? "Nothing matches those filters." : "Nothing outstanding."}
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
        onRemove={removeLine}
      />
    </div>
  );
}
