"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, FileText, Trash2, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader, Progress, StatCard } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { formatIDR, formatNumber } from "@/lib/format";
import { procurement } from "@/demo/api";
import type { PrDocumentView } from "@/demo/api/procurement";
import { LINE_STATUSES, type LineStatus } from "@/services/procurement/contracts";
import { cn } from "@/lib/cn";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";

/** Purchase requests.
 *
 *  A document is a container; the LINE is the unit that matters. Each line
 *  carries its own status, its own approval and its own money, and the document
 *  is only how they arrived together. That is why the drawer lists lines with
 *  their own pills rather than showing one status for the document — a PR with
 *  one line paid and one line still waiting has no single honest status.
 */
export default function PurchaseRequestsPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | LineStatus>("");
  const [selected, setSelected] = useState<PrDocumentView | null>(null);
  const [busy, setBusy] = useState(false);

  const [state, reload] = useLoad(() => procurement.listPr(), []);
  const mayEdit = can("procurement.create");

  function matches(d: PrDocumentView) {
    if (status && !d.lines.some((l) => l.status === status)) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return d.doc_no.toLowerCase().includes(needle)
      || (d.purpose ?? "").toLowerCase().includes(needle)
      || d.requested_by_name.toLowerCase().includes(needle)
      || d.lines.some((l) => l.description.toLowerCase().includes(needle));
  }

  async function submit(d: PrDocumentView) {
    setBusy(true);
    const res = await procurement.submitPr(d.doc_no, `submit-${d.doc_no}`);
    setBusy(false);
    if (res.error) { toast(res.error.status === 409 ? "warning" : "critical", "Not submitted", res.error.message); return; }
    toast("success", "Submitted", `${d.doc_no} is now waiting for approval.`);
    setSelected(res.data);
    reload();
  }

  async function removeLine(lineNo: string) {
    const res = await procurement.removeLine({ line_no: lineNo });
    if (res.error) {
      /* 409 here is the guard doing its job, not a failure: money has reached
         the line, and what applies then is a return or a credit. */
      toast("warning", "Not removed", res.error.message);
      return;
    }
    toast("success", "Line removed", `${lineNo} is no longer needed.`);
    const refreshed = await procurement.getPr(selected!.doc_no);
    if (refreshed.data) setSelected(refreshed.data);
    reload();
  }

  const columns: Column<PrDocumentView>[] = [
    {
      key: "doc",
      header: "Document",
      render: (d) => (
        <div>
          <p className="font-mono text-[13px] font-semibold text-brand-700">{d.doc_no}</p>
          <p className="text-xs text-slate-500">{d.requested_by_name}</p>
        </div>
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      className: "max-w-[260px] whitespace-normal",
      render: (d) => (
        <div>
          <p className="text-slate-700">{d.purpose ?? "—"}</p>
          {d.project_code && <p className="text-[11px] text-slate-400">Project {d.project_code}</p>}
        </div>
      ),
    },
    { key: "lines", header: "Lines", align: "right", render: (d) => formatNumber(d.lines.length) },
    {
      key: "requested",
      header: "Requested",
      align: "right",
      render: (d) => <span className="tabular-nums">{formatIDR(d.requested_total)}</span>,
    },
    {
      key: "approved",
      header: "Approved",
      align: "right",
      render: (d) =>
        d.approved_total > 0
          ? <span className="tabular-nums font-medium text-slate-800">{formatIDR(d.approved_total)}</span>
          : <span className="text-slate-300">—</span>,
    },
    {
      key: "state",
      header: "Lines by status",
      className: "max-w-[240px] whitespace-normal",
      render: (d) => {
        const counts = new Map<LineStatus, number>();
        for (const l of d.lines) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
        return (
          <span className="flex flex-wrap gap-1">
            {[...counts.entries()].map(([s, n]) => (
              <span key={s} className="inline-flex">
                <StatusPill kind="line" status={n > 1 ? `${s} · ${n}` : s} />
              </span>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Purchase Requests"
        description="What people have asked to buy. A document groups lines that arrived together; each line carries its own status, approval and money."
        actions={
          mayEdit && (
            <Link href="/procurement/pr/new">
              <Button icon={Plus}>New request</Button>
            </Link>
          )
        }
      />

      <Loaded state={state} onRetry={reload}>
        {(docs) => {
          const rows = docs.filter(matches);
          const allLines = docs.flatMap((d) => d.lines);
          const waiting = allLines.filter((l) => l.status === "WAITING FOR APPROVAL");
          return (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <StatCard label="Documents" value={docs.length} icon={FileText} hint={`${allLines.length} lines`} />
                <StatCard
                  label="Waiting for approval"
                  value={waiting.length}
                  icon={ClipboardList}
                  tone="amber"
                  hint={formatIDR(waiting.reduce((s, l) => s + l.item_total, 0))}
                />
                <StatCard
                  label="Requested in total"
                  value={formatIDR(allLines.reduce((s, l) => s + l.item_total, 0))}
                  icon={FileText}
                  tone="brand"
                />
              </div>

              <Card>
                <CardHeader
                  title="All requests"
                  subtitle="Filter by line status — a document is shown when any of its lines matches."
                  icon={ClipboardList}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceBadge state={state} />
                      <select
                        id="pr-status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as LineStatus | "")}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
                      >
                        <option value="">Any status</option>
                        {LINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input
                        id="pr-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Document, item, requester…"
                        className="h-9 w-44 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  }
                />
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(d) => d.id}
                  onRowClick={setSelected}
                  empty={q || status ? "Nothing matches those filters." : "No requests yet."}
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.doc_no ?? ""}
        subtitle={selected ? `${selected.requested_by_name} · ${selected.status}` : undefined}
        width="max-w-2xl"
        footer={
          selected && mayEdit && selected.status === "DRAFT" ? (
            <div className="flex justify-end">
              <Button size="sm" icon={Send} onClick={() => submit(selected)} disabled={busy}>
                {busy ? "Submitting…" : "Submit for approval"}
              </Button>
            </div>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              {([
                ["Purpose", selected.purpose ?? "—"],
                ["Project", selected.project_code ?? "—"],
                ["Requested", formatIDR(selected.requested_total)],
                ["Approved", selected.approved_total > 0 ? formatIDR(selected.approved_total) : "—"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 px-3 py-2">
                  <dt className="text-xs text-slate-400">{k}</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {selected.status === "DRAFT" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
                Still a draft. Nothing has been asked of anyone yet — it appears in
                nobody&rsquo;s approval queue until it is submitted.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lines
              </p>
              <div className="space-y-2">
                {selected.lines.map((l) => {
                  const cov = l.coverage;
                  const pct = cov.approved > 0 ? (cov.covered / cov.approved) * 100 : 0;
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "rounded-lg border px-3 py-3",
                        l.removed_at ? "border-slate-200 bg-slate-50/70 opacity-70" : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-slate-400">{l.line_no_full}</p>
                          <p className={cn("font-medium text-slate-800", l.removed_at && "line-through")}>
                            {l.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            {l.qty != null ? `${formatNumber(l.qty)} ${l.uom ?? ""} × ${formatIDR(l.unit_price ?? 0)}` : "no quantity"}
                            {l.vendor_name && ` · ${l.vendor_name}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums font-semibold text-slate-800">{formatIDR(l.item_total)}</p>
                          {l.approval?.approved && l.approval.approved_amount !== l.item_total && (
                            <p className="text-[11px] text-brand-700">
                              approved {formatIDR(l.approval.approved_amount ?? 0)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <StatusPill kind="line" status={l.status} />
                        {l.received_qty > 0 && l.qty != null && (
                          <Badge tone="slate">received {formatNumber(l.received_qty)} of {formatNumber(l.qty)}</Badge>
                        )}
                        {mayEdit && !l.removed_at && (
                          <button
                            onClick={() => removeLine(l.line_no_full)}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" /> No longer needed
                          </button>
                        )}
                      </div>

                      {cov.covered > 0 && (
                        <div className="mt-2.5">
                          <Progress value={pct} tone={cov.settled ? "green" : "amber"} />
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatIDR(cov.covered)} of {formatIDR(cov.approved)} covered
                            {cov.remaining > 0 && ` · ${formatIDR(cov.remaining)} still owed`}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
