/** Implements `/api/v1/hr` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Employee, AttendanceScan, TimesheetDay, DayMark, DayMarkKind,
  OvertimeSheet, OvertimeLine, OvertimeSheetView, OvertimeKind,
  PayrollRun, PayrollView, PayBasis,
} from "@/services/hr/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import {
  timesheet, timesheetDay, payrollView, overtimeStage, overtimePayable, sheetEvidence,
} from "../hr-derive";
import { latency, actingUser, requireModule, requireAuthority, conflict, replayed, remember } from "./_kit";

const SERVICE = "hr" as const;

/** A sheet with its lines, its stage and the paper behind it — how every
 *  screen wants it, and how nothing stores it (D146). */
function sheetView(state: ReturnType<typeof getState>, sheet: OvertimeSheet): OvertimeSheetView {
  const lines = state.overtime_lines
    .filter((l) => l.sheet_id === sheet.id)
    .map((l) => {
      const emp = state.employees.find((e) => e.id === l.employee_id);
      return { ...l, employee_no: emp?.employee_no ?? "—", full_name: emp?.full_name ?? "—" };
    });
  const link = sheetEvidence(state, sheet.id);
  const att = link ? state.attachments.find((a) => a.id === link.attachment_id) : null;
  return {
    ...sheet,
    lines,
    stage: overtimeStage(state, sheet),
    payable: overtimePayable(state, sheet),
    total_hours: Math.round(lines.reduce((a, l) => a + l.hours, 0) * 100) / 100,
    evidence: att && link
      ? { attachment_id: att.id, filename: att.filename, kind: link.kind }
      : null,
  };
}

export async function listEmployees(opts: { include_left?: boolean } = {}): Promise<Result<Employee[]>> {
  await latency();
  const rows = getState().employees
    .filter((e) => opts.include_left || e.active)
    .sort((a, b) => a.employee_no.localeCompare(b.employee_no));
  return ok(SERVICE, rows);
}

export async function getEmployee(employeeNo: string): Promise<Result<Employee>> {
  await latency();
  const found = getState().employees.find((e) => e.employee_no === employeeNo);
  if (!found) return notFound(SERVICE, "employee_not_found", `No employee ${employeeNo}.`);
  return ok(SERVICE, found);
}

/** Adding somebody, or changing what they are paid.
 *
 *  A rate change is append-only in spirit: the audit row carries the figure
 *  before and after, because "when did his rate go up, and who said so" is the
 *  question a payroll dispute turns on.
 */
