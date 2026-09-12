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
  Employee, TimesheetDay, DayState, ScanSlot, DayPay, DayMark,
  OvertimeSheet, OvertimeStage, PayrollLine, PayrollView, PayrollRun,
  PayslipDay, AdjustmentKind,
  PayRules, PayRuleSet, OvertimeTier, OvertimePart,
  EmployeeFileView, EmployeeDocSlot, EmployeeDocument, EmployeeDocumentView,
  LeaveBalance, LeaveRequest, LeaveRequestView,
} from "@/services/hr/contracts";
import {
  ADJUSTMENT_LABEL, DAY_MARK_SHORT,
  EMPLOYEE_DOC_CHECKLIST, EMPLOYEE_DOC_LABEL, SENSITIVE_DOC_KINDS, DOC_NO_DIGITS, maskDocNo,
} from "@/services/hr/contracts";

const HOURS = 3_600_000;

/** Hours between two stamps, to two decimals. Crossing midnight is normal —
 *  the security shift starts at 19:00 and ends at 07:00. */
function hoursBetween(from: string, to: string): number {
  let ms = Date.parse(to) - Date.parse(from);
  if (ms < 0) ms += 24 * HOURS;
  return Math.round((ms / HOURS) * 100) / 100;
}

/** Taps a person made on one day, de-duplicated.
 *
 *  A reader scanned twice in the same minute is one arrival, not two — the
 *  real export has 29 of them. Two minutes is the window: it is long enough to
 *  swallow a finger that did not take the first time, and short enough to keep
 *  a genuine second tap eleven minutes later, which is a different event
 *  somebody has to look at (D141).
 */
function tapsOf(state: DemoState, employeeId: string, workDate: string) {
  const rows = state.attendance_scans
    .filter((r) => r.employee_id === employeeId && r.work_date === workDate)
    .sort((a, b) => a.at.localeCompare(b.at));
  const kept: typeof rows = [];
  for (const r of rows) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(Date.parse(r.at) - Date.parse(last.at)) < 120_000) continue;
    kept.push(r);
  }
  return kept;
}

const hhmm = (iso: string) => iso.slice(11, 16);
const minutes = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** Is the doctor's letter behind this mark?
 *
 *  Evidence reaches a record the same way everywhere in this system: through
 *  an attachment link declared by a person (ADR-010). So *sakit dibayar kalau
 *  ada surat dokter* is not a boolean somebody ticks — it is whether a
 *  `Surat Dokter` is linked to that mark, by name, with a date (D144).
 */
function suratDokter(state: DemoState, mark: DayMark): boolean {
  return state.attachment_links.some(
    (l) => l.entity === "day_mark" && l.entity_no === mark.id && l.kind === "Surat Dokter",
  );
}

/** Paid leave already taken this calendar year, before `workDate`.
 *
 *  Counted rather than stored. A stored "sisa cuti" is a number that drifts
 *  the first time a mark is removed, and the person it drifts against is the
 *  one who loses a paid day (A3). The order is the year's own: the first days
 *  of the entitlement are the paid ones, and once it is spent the rest are
 *  recorded and unpaid (D144).
 */
function leaveTakenBefore(state: DemoState, employeeId: string, workDate: string): number {
  const year = workDate.slice(0, 4);
  return state.day_marks.filter(
    (m) => m.kind === "leave"
      && m.employee_id === employeeId
      && m.work_date.slice(0, 4) === year
      && m.work_date < workDate,
  ).length;
}

/** What a marked day is worth, and why — the sentence an employee asks for.
 *
 *  Answering Q33 (owner, 2026-09-11): *sakit* is paid when the surat dokter is
 *  there, *cuti* is paid out of that person's own balance, and everything else
 *  is recorded without being paid. Nothing here refuses a mark: a day taken
 *  with no letter and no balance left is still a fact about that person's
 *  month, and hiding it would only move the argument to payday (D144).
 */
