/** Implements `/api/v1/hr` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Employee, Attendance, AttendanceDay, OvertimeClaim, PayrollRun, PayrollView, PayBasis,
} from "@/services/hr/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import { attendanceDays, payrollView } from "../hr-derive";
import { latency, actingUser, requireModule, requireAuthority, conflict, replayed, remember } from "./_kit";

const SERVICE = "hr" as const;

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
): Promise<Result<AttendanceDay[]>> {
  await latency();
  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  return ok(SERVICE, attendanceDays(state, emp, input.from, input.to));
}

/** Every open day in a period, across everybody — the thing somebody has to
 *  clear before a payroll run means anything. */
export async function listOpenDays(
  input: { from: string; to: string },
): Promise<Result<(AttendanceDay & { employee_no: string; full_name: string })[]>> {
  await latency();
  const state = getState();
  const rows = state.employees
    .filter((e) => e.active)
    .flatMap((e) => attendanceDays(state, e, input.from, input.to)
      .filter((d) => d.state === "open")
      .map((d) => ({ ...d, employee_no: e.employee_no, full_name: e.full_name })))
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  return ok(SERVICE, rows);
}

/** Closing a day the machine did not finish.
 *
 *  Always by hand, always with a reason, and never by assuming a time. An
 *  attendance record nobody can challenge is a payroll nobody can challenge
 *  (D137).
 */
export async function closeDay(
  input: { employee_no: string; work_date: string; check_in?: string; check_out?: string; reason: string },
): Promise<Result<Attendance>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  if (!input.reason.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "A time somebody typed needs to say why. In three months this sentence is the only thing separating a correction from a favour.",
      { field: "reason" },
    );
  }
  if (!input.check_in && !input.check_out) {
    return invalid(SERVICE, "time_required", "Put the time that is missing.", { field: "check_out" });
  }

  const user = actingUser();
  let row: Attendance | null = null;
  apply((draft) => {
    row = {
      id: newId("att"),
      employee_id: emp.id,
      work_date: input.work_date,
      check_in: input.check_in ? `${input.work_date}T${input.check_in}:00+08:00` : null,
      check_out: input.check_out ? `${input.work_date}T${input.check_out}:00+08:00` : null,
      source: "manual",
      device_ref: null,
      reason: input.reason.trim(),
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    };
    draft.attendance.push(row);
    writeAudit(draft, {
      service: SERVICE, entity: "attendance", entity_no: `${emp.employee_no}/${input.work_date}`,
      action: "close_day", outcome: "ok", reason: input.reason.trim(),
      detail: { check_in: input.check_in ?? null, check_out: input.check_out ?? null, by: user.email },
    });
  });
  return ok(SERVICE, row as unknown as Attendance);
}

/** Claiming overtime. The machine saw them stay; this says it was work. */
export async function claimOvertime(
  input: { employee_no: string; work_date: string; hours: number; reason: string },
): Promise<Result<OvertimeClaim>> {
  await latency();
  const denied = requireModule(SERVICE, "hrd");
  if (denied) return denied;

  const state = getState();
  const emp = state.employees.find((e) => e.employee_no === input.employee_no);
  if (!emp) return notFound(SERVICE, "employee_not_found", `No employee ${input.employee_no}.`);
  if (input.hours <= 0) {
    return invalid(SERVICE, "hours_required", "Overtime of zero hours is not overtime.", { field: "hours" });
  }
  if (!input.reason.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "What was being finished? Overtime with no reason is how it becomes a habit rather than a decision.",
      { field: "reason" },
    );
  }
  if (state.overtime_claims.some(
    (c) => c.employee_id === emp.id && c.work_date === input.work_date && c.declined_reason === null,
  )) {
    return conflict(SERVICE, "already_claimed", `${emp.full_name} already has a claim for ${input.work_date}.`);
  }

  const user = actingUser();
  let claim: OvertimeClaim | null = null;
  apply((draft) => {
    claim = {
      id: newId("ovt"),
      employee_id: emp.id,
      work_date: input.work_date,
      hours: input.hours,
      reason: input.reason.trim(),
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
      approved_by: null, approved_at: null, declined_reason: null,
    };
    draft.overtime_claims.push(claim);
    writeAudit(draft, {
      service: SERVICE, entity: "overtime", entity_no: `${emp.employee_no}/${input.work_date}`,
      action: "claim", outcome: "ok", reason: input.reason.trim(),
      detail: { hours: input.hours, by: user.email },
    });
  });
  return ok(SERVICE, claim as unknown as OvertimeClaim);
}

/** Deciding a claim. Nothing is paid at 1,5× because a door sensor saw
 *  somebody (D138). */
export async function decideOvertime(
  input: { claim_id: string; approved: boolean; reason?: string | null },
): Promise<Result<OvertimeClaim>> {
  await latency();
  const denied = requireAuthority(SERVICE, "approve_goods");
  if (denied) return denied;

  const state = getState();
  const claim = state.overtime_claims.find((c) => c.id === input.claim_id);
  if (!claim) return notFound(SERVICE, "claim_not_found", "No such overtime claim.");
  if (claim.approved_at || claim.declined_reason) {
    return conflict(SERVICE, "already_decided", "That claim has already been decided.");
  }
  if (!input.approved && !input.reason?.trim()) {
    return invalid(SERVICE, "reason_required", "Turning down overtime somebody worked needs a sentence.", { field: "reason" });
  }

  const user = actingUser();
  let updated: OvertimeClaim | null = null;
  apply((draft) => {
    const row = draft.overtime_claims.find((c) => c.id === input.claim_id);
    if (!row) return;
    if (input.approved) { row.approved_by = user.id; row.approved_at = new Date().toISOString(); }
    else row.declined_reason = input.reason?.trim() ?? null;
    updated = row;
    writeAudit(draft, {
      service: SERVICE, entity: "overtime", entity_no: row.id,
      action: input.approved ? "approve" : "decline", outcome: "ok",
      reason: input.reason?.trim() ?? null,
      detail: { hours: row.hours, by: user.email },
    });
  });
  return ok(SERVICE, updated as unknown as OvertimeClaim);
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
      `${view.open_days} day(s) in this period have no check-out. Close them first — a payroll over days nobody finished recording is wrong about the people least able to argue.`,
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

/** Every overtime claim, with the name attached — waiting ones first. */
export async function listOvertime(): Promise<Result<(OvertimeClaim & { full_name: string; employee_no: string })[]>> {
  await latency();
  const state = getState();
  const rows = state.overtime_claims
    .map((c) => {
      const emp = state.employees.find((e) => e.id === c.employee_id);
      return { ...c, full_name: emp?.full_name ?? "—", employee_no: emp?.employee_no ?? "—" };
    })
    .sort((a, b) => {
      const aOpen = !a.approved_at && !a.declined_reason;
      const bOpen = !b.approved_at && !b.declined_reason;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return b.work_date.localeCompare(a.work_date);
    });
  return ok(SERVICE, rows);
}
