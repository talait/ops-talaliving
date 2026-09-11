"use client";

import { useState } from "react";
import { CalendarCheck, Upload, AlertTriangle, Clock, Flag } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { hr } from "@/demo/api";
import { DAY_MARK_SHORT, type DayState, type OvertimeClaim } from "@/services/hr/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";
import { ImportScans } from "./ImportScans";
import { DayDrawer } from "./DayDrawer";
import { MarkDay } from "./MarkDay";

/** The timesheet: every person, every day, and whether the machine told us
 *  enough to pay them.
 *
 *  A full day is six taps — masuk, istirahat keluar, istirahat masuk, pulang,
 *  and the lembur pair when there is one. The reader gives us four on a good
 *  day. In the real export this was built against, **48 days out of 227** have
 *  an odd number: a missing *istirahat masuk*, a second tap eleven minutes
 *  later, one scan and nothing else.
 *
 *  So the grid's job is not to display attendance. It is to show, at a glance,
 *  **which days a person still has to read** — because until they have, a
 *  payroll over this period is arithmetic rather than wages (D141).
 */
const PERIOD = { from: "2026-08-29", to: "2026-09-07" };

const CELL: Record<DayState, string> = {
  complete: "bg-emerald-50 text-emerald-800 border-emerald-200",
  review: "bg-amber-50 text-amber-900 border-amber-300 font-semibold",
  marked: "bg-violet-50 text-violet-800 border-violet-200",
  off: "bg-slate-50 text-slate-300 border-slate-100",
};