function payOfMark(
  state: DemoState,
  employee: Employee,
  mark: DayMark,
  workHours: number,
): DayPay {
  switch (mark.kind) {
    case "half_day":
      return { value: 0.5, why: "Setengah hari — dibayar 0,5 hari.", fixable: null };
    case "holiday":
      return {
        value: 0,
        why: workHours > 0
          ? "Tanggal merah — jam yang dikerjakan dihitung lembur, harinya sendiri tidak."
          : "Tanggal merah — bukan hari kerja.",
        fixable: null,
      };
    case "sick": {
      if (suratDokter(state, mark)) {
        return { value: 1, why: "Sakit dengan surat dokter — dibayar penuh.", fixable: null };
      }
      return {
        value: 0,
        why: "Sakit tanpa surat dokter — tidak dibayar.",
        fixable: "Lampirkan surat dokter dan hari ini terhitung dibayar.",
      };
    }
    case "leave": {
      const taken = leaveTakenBefore(state, employee.id, mark.work_date);
      const left = employee.paid_leave_days - taken;
      if (left > 0) {
        return {
          value: 1,
          why: `Cuti berbayar — sisa hak cuti ${left} hari sebelum hari ini, dari ${employee.paid_leave_days}.`,
          fixable: null,
        };
      }
      return {
        value: 0,
        why: `Cuti di luar hak — jatah ${employee.paid_leave_days} hari tahun ini sudah habis.`,
        fixable: null,
      };
    }
    case "permit":
      return { value: 0, why: "Izin — tercatat, tidak dibayar.", fixable: null };
    case "absent":
    default:
      return { value: 0, why: "Tidak masuk tanpa keterangan — tidak dibayar.", fixable: null };
  }
}

/** Reading a day's taps against the six slots.
 *
 *  The rule is written here rather than buried, because it is a **reading**
 *  and every reading can be wrong: the first tap is `masuk`, a tap in the
 *  middle of the day is the break going out and coming back, the first tap
 *  after mid-afternoon is `pulang`, and a pair after that is the lembur.
 *
 *  What matters more than the rule is what happens when it does not fit.
 *  Anything left over, or any slot the rule cannot fill, makes the day
 *  `review` — never a guess. On the export this was built against that is 48
 *  days out of 227, and each of them is somebody's wages (D141).
 */
export function timesheetDay(
  state: DemoState,
  employee: Employee,
  workDate: string,
): TimesheetDay {
  const taps = tapsOf(state, employee.id, workDate);
  const mark = state.day_marks.find(
    (m) => m.work_date === workDate
      && (m.employee_id === null || m.employee_id === employee.id),
  ) ?? null;

  const slots: Partial<Record<ScanSlot, string>> = {};
  const assigned = new Map<string, ScanSlot>();
  const issues: string[] = [];

  const rest = [...taps];
  const take = (slot: ScanSlot, pick: (t: typeof taps[number]) => boolean) => {
    const i = rest.findIndex(pick);
    if (i === -1) return false;
    slots[slot] = rest[i].at;
    assigned.set(rest[i].id, slot);
    rest.splice(i, 1);
    return true;
  };

  if (taps.length > 0) {
    take("in", () => true);
    /* The middle of the day: out to eat, back from eating. */
    take("break_out", (t) => minutes(t.at) >= 11 * 60 && minutes(t.at) < 13 * 60 + 30);
    take("break_in", (t) => minutes(t.at) >= 11 * 60 + 30 && minutes(t.at) < 14 * 60 + 30);
    take("out", (t) => minutes(t.at) >= 14 * 60 + 30);
    take("ot_start", (t) => slots.out !== undefined && t.at > slots.out!);
    take("ot_end", (t) => slots.ot_start !== undefined && t.at > slots.ot_start!);
  }

  const worked = (a?: string, b?: string) =>
    a && b ? Math.max(Math.round(((Date.parse(b) - Date.parse(a)) / HOURS) * 100) / 100, 0) : 0;

  let break_hours = worked(slots.break_out, slots.break_in);
  const gross_hours = worked(slots.in, slots.out);
  let work_hours = Math.max(Math.round((gross_hours - break_hours) * 100) / 100, 0);
  let overtime_hours = worked(slots.ot_start, slots.ot_end);

  /* Anything the rule could not place. Left over taps are the loudest signal
     that this day needs a person: they are real events nobody has explained. */
  if (rest.length > 0) {
    issues.push(`${rest.length} tap(s) the rule could not place: ${rest.map((t) => hhmm(t.at)).join(", ")}`);
  }
  if (taps.length > 0) {
    if (!slots.out) issues.push("No pulang — the day has no end");
    if (!slots.break_out || !slots.break_in) issues.push("Istirahat incomplete");
    if (slots.ot_start && !slots.ot_end) issues.push("Lembur started and never finished");
  }

  let day_value = 0;
  let state_: DayState;
  let pay: DayPay;

  if (mark) {
    state_ = "marked";
    pay = payOfMark(state, employee, mark, work_hours);
    day_value = pay.value;
    if (mark.kind === "holiday") {
      /* Tanggal merah: being here at all is overtime (owner). The day itself
         is not a working day, so it adds no day_value — the hours do. */
      overtime_hours = work_hours > 0 ? work_hours : overtime_hours;
      work_hours = 0;
    } else if (mark.kind !== "half_day") {
      /* Away is away: no hours are counted for a day somebody did not work,
         whether or not it is paid. The taps themselves stay untouched below —
         it is the counting that stops, not the record (D142). */
      work_hours = 0;
      break_hours = 0;
      overtime_hours = 0;
    }
  } else if (taps.length === 0) {
    state_ = "off";
    pay = { value: 0, why: "Tidak ada absensi sama sekali pada hari ini.", fixable: "Tetapkan hari ini — libur, sakit, cuti atau tidak masuk." };
  } else if (issues.length > 0) {
    state_ = "review";
    pay = { value: 0, why: "Belum dibaca — absensi hari ini tidak lengkap, jadi belum bernilai.", fixable: "Lengkapi tap yang hilang, atau tetapkan hari ini." };
  } else {
    state_ = "complete";
    day_value = 1;
    pay = { value: 1, why: "Hari kerja penuh.", fixable: null };
  }

  return {
    employee_id: employee.id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    work_date: workDate,
    scans: taps.map((t) => ({
      at: t.at, verify: t.verify, slot: assigned.get(t.id) ?? null, source: t.source,
    })),
    slots,
    state: state_,
    mark,
    work_hours,
    break_hours,
    overtime_hours,
    day_value,
    pay,
    issues,
  };
}

