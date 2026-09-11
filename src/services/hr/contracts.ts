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
  /** Paid leave this person is entitled to in a calendar year, in days.
   *
   *  **Per person, deliberately** (owner, answering Q33): length of service,
   *  what was agreed when they were hired, and whether they are staff or
   *  workshop all move it, so a company-wide constant would be wrong for
   *  almost everybody. Days beyond it are still taken and still recorded —
   *  they are simply not paid, and the timesheet says which is which (D144). */
  paid_leave_days: number;
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

/** Whether a marked day reaches the payslip, and why.
 *
 *  Answering Q33 (owner): **sakit is paid when the doctor's letter is
 *  behind it**, and **cuti is paid only out of what that person has left** —
 *  every one of them has a different number. Everything else stays unpaid
 *  (D144). The reason travels with the figure because "why is this day worth
 *  nothing" is the question an employee asks, and an app that cannot answer it
 *  makes HRD answer it from memory.
 */
export interface DayPay {
  /** What payroll counts this day as: 1, 0,5 or 0. */
  value: number;
  /** One sentence, in Indonesian, for the person whose day it is. */
  why: string;
  /** Set when the mark could be paid and something is missing — no surat
   *  dokter, no paid leave left. Never a refusal: the day is recorded either
   *  way, and this is what makes the unpaid one visible while it can still be
   *  fixed. */
  fixable: string | null;
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
  /** Why it is worth that, and what would change it (D144). */
  pay: DayPay;
  /** What a person has to resolve, in words. */
  issues: string[];
}

/** Overtime arrives as a **sheet**, and there are two kinds of sheet.
 *
 *  This is the owner's own description of the paper that already exists, and
 *  the two are genuinely different documents (D146):
 *
 *  - **Produksi.** One sheet, one night, **many names** — and against each
 *    name the job, the item, how far it got and how many. It is signed by
 *    leadership, because it is a batch of wages and a batch of production
 *    claims at once. It is also the only overtime that needs that signature.
 *  - **Staff.** One sheet **per session**, one person, with their own report
 *    of what they did — usually a screenshot of the work. No leadership
 *    signature: HRD decides whether it is paid, and **the default is yes**,
 *    because the person already stayed and the report is attached.
 *
 *  What the two share is that hours are never inferred from the reader (D138).
 *  What they do not share is who has to sign, and pretending otherwise is how
 *  a designer's Tuesday evening ends up waiting on the Direktur.
 */
export type OvertimeKind = "production" | "staff";

export const OVERTIME_KIND_LABEL: Record<OvertimeKind, string> = {
  production: "Lembur produksi",
  staff: "Lembur staff",
};

export interface OvertimeSheet {
  id: string;
  sheet_no: string;
  kind: OvertimeKind;
  /** The office day the work happened. One sheet covers one night. */
  work_date: string;
  /** Why there was overtime at all — the shift's own heading. */
  purpose: string;
  created_by: string;
  created_at: string;
  /** HRD checked the hours against the taps. Both kinds pass through here. */
  hrd_checked_by: string | null;
  hrd_checked_at: string | null;
  /** Leadership's signature. **Production only** (D146). */
  leader_approved_by: string | null;
  leader_approved_at: string | null;
  /** Staff sheets are paid unless HRD says otherwise — so this ships `true`
   *  and is only ever turned off deliberately, with a reason (D146). Not used
   *  by production sheets, whose payment is the leadership signature. */
  paid: boolean;
  unpaid_reason: string | null;
  declined_by: string | null;
  declined_reason: string | null;
}

/** One person's line on a sheet.
 *
 *  The production fields are why this module now touches `production`: *item
 *  apa, proses sampai mana, berapa*. They are carried as the work order's
 *  public number and a stage code, validated at the seam — never as a foreign
 *  key into another service (ADR-004, D147).
 */
export interface OvertimeLine {
  id: string;
  sheet_id: string;
  employee_id: string;
  hours: number;
  /** What they were doing, in the words on the sheet. */
  task: string;
  /** Production lines: which order, which stage, how many finished. */
  wo_no: string | null;
  stage: string | null;
  qty_done: number | null;
  /** The **GAJI** column of the paper form: what was written against this
   *  person's name and signed for (D154).
   *
   *  When it is there it is what payroll pays, because it is what the sheet
   *  says and what the man signed beside. The computed figure — hours × the
   *  ordinary hourly rate — is still shown next to it, and a difference
   *  between the two is displayed rather than resolved: one of them is wrong
   *  and only a person knows which. */
  form_amount: number | null;
}

/** Something added to or taken off a payslip by a person, with a reason.
 *
 *  Distinct from the statutory deductions this system still refuses to invent
 *  (D140): BPJS and PPh 21 are rules nobody has given us, while these are the
 *  company's own decisions about one person and one period — a late arrival, a
 *  written warning, money left over from the last run. Each one is typed by
 *  somebody, carries a sentence, and appears on the payslip in words (D155).
 */
