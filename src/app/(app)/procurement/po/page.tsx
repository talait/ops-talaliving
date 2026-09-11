"use client";

import { useState } from "react";
import { FileText, Plus, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { PoView } from "@/demo/api/procurement";
import { useSession } from "@/store/session";
import { NewPo } from "../tracker/NewPo";

/** Every order, as an obligation rather than a document.
 *
 *  The tracker reads by supplier — *what do we owe HADI GLASS*. This reads by
 *  order, which is the other half of the same question and the one somebody
 *  asks with a vendor on the phone: *what did we agree on po-26-08-14_01, has
 *  it arrived, and what have we paid against it.*
 *
 *  Money and goods stay apart (A1). An order can be fully paid and empty, or
 *  full and unpaid, and one progress bar would say neither — so there are two
 *  badges, never a single percentage.
 */
export default function PoPage() {
  const { can } = useSession();
  const [rows, reload] = useLoad(() => procurement.listPo(), []);
  const [creating, setCreating] = useState(false);
  const mayCreate = can("procurement.create");

  const columns: Column<PoView>[] = [
    {
      key: "po",
      header: "Order",
      className: "whitespace-normal",
      render: (p) => (
        <div className="max-w-[260px]">
          <p className="font-mono text-[13px] font-medium text-slate-800">{p.po_no}</p>
          <p className="whitespace-normal break-words text-[12px] text-slate-500">{p.vendor_name}</p>
          {p.note && <p className="whitespace-normal break-words text-[11px] text-slate-400">{p.note}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <Badge tone={p.status === "ISSUED" ? "brand" : p.status === "DRAFT" ? "slate" : "green"}>
          {p.status}
        </Badge>
      ),
    },
    {
      key: "contract",
      header: "Contract",
      align: "right",
      render: (p) => (
        <span className="whitespace-nowrap tabular-nums text-slate-800">
          {formatIDR(p.lines.reduce((s, l) => s + l.line_total, 0))}
        </span>
      ),
    },
    {
      key: "money",
      header: "Money",
      render: (p) => (
        <Badge tone={p.status_view.payment_state === "SETTLED" ? "green"
          : p.status_view.payment_state === "PARTIAL" ? "amber" : "slate"}>
          {p.status_view.payment_state === "SETTLED" ? "paid"
            : p.status_view.payment_state === "PARTIAL" ? `${formatIDR(p.status_view.paid_to_date)} paid` : "nothing paid"}
        </Badge>
      ),
    },
    {
      key: "goods",
      header: "Goods",
      render: (p) => (
        <Badge tone={p.status_view.delivery_state === "COMPLETE" ? "green"
          : p.status_view.delivery_state === "PARTIAL" ? "amber" : "slate"}>
          {p.status_view.delivery_state === "COMPLETE" ? "all arrived"
            : p.status_view.delivery_state === "PARTIAL" ? "part arrived" : "nothing arrived"}
        </Badge>
      ),
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      /* Paid minus received. Positive is money out ahead of goods — our risk;
         negative is goods here we have not paid for — theirs. One number that
         two bars cannot say. */
      render: (p) => {
        const e = p.status_view.exposure;
        return (
          <div className="whitespace-nowrap text-right">
            <span className={cn("tabular-nums font-medium", e > 0 ? "text-amber-700" : e < 0 ? "text-slate-700" : "text-slate-400")}>
              {e === 0 ? "level" : formatIDR(Math.abs(e))}
            </span>
            {e !== 0 && (
              <p className="text-[11px] text-slate-500">{e > 0 ? "paid ahead" : "delivered ahead"}</p>
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
        title="Purchase orders"
        description="What we agreed with each supplier, what has arrived against it, and what has been paid. Money and goods are read separately, never merged."
        actions={mayCreate ? <Button icon={Plus} onClick={() => setCreating(true)}>Add new PO</Button> : undefined}
      />

      <Loaded state={rows} onRetry={reload}>
        {(all) => {
          const drafts = all.filter((p) => p.status === "DRAFT");
          const live = all.filter((p) => p.status === "ISSUED");
          const done = all.filter((p) => p.status === "CLOSED" || p.status === "CANCELLED");
          const open = (p: PoView) => { window.location.href = `/procurement/po/${p.po_no}`; };

          return (
            <>
              {drafts.length > 0 && (
                /* A draft owes nothing however large it is (D99). Kept apart so
                   nobody reads it as an obligation. */
                <Card className="mb-4">
                  <CardHeader
                    title={`${drafts.length} draft — not sent, so nothing is owed`}
                    subtitle="Issue it and the deposit becomes payable and it starts counting against what we owe suppliers."
                    icon={Send}
                  />
                  <DataTable
                    dense columns={columns} rows={drafts} rowKey={(p) => p.po_no}
                    onRowClick={open} empty="No drafts."
                  />
                </Card>
              )}

              <Card className="mb-4">
                <CardHeader
                  title={`${live.length} order(s) open`}
                  subtitle="Issued and not closed. Open one to see its terms, its deliveries and what may be paid next."
                  icon={FileText}
                  action={<SourceBadge state={rows} />}
                />
                <DataTable
                  dense columns={columns} rows={live} rowKey={(p) => p.po_no}
                  onRowClick={open} empty="No orders are open."
                />
              </Card>

              {done.length > 0 && (
                <Card>
                  <CardHeader title={`${done.length} finished`} subtitle="Closed or cancelled — kept, because last month's questions arrive next month." icon={FileText} />
                  <DataTable
                    dense columns={columns} rows={done} rowKey={(p) => p.po_no}
                    onRowClick={open} empty="Nothing finished yet."
                  />
                </Card>
              )}
            </>
          );
        }}
      </Loaded>

      {creating && (
        <NewPo onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
      )}
    </div>
  );
}