/** Where a sheet has got to, and whether its hours reach a payslip.
 *
 *  Two paths, because the owner described two documents (D146):
 *
 *  - **Produksi** — HRD checks the hours, the signed sheet is attached, and
 *    leadership signs. Nothing is paid until all three.
 *  - **Staff** — HRD alone, and the default is **paid**: the person already
 *    stayed and their report is attached, so the decision HRD takes is whether
 *    to turn it off, not whether to turn it on.
 *
 *  Derived from the signatures and the attached paper rather than stored
 *  beside them, so a status can never disagree with what is under it (A3).
 */
export function overtimeStage(state: DemoState, sheet: OvertimeSheet): OvertimeStage {
  if (sheet.declined_reason) return "declined";

  if (sheet.kind === "staff") {
    if (!sheet.paid) return "unpaid";
    return sheet.hrd_checked_at ? "paid_checked" : "paid_default";
  }

  if (!sheet.hrd_checked_at) return "waiting_hrd";
  if (sheet.leader_approved_at) return "approved";
  return sheetEvidence(state, sheet.id, "Surat Lembur") ? "waiting_leader" : "waiting_surat";
}

/** The paper behind a sheet: the signed form for production, the screenshot
 *  report for a staff session. Both arrive as attachments on the same road as
 *  every other document here (ADR-010). */
export function sheetEvidence(state: DemoState, sheetId: string, kind?: string) {
  return state.attachment_links.find(
    (l) => l.entity === "overtime" && l.entity_no === sheetId
      && (kind ? l.kind === kind : l.kind === "Surat Lembur" || l.kind === "Laporan Lembur"),
  ) ?? null;
}

/** Do these hours reach a payslip as things stand? */
export function overtimePayable(state: DemoState, sheet: OvertimeSheet): boolean {
  const stage = overtimeStage(state, sheet);
  return stage === "approved" || stage === "paid_default" || stage === "paid_checked";
}

/** Every day of a period for one person, including the days with nothing on
 *  them — a day nobody scanned is a fact too. */
export function timesheet(
  state: DemoState,
  employee: Employee,
  from: string,
  to: string,
): TimesheetDay[] {
  const out: TimesheetDay[] = [];
  /* Walked as strings, in office days. Going through `Date` to build a key
     converts back via UTC and loses the last day of every period (F39). */
  for (let key = from; key <= to; key = nextDay(key)) {
    out.push(timesheetDay(state, employee, key));
  }
  return out;
}