export async function saveEmployee(
  input: {
    employee_no: string;
    full_name: string;
    position: string;
    unit: string;
    pay_basis: PayBasis;
    base_rate: number;
    daily_hours?: number;
    paid_leave_days?: number;
    joined_on?: string;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<Employee>> {
  await latency();
  const cached = replayed<Employee>(SERVICE, "saveEmployee", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  if (!input.full_name.trim()) {
    return invalid(SERVICE, "name_required", "Somebody's name is the one thing a payslip cannot do without.", { field: "full_name" });
  }
  if (!input.employee_no.trim()) {
    return invalid(SERVICE, "employee_no_required", "The number on the fingerprint machine — it is how attendance finds them.", { field: "employee_no" });
  }
  if (!input.base_rate || input.base_rate <= 0) {
    return invalid(SERVICE, "rate_required", "A rate of zero is not a rate. Put what they are actually paid.", { field: "base_rate" });
  }

  const state = getState();
  const existing = state.employees.find((e) => e.employee_no === input.employee_no.trim());
  const user = actingUser();
  let saved: Employee | null = null;

  apply((draft) => {
    if (existing) {
      const row = draft.employees.find((e) => e.employee_no === existing.employee_no);
      if (!row) return;
      const before = { base_rate: row.base_rate, pay_basis: row.pay_basis, position: row.position };
      Object.assign(row, {
        full_name: input.full_name.trim(),
        position: input.position.trim() || row.position,
        unit: input.unit.trim() || row.unit,
        pay_basis: input.pay_basis,
        base_rate: Math.round(input.base_rate),
        daily_hours: input.daily_hours ?? row.daily_hours,
        paid_leave_days: input.paid_leave_days ?? row.paid_leave_days,
        note: input.note?.trim() ?? row.note,
      });
      saved = row;
      writeAudit(draft, {
        service: SERVICE, entity: "employee", entity_no: row.employee_no,
        action: "update", outcome: "ok", reason: null,
        detail: { before, after: { base_rate: row.base_rate, pay_basis: row.pay_basis, position: row.position }, by: user.email },
      });
    } else {
      const row: Employee = {
        id: newId("emp"),
        employee_no: input.employee_no.trim(),
        full_name: input.full_name.trim(),
        position: input.position.trim(),
        unit: input.unit.trim() || "Workshop",
        pay_basis: input.pay_basis,
        base_rate: Math.round(input.base_rate),
        daily_hours: input.daily_hours ?? 8,
        paid_leave_days: input.paid_leave_days ?? 12,
        joined_on: input.joined_on ?? new Date().toISOString().slice(0, 10),
        active: true,
        left_on: null,
        note: input.note?.trim() || null,
      };
      draft.employees.push(row);
      saved = row;
      writeAudit(draft, {
        service: SERVICE, entity: "employee", entity_no: row.employee_no,
        action: "create", outcome: "ok", reason: null,
        detail: { pay_basis: row.pay_basis, base_rate: row.base_rate, by: user.email },
      });
    }
  });
  const view = saved as Employee | null;
  if (!view) return invalid(SERVICE, "not_saved", "The record could not be written.", { field: "employee_no" });
  remember(SERVICE, "saveEmployee", idempotencyKey, view);
  return ok(SERVICE, view);
}

export async function attendanceFor(
  input: { employee_no: string; from: string; to: string },
): Promise<Result<TimesheetDay[]>> {
  await latency();
  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  return ok(SERVICE, timesheet(state, emp, input.from, input.to));
}

/** The whole workshop for a week, one row per person per day.
 *
 *  This is the screen the payroll depends on: until a person has read every
 *  day the machine could not, the figures below are arithmetic rather than
 *  wages (D141).
 */
export async function getTimesheet(
  input: { from: string; to: string; unit?: string },
): Promise<Result<{
  days: TimesheetDay[];
  dates: string[];
  employees: { employee_no: string; full_name: string; pay_basis: PayBasis }[];
  needs_review: number;
  marked: number;
}>> {
  await latency();
  const state = getState();
  const people = state.employees.filter(
    (e) => e.active && (!input.unit || e.unit === input.unit),
  );
  const days = people.flatMap((e) => timesheet(state, e, input.from, input.to));
  const dates = [...new Set(days.map((d) => d.work_date))].sort();
  return ok(SERVICE, {
    days,
    dates,
    employees: people.map((e) => ({
      employee_no: e.employee_no, full_name: e.full_name, pay_basis: e.pay_basis,
    })),
    needs_review: days.filter((d) => d.state === "review").length,
    marked: days.filter((d) => d.state === "marked").length,
  });
}

/** One day, in full — every tap and how the rule read it. */
export async function getDay(
  input: { employee_no: string; work_date: string },
): Promise<Result<TimesheetDay>> {
  await latency();
  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  return ok(SERVICE, timesheetDay(state, emp, input.work_date));
}

/** Taking the machine's export.
 *
 *  The file is one row per tap, `Date/Time` as `DD/MM/YYYY HH:MM:SS`, and the
 *  employee is the machine's own `No.` — which is why an employee carries that
 *  number rather than a name match. Nothing is invented: a number the system
 *  does not know is **reported back, not created**, because a person the
 *  payroll has never heard of is a question, not a row (D143).
 *
 *  Re-uploading the same file changes nothing. A tap is identified by who, and
 *  when, to the second.
 */
export async function importScans(
  input: { filename: string; rows: { employee_ref: string; at: string; verify: string; location?: string | null }[] },
  idempotencyKey?: string,
): Promise<Result<{ import_id: string; added: number; duplicates: number; unknown: { ref: string; count: number }[] }>> {
  await latency();
  const cached = replayed<{ import_id: string; added: number; duplicates: number; unknown: { ref: string; count: number }[] }>(
    SERVICE, "importScans", idempotencyKey,
  );
  if (cached) return cached;

  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;
  if (input.rows.length === 0) {
    return invalid(SERVICE, "empty_file", "That file has no scans in it.", { field: "rows" });
  }

  const state = getState();
  const byRef = new Map(state.employees.map((e) => [e.employee_no.replace(/^B-0*/, ""), e]));
  const seen = new Set(state.attendance_scans.map((s) => `${s.employee_id}|${s.at}`));

  const user = actingUser();
  const importId = newId("imp");
  let added = 0;
  let duplicates = 0;
  const unknown = new Map<string, number>();

  apply((draft) => {
    for (const row of input.rows) {
      const emp = byRef.get(row.employee_ref.replace(/^0+/, ""));
      if (!emp) {
        unknown.set(row.employee_ref, (unknown.get(row.employee_ref) ?? 0) + 1);
        continue;
      }
      const key = `${emp.id}|${row.at}`;
      if (seen.has(key)) { duplicates += 1; continue; }
      seen.add(key);
      added += 1;
      draft.attendance_scans.push({
        id: newId("scn"),
        employee_id: emp.id,
        work_date: row.at.slice(0, 10),
        at: row.at,
        verify: row.verify,
        location: row.location ?? null,
        source: "import",
        import_id: importId,
        reason: null,
        recorded_by: user.id,
        recorded_at: new Date().toISOString(),
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "attendance_import", entity_no: importId,
      action: "import", outcome: "ok", reason: input.filename,
      detail: {
        rows: input.rows.length, added, duplicates,
        unknown: [...unknown.keys()], by: user.email,
      },
    });
  });

  const result = {
    import_id: importId, added, duplicates,
    unknown: [...unknown.entries()].map(([ref, count]) => ({ ref, count })),
  };
  remember(SERVICE, "importScans", idempotencyKey, result);
  return ok(SERVICE, result);
}

/** Putting in a tap the machine did not record.
 *
 *  Always by hand, always with a reason. The reason is what separates a
 *  correction from a favour three months later (D137).
 */
export async function addScan(
  input: { employee_no: string; work_date: string; time: string; reason: string },
): Promise<Result<AttendanceScan>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  if (!input.reason.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "A time somebody typed needs to say why the machine missed it.",
      { field: "reason" },
    );
  }

  const user = actingUser();
  let row: AttendanceScan | null = null;
  apply((draft) => {
    row = {
      id: newId("scn"),
      employee_id: emp.id,
      work_date: input.work_date,
      at: `${input.work_date}T${input.time}:00+08:00`,
      verify: "MANUAL",
      location: null,
      source: "manual",
      import_id: null,
      reason: input.reason.trim(),
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    };
    draft.attendance_scans.push(row);
    writeAudit(draft, {
      service: SERVICE, entity: "attendance", entity_no: `${emp.employee_no}/${input.work_date}`,
      action: "add_scan", outcome: "ok", reason: input.reason.trim(),
      detail: { at: input.time, by: user.email },
    });
  });
  return ok(SERVICE, row as unknown as AttendanceScan);
}

/** What HRD says about a day the reader cannot describe.
 *
 *  A public holiday, an afternoon the power went, somebody off sick. Marking
 *  is not editing: the taps stay exactly as they were, and a mark for
 *  everybody carries no employee at all (D142).
 */
export async function markDay(
  input: { work_date: string; kind: DayMarkKind; reason: string; employee_no?: string | null },
): Promise<Result<DayMark>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  if (!input.reason.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "Say what happened. *Setengah hari* with no reason is a decision nobody can check in six months.",
      { field: "reason" },
    );
  }
  const state = getState();
  const emp = input.employee_no
    ? state.employees.find((e) => e.employee_no === input.employee_no)
    : null;
  if (input.employee_no && !emp) {
    return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  }
  const clash = state.day_marks.find(
    (m) => m.work_date === input.work_date && (m.employee_id ?? null) === (emp?.id ?? null),
  );
  if (clash) {
    return conflict(
      SERVICE, "already_marked",
      `${input.work_date} is already marked as ${clash.kind}${emp ? ` for ${emp.full_name}` : " for everybody"}.`,
    );
  }

  const user = actingUser();
  let mark: DayMark | null = null;
  apply((draft) => {
    mark = {
      id: newId("dmk"),
      employee_id: emp?.id ?? null,
      work_date: input.work_date,
      kind: input.kind,
      reason: input.reason.trim(),
      marked_by: user.id,
      marked_at: new Date().toISOString(),
    };
    draft.day_marks.push(mark);
    writeAudit(draft, {
      service: SERVICE, entity: "day_mark", entity_no: `${input.work_date}/${emp?.employee_no ?? "ALL"}`,
      action: "mark", outcome: "ok", reason: input.reason.trim(),
      detail: { kind: input.kind, by: user.email },
    });
  });
  return ok(SERVICE, mark as unknown as DayMark);
}

