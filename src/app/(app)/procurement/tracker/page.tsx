"use client";

import { useState } from "react";
import Link from "next/link";
import { Route, ChevronRight, Plus, CheckCircle2, Landmark } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { VendorJourney } from "@/services/procurement/contracts";
import { useSession } from "@/store/session";
import { NewPo } from "./NewPo";

/** What we owe every supplier, and where each order stands.
 *
 *  The strip at the top is the number nobody could get from the sheet: **what
 *  the company is on the hook for, across every vendor at once** — contracted
 *  and unpaid, and of that, the part goods have already arrived for. One is a
 *  commitment, the other is a bill somebody can send today, and they are not
 *  the same size.
 *
 *  Settled vendors are kept apart rather than mixed in (D102). A list where
 *  two thirds of the rows need nothing is a list people stop reading, and the
 *  settled ones are still one click away because "what did we pay HADI GLASS
 *  in July" is a real question.
 */
export default function TrackerPage() {
  const { can } = useSession();
  const [rows, reload] = useLoad(() => procurement.listVendorJourneys(), []);
  const [creating, setCreating] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const mayCreate = can("procurement.create");

  const columns: Column<VendorJourney>[] = [
    {
      key: "vendor",
      header: "Vendor",
      className: "whitespace-normal",
      render: (v) => (
        <div className="flex items-start gap-2">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
          <div className="max-w-[300px] whitespace-normal break-words">
            <p className="font-medium leading-snug text-slate-800">{v.vendor_name}</p>
            <p className="text-[11px] text-slate-500">{v.headline}</p>
          </div>
        </div>
      ),
    },
    { key: "orders", header: "Orders", align: "right", render: (v) => <span className="tabular-nums text-[13px] text-slate-600">{v.orders}</span> },
    { key: "contract", header: "Contract", align: "right", render: (v) => <span className="tabular-nums text-slate-700">{formatIDR(v.contract_value)}</span> },
    { key: "paid", header: "Paid", align: "right", render: (v) => <span className="tabular-nums text-slate-700">{formatIDR(v.paid)}</span> },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      render: (v) => (
        <span className={cn("tabular-nums", v.outstanding > 0 ? "text-slate-800" : "text-slate-400")}>
          {formatIDR(v.outstanding)}
        </span>
      ),
    },
    {
      key: "billable",
      header: "Billable now",
      align: "right",
      render: (v) => (
        <span className={cn(
          "tabular-nums font-semibold",
          v.billable_now > 0 ? "text-amber-700" : "text-slate-400",
        )}>
          {formatIDR(v.billable_now)}
        </span>
      ),
    },
    {
      key: "state",
      header: "Status",
      render: (v) => v.billable_now > 0
        ? <Badge tone="amber">goods to be invoiced</Badge>
        : v.outstanding > 0
          ? <Badge tone="brand">contract open</Badge>
          : <Badge tone="green">fully settled</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Purchase tracker"
        description="Every supplier we have an order with: what is contracted, what has been paid, what has actually arrived, and what they could invoice next."
        actions={mayCreate ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>Add new PO</Button>
        ) : undefined}
      />

      <Loaded state={rows} onRetry={reload}>
        {(all) => {
          const live = all.filter((v) => v.outstanding > 0 || v.billable_now > 0);
          const settled = all.filter((v) => v.outstanding === 0 && v.billable_now === 0);
          const contracted = all.reduce((s, v) => s + v.contract_value, 0);
          const paid = all.reduce((s, v) => s + v.paid, 0);
          const owed = all.reduce((s, v) => s + v.outstanding, 0);
          const billable = all.reduce((s, v) => s + v.billable_now, 0);
          const credit = all.reduce((s, v) => s + v.credit, 0);

          return (
            <>
              {/* What the company is on the hook for, across every vendor. */}
              <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-card">
                <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                  {([
                    ["Contracted", formatIDR(contracted), `${all.length} supplier(s), every open order`],
                    ["Paid to date", formatIDR(paid), "money that has left our bank"],
                    ["Owed to suppliers", formatIDR(owed), "contracted and not yet paid"],
                    ["Billable now", formatIDR(billable), "goods here that nobody has paid for"],
                  ] as [string, string, string][]).map(([k, v, note]) => (
                    <div key={k} className="px-4 py-3.5">
                      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                        {k === "Owed to suppliers" && <Landmark className="h-3 w-3" />}
                        {k}
                      </dt>
                      <dd className={cn(
                        "mt-0.5 text-xl font-bold tabular-nums tracking-tight",
                        k === "Billable now" && billable > 0 ? "text-amber-700" : "text-slate-800",
                      )}>
                        {v}
                      </dd>
                      <p className="text-[11px] text-slate-500">{note}</p>
                    </div>
                  ))}
                </dl>
                <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
                  <strong className="text-slate-700">{formatIDR(owed)}</strong> is the commitment;{" "}
                  <strong className="text-amber-800">{formatIDR(billable)}</strong> of it is a bill a
                  supplier could send today. The rest waits on deliveries that have not happened.
                  {credit > 0 && (
                    <> Separately, <strong className="text-slate-700">{formatIDR(credit)}</strong> of
                    goods arrived beyond what was ordered — credit sitting with vendors, not ours to spend.</>
                  )}
                </p>
              </div>

              <Card className="mb-4">
                <CardHeader
                  title={`${live.length} supplier(s) with something open`}
                  subtitle="Most billable first — the ones with goods here that nobody has paid for."
                  icon={Route}
                  action={<SourceBadge state={rows} />}
                />
                <DataTable
                  dense
                  columns={columns}
                  rows={live}
                  rowKey={(v) => v.vendor_id}
                  onRowClick={(v) => { window.location.href = `/procurement/tracker/${v.vendor_id}`; }}
                  empty="Nothing open with any supplier."
                />
              </Card>

              {/* Settled, kept apart. Still one click away. */}
              {settled.length > 0 && (
                <Card>
                  <CardHeader
                    title={`${settled.length} fully settled`}
                    subtitle="Paid against everything that arrived. Nothing to do — kept because last month's questions arrive next month."
                    icon={CheckCircle2}
                    action={
                      <Button variant="outline" size="sm" onClick={() => setShowSettled((v) => !v)}>
                        {showSettled ? "Hide" : "Show"}
                      </Button>
                    }
                  />
                  {showSettled && (
                    <DataTable
                      dense
                      columns={columns}
                      rows={settled}
                      rowKey={(v) => v.vendor_id}
                      onRowClick={(v) => { window.location.href = `/procurement/tracker/${v.vendor_id}`; }}
                    />
                  )}
                </Card>
              )}

              {creating && (
                <NewPo onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
              )}
            </>
          );
        }}
      </Loaded>

      <p className="mt-4 text-[12px] text-slate-400">
        Open a supplier to see every order, every payment and every delivery —{" "}
        <Link href="/procurement/po" className="underline">the plain order list</Link> is still there.
      </p>
    </div>
  );
}