/** The next office day, without going near a timezone. */
function nextDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
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
  /** Adjustments belong to a run, so the line has to know which one it is
   *  being computed for (D155). */
  runNo = "",
  /** A rule book to apply instead of the one in force. Only the preview uses
   *  it: *what would this multiplier do to this period* is a question worth
   *  answering before somebody commits to the answer (D175). */
  rulesOverride?: PayRules,
): PayrollLine {
  const days = timesheet(state, employee, from, to);
  /* A day is worth what the timesheet says it is worth: a full day, half of
     one when the office closed at noon, none at all when somebody was away
     (D142). */
  const counted = days.filter((d) => d.day_value > 0);
  const worked_days = days.reduce((s, d) => s + d.day_value, 0);
  const open = days.filter((d) => d.state === "review");

  /* Overtime arrives as sheets; a person's hours are their lines on the ones
     covering this period. Whether those hours are paid is a property of the
     sheet, not of the line (D146). */
  const myLines = state.overtime_lines
    .map((l) => ({ line: l, sheet: state.overtime_sheets.find((sh) => sh.id === l.sheet_id) }))
    .filter((x) => x.sheet
      && x.line.employee_id === employee.id
      && x.sheet.work_date >= from && x.sheet.work_date <= to);

  const payableLines = payableLinesOf(state, employee, from, to);
  const approvedOt = payableLines.reduce((s, x) => s + x.line.hours, 0);
  const pendingOt = myLines
    .filter((x) => !overtimePayable(state, x.sheet!) && !x.sheet!.declined_reason && x.sheet!.paid)
    .reduce((s, x) => s + x.line.hours, 0);

  const normal_hours = counted.reduce((s, d) => s + d.work_hours, 0);
  /* Hours the machine shows past the day, and the whole of a public holiday.
     Still not paid until a claim for them is approved (D138). */
  const shown_ot = days.reduce((s, d) => s + d.overtime_hours, 0);

  /* Monthly staff are paid the month whatever the machine says; a daily or
     hourly person is paid for what they were here for. That difference is the
     only place `pay_basis` is used, and it is why it exists. */
  const base_pay = employee.pay_basis === "monthly"
    ? employee.base_rate
    : employee.pay_basis === "daily"
      ? Math.round(worked_days * employee.base_rate)
      : Math.round(normal_hours * employee.base_rate);

  /* What an ordinary hour of this person's time is worth, and then the ladder
     the active rule book says to multiply it by (D173). Both come out of the
     rules — the monthly divisor is 173 because the regulation says so, not
     because the code does. */
  const rules = rulesOverride ?? activePayRules(state, from).rules;
  const hourly = hourlyRate(employee, rules);
  const overtime_parts = overtimeParts(state, employee, from, to, rules, hourly);
  const overtime_pay = overtime_parts.reduce((s, p) => s + p.amount, 0);

  /* Hours short of the contracted day. Off by default: what a short hour costs
     here has not been stated, and a deduction invented by software reaches
     somebody's pocket (D174). */
  const under = undertimeOf(days, employee, rules, hourly);

  /* What the paid days are made of, so a payslip can say it rather than
     showing one total nobody can take apart (D144). */
  const marked = days.filter((d) => d.mark);
  const days_present = days
    .filter((d) => !d.mark && d.day_value > 0)
    .reduce((s, d) => s + d.day_value, 0)
    + marked.filter((d) => d.mark!.kind === "half_day").reduce((s, d) => s + d.day_value, 0);
  const days_sick_paid = marked.filter((d) => d.mark!.kind === "sick" && d.day_value > 0).length;
  const days_leave_paid = marked.filter((d) => d.mark!.kind === "leave" && d.day_value > 0).length;
  const days_unpaid = marked.filter((d) => d.day_value === 0 && d.mark!.kind !== "holiday").length;

  const warnings: string[] = [];
  if (open.length > 0) {
    warnings.push(`${open.length} day(s) need a person to read them — worth nothing until they do`);
  }
  if (shown_ot > 0 && shown_ot > approvedOt + pendingOt) {
    warnings.push(`${Math.round((shown_ot - approvedOt - pendingOt) * 10) / 10} hour(s) past the day on the machine that nobody has claimed`);
  }
  if (pendingOt > 0) {
    warnings.push(`${pendingOt} overtime hour(s) on a sheet nobody has finished signing — not in this figure`);
  }
  const noLetter = marked.filter((d) => d.mark!.kind === "sick" && d.day_value === 0).length;
  if (noLetter > 0) {
    warnings.push(`${noLetter} sick day(s) with no surat dokter — recorded, not paid. A letter makes them paid`);
  }
  const overLeave = marked.filter((d) => d.mark!.kind === "leave" && d.day_value === 0).length;
  if (overLeave > 0) {
    warnings.push(`${overLeave} day(s) of cuti beyond this person's ${employee.paid_leave_days}-day entitlement — recorded, not paid`);
  }
  if (employee.pay_basis !== "monthly" && worked_days === 0) {
    warnings.push("No day counted in this period");
  }

  /* Adjustments: what a person added or took off, each with its sentence
     (D155). Never invented — this system computes no deduction it was not
     told about. */
  const adjustments = state.payroll_adjustments
    .filter((a) => a.employee_id === employee.id && a.run_no === runNo)
    .map((a) => ({
      kind: a.kind as AdjustmentKind,
      label: ADJUSTMENT_LABEL[a.kind],
      amount: a.amount,
      reason: a.reason,
    }));
  const adjustment_total = adjustments.reduce((s, a) => s + a.amount, 0);

  /* Minutes late across the period. **Evidence, not a deduction**: what a
     minute of lateness costs has never been stated, so the figure is shown and
     the rupiah is typed by a person (Q41). */
  const late_minutes = days.reduce((s, d) => {
    const inAt = d.slots.in;
    if (!inAt || d.mark) return s;
    const mins = Number(inAt.slice(11, 13)) * 60 + Number(inAt.slice(14, 16));
    return s + Math.max(mins - rules.late_after_minutes, 0);
  }, 0);

  const payslipDays: PayslipDay[] = days.map((d) => ({
    work_date: d.work_date,
    weekday: weekdayOf(d.work_date),
    in_at: d.slots.in ? d.slots.in.slice(11, 16) : null,
    out_at: d.slots.out ? d.slots.out.slice(11, 16) : null,
    work_hours: d.work_hours,
    overtime_hours: d.overtime_hours,
    mark: d.mark ? DAY_MARK_SHORT[d.mark.kind] : null,
    day_value: d.day_value,
    open: d.state === "review",
  }));

  if (adjustment_total < 0) {
    warnings.push(`${adjustments.filter((a) => a.amount < 0).length} potongan dicatat tangan — lihat rinciannya di slip`);
  }

  return {
    employee_id: employee.id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    position: employee.position,
    pay_basis: employee.pay_basis,
    base_rate: employee.base_rate,
    days_worked: worked_days,
    days_open: open.length,
    days_present: Math.round(days_present * 100) / 100,
    days_sick_paid,
    days_leave_paid,
    days_unpaid,
    normal_hours: Math.round(normal_hours * 100) / 100,
    overtime_hours: approvedOt,
    overtime_pending_hours: pendingOt,
    base_pay,
    overtime_pay,
    overtime_parts,
    undertime_hours: under.hours,
    undertime_amount: under.amount,
    /* Undertime is part of the gross, not an adjustment: it is arithmetic over
       recorded hours under a stated rule, while an adjustment is one person's
       decision about another (D155). */
    gross: base_pay + overtime_pay - under.amount,
    adjustments,
    adjustment_total,
    net: base_pay + overtime_pay - under.amount + adjustment_total,
    late_minutes,
    days: payslipDays,
    warnings,
  };
}


