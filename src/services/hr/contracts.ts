/** HR contracts — cut to `docs/plan/02-database.md`, schema `hr`.
 *
 *  A sixth service (D136). It could have been folded into `identity` — both
 *  are about people — but they answer to different rooms: identity says who
 *  may open which screen, HR says what somebody is owed. Payroll is the most
 *  access-controlled data in the company and the most likely to need a
 *  different retention rule, and merging it into the table that holds logins
 *  makes both harder to reason about.
 *
 *  **What is deliberately not here: deductions.** BPJS Kesehatan, BPJS
 *  Ketenagakerjaan and PPh 21 all apply to this business and none of them has
 *  been described to us. Payroll computes **gross** and says plainly that it
 *  stops there (Q30–Q32). A wrong deduction is worse than a missing one: the
 *  missing one is obvious on the payslip, the wrong one is discovered by an
 *  employee who is short.
 */

/** How somebody is paid. Both exist here: staff on a monthly salary, and
 *  workshop people paid for the days they actually worked (owner). */
export type PayBasis = "monthly" | "daily" | "hourly";

export interface Employee {
  id: string;
  /** The number on the biometric machine and on every payslip. */
  employee_no: string;
  full_name: string;
  position: string;
  /** Which part of the business — used to group a payroll run, nothing more. */
  unit: string;
  pay_basis: PayBasis;
  /** Per month, per day or per hour, matching `pay_basis`. Whole rupiah. */
  base_rate: number;
  /** Standard hours in a working day. Overtime is what goes past it. */
  daily_hours: number;
  joined_on: string;
  active: boolean;
  /** Set when somebody leaves. Their records stay — a payslip from March is
   *  still a fact in June (A5). */
  left_on: string | null;
  note: string | null;
}

/** Where an attendance row came from.
 *
 *  `biometric` is the fingerprint machine, imported. `manual` is a person
 *  saying what the machine missed, which always carries a reason: an
 *  attendance record nobody can challenge is a payroll nobody can challenge
 *  (D137).
 */
export type AttendanceSource = "biometric" | "manual";

export interface Attendance {
  id: string;
  employee_id: string;
  /** Office day, WITA. */
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  source: AttendanceSource;
  /** The machine's own id for the row, so a re-import is a no-op rather than a
   *  double day. */
  device_ref: string | null;
  /** Required on anything entered by hand. */
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

/** What the day is worth, once somebody has read the two timestamps.
 *
 *  A machine produces times, not hours: a missing check-out is the normal
 *  failure, not the exception, and guessing one is how a payroll quietly pays
 *  for a day nobody worked. So an incomplete day is `open` and counts as
 *  nothing until a person closes it (D137).
 */
export type AttendanceState = "complete" | "open" | "absent";

export interface AttendanceDay {
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  source: AttendanceSource;
  state: AttendanceState;
  /** Worked hours, capped at nothing — the raw difference. */
  hours: number;
  /** Hours up to the employee's standard day. */
  normal_hours: number;
  /** Everything past it, before anybody has approved paying for it. */
  overtime_hours: number;
  late_minutes: number;
  reason: string | null;
}

/** Overtime is claimed and approved, never inferred.
 *
 *  The machine knows somebody was in the building at 19:40. It does not know
 *  whether they were working, waiting for a lift, or finishing a cigarette —
 *  and paying 1,5× for all three is how overtime becomes a habit. So hours
 *  past the standard day are **shown** from the moment they happen and **paid**
 *  only once a supervisor says they were worked (D138).
 */
export interface OvertimeClaim {
  id: string;
  employee_id: string;
  work_date: string;
  hours: number;
  reason: string;
  claimed_by: string;
  claimed_at: string;
  approved_by: string | null;
  approved_at: string | null;
  declined_reason: string | null;
}

export type PayrollStatus = "DRAFT" | "APPROVED" | "PAID";

export interface PayrollRun {
  id: string;
  run_no: string;
  /** Inclusive, `YYYY-MM-DD`. Weekly for the workshop, monthly for staff —
   *  the period is on the run, not assumed by the code. */
  period_start: string;
  period_end: string;
  status: PayrollStatus;
  created_at: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
  /** The ledger row that paid it, once it has been paid. */
  paid_trx_no: string | null;
  note: string | null;
}

export interface PayrollLine {
  employee_id: string;
  employee_no: string;
  full_name: string;
  position: string;
  pay_basis: PayBasis;
  base_rate: number;
  /** Days present, and of those, how many are still open. */
  days_worked: number;
  days_open: number;
  normal_hours: number;
  /** Approved only — claimed-but-unapproved hours are listed apart. */
  overtime_hours: number;
  overtime_pending_hours: number;
  base_pay: number;
  overtime_pay: number;
  gross: number;
  /** Anything a person cannot resolve from the figures alone. */
  warnings: string[];
}

export interface PayrollView extends PayrollRun {
  lines: PayrollLine[];
  gross_total: number;
  /** Days inside the period that nobody has closed. A run with open days is
   *  computable and not trustworthy, and the screen says which. */
  open_days: number;
  pending_overtime_hours: number;
}