/** Taking a mark off. It happens — the holiday was the Tuesday, not the
 *  Monday — and it is an act with a name on it like any other. */
export async function unmarkDay(markId: string): Promise<Result<{ removed: string }>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const mark = state.day_marks.find((m) => m.id === markId);
  if (!mark) return notFound(SERVICE, "mark_not_found", "No such mark.");

  const user = actingUser();
  apply((draft) => {
    draft.day_marks = draft.day_marks.filter((m) => m.id !== markId);
    writeAudit(draft, {
      service: SERVICE, entity: "day_mark", entity_no: `${mark.work_date}/${mark.employee_id ?? "ALL"}`,
      action: "unmark", outcome: "ok", reason: mark.reason,
      detail: { kind: mark.kind, by: user.email },
    });
  });
  return ok(SERVICE, { removed: markId });
}

/** Opening a sheet.
 *
 *  A **production** sheet is one night with many names on it; a **staff**
 *  sheet is one session with one name and that person's own report (D146).
 *  The kind is chosen when the sheet is opened because it decides who has to
 *  sign — and that is not a detail to discover at the end.
 */
export async function createOvertimeSheet(
  input: { kind: OvertimeKind; work_date: string; purpose: string },
  idempotencyKey?: string,
): Promise<Result<OvertimeSheetView>> {
  await latency();
  const cached = replayed<OvertimeSheetView>(SERVICE, "createOvertimeSheet", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;
  if (!input.purpose.trim()) {
    return invalid(
      SERVICE, "purpose_required",
      "Kenapa ada lembur malam itu? Lembur tanpa alasan adalah kebiasaan, bukan keputusan.",
      { field: "purpose" },
    );
  }

  const user = actingUser();
  let sheetNo = "";
  let id = "";
  apply((draft) => {
    sheetNo = nextDocNumber(draft, "lbr");
    id = newId("lbr");
    draft.overtime_sheets.push({
      id, sheet_no: sheetNo, kind: input.kind,
      work_date: input.work_date,
      purpose: input.purpose.trim(),
      created_by: user.id, created_at: new Date().toISOString(),
      hrd_checked_by: null, hrd_checked_at: null,
      leader_approved_by: null, leader_approved_at: null,
      /* Staff sessions ship paid; production sheets are paid by the
         leadership signature, and this flag is not what decides them. */
      paid: true, unpaid_reason: null,
      declined_by: null, declined_reason: null,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "overtime_sheet", entity_no: sheetNo,
      action: "create", outcome: "ok", reason: input.purpose.trim(),
      detail: { kind: input.kind, work_date: input.work_date, by: user.email },
    });
  });
  const state = getState();
  const view = sheetView(state, state.overtime_sheets.find((x) => x.id === id)!);
  remember(SERVICE, "createOvertimeSheet", idempotencyKey, view);
  return ok(SERVICE, view);
}

/** Adding a name to a sheet.
 *
 *  On a production sheet the line also carries **what was made**: the work
 *  order, the stage and how many. Those three are the production report for
 *  that night, and the reason they are typed here rather than twice is that
 *  two copies of the same fact start disagreeing the week after (D147).
 */
export async function addOvertimeLine(
  input: {
    sheet_no: string;
    employee_no: string;
    hours: number;
    task: string;
    wo_no?: string | null;
    stage?: string | null;
    qty_done?: number | null;
  },
): Promise<Result<OvertimeSheetView>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const sheet = state.overtime_sheets.find((x) => x.sheet_no === input.sheet_no);
  if (!sheet) return notFound(SERVICE, "sheet_not_found", `No sheet ${input.sheet_no}.`);
  if (sheet.leader_approved_at || sheet.hrd_checked_at) {
    return conflict(
      SERVICE, "sheet_closed",
      `${sheet.sheet_no} sudah diperiksa. Nama baru masuk lembar baru — menambah nama ke lembar yang sudah ditandatangani berarti tanda tangannya tidak lagi menunjuk apa yang ditandatangani.`,
    );
  }
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  if (input.hours <= 0) {
    return invalid(SERVICE, "hours_required", "Lembur nol jam bukan lembur.", { field: "hours" });
  }
  if (!input.task.trim()) {
    return invalid(SERVICE, "task_required", "Apa yang dikerjakan?", { field: "task" });
  }
  if (state.overtime_lines.some((l) => l.sheet_id === sheet.id && l.employee_id === emp.id)) {
    return conflict(SERVICE, "already_on_sheet", `${emp.full_name} sudah ada di lembar ini.`);
  }

  const user = actingUser();
  apply((draft) => {
    const row: OvertimeLine = {
      id: newId("lbl"), sheet_id: sheet.id, employee_id: emp.id,
      hours: input.hours, task: input.task.trim(),
      wo_no: input.wo_no?.trim() || null,
      stage: input.stage?.trim() || null,
      qty_done: input.qty_done ?? null,
    };
    draft.overtime_lines.push(row);
    writeAudit(draft, {
      service: SERVICE, entity: "overtime_sheet", entity_no: sheet.sheet_no,
      action: "add_line", outcome: "ok", reason: input.task.trim(),
      detail: { employee: emp.employee_no, hours: input.hours, wo_no: row.wo_no, stage: row.stage, qty: row.qty_done, by: user.email },
    });
  });
  return getOvertimeSheet(sheet.sheet_no);
}