/* ── The rule book ─────────────────────────────────────────────────────────
 *
 *  Which version applies is decided by the **period's start**, not by today:
 *  recomputing an August payslip in December must produce August's figure
 *  (D173). A rule that changed mid-period does not split a payslip in two —
 *  the version in force when the period opened governs all of it, which is
 *  what a person who has already been paid would expect.
 */
export function activePayRules(state: DemoState, onDate: string): PayRuleSet {
  const sets = [...state.pay_rule_sets].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const found = sets.filter((r) => r.effective_from <= onDate).pop();
  /* Before the first version there is no policy, and the honest fallback is
     the earliest one somebody wrote down rather than an invented default. */
  return found ?? sets[0];
}

/** Whether a date is a weekly rest day under the active pattern, or a public
 *  holiday somebody marked. Both take the steeper ladder. */
function isRestDay(state: DemoState, rules: PayRules, date: string): boolean {
  const marked = state.day_marks.some((m) => m.work_date === date && m.employee_id === null && m.kind === "holiday");
  if (marked) return true;
  const wd = weekdayOf(date);
  return rules.week_pattern === "5day" ? wd >= 6 : wd === 7;
}

/** The ladder, applied to one night's hours.
 *
 *  Returns the parts rather than a total, because the total is the thing
 *  nobody can check: *3 jam lembur = Rp 91.000* invites an argument, while
 *  *jam ke-1 × 1,5 + 2 jam × 2 = 5,5 jam × Rp 16.500* ends one (D173).
 */