export type AdjustmentKind = "late" | "sp" | "carry_over" | "advance" | "bonus" | "other";

export const ADJUSTMENT_LABEL: Record<AdjustmentKind, string> = {
  late: "Keterlambatan",
  sp: "Surat peringatan",
  carry_over: "Selisih periode lalu",
  advance: "Kasbon / potongan pinjaman",
  bonus: "Tambahan",
  other: "Lain-lain",
};

export interface PayrollAdjustment {
  id: string;
  /** The run it belongs to. An adjustment is always about one period. */
  run_no: string;
  employee_id: string;
  kind: AdjustmentKind;
  /** **Signed.** Negative takes money off, positive adds it — including a
   *  carry-over, which goes either way depending on who owes whom. */
  amount: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface PayrollAdjustmentView extends PayrollAdjustment {
  employee_no: string;
  full_name: string;
}

/** Where a sheet has got to. Derived from the signatures and the attached
 *  paper, never stored beside them (A3). */
export type OvertimeStage =
  | "waiting_hrd"      // nobody has checked the hours yet
  | "waiting_surat"    // production: the signed sheet is not attached
  | "waiting_leader"   // production: the letter is there, leadership has not signed
  | "approved"         // production: both signatures — it reaches a payslip
  | "paid_default"     // staff: paid because nobody said otherwise
  | "paid_checked"     // staff: HRD looked and said yes
  | "unpaid"           // staff: HRD looked and said no, with a reason
  | "declined";

export const OVERTIME_STAGE_LABEL: Record<OvertimeStage, string> = {
  waiting_hrd: "Menunggu HRD",
  waiting_surat: "Menunggu surat lembur",
  waiting_leader: "Menunggu pimpinan",
  approved: "Disetujui pimpinan",
  paid_default: "Dibayar — belum ditinjau",
  paid_checked: "Dibayar — ditinjau HRD",
  unpaid: "Tidak dibayar",
  declined: "Ditolak",
};

export interface OvertimeLineView extends OvertimeLine {
  employee_no: string;
  full_name: string;
}

export interface OvertimeSheetView extends OvertimeSheet {
  lines: OvertimeLineView[];
  stage: OvertimeStage;
  /** True when the hours on this sheet reach a payslip as they stand. */
  payable: boolean;
  total_hours: number;
  /** The signed sheet (production) or the work report (staff). */
  evidence: { attachment_id: string; filename: string; kind: string } | null;
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
  /** The paid days that were not worked, kept apart so a payslip can say what
   *  it is paying for: sakit with a letter, cuti out of the balance (D144). */
  days_present: number;
  days_sick_paid: number;
  days_leave_paid: number;
  /** Recorded, and not paid — the line an employee will ask about. */
  days_unpaid: number;
  normal_hours: number;
  /** Approved only — claimed-but-unapproved hours are listed apart. */
  overtime_hours: number;
  overtime_pending_hours: number;
  base_pay: number;
  overtime_pay: number;
  gross: number;
  /** What was added or taken off by hand, each with its reason (D155). */
  adjustments: { kind: AdjustmentKind; label: string; amount: number; reason: string }[];
  /** Σ adjustments — negative when more was taken off than added. */
  adjustment_total: number;
  /** `gross + adjustment_total`. Still before any statutory deduction, which
   *  this system does not compute (D140). */
  net: number;
  /** Minutes late across the period, from the taps. Evidence for a
   *  `late` adjustment, never itself a deduction: what a minute costs is a
   *  policy nobody has stated (Q41). */
  late_minutes: number;
  /** Every day of the period, for the weekly recap on the payslip (D156). */
  days: PayslipDay[];
  /** Anything a person cannot resolve from the figures alone. */
  warnings: string[];
}

/** One day, as a payslip prints it — the owner's own sketch: masuk, pulang,
 *  jam, and the overtime under it (D156). */
export interface PayslipDay {
  work_date: string;
  /** 1 Monday … 7 Sunday. */
  weekday: number;
  in_at: string | null;
  out_at: string | null;
  work_hours: number;
  overtime_hours: number;
  /** `merah`, `sakit`, `cuti` — the short mark, when there is one. */
  mark: string | null;
  day_value: number;
  /** The machine's record of this day is incomplete and nobody has read it, so
   *  it counts for nothing yet. Printed on the slip rather than hidden: a day
   *  with hours beside it that adds nothing to the total is the one an
   *  employee is right to argue about (D156). */
  open: boolean;
}

export interface PayrollView extends PayrollRun {
  lines: PayrollLine[];
  gross_total: number;
  /** Gross plus everything added or taken off by hand (D155). */
  net_total: number;
  adjustment_total: number;
  /** Days inside the period that nobody has closed. A run with open days is
   *  computable and not trustworthy, and the screen says which. */
  open_days: number;
  pending_overtime_hours: number;
}
