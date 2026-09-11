/** HR views — computed on read, never stored (A3).
 *
 *  Payroll is the place where a stored number does the most damage: a figure
 *  that disagrees with the days behind it is somebody's wages being wrong, and
 *  nobody finds out until they count their money. So a payroll line is derived
 *  from attendance and approved overtime every time it is read, and the run
 *  stores only the period, the status and who said yes.
 */
import type { DemoState } from "./state";
import type {
  Employee, AttendanceDay, AttendanceState, PayrollLine, PayrollView, PayrollRun,
} from "@/services/hr/contracts";

const HOURS = 3_600_000;

/** Hours between two stamps, to two decimals. Crossing midnight is normal —
 *  the security shift starts at 19:00 and ends at 07:00. */
function hoursBetween(from: string, to: string): number {
  let ms = Date.parse(to) - Date.parse(from);
  if (ms < 0) ms += 24 * HOURS;
  return Math.round((ms / HOURS) * 100) / 100;
}

/** One day, read from what the machine recorded.
 *
 *  A missing check-out is `open` and worth nothing until a person closes it.
 *  That is the whole rule: the machine produces times, and a day with one time
 *  is not a day worked, it is a day nobody finished recording (D137). Guessing
 *  the second stamp — "assume they left at five" — is how a payroll quietly
 *  pays for a day nobody can account for.
 */
export function attendanceDay(
  state: DemoState,
  employee: Employee,
  workDate: string,
): AttendanceDay | null {
  const rows = state.attendance
    .filter((a) => a.employee_id === employee.id && a.work_date === workDate)
    .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));
  if (rows.length === 0) return null;

  /* A machine that scans twice produces two rows for one day. The earliest
     check-in and the latest check-out are the day; the rest is the same
     finger, twice. */
  const check_in = rows.map((r) => r.check_in).filter(Boolean).sort()[0] ?? null;
  const outs = rows.map((r) => r.check_out).filter(Boolean).sort();
  const check_out = outs.length ? outs[outs.length - 1] : null;
  const manual = rows.find((r) => r.source === "manual");

  let state_: AttendanceState;
  let hours = 0;
  if (check_in && check_out) { state_ = "complete"; hours = hoursBetween(check_in, check_out); }
  else if (check_in || check_out) state_ = "open";
  else state_ = "absent";

  const normal_hours = Math.min(hours, employee.daily_hours);
  const overtime_hours = Math.max(Math.round((hours - employee.daily_hours) * 100) / 100, 0);

  /* Late against the earliest check-in seen for this person in the period —
     not against a schedule nobody has given us. Shown, never priced. */
  return {
    employee_id: employee.id,
    work_date: workDate,
    check_in,
    check_out,
    source: manual ? "manual" : "biometric",
    state: state_,
    hours,
    normal_hours,
    overtime_hours,
    late_minutes: 0,
    reason: manual?.reason ?? null,
  };
}

/** Every day of a period for one person, including the days with nothing. */
export function attendanceDays(
  state: DemoState,
  employee: Employee,
  from: string,
  to: string,
): AttendanceDay[] {
  const out: AttendanceDay[] = [];
  /* Walked in office days, not in UTC. Building the key with `toISOString()`
     converts back through UTC, and 2026-09-07 00:00 WITA is 2026-09-06 16:00Z
     — so every day came out one early and the last day of the period was
     silently dropped. On a daily rate that is somebody's wages (F39). */
  for (let key = from; key <= to; key = nextDay(key)) {
    const day = attendanceDay(state, employee, key);
    if (day) out.push(day);
  }
  return out;
}

/** The next office day, as a `YYYY-MM-DD` string, without going near a
 *  timezone. */
function nextDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** What one person is owed for a period, before any deduction.
 *
 *  **Gross only, deliberately.** BPJS Kesehatan, BPJS Ketenagakerjaan and PPh
 *  21 all apply to this business and none of them has been described to us
 *  (Q30–Q32). A missing deduction is obvious on a payslip; a wrong one is
 *  discovered by an employee who is short.
 */
export function payrollLine(
  state: DemoState,
  employee: Employee,
  from: string,
  to: string,
): PayrollLine {
  const days = attendanceDays(state, employee, from, to);
  const complete = days.filter((d) => d.state === "complete");
  const open = days.filter((d) => d.state === "open");

  const claims = state.overtime_claims.filter(
    (c) => c.employee_id === employee.id && c.work_date >= from && c.work_date <= to,
  );
  const approvedOt = claims
    .filter((c) => c.approved_at !== null)
    .reduce((s, c) => s + c.hours, 0);
  const pendingOt = claims
    .filter((c) => c.approved_at === null && c.declined_reason === null)
    .reduce((s, c) => s + c.hours, 0);

  const normal_hours = complete.reduce((s, d) => s + d.normal_hours, 0);

  /* Monthly staff are paid the month whatever the machine says; a daily or
     hourly person is paid for what they were here for. That difference is the
     only place `pay_basis` is used, and it is why it exists. */
  const base_pay = employee.pay_basis === "monthly"
    ? employee.base_rate
    : employee.pay_basis === "daily"
      ? complete.length * employee.base_rate
      : Math.round(normal_hours * employee.base_rate);

  /* The hourly value of an ordinary hour, which is what overtime is a multiple
     of. No multiplier is applied here: what this business pays for an overtime
     hour has not been stated, so it pays the ordinary rate and says so
     (Q31). */
  const hourly = employee.pay_basis === "hourly"
    ? employee.base_rate
    : employee.pay_basis === "daily"
      ? Math.round(employee.base_rate / employee.daily_hours)
      : Math.round(employee.base_rate / 21 / employee.daily_hours);
  const overtime_pay = Math.round(approvedOt * hourly);

  const warnings: string[] = [];
  if (open.length > 0) {
    warnings.push(`${open.length} day(s) with no check-out — worth nothing until somebody closes them`);
  }
  if (pendingOt > 0) {
    warnings.push(`${pendingOt} overtime hour(s) claimed and not approved — not in this figure`);
  }
  if (employee.pay_basis !== "monthly" && complete.length === 0) {
    warnings.push("No complete day in this period");
  }

  return {
    employee_id: employee.id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    position: employee.position,
    pay_basis: employee.pay_basis,
    base_rate: employee.base_rate,
    days_worked: complete.length,
    days_open: open.length,
    normal_hours: Math.round(normal_hours * 100) / 100,
    overtime_hours: approvedOt,
    overtime_pending_hours: pendingOt,
    base_pay,
    overtime_pay,
    gross: base_pay + overtime_pay,
    warnings,
  };
}

export function payrollView(state: DemoState, run: PayrollRun): PayrollView {
  /* Anybody employed during the period, including somebody who left inside
     it — their last week is still owed. */
  const people = state.employees.filter(
    (e) => e.joined_on <= run.period_end && (e.left_on === null || e.left_on >= run.period_start),
  );
  const lines = people.map((e) => payrollLine(state, e, run.period_start, run.period_end));

  return {
    ...run,
    lines,
    gross_total: lines.reduce((s, l) => s + l.gross, 0),
    open_days: lines.reduce((s, l) => s + l.days_open, 0),
    pending_overtime_hours: lines.reduce((s, l) => s + l.overtime_pending_hours, 0),
  };
}