function tierParts(hours: number, tiers: OvertimeTier[]): { hours: number; multiplier: number; from: number }[] {
  const ladder = [...tiers].sort((a, b) => a.after_hours - b.after_hours);
  const parts: { hours: number; multiplier: number; from: number }[] = [];
  let taken = 0;
  for (let i = 0; i < ladder.length && taken < hours; i += 1) {
    const from = ladder[i].after_hours;
    const to = i + 1 < ladder.length ? ladder[i + 1].after_hours : Infinity;
    const slice = Math.min(hours, to) - Math.max(taken, from);
    if (slice > 0) {
      parts.push({ hours: Math.round(slice * 100) / 100, multiplier: ladder[i].multiplier, from });
      taken = Math.max(taken, from) + slice;
    }
  }
  return parts;
}

/** `jam ke-1`, `jam 2–7`, `jam 8 ke atas` — how the ladder reads on paper. */
function tierLabel(restDay: boolean, from: number, hours: number): string {
  const day = restDay ? "Hari libur" : "Hari kerja";
  const first = from + 1;
  const last = from + hours;
  const span = hours <= 1 || first === last
    ? `jam ke-${Math.round(first)}`
    : `jam ${Math.round(first)}–${Math.round(last)}`;
  return `${day} · ${span}`;
}

/** Rounding, where the rule asks for it. Zero minutes means exact — the figure
 *  the machine produced, not one somebody negotiated. */
function roundHours(hours: number, minutes: number): number {
  if (!minutes) return hours;
  const step = minutes / 60;
  return Math.round(hours / step) * step;
}


/** The overtime lines that reach a payslip: on sheets covering the period,
 *  belonging to this person, and signed all the way (D146). */
function payableLinesOf(state: DemoState, employee: Employee, from: string, to: string) {
  return state.overtime_lines
    .map((l) => ({ line: l, sheet: state.overtime_sheets.find((sh) => sh.id === l.sheet_id) }))
    .filter((x) => x.sheet
      && x.line.employee_id === employee.id
      && x.sheet.work_date >= from && x.sheet.work_date <= to
      && overtimePayable(state, x.sheet))
    .map((x) => ({ line: x.line, sheet: x.sheet! }));
}

/** What one ordinary hour of this person is worth, under the active rules. */
export function hourlyRate(employee: Employee, rules: PayRules): number {
  if (employee.pay_basis === "hourly") return employee.base_rate;
  if (employee.pay_basis === "daily") return Math.round(employee.base_rate / employee.daily_hours);
  /* A month divided by the regulation's own figure. Written as a rule rather
     than as `/ 21 / 8`, which was this code's previous guess at the same
     thing. */
  return Math.round(employee.base_rate / rules.monthly_divisor);
}

/** Overtime, night by night and tier by tier.
 *
 *  Three rules meet here and the order matters:
 *
 *  1. **The paper wins where it speaks.** A GAJI figure written on the form is
 *     what the man signed for, and is paid as written (D154) — no ladder, no
 *     recomputation. A system that quietly pays a different number because its
 *     own multiplication came out differently is wrong even when its arithmetic
 *     is right.
 *  2. **Otherwise the ladder applies**, per night, because "the first hour" is
 *     the first hour of *that* night and not of the fortnight.
 *  3. **A rest day takes the steeper ladder**, and a tanggal merah counts as
 *     one (D173).
 */
export function overtimeParts(
  state: DemoState,
  employee: Employee,
  from: string,
  to: string,
  rules: PayRules,
  hourly: number,
): OvertimePart[] {
  const out: OvertimePart[] = [];

  for (const { line, sheet } of payableLinesOf(state, employee, from, to)) {
    if (line.form_amount != null) {
      out.push({
        source: sheet.sheet_no, work_date: sheet.work_date,
        hours: line.hours, multiplier: 0, hourly,
        amount: line.form_amount, label: "Sesuai form lembur",
      });
      continue;
    }
    if (rules.overtime_mode === "form_only") {
      out.push({
        source: sheet.sheet_no, work_date: sheet.work_date,
        hours: line.hours, multiplier: 0, hourly, amount: 0,
        label: "Tidak ada angka di form — tidak dibayar",
      });
      continue;
    }

    const hours = roundHours(line.hours, rules.overtime_rounding_minutes);
    const restDay = isRestDay(state, rules, sheet.work_date);
    const tiers = rules.overtime_mode === "flat"
      ? [{ after_hours: 0, multiplier: rules.flat_multiplier }]
      : restDay ? rules.restday_tiers : rules.workday_tiers;

    for (const part of tierParts(hours, tiers)) {
      out.push({
        source: sheet.sheet_no, work_date: sheet.work_date,
        hours: part.hours, multiplier: part.multiplier, hourly,
        amount: Math.round(part.hours * part.multiplier * hourly),
        label: rules.overtime_mode === "flat"
          ? `Tarif rata ${part.multiplier}×`
          : tierLabel(restDay, part.from, part.hours),
      });
    }
  }
  return out;
}

