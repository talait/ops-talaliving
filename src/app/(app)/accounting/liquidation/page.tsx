"use client";

import { useState } from "react";
import { ArrowDownToLine, Timer } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accounting } from "@/demo/api";
import type { FundingView } from "@/services/accounting/contracts";
import { FundingDrawer } from "./FundingDrawer";

/** *"Saya sudah transfer sekian, kok sudah habis?"*
 *
 *  That question has a shape, and it is not a month. It is **one transfer**:
 *  money left leadership's account, landed in an account that pays people, and
 *  then went. So this report is a list of transfers, each answering what
 *  happened to that one (D106).
 *
 *  The window runs from one transfer to the next into the same account, and
 *  nothing here pretends to trace individual rupiah. It compares what was
 *  spent in the window against what was sent — and when spending passes the
 *  transfer, it says the excess came out of the balance that was already
 *  there, which is both true and the thing people actually want to know.
 */
export default function LiquidationPage() {
  const [rows, reload] = useLoad(() => accounting.listFundings(), []);
  const [open, setOpen] = useState<string | null>(null);

  const columns: Column<FundingView>[] = [
    {
      key: "when",
      header: "Transferred",
      render: (f) => (
        <div className="whitespace-nowrap">
          <p className="text-[13px] font-medium text-slate-800">{f.trx_date}</p>
          <p className="font-mono text-[10px] text-slate-400">{f.trx_no}</p>
        </div>
      ),
    },
    {
      key: "where",
      header: "Into",
      render: (f) => (
        <div className="whitespace-nowrap">
          <p className="text-[13px] text-slate-700">{f.account_code}</p>
          {f.from_account_code && (
            <p className="text-[11px] text-slate-400">from {f.from_account_code}</p>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (f) => <span className="tabular-nums font-semibold text-slate-800">{formatIDR(f.amount)}</span>,
    },
    {
      key: "spent",
      header: "Spent before the next transfer",
      align: "right",
      render: (f) => (
        <span className={cn("tabular-nums", f.beyond > 0 ? "text-rose-700" : "text-slate-700")}>
          {formatIDR(f.spent)}
        </span>
      ),
    },
    {
      key: "life",
      header: "How long it lasted",
      className: "whitespace-normal",
      render: (f) => (
        <div className="max-w-[280px]">
          {f.days_lasted !== null ? (
            <Badge tone={f.days_lasted <= 7 ? "red" : "amber"}>
              {f.days_lasted === 0 ? "gone the same day" : `${f.days_lasted} day(s)`}
            </Badge>
          ) : (
            <Badge tone={f.is_open ? "brand" : "green"}>
              {f.is_open ? "still running" : "not spent through"}
            </Badge>
          )}
          <p className="mt-1 text-[11px] text-slate-500">{f.headline}</p>
        </div>
      ),
    },
    {
      key: "decided",
      header: "Not tied to a decision",
      align: "right",
      render: (f) => (
        <span className={cn("tabular-nums", f.undecided > 0 ? "text-amber-700" : "text-slate-400")}>
          {formatIDR(f.undecided)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Accounting"
        title="Liquidation"
        description="Every transfer of operating money, and where it went before the next one arrived."
      />

      <Loaded state={rows} onRetry={reload}>
        {(all) => {
          const transferred = all.reduce((s, f) => s + f.amount, 0);
          const spent = all.reduce((s, f) => s + f.spent, 0);
          const undecided = all.reduce((s, f) => s + f.undecided, 0);
          const lived = all.filter((f) => f.days_lasted !== null);
          const typical = lived.length
            ? Math.round(lived.reduce((s, f) => s + (f.days_lasted ?? 0), 0) / lived.length)
            : null;

          return (
            <>
              <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-card">
                <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                  {([
                    ["Transferred in", formatIDR(transferred), `${all.length} transfer(s) into operating accounts`],
                    ["Spent in those windows", formatIDR(spent), "money out before the next transfer landed"],
                    ["Typical life of a transfer", typical === null ? "—" : `${typical} day(s)`,
                      `${lived.length} of ${all.length} were spent through`],
                    ["Not tied to a decision", formatIDR(undecided), "purchases with no approved line or order behind them"],
                  ] as [string, string, string][]).map(([k, v, note]) => (
                    <div key={k} className="px-4 py-3.5">
                      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                        {k === "Typical life of a transfer" && <Timer className="h-3 w-3" />}
                        {k}
                      </dt>
                      <dd className={cn(
                        "mt-0.5 text-xl font-bold tabular-nums tracking-tight",
                        k === "Not tied to a decision" && undecided > 0 ? "text-amber-700" : "text-slate-800",
                      )}>
                        {v}
                      </dd>
                      <p className="text-[11px] text-slate-500">{note}</p>
                    </div>
                  ))}
                </dl>
                <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
                  Spending is measured against the transfer, not traced rupiah by
                  rupiah. Where more went out than came in, the rest came from the
                  balance that was already in the account — the detail says how much.
                </p>
              </div>

              <Card>
                <CardHeader
                  title="Every transfer in"
                  subtitle="Newest first. Open one to see every rupiah that left before the next transfer arrived."
                  icon={ArrowDownToLine}
                  action={<SourceBadge state={rows} />}
                />
                <DataTable
                  dense
                  columns={columns}
                  rows={all}
                  rowKey={(f) => f.trx_no}
                  onRowClick={(f) => setOpen(f.trx_no)}
                  empty="Nobody has transferred operating money in yet."
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      {open && <FundingDrawer trxNo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