/** Attaching the paper: the signed sheet for production, the work report —
 *  usually a screenshot — for a staff session (D146). */
export async function attachOvertimeDoc(
  input: { sheet_no: string; attachment_id: string },
): Promise<Result<OvertimeSheetView>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const sheet = state.overtime_sheets.find((x) => x.sheet_no === input.sheet_no);
  if (!sheet) return notFound(SERVICE, "sheet_not_found", `No sheet ${input.sheet_no}.`);
  if (!state.attachments.some((a) => a.id === input.attachment_id)) {
    return notFound(SERVICE, "attachment_not_found", "That file is not on the system.");
  }

  const user = actingUser();
  const kind = sheet.kind === "production" ? "Surat Lembur" : "Laporan Lembur";
  apply((draft) => {
    draft.attachment_links.push({
      id: newId("lnk"), attachment_id: input.attachment_id,
      entity: "overtime", entity_no: sheet.id, kind,
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    writeAudit(draft, {
      service: SERVICE, entity: "overtime_sheet", entity_no: sheet.sheet_no,
      action: "attach", outcome: "ok", reason: null,
      detail: { kind, attachment_id: input.attachment_id, by: user.email },
    });
  });
  return getOvertimeSheet(sheet.sheet_no);
}

/** Deciding a sheet.
 *
 *  Owner (2026-09-11): **only production overtime needs leadership.** A staff
 *  session is HRD's decision alone, and the default is yes — so `hrd` on a
 *  staff sheet means *I have looked*, and turning it down is a separate,
 *  explicit act carrying a reason.
 *
 *  On a production sheet the two steps check different things: HRD checks the
 *  hours against the taps, leadership signs the sheet — holding it, which is
 *  why the scan has to be attached before that signature is allowed (D146).
 */
export async function decideOvertimeSheet(
  input: {
    sheet_no: string;
    step: "hrd" | "leader";
    approved: boolean;
    reason?: string | null;
  },
): Promise<Result<OvertimeSheetView>> {
  await latency();
  const state0 = getState();
  const sheet0 = state0.overtime_sheets.find((x) => x.sheet_no === input.sheet_no);
  if (!sheet0) return notFound(SERVICE, "sheet_not_found", `No sheet ${input.sheet_no}.`);

  const denied = input.step === "hrd"
    ? requireModule(SERVICE, "hrd")
    : requireAuthority(SERVICE, "approve_overtime");
  if (denied) return denied;

  if (input.step === "leader" && sheet0.kind === "staff") {
    return invalid(
      SERVICE, "no_leader_needed",
      "Lembur staff tidak perlu tanda tangan pimpinan — HRD yang memutuskan (D146).",
      { field: "step" },
    );
  }
  if (sheet0.declined_reason) {
    return conflict(SERVICE, "already_decided", `${sheet0.sheet_no} sudah ditolak.`);
  }
  if (!input.approved && !input.reason?.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "Menolak lembur yang sudah dikerjakan butuh satu kalimat.",
      { field: "reason" },
    );
  }
  if (state0.overtime_lines.filter((l) => l.sheet_id === sheet0.id).length === 0) {
    return invalid(SERVICE, "empty_sheet", "Lembar ini belum ada namanya.", { field: "lines" });
  }

  if (input.step === "leader") {
    if (!sheet0.hrd_checked_at) {
      return conflict(
        SERVICE, "hrd_first",
        "HRD belum memeriksa jamnya. Pimpinan menandatangani setelah HRD, bukan menggantikannya.",
      );
    }
    if (sheet0.leader_approved_at) {
      return conflict(SERVICE, "already_decided", "Pimpinan sudah menandatangani lembar ini.");
    }
    if (input.approved && !sheetEvidence(state0, sheet0.id, "Surat Lembur")) {
      return invalid(
        SERVICE, "surat_required",
        "Surat lembur belum dilampirkan. Pimpinan menandatangani suratnya — tanpa itu yang disetujui hanya angka.",
        { field: "surat_lembur" },
      );
    }
  }

  const user = actingUser();
  apply((draft) => {
    const row = draft.overtime_sheets.find((x) => x.sheet_no === input.sheet_no);
    if (!row) return;
    if (input.step === "hrd") {
      row.hrd_checked_by = user.id;
      row.hrd_checked_at = new Date().toISOString();
      if (row.kind === "staff") {
        row.paid = input.approved;
        row.unpaid_reason = input.approved ? null : input.reason?.trim() ?? null;
      } else if (!input.approved) {
        row.declined_by = user.id;
        row.declined_reason = input.reason?.trim() ?? null;
      }
    } else if (input.approved) {
      row.leader_approved_by = user.id;
      row.leader_approved_at = new Date().toISOString();
    } else {
      row.declined_by = user.id;
      row.declined_reason = input.reason?.trim() ?? null;
    }
    writeAudit(draft, {
      service: SERVICE, entity: "overtime_sheet", entity_no: row.sheet_no,
      action: `${input.approved ? "approve" : "decline"}_${input.step}`, outcome: "ok",
      reason: input.reason?.trim() ?? null,
      detail: { kind: row.kind, by: user.email },
    });
    if (input.approved && (input.step === "leader" || row.kind === "staff")) {
      writeOutbox(draft, {
        service: SERVICE, event_type: "hr.overtime.approved",
        payload: {
          sheet_no: row.sheet_no, kind: row.kind, work_date: row.work_date,
          /* Production lines carry what was made. A subscriber — today the
             screen, in Phase 2 the production service itself — turns these
             into progress entries against the work order (D147). */
          production: draft.overtime_lines
            .filter((l) => l.sheet_id === row.id && l.wo_no && l.qty_done)
            .map((l) => ({ wo_no: l.wo_no, stage: l.stage, qty: l.qty_done })),
        },
      });
    }
  });
  return getOvertimeSheet(input.sheet_no);
}

