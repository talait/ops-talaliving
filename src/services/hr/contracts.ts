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

/** Where a scan came from. `import` is the machine's own export; `manual` is a
 *  person putting in what the machine missed, which always carries a reason
 *  (D137). */
export type ScanSource = "import" | "manual";

/** One tap on the reader.
 *
 *  This is what the machine actually produces — a person, a moment, and how
 *  they were recognised. **Not** a check-in and a check-out: the export from
 *  the real device is one row per tap, four on an ordinary day and six when
 *  somebody works late, and which tap means *istirahat keluar* is our reading
 *  of it rather than something the machine says (D141).
 */
export interface AttendanceScan {
  id: string;
  employee_id: string;
  /** Office day this tap belongs to, WITA. */
  work_date: string;
  at: string;
  /** `FACE`, `FP`, whatever the device calls it. Carried verbatim. */
  verify: string;
  location: string | null;
  source: ScanSource;
  /** The import that brought it in, so a re-upload is a no-op rather than a
   *  second day. */
  import_id: string | null;
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

/** The six things a full day is made of, in the order they happen. */
export const SCAN_SLOTS = ["in", "break_out", "break_in", "out", "ot_start", "ot_end"] as const;
export type ScanSlot = (typeof SCAN_SLOTS)[number];

export const SLOT_LABEL: Record<ScanSlot, string> = {
  in: "Masuk",
  break_out: "Istirahat keluar",
  break_in: "Istirahat masuk",
  out: "Pulang",
  ot_start: "Lembur mulai",
  ot_end: "Lembur selesai",
};

/** What HRD says about a day, when the machine alone cannot say it.
 *
 *  These are not corrections to the scans — they are facts about the day that
 *  no reader can know: that it was a public holiday, that the office sent
 *  everybody home at noon, that somebody was ill. A mark never deletes a scan
 *  and a scan never overrides a mark (D142).
 */
export type DayMarkKind =
  | "holiday"     // tanggal merah — being here at all is overtime
  | "half_day"    // acara kantor, kecelakaan, blackout
  | "absent"      // tidak masuk, tanpa keterangan
  | "sick"        // sakit
  | "leave"       // cuti
  | "permit";     // izin

export const DAY_MARK_LABEL: Record<DayMarkKind, string> = {
  holiday: "Tanggal merah",
  half_day: "Setengah hari",
  absent: "Tidak masuk",
  sick: "Sakit",
  leave: "Cuti",
  permit: "Izin",
};

/** The same six, short enough for a cell in a grid forty people wide. */
export const DAY_MARK_SHORT: Record<DayMarkKind, string> = {
  holiday: "merah",
  half_day: "½ hari",
  absent: "absen",
  sick: "sakit",
  leave: "cuti",
  permit: "izin",
};

export interface DayMark {
  id: string;
  /** Null means everybody — a public holiday is not marked person by person. */
  employee_id: string | null;
  work_date: string;
  kind: DayMarkKind;
  reason: string;
  marked_by: string;
  marked_at: string;
}

/** How a day stands once the taps have been read against the six slots.
 *
 *  `review` is the honest state for what the real machine mostly produces: an
 *  odd number of taps, a missing *istirahat masuk*, a double tap eleven
 *  minutes apart. In the export this was built against, **48 of 227 days**
 *  land here, and guessing any of them would be guessing somebody's wages
 *  (D141).
 */
export type DayState = "complete" | "review" | "marked" | "off";

export interface TimesheetDay {
  employee_id: string;
  employee_no: string;
  full_name: string;
  work_date: string;
  /** Every tap, in order. The reading is derived; the taps are the record. */
  scans: { at: string; verify: string; slot: ScanSlot | null; source: ScanSource }[];
  slots: Partial<Record<ScanSlot, string>>;
  state: DayState;
  mark: DayMark | null;
  /** In the building, break subtracted. */
  work_hours: number;
  break_hours: number;
  /** From the lembur pair, or the whole day when it is a public holiday. */
  overtime_hours: number;
  /** 1 for a full day, 0.5 for a half day, 0 for absent — what payroll counts. */
  day_value: number;
  /** What a person has to resolve, in words. */
  issues: string[];
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
