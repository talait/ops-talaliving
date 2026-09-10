"use client";

import { useState } from "react";
import { Route, ChevronRight } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { VendorJourney } from "@/services/procurement/contracts";
import { VendorBlock } from "./VendorBlock";

/** Where we are with a supplier — the whole story, in one block.
 *
 *  The sheet could answer "what did we order" and "what did we pay", never
 *  both at once, and never for a vendor with three open orders and one
 *  transfer closing all three. So this screen keeps the two axes side by side
 *  and never merges them (D97):
 *
 *    **paid** is what left our bank
 *    **received** is what came through the door
 *
 *  A supplier can be fully paid and have delivered nothing; another can be
 *  owed money for goods sitting in our workshop. Both are ordinary, and both
 *  are invisible the moment you average them into a single percentage.
 *
 *  The number that ends an argument is *billable now*: what this vendor could
 *  honestly invoice today, given what has arrived and what we have already
 *  sent.
 */
export default function JourneyPage() {
  const [rows, reload] = useLoad(() => procurement.listVendorJourneys(), []);
  const [open, setOpen] = useState<string | null>(null);

  const columns: Column<VendorJourney>[] = [
    {
      key: "vendor",
      header: "Vendor",
      className: "whitespace-normal",
      render: (v) => (
        <div className="flex items-start gap-2">
          <ChevronRight className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open === v.vendor_id && "rotate-90",
          )} />
          <div className="max-w-[280px] whitespace-normal break-words">
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
        title="Purchase journey"
        description="Where we are with each supplier: what is contracted, what has been paid, what has actually arrived — and what they could invoice next. Paid and received are two different facts and are never averaged into one."
      />

      <Loaded state={rows} onRetry={reload}>
        {(all) => (
          <Card>
            <CardHeader
              title={`${all.length} supplier(s) with orders`}
              subtitle="Most billable first — the ones with goods here that nobody has paid for."
              icon={Route}
              action={<SourceBadge state={rows} />}
            />
            <DataTable
              dense
              columns={columns}
              rows={all}
              rowKey={(v) => v.vendor_id}
              onRowClick={(v) => setOpen(open === v.vendor_id ? null : v.vendor_id)}
              empty="No purchase orders yet."
            />
            {open && (
              <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-4">
                <VendorBlock
                  journey={all.find((v) => v.vendor_id === open)!}
                  onChanged={reload}
                />
              </div>
            )}
          </Card>
        )}
      </Loaded>
    </div>
  );
}