export async function listOvertimeSheets(): Promise<Result<OvertimeSheetView[]>> {
  await latency();
  const state = getState();
  const rows = state.overtime_sheets
    .map((sh) => sheetView(state, sh))
    .sort((a, b) => {
      /* Anything still waiting for somebody, first. */
      const open = (v: OvertimeSheetView) =>
        v.stage === "waiting_hrd" || v.stage === "waiting_surat" || v.stage === "waiting_leader"
          || v.stage === "paid_default" ? 0 : 1;
      if (open(a) !== open(b)) return open(a) - open(b);
      return b.work_date.localeCompare(a.work_date);
    });
  return ok(SERVICE, rows);
}

export async function getOvertimeSheet(sheetNo: string): Promise<Result<OvertimeSheetView>> {
  await latency();
  const state = getState();
  const sheet = state.overtime_sheets.find((x) => x.sheet_no === sheetNo);
  if (!sheet) return notFound(SERVICE, "sheet_not_found", `No sheet ${sheetNo}.`);
  return ok(SERVICE, sheetView(state, sheet));
}

/** Attaching the surat dokter to a day somebody was ill.
 *
 *  This is what turns *sakit* into a paid day (D144) — so it is an act with a
 *  name and a time on it, not a checkbox. Nothing is recomputed and stored:
 *  the timesheet reads the link the next time it is asked.
 */
