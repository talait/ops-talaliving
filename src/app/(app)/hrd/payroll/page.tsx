"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet, Plus, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { hr } from "@/demo/api";
import type { PayrollRun } from "@/services/hr/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** Payroll runs, and the one thing this screen refuses to pretend.
 *
 *  It computes **gross**. BPJS Kesehatan, BPJS Ketenagakerjaan and PPh 21 all
 *  apply to this business and none of them has been described to us, so none
 *  of them is invented here (Q30–Q32). A missing deduction is obvious on a
 *  payslip; a wrong one is discovered by somebody who is short at the end of
 *  the month.
 */
export default function PayrollPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const [runs, reload] = useLoad(() => hr.listPayrollRuns(), []);
  const [from, setFrom] = useState("2026-09-07");
  const [to, setTo] = useState("2026-09-11");
  const [busy, setBusy] = useState(false);
  /* The module has one verb of its own — `run` — and it is the right one:
     opening and approving a payroll are the same permission. */
  const mayRun = can("payroll.run");

  async function open() {
    setBusy(true);
    const res = await hr.openPayroll({ period_start: from, period_end: to });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 409 ? "warning" : "critical", "Not opened", res.error.message);
      return;
    }
    toast("success", `${res.data.run_no} opened`, `${res.data.lines.length} people · ${formatIDR(res.data.gross_total)} gross`);
    reload();
  }

  const columns: Column<PayrollRun>[] = [
    {
      key: "run", header: "Run",
      render: (r) => (
        <div className="whitespace-nowrap">
          <p className="font-mono text-[13px] font-medium text-slate-800">{r.run_no}</p>
          <p className="text-[11px] text-slate-500">{r.period_start} → {r.period_end}</p>
        </div>
      ),
    },
    {
      key: "status", header: "Status",
      render: (r) => (
        <Badge tone={r.status === "PAID" ? "green" : r.status === "APPROVED" ? "brand" : "slate"}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "note", header: "Note", className: "whitespace-normal",
      render: (r) => (
        <span className="block max-w-[320px] whitespace-normal break-words text-[12px] text-slate-500">
          {r.note ?? (r.paid_trx_no ? `paid · ${r.paid_trx_no}` : "—")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="HRD"
        title="Payroll"
        description="Computed from attendance and approved overtime, every time it is read. Gross only — deductions are not modelled until somebody tells us which apply."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div>
          <label htmlFor="p-from" className="block text-xs text-slate-500">Period from</label>
          <input
            id="p-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="p-to" className="block text-xs text-slate-500">to</label>
          <input
            id="p-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <Button icon={Plus} disabled={busy || !mayRun} onClick={open}>
          {busy ? "Opening…" : "Open a run"}
        </Button>
        <p className="text-[12px] text-slate-500">
          Weekly for the workshop, monthly for staff — the period is on the run, not assumed.
        </p>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Gross only.</strong> BPJS Kesehatan, BPJS Ketenagakerjaan and PPh 21 are not
          computed — nobody has told us which apply here, at what rate, or who pays which half.
          Inventing them would produce a payslip that looks right and is wrong.
        </span>
      </div>

      <Loaded state={runs} onRetry={reload}>
        {(all) => (
          <Card>
            <CardHeader
              title={`${all.length} run(s)`}
              subtitle="Open one to see every line, the days behind it, and what is still unresolved."
              icon={Wallet}
              action={<SourceBadge state={runs} />}
            />
            <DataTable
              dense columns={columns} rows={all} rowKey={(r) => r.run_no}
              onRowClick={(r) => { window.location.href = `/hrd/payroll/${r.run_no}`; }}
              empty="No payroll has been run yet."
            />
          </Card>
        )}
      </Loaded>

      <p className="mt-4 text-[12px] text-slate-400">
        Days the machine could not describe are read on the{" "}
        <Link href="/hrd/absensi" className="underline">timesheet</Link> — a run cannot be
        approved while any are still unread.
      </p>
    </div>
  );
}