/** Hours short of the contracted day, and what the rule says they cost.
 *
 *  Only for people paid **by the day**: an hourly person is already paid for
 *  the hours they were here, and a monthly salary is a month. Days that are
 *  marked — sakit, cuti, tanggal merah — are not short days, they are
 *  different days, and counting them here would deduct twice (D174).
 */
export function undertimeOf(
  days: TimesheetDay[],
  employee: Employee,
  rules: PayRules,
  hourly: number,
): { hours: number; amount: number } {
  if (rules.undertime_mode === "off" || employee.pay_basis !== "daily") {
    return { hours: 0, amount: 0 };
  }
  const grace = rules.undertime_grace_minutes / 60;
  let short = 0;
  let halfDays = 0;
  for (const d of days) {
    if (d.mark || d.state !== "complete") continue;
    const gap = employee.daily_hours - d.work_hours;
    if (gap <= grace) continue;
    short += gap;
    if (gap > employee.daily_hours / 2) halfDays += 1;
  }
  short = Math.round(short * 100) / 100;
  if (rules.undertime_mode === "half_day_step") {
    return { hours: short, amount: Math.round(halfDays * (employee.base_rate / 2)) };
  }
  return { hours: short, amount: Math.round(short * hourly) };
}

/* The office day used to start at 08:00 in a constant here. It is a policy,
   not a fact, so it moved into the rule book where somebody can change it
   without a deployment — `rules.late_after_minutes` (D168, D173). */

/** 1 Monday … 7 Sunday, from a `YYYY-MM-DD` string without going near a
 *  timezone (F39). */
function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** The same line under a rule book that is not in force. Preview only. */
export function payrollLineWith(
  state: DemoState, employee: Employee, from: string, to: string, rules: PayRules,
): PayrollLine {
  return payrollLine(state, employee, from, to, "", rules);
}

export function payrollView(state: DemoState, run: PayrollRun): PayrollView {
  /* Anybody employed during the period, including somebody who left inside
     it — their last week is still owed. */
  const people = state.employees.filter(
    (e) => e.joined_on <= run.period_end && (e.left_on === null || e.left_on >= run.period_start),
  );
  const lines = people.map((e) => payrollLine(state, e, run.period_start, run.period_end, run.run_no));

  return {
    ...run,
    lines,
    gross_total: lines.reduce((s, l) => s + l.gross, 0),
    net_total: lines.reduce((s, l) => s + l.net, 0),
    adjustment_total: lines.reduce((s, l) => s + l.adjustment_total, 0),
    open_days: lines.reduce((s, l) => s + l.days_open, 0),
    pending_overtime_hours: lines.reduce((s, l) => s + l.overtime_pending_hours, 0),
  };
}

/* ── Berkas 201 and leave ─────────────────────────────────────────────────── */

/** Somebody's file, slot by slot, with what is missing named (D177).
 *
 *  The checklist is the point. A folder answers "what is in here"; a checklist
 *  answers "what is not", which is the only version of the question anybody
 *  ever actually needs — before a BPJS registration, before an audit, before
 *  paying somebody whose contract ran out last month.
 */
/** What leaves the store for a screen.
 *
 *  The sensitive number is dropped here rather than hidden later, which is the
 *  whole difference between a reveal log that means something and one that
 *  records a click (D196). Everything a screen legitimately needs about the
 *  number — is there one, how long is it, is that length right — survives.
 */
export function docView(d: EmployeeDocument): EmployeeDocumentView {
  const sensitive = SENSITIVE_DOC_KINDS.has(d.kind);
  const digits = d.doc_no ? d.doc_no.replace(/[^0-9A-Za-z]/g, "").length : null;
  const want = DOC_NO_DIGITS[d.kind] ?? null;
  return {
    ...d,
    doc_no: sensitive ? null : d.doc_no,
    sensitive,
    doc_no_masked: d.doc_no ? maskDocNo(d.doc_no) : null,
    doc_no_length: digits,
    doc_no_length_ok: digits != null && want != null ? digits === want : null,
  };
}