export async function attachSuratDokter(
  input: { mark_id: string; attachment_id: string },
): Promise<Result<{ mark_id: string; attachment_id: string }>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const mark = state.day_marks.find((m) => m.id === input.mark_id);
  if (!mark) return notFound(SERVICE, "mark_not_found", "No such mark.");
  if (mark.kind !== "sick") {
    return invalid(
      SERVICE, "not_a_sick_day",
      "A surat dokter belongs to a day marked sakit. This day is marked something else.",
      { field: "mark_id" },
    );
  }
  if (!state.attachments.some((a) => a.id === input.attachment_id)) {
    return notFound(SERVICE, "attachment_not_found", "That file is not on the system.");
  }

  const user = actingUser();
  apply((draft) => {
    draft.attachment_links.push({
      id: newId("lnk"),
      attachment_id: input.attachment_id,
      entity: "day_mark",
      entity_no: mark.id,
      kind: "Surat Dokter",
      linked_by: user.id,
      linked_at: new Date().toISOString(),
    });
    writeAudit(draft, {
      service: SERVICE, entity: "day_mark", entity_no: `${mark.work_date}/${mark.employee_id ?? "ALL"}`,
      action: "attach_surat_dokter", outcome: "ok", reason: mark.reason,
      detail: { attachment_id: input.attachment_id, by: user.email },
    });
  });
  return ok(SERVICE, { mark_id: mark.id, attachment_id: input.attachment_id });
}

