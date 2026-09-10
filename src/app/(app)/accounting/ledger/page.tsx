"use client";

import { useState } from "react";
import { BookOpen, Paperclip, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accounting } from "@/demo/api";
import { TRANSACTION_TYPE_CODES, type TransactionView } from "@/services/accounting/contracts";
import { TrxDrawer } from "./TrxDrawer";

/** The ledger: every row of money, and what each one is attached to.
 *
 *  Two columns here are the whole argument for rebuilding this. **Unallocated**
 *  says how much of a transaction points at nothing — money that moved without
 *  a request behind it, which the sheet could only find by reading it. And
 *  **evidence** says whether there is a document at all, on the row rather
 *  than in a folder somebody has to go and check.
 *
 *  Nothing is deleted from here. A wrong row is voided with a reason and stays
 *  visible (A5), because a row that is gone cannot be asked about — and the
 *  question always arrives later.
 */
export default function LedgerPage() {
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [showVoid, setShowVoid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const [accounts] = useLoad(() => accounting.listAccounts(), []);
  const [rows, reload] = useLoad(
    () => accounting.listTransactions({
      account_id: accountId || undefined,
      type_code: typeCode || undefined,
      q: q || undefined,
      limit: 200,
    }),
    [accountId, typeCode, q],
  );

  const columns: Column<TransactionView>[] = [
    {
      key: "when",
      header: "Date",
      render: (t) => (
        <div className="whitespace-nowrap">
          <p className="text-[13px] text-slate-700">{t.trx_date}</p>
          <p className="font-mono text-[10px] text-slate-400">{t.trx_no}</p>
        </div>
      ),
    },
    {
      key: "what",
      header: "Description",
      className: "whitespace-normal",
      render: (t) => (
        <div className="max-w-[380px] whitespace-normal break-words">
          <p className={cn("font-medium leading-snug text-slate-800", t.status === "VOID" && "line-through text-slate-400")}>
            {t.description}
          </p>
          <p className="text-[11px] text-slate-400">
            {t.account_code} · {t.type_code}
            {t.vendor_name && ` · ${t.vendor_name}`}
          </p>
          {t.void_reason && (
            <p className="mt-0.5 text-[11px] text-rose-700">{t.void_reason}</p>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (t) => (
        <div className="whitespace-nowrap">
          <p className={cn(
            "tabular-nums font-medium",
            t.direction === "IN" ? "text-emerald-700" : "text-slate-800",
          )}>
            {t.direction === "IN" ? "+" : "−"}{formatIDR(t.amount_idr)}
          </p>
          {/* Money pointing at nothing, on the row rather than in a report. */}
          {t.unallocated > 0 && t.status !== "VOID" && t.expects_allocation && (
            <p className="text-[11px] text-amber-700">{formatIDR(t.unallocated)} unallocated</p>
          )}
        </div>
      ),
    },
    {
      key: "evidence",
      header: "Evidence",
      align: "center",
      render: (t) => t.evidence_count > 0
        ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-slate-600">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
            {t.evidence_count}
          </span>
        )
        : t.status === "VOID"
          ? <span className="text-slate-300">—</span>
          : <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> none
            </span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <div className="space-y-0.5">
          <StatusPill kind="trx" status={t.status} />
          {t.pr_line_nos.length > 0 && (
            <p className="font-mono text-[10px] text-slate-400">{t.pr_line_nos[0]}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Accounting"
        title="Ledger"
        description="Every row of money, with what it settled and what proves it. Nothing is deleted here — a wrong row is voided with a reason and stays visible."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          id="f-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
        >
          <option value="">All accounts</option>
          {accounts.status === "ready" && accounts.data.map((a) => (
            <option key={a.account_id} value={a.account_id}>{a.code} — {formatIDR(a.balance)}</option>
          ))}
        </select>
        <select
          id="f-type"
          value={typeCode}
          onChange={(e) => setTypeCode(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
        >
          <option value="">All types</option>
          {TRANSACTION_TYPE_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            id="f-void"
            type="checkbox"
            checked={showVoid}
            onChange={(e) => setShowVoid(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Include voided
        </label>
        <input
          id="f-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Description or number…"
          className="ml-auto h-9 w-56 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
        />
      </div>

      <Loaded state={rows} onRetry={reload}>
        {(all) => {
          const visible = showVoid ? all : all.filter((t) => t.status !== "VOID");
          const out = visible.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount_idr, 0);
          const inn = visible.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount_idr, 0);
          /* A purchase with money pointing at nothing is the row worth
             finding. Payroll and utilities are not that row. */
          const unlinked = visible.filter((t) => t.expects_allocation && t.unallocated > 0 && t.status !== "VOID");

          return (
            <Card>
              <CardHeader
                title={`${visible.length} row(s)`}
                subtitle={`${formatIDR(inn)} in · ${formatIDR(out)} out${unlinked.length ? ` · ${unlinked.length} with money pointing at nothing` : ""}`}
                icon={BookOpen}
                action={
                  <div className="flex items-center gap-2">
                    {unlinked.length > 0 && (
                      <Badge tone="amber">
                        {formatIDR(unlinked.reduce((s, t) => s + t.unallocated, 0))} unallocated
                      </Badge>
                    )}
                    <SourceBadge state={rows} />
                  </div>
                }
              />
              <DataTable
                dense
                columns={columns}
                rows={visible}
                rowKey={(t) => t.id}
                onRowClick={(t) => setSelected(t.trx_no)}
                empty={q || accountId || typeCode ? "Nothing matches those filters." : "The ledger is empty."}
              />
            </Card>
          );
        }}
      </Loaded>

      <TrxDrawer
        trxNo={selected}
        onClose={() => setSelected(null)}
        onChanged={reload}
      />
    </div>
  );
}