export default function TimesheetPage() {
  const { can, hasAuthority } = useSession();
  const { toast } = useToast();
  const [sheet, reload] = useLoad(() => hr.getTimesheet(PERIOD), []);
  const [claims, reloadClaims] = useLoad(() => hr.listOvertime(), []);
  const [importing, setImporting] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [open, setOpen] = useState<{ employee_no: string; work_date: string } | null>(null);
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
    toast("success", approved ? "Lembur disetujui" : "Lembur ditolak", `${c.full_name} · ${c.work_date} · ${c.hours} jam`);
    reloadClaims();
  }

  return (
    <div>
      <PageHeader
        breadcrumb="HRD"
        title="Timesheet"
        description={`${PERIOD.from} → ${PERIOD.to}. Six taps make a full day; the reader gives four on a good one. Amber is a day somebody still has to read.`}
        actions={mayEdit ? (
          <Button icon={Upload} onClick={() => setImporting(true)}>Upload biometric file</Button>
        ) : undefined}
      />

      <Loaded state={sheet} onRetry={reload}>
        {(s) => (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-card">
              <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                {([
                  ["People", String(s.employees.length), "on the machine this period"],
                  ["Days to read", String(s.needs_review), s.needs_review > 0 ? "the machine could not describe these" : "the machine described every day"],
                  ["Marked by HRD", String(s.marked), "holiday, half day, absent, sick"],
                  ["Complete", String(s.days.filter((d) => d.state === "complete").length), "nothing to do"],
                ] as [string, string, string][]).map(([k, v, note]) => (
                  <div key={k} className="px-4 py-3.5">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                    <dd className={cn(
                      "mt-0.5 text-xl font-bold tabular-nums tracking-tight",
                      k === "Days to read" && s.needs_review > 0 ? "text-amber-700" : "text-slate-800",
                    )}>
                      {v}
                    </dd>
                    <p className="text-[11px] text-slate-500">{note}</p>
                  </div>
                ))}
              </dl>
              {s.needs_review > 0 && (
                <p className="border-t border-slate-100 bg-amber-50/60 px-4 py-2.5 text-[12px] text-amber-900">
                  A payroll over this period cannot be approved until these are read. Click any amber
                  cell to see the taps the machine actually recorded.
                </p>
              )}
            </div>

            <Card className="mb-4">
              <CardHeader
                title="Every person, every day"
                subtitle="Click a cell for the taps behind it. Click a date to mark the whole day — tanggal merah, setengah hari."
                icon={CalendarCheck}
                action={<SourceBadge state={sheet} />}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <th className="sticky left-0 z-10 bg-slate-50/70 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Employee
                      </th>
                      {s.dates.map((d) => (
                        <th key={d} className="px-2 py-2.5 text-center text-[11px] font-semibold text-slate-500">
                          <button
                            onClick={() => mayEdit && setMarking(d)}
                            className="underline decoration-dotted underline-offset-4 hover:text-brand-700"
                            title="Mark this day for everybody"
                          >
                            {d.slice(8)}/{d.slice(5, 7)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.employees.map((e) => (
                      <tr key={e.employee_no} className="border-b border-slate-100">
                        <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left">
                          <span className="block text-[13px] font-medium text-slate-800">{e.full_name}</span>
                          <span className="block font-mono text-[10px] text-slate-400">
                            {e.employee_no} · {e.pay_basis === "monthly" ? "bulanan" : "harian"}
                          </span>
                        </th>
                        {s.dates.map((date) => {
                          const day = s.days.find((d) => d.employee_no === e.employee_no && d.work_date === date);
                          if (!day) return <td key={date} />;
                          return (
                            <td key={date} className="px-1 py-1 text-center">
                              <button
                                onClick={() => setOpen({ employee_no: e.employee_no, work_date: date })}
                                className={cn(
                                  "w-full rounded border px-1 py-1 text-[11px] leading-tight transition-colors hover:brightness-95",
                                  CELL[day.state],
                                )}
                                title={day.issues.join(" · ") || day.mark?.reason || ""}
                              >
                                {day.state === "off" ? "—"
                                  : day.state === "marked" ? DAY_MARK_SHORT[day.mark!.kind]
                                    : day.state === "review" ? `${day.scans.length} tap`
                                      : formatNumber(day.work_hours)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 text-emerald-800">hours</span> read cleanly
                <span className="rounded border border-amber-300 bg-amber-50 px-1.5 text-amber-900">n tap</span> needs reading
                <span className="rounded border border-violet-200 bg-violet-50 px-1.5 text-violet-800">marked</span> HRD said what happened
                <span className="rounded border border-slate-100 bg-slate-50 px-1.5 text-slate-400">—</span> no tap at all
              </p>
            </Card>

            <Loaded state={claims} onRetry={reloadClaims}>
              {(all) => {
                const waiting = all.filter((c) => !c.approved_at && !c.declined_reason);
                return (
                  <Card>
                    <CardHeader
                      title={`Lembur — ${waiting.length} menunggu`}
                      subtitle="The machine saw them stay. Only a person can say it was work, and only approved hours reach a payslip."
                      icon={Clock}
                    />
                    <ul className="divide-y divide-slate-100">
                      {waiting.length === 0 && (
                        <li className="px-5 py-6 text-[13px] text-slate-500">Nothing is waiting to be decided.</li>
                      )}
                      {waiting.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                          <span className="min-w-[160px] flex-1 text-[13px] font-medium text-slate-800">
                            {c.full_name}
                            <span className="ml-2 font-normal text-slate-500">{c.work_date}</span>
                          </span>
                          <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-700">{formatNumber(c.hours)} jam</span>
                          <span className="min-w-[200px] flex-1 text-[12px] text-slate-500">{c.reason}</span>
                          {mayDecide ? (
                            <span className="flex gap-2">
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(c, false)}>Tolak</Button>
                              <Button size="sm" disabled={busy} onClick={() => decide(c, true)}>Setujui</Button>
                            </span>
                          ) : (
                            <Badge tone="amber">menunggu supervisor</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              }}
            </Loaded>
          </>
        )}
      </Loaded>

      {importing && <ImportScans onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
      {marking && <MarkDay date={marking} onClose={() => setMarking(null)} onDone={() => { setMarking(null); reload(); }} />}
      {open && (
        <DayDrawer
          employeeNo={open.employee_no}
          workDate={open.work_date}
          onClose={() => setOpen(null)}
          onChanged={() => { reload(); }}
        />
      )}
    </div>
  );
}