export async function listPayrollRuns(): Promise<Result<PayrollRun[]>> {
  await latency();
  return ok(SERVICE, [...getState().payroll_runs].sort((a, b) => b.period_end.localeCompare(a.period_end)));
}

export async function getPayroll(runNo: string): Promise<Result<PayrollView>> {
  await latency();
  const state = getState();
  const run = state.payroll_runs.find((r) => r.run_no === runNo);
  if (!run) return notFound(SERVICE, "run_not_found", `No payroll run ${runNo}.`);
  return ok(SERVICE, payrollView(state, run));
}

/** Opening a run for a period. It computes immediately — there is nothing to
 *  "generate", because the figures are derived from the days (A3). */
export async function openPayroll(
  input: { period_start: string; period_end: string; note?: string | null },
  idempotencyKey?: string,
): Promise<Result<PayrollView>> {
  await latency();
  const cached = replayed<PayrollView>(SERVICE, "openPayroll", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "payroll");
  if (denied) return denied;

  if (input.period_end < input.period_start) {
    return invalid(SERVICE, "period_invalid", "The period ends before it starts.", { field: "period_end" });
  }
  const state = getState();
  const clash = state.payroll_runs.find(
    (r) => r.period_start === input.period_start && r.period_end === input.period_end,
  );
  if (clash) {
    return conflict(SERVICE, "period_already_run", `${clash.run_no} already covers that period.`);
  }

  const user = actingUser();
  let runNo = "";
  apply((draft) => {
    runNo = nextDocNumber(draft, "pyr");
    draft.payroll_runs.unshift({
      id: newId("pay"), run_no: runNo,
      period_start: input.period_start, period_end: input.period_end,
      status: "DRAFT",
      created_at: new Date().toISOString(), created_by: user.id,
      approved_at: null, approved_by: null, paid_trx_no: null,
      note: input.note?.trim() || null,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "payroll", entity_no: runNo,
      action: "open", outcome: "ok", reason: null,
      detail: { period: `${input.period_start}…${input.period_end}`, by: user.email },
    });
  });
  const view = await getPayroll(runNo);
  if (view.data) remember(SERVICE, "openPayroll", idempotencyKey, view.data);
  return view;
}