export function employeeFile(state: DemoState, employee: Employee, today: string): EmployeeFileView {
  const mine = state.employee_documents.filter((d) => d.employee_id === employee.id);

  const slots: EmployeeDocSlot[] = EMPLOYEE_DOC_CHECKLIST.map((c) => {
    const documents = mine
      .filter((d) => d.kind === c.kind)
      .sort((a, b) => (b.issued_on ?? "").localeCompare(a.issued_on ?? ""))
      .map(docView);
    const expiries = documents.map((d) => d.expires_on).filter((x): x is string => !!x);
    const soonest = expiries.sort()[0] ?? null;
    return {
      kind: c.kind,
      label: EMPLOYEE_DOC_LABEL[c.kind],
      required: c.required,
      note: c.note,
      documents,
      expires_in_days: soonest ? daysBetween(today, soonest) : null,
    };
  });

  const missing = slots.filter((s) => s.required && s.documents.length === 0).map((s) => s.kind);
  /* Already expired, or expiring inside two months. Sixty days because a PKWT
     renewal takes a conversation, not an afternoon. */
  const expiring = slots
    .filter((s) => s.expires_in_days != null && s.expires_in_days <= 60)
    .map((s) => ({
      kind: s.kind,
      label: s.label,
      expires_on: s.documents.map((d) => d.expires_on).filter((x): x is string => !!x).sort()[0],
      days: s.expires_in_days as number,
    }));

  return {
    employee_id: employee.id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    position: employee.position,
    unit: employee.unit,
    joined_on: employee.joined_on,
    active: employee.active,
    slots,
    missing,
    expiring,
    complete: missing.length === 0,
  };
}

/** Whole days between two `YYYY-MM-DD` strings, walked in UTC so the office day
 *  is not the browser's (F17, F39). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Every date in an inclusive range. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  const end = (() => { const [ey, em, ed] = to.split("-").map(Number); return Date.UTC(ey, em - 1, ed); })();
  while (t <= end) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

/** What somebody has left, computed from the marks (A3, D178).
 *
 *  `taken` counts the days already marked; `booked` counts approved requests
 *  that have not become the past yet. Both matter: an employee asking on the
 *  first of the month wants to know what is left **after** the week they have
 *  already been given.
 */
export function leaveBalance(state: DemoState, employee: Employee, year: string): LeaveBalance {
  const marks = state.day_marks.filter(
    (m) => m.employee_id === employee.id && m.work_date.startsWith(year),
  );
  const leaveDays = marks.filter((m) => m.kind === "leave");
  const taken = leaveDays.length;
  const entitlement = employee.paid_leave_days;

  const booked = state.leave_requests
    .filter((r) => r.employee_id === employee.id && r.status === "APPROVED" && r.kind === "cuti")
    .flatMap((r) => datesBetween(r.from_date, r.to_date))
    .filter((d) => d.startsWith(year))
    /* Only the ones that have not already become marks — otherwise the same
       day is counted twice, which is how a balance ends up wrong in the
       employee's favour and nobody notices until December. */
    .filter((d) => !marks.some((m) => m.work_date === d && m.kind === "leave"))
    .length;

  const sick = marks.filter((m) => m.kind === "sick");
  return {
    employee_id: employee.id,
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    entitlement,
    taken,
    booked,
    remaining: Math.max(entitlement - taken - booked, 0),
    over: Math.max(taken + booked - entitlement, 0),
    sick_days: sick.length,
    sick_without_letter: sick.filter((m) => !suratDokter(state, m)).length,
    permit_days: marks.filter((m) => m.kind === "permit").length,
  };
}

/** A request, with what it would cost before anybody decides (D178). */
export function leaveRequestView(state: DemoState, r: LeaveRequest): LeaveRequestView {
  const employee = state.employees.find((e) => e.id === r.employee_id);
  const dates = datesBetween(r.from_date, r.to_date);

  /* How these days would land if approved. Cuti is paid out of the balance and
     nothing else is (D144), so the split is known before the decision rather
     than after the payslip. */
  let paid = 0;
  if (employee && r.kind === "cuti") {
    const bal = leaveBalance(state, employee, r.from_date.slice(0, 4));
    paid = Math.min(dates.length, bal.remaining);
  } else if (r.kind === "sakit") {
    /* Sick is paid only with the letter, and the letter arrives with the day —
       not with the request. So a request cannot promise it. */
    paid = 0;
  }

  return {
    ...r,
    employee_no: employee?.employee_no ?? "—",
    full_name: employee?.full_name ?? "—",
    decided_by_name: r.decided_by
      ? state.users.find((u) => u.id === r.decided_by)?.full_name ?? null
      : null,
    paid_days: paid,
    unpaid_days: dates.length - paid,
    clashes: dates.filter((d) => state.day_marks.some(
      (m) => m.work_date === d && (m.employee_id === r.employee_id || m.employee_id === null),
    )),
  };
}
