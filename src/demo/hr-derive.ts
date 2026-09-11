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
  Employee, TimesheetDay, DayState, ScanSlot, DayPay, DayMark, OvertimeClaim,
  OvertimeStage, PayrollLine, PayrollView, PayrollRun,
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

/** Where a claim has got to (D145).
 *
 *  HRD checks the hours against the taps; leadership signs, and not before the
 *  surat lembur is attached. Derived from the two approvals rather than stored
 *  beside them, so a status can never disagree with the signatures under it.
 */
export function overtimeStage(state: DemoState, claim: OvertimeClaim): OvertimeStage {
  if (claim.declined_reason) return "declined";
  if (!claim.hrd_approved_at) return "waiting_hrd";
  if (claim.leader_approved_at) return "approved";
  return suratLembur(state, claim.id) ? "waiting_leader" : "waiting_surat";
}

export function suratLembur(state: DemoState, claimId: string) {
  return state.attachment_links.find(
    (l) => l.entity === "overtime" && l.entity_no === claimId && l.kind === "Surat Lembur",
  ) ?? null;
}

/** Paid overtime is overtime both of them approved. */
export function overtimeApproved(claim: OvertimeClaim): boolean {
  return claim.hrd_approved_at !== null && claim.leader_approved_at !== null
    && claim.declined_reason === null;
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
): PayrollLine {
  const days = timesheet(state, employee, from, to);
  /* A day is worth what the timesheet says it is worth: a full day, half of
     one when the office closed at noon, none at all when somebody was away
     (D142). */
  const counted = days.filter((d) => d.day_value > 0);
  const worked_days = days.reduce((s, d) => s + d.day_value, 0);
  const open = days.filter((d) => d.state === "review");

  const claims = state.overtime_claims.filter(
    (c) => c.employee_id === employee.id && c.work_date >= from && c.work_date <= to,
  );
  /* Both signatures, or it is not paid: HRD checked the hours, leadership
     signed, and the surat lembur is behind it (D145). */
  const approvedOt = claims
    .filter((c) => overtimeApproved(c))
    .reduce((s, c) => s + c.hours, 0);
  const pendingOt = claims
    .filter((c) => !overtimeApproved(c) && c.declined_reason === null)
    .reduce((s, c) => s + c.hours, 0);

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
    warnings.push(`${pendingOt} overtime hour(s) claimed and not yet approved by both HRD and leadership — not in this figure`);
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