/** Approving a run.
 *
 *  Refused while any day in the period is still open. A payroll computed over
 *  days nobody finished recording is a number that looks exact and is not, and
 *  the people it is wrong about are the ones least able to argue (D139).
 */
export async function approvePayroll(runNo: string): Promise<Result<PayrollView>> {
  await latency();
  const denied = requireAuthority(SERVICE, "approve_funds");
  if (denied) return denied;

  const state = getState();
  const run = state.payroll_runs.find((r) => r.run_no === runNo);
  if (!run) return notFound(SERVICE, "run_not_found", `No payroll run ${runNo}.`);
  if (run.status !== "DRAFT") {
    return conflict(SERVICE, "already_decided", `${runNo} is ${run.status}.`);
  }
  const view = payrollView(state, run);
  if (view.open_days > 0) {
    return invalid(
      SERVICE, "open_days",
      `${view.open_days} day(s) in this period are still unread — the machine left them incomplete and nobody has said what happened. Read them on the timesheet first: a payroll over days nobody finished recording is wrong about the people least able to argue.`,
      { field: "open_days" },
    );
  }

  const user = actingUser();
  apply((draft) => {
    const row = draft.payroll_runs.find((r) => r.run_no === runNo);
    if (!row) return;
    row.status = "APPROVED";
    row.approved_at = new Date().toISOString();
    row.approved_by = user.id;
    writeAudit(draft, {
      service: SERVICE, entity: "payroll", entity_no: runNo,
      action: "approve", outcome: "ok", reason: null,
      detail: { gross_total: view.gross_total, people: view.lines.length, by: user.email },
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "hr.payroll.approved",
      payload: { run_no: runNo, gross_total: view.gross_total, people: view.lines.length },
    });
  });
  return getPayroll(runNo);
}


