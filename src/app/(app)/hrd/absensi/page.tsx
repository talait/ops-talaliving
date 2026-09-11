"use client";

import { useState } from "react";
import { CalendarCheck, Fingerprint, AlertTriangle, Clock } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { hr } from "@/demo/api";
import type { AttendanceDay, OvertimeClaim } from "@/services/hr/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";
import { CloseDay } from "./CloseDay";

/** What the fingerprint machine saw, and the two things it cannot tell us.
 *
 *  It produces times, not days. A missing check-out is the normal failure, not
 *  the exception — somebody leaves through the workshop door, the sensor is
 *  dirty, the power blinks. Guessing the second stamp is how a payroll quietly
 *  pays for a day nobody can account for, so an incomplete day is **open** and
 *  worth nothing until a person closes it with a reason (D137).
 *
 *  And it cannot tell work from presence. It knows somebody was in the
 *  building at 19:40; it does not know whether they were finishing a table or
 *  waiting for a lift. So hours past the standard day are shown here and paid
 *  only once somebody claims them and a supervisor agrees (D138).
 */
const PERIOD = { from: "2026-08-31", to: "2026-09-11" };

export default function AttendancePage() {
  const { can, hasAuthority } = useSession();
  const { toast } = useToast();
  const [open, reloadOpen] = useLoad(() => hr.listOpenDays(PERIOD), []);
  const [claims, reloadClaims] = useLoad(() => hr.listOvertime(), []);
  const [closing, setClosing] = useState<(AttendanceDay & { employee_no: string; full_name: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const mayEdit = can("hrd.update");
  const mayDecide = hasAuthority("approve_goods");

  async function decide(c: OvertimeClaim & { full_name: string }, approved: boolean) {
    setBusy(true);
    const res = await hr.decideOvertime({
      claim_id: c.id, approved,
      reason: approved ? null : "Tidak disetujui dari layar absensi.",
    });
    setBusy(false);
    if (res.error) { toast(res.error.status === 403 ? "critical" : "warning", "Not decided", res.error.message); return; }
    toast("success", approved ? "Overtime approved" : "Overtime declined", `${c.full_name} · ${c.work_date} · ${c.hours}h`);
    reloadClaims();
  }

  const openColumns: Column<AttendanceDay & { employee_no: string; full_name: string }>[] = [
    {
      key: "who", header: "Employee", className: "whitespace-normal",
      render: (d) => (
        <div className="max-w-[240px]">
          <p className="font-medium text-slate-800">{d.full_name}</p>
          <p className="font-mono text-[10px] text-slate-400">{d.employee_no}</p>
        </div>
      ),
    },
    { key: "date", header: "Day", render: (d) => <span className="whitespace-nowrap text-[13px] text-slate-700">{d.work_date}</span> },
    {
      key: "in", header: "In", align: "right",
      render: (d) => <span className="whitespace-nowrap tabular-nums text-[13px] text-slate-700">{d.check_in?.slice(11, 16) ?? "—"}</span>,
    },
    {
      key: "out", header: "Out", align: "right",
      render: (d) => (
        <span className={cn("whitespace-nowrap tabular-nums text-[13px]", d.check_out ? "text-slate-700" : "text-rose-700")}>
          {d.check_out?.slice(11, 16) ?? "missing"}
        </span>
      ),
    },
    {
      key: "act", header: "", align: "right",
      render: (d) => mayEdit
        ? <Button size="sm" variant="outline" onClick={() => setClosing(d)}>Close it</Button>
        : <span className="text-[11px] text-slate-400">needs HR access</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="HRD"
        title="Attendance"
        description={`From the fingerprint machine, ${PERIOD.from} to ${PERIOD.to}. The machine records times; a day only becomes a day worked once both of them exist.`}
      />

      <Loaded state={open} onRetry={reloadOpen}>
        {(days) => (
          <Card className="mb-4">
            <CardHeader
              title={days.length === 0 ? "Every day is closed" : `${days.length} day(s) with no check-out`}
              subtitle="Worth nothing until somebody closes them — and a payroll run over this period will refuse to be approved while any are here."
              icon={days.length === 0 ? CalendarCheck : AlertTriangle}
              action={<SourceBadge state={open} />}
            />
            {days.length === 0 ? (
              <p className="px-5 py-8 text-[13px] text-slate-500">
                Nothing to fix. Every day in the period has both stamps.
              </p>
            ) : (
              <DataTable
                dense columns={openColumns} rows={days}
                rowKey={(d) => `${d.employee_no}:${d.work_date}`}
                empty="No open days."
              />
            )}
          </Card>
        )}
      </Loaded>

      <Loaded state={claims} onRetry={reloadClaims}>
        {(all) => {
          const waiting = all.filter((c) => !c.approved_at && !c.declined_reason);
          const decided = all.filter((c) => c.approved_at || c.declined_reason);
          return (
            <Card>
              <CardHeader
                title={`Overtime — ${waiting.length} waiting`}
                subtitle="The machine saw them stay. Only a person can say it was work, and only approved hours reach a payslip."
                icon={Clock}
              />
              <ul className="divide-y divide-slate-100">
                {waiting.length === 0 && (
                  <li className="px-5 py-6 text-[13px] text-slate-500">Nothing is waiting to be decided.</li>
                )}
                {waiting.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                    <Fingerprint className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-[180px] flex-1 text-[13px] font-medium text-slate-800">
                      {c.full_name}
                      <span className="ml-2 font-normal text-slate-500">{c.work_date}</span>
                    </span>
                    <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-700">{formatNumber(c.hours)} h</span>
                    <span className="min-w-[200px] flex-1 text-[12px] text-slate-500">{c.reason}</span>
                    {mayDecide ? (
                      <span className="flex gap-2">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(c, false)}>Decline</Button>
                        <Button size="sm" disabled={busy} onClick={() => decide(c, true)}>Approve</Button>
                      </span>
                    ) : (
                      <Badge tone="amber">waiting on a supervisor</Badge>
                    )}
                  </li>
                ))}
                {decided.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 px-5 py-2 text-[12px] text-slate-500">
                    <span className="min-w-[180px] flex-1">{c.full_name} · {c.work_date}</span>
                    <span className="tabular-nums">{formatNumber(c.hours)} h</span>
                    <Badge tone={c.approved_at ? "green" : "slate"}>
                      {c.approved_at ? "approved" : "declined"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          );
        }}
      </Loaded>

      {closing && (
        <CloseDay
          day={closing}
          onClose={() => setClosing(null)}
          onSaved={() => { setClosing(null); reloadOpen(); }}
        />
      )}
    </div>
  );
}
