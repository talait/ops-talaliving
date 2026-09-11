/** Implements `/api/v1/production` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import {
  PROCESS_STAGES, type WorkOrder, type WorkOrderView, type ProgressEntry,
} from "@/services/production/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import { workOrderView, workOrderViews } from "../production-derive";
import {
  latency, actingUser, requireModule, requireAuthority, conflict, replayed, remember,
} from "./_kit";

const SERVICE = "production" as const;

export async function listStages() {
  await latency();
  return ok(SERVICE, PROCESS_STAGES);
}

export async function listWorkOrders(
  opts: { include_done?: boolean } = {},
): Promise<Result<WorkOrderView[]>> {
  await latency();
  const rows = workOrderViews(getState());
  return ok(SERVICE, opts.include_done ? rows : rows.filter((w) => w.status === "OPEN"));
}

export async function getWorkOrder(woNo: string): Promise<Result<WorkOrderView>> {
  await latency();
  const state = getState();
  const wo = state.work_orders.find((w) => w.wo_no === woNo);
  if (!wo) return notFound(SERVICE, "wo_not_found", `No work order ${woNo}.`);
  return ok(SERVICE, workOrderView(state, wo));
}

/** Putting something on the floor.
 *
 *  The due date is required, and that is the point of the record: a workshop
 *  always knows what it is building, and loses track of which of the eleven
 *  things in front of it is the one that is late.
 */
export async function createWorkOrder(
  input: {
    item_name: string;
    description?: string | null;
    qty: number;
    uom: string;
    project_code?: string | null;
    due_date: string;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<WorkOrderView>> {
  await latency();
  const cached = replayed<WorkOrderView>(SERVICE, "createWorkOrder", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  if (!input.item_name.trim()) {
    return invalid(SERVICE, "item_required", "What is being made?", { field: "item_name" });
  }
  if (!input.qty || input.qty <= 0) {
    return invalid(SERVICE, "qty_required", "An order for nothing is not an order.", { field: "qty" });
  }
  if (!input.due_date) {
    return invalid(
      SERVICE, "due_date_required",
      "A work order with no date cannot be late, which means nobody can tell when it is.",
      { field: "due_date" },
    );
  }

  const user = actingUser();
  let woNo = "";
  apply((draft) => {
    woNo = nextDocNumber(draft, "spk");
    draft.work_orders.push({
      id: newId("wo"), wo_no: woNo,
      item_name: input.item_name.trim(),
      description: input.description?.trim() || null,
      qty: input.qty,
      uom: input.uom.trim() || "unit",
      project_code: input.project_code?.trim() || null,
      due_date: input.due_date,
      status: "OPEN",
      created_at: new Date().toISOString(), created_by: user.id,
      cancelled_reason: null,
      note: input.note?.trim() || null,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "work_order", entity_no: woNo,
      action: "create", outcome: "ok", reason: null,
      detail: { item: input.item_name.trim(), qty: input.qty, due: input.due_date, by: user.email },
    });
  });
  const view = await getWorkOrder(woNo);
  if (view.data) remember(SERVICE, "createWorkOrder", idempotencyKey, view.data);
  return view;
}

/** Reporting work done.
 *
 *  Append-only: a correction is a **negative entry with a reason**, never an
 *  edit, because "how many were finished on Thursday" is a question somebody
 *  asks after the argument has already started (A5).
 *
 *  What this refuses and what it merely warns about is deliberate. More than
 *  the order's quantity is refused — it cannot be true. A stage running ahead
 *  of the one before it is **warned** about on the board and accepted here: it
 *  usually means a mis-keyed number or work that skipped a step, and refusing
 *  the report would only mean the work goes unrecorded (A6).
 */
export async function recordProgress(
  input: {
    wo_no: string;
    stage: string;
    qty: number;
    work_date: string;
    worked_by?: string | null;
    note?: string | null;
    source?: "manual" | "overtime_sheet";
    source_ref?: string | null;
  },
): Promise<Result<WorkOrderView>> {
  await latency();
  /* Who may report work.
   *
   *  Normally the workshop: `production.update`. But an entry that comes from
   *  a **signed overtime sheet** is not an act of whoever happens to be at the
   *  keyboard — it is the consequence of the signature, and the authority for
   *  it is that signature (D147). So leadership's `approve_overtime` is
   *  accepted for exactly that source, and nothing else. Without this the
   *  Direktur signs a sheet and the posting it causes is refused, which would
   *  leave the two halves of the same act disagreeing. */
  const denied = input.source === "overtime_sheet"
    ? requireAuthority(SERVICE, "approve_overtime")
    : requireModule(SERVICE, "production");
  if (denied) return denied;

  const state = getState();
  const wo = state.work_orders.find((w) => w.wo_no === input.wo_no);
  if (!wo) return notFound(SERVICE, "wo_not_found", `No work order ${input.wo_no}.`);
  if (!PROCESS_STAGES.some((s) => s.code === input.stage)) {
    return invalid(SERVICE, "unknown_stage", `No stage called ${input.stage}.`, { field: "stage" });
  }
  if (!input.qty) {
    return invalid(SERVICE, "qty_required", "Nothing to report.", { field: "qty" });
  }
  if (input.qty < 0 && !input.note?.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "A correction says why. A negative number with no sentence behind it is worse than the wrong one.",
      { field: "note" },
    );
  }
  if (wo.status !== "OPEN") {
    return conflict(SERVICE, "wo_not_open", `${wo.wo_no} is ${wo.status}.`);
  }

  /* A sheet posted twice adds nothing. The claim is the sheet number plus the
     stage and the order — the same shape as `source_ref` on a ledger row. */
  const claim = input.source_ref
    ? `${input.source_ref}|${wo.id}|${input.stage}`
    : null;
  if (claim && state.production_progress.some(
    (p) => p.source_ref && `${p.source_ref}|${p.wo_id}|${p.stage}` === claim,
  )) {
    const view = workOrderView(state, wo);
    return ok(SERVICE, view);
  }

  const done = state.production_progress
    .filter((p) => p.wo_id === wo.id && p.stage === input.stage)
    .reduce((a, p) => a + p.qty, 0);
  if (done + input.qty > wo.qty) {
    return invalid(
      SERVICE, "over_order",
      `${wo.wo_no} is for ${wo.qty} ${wo.uom}; ${done} already reported at this stage, so ${input.qty} more would be ${done + input.qty}.`,
      { field: "qty", ordered: wo.qty, already: done },
    );
  }
  if (done + input.qty < 0) {
    return invalid(
      SERVICE, "below_zero",
      `That correction would take ${input.stage} below zero.`,
      { field: "qty", already: done },
    );
  }

  const user = actingUser();
  apply((draft) => {
    const row: ProgressEntry = {
      id: newId("prg"), wo_id: wo.id, stage: input.stage, qty: input.qty,
      work_date: input.work_date,
      worked_by: input.worked_by?.trim() || null,
      source: input.source ?? "manual",
      source_ref: input.source_ref ?? null,
      note: input.note?.trim() || null,
      recorded_by: user.id, recorded_at: new Date().toISOString(),
    };
    draft.production_progress.push(row);
    writeAudit(draft, {
      service: SERVICE, entity: "work_order", entity_no: wo.wo_no,
      action: "progress", outcome: "ok", reason: input.note?.trim() ?? null,
      detail: { stage: input.stage, qty: input.qty, source: row.source, ref: row.source_ref, by: user.email },
    });
  });
  return getWorkOrder(wo.wo_no);
}

/** Closing an order. Allowed before everything is finished, because a customer
 *  who took eleven of twelve doors is a real thing — but then it asks why. */
export async function closeWorkOrder(
  input: { wo_no: string; reason?: string | null },
): Promise<Result<WorkOrderView>> {
  await latency();
  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  const state = getState();
  const wo = state.work_orders.find((w) => w.wo_no === input.wo_no);
  if (!wo) return notFound(SERVICE, "wo_not_found", `No work order ${input.wo_no}.`);
  if (wo.status !== "OPEN") {
    return conflict(SERVICE, "already_closed", `${wo.wo_no} is already ${wo.status}.`);
  }
  const view = workOrderView(state, wo);
  if (view.completed < wo.qty && !input.reason?.trim()) {
    return invalid(
      SERVICE, "reason_required",
      `Only ${view.completed} of ${wo.qty} ${wo.uom} finished. Closing it anyway needs a sentence saying why.`,
      { field: "reason", completed: view.completed, ordered: wo.qty },
    );
  }

  const user = actingUser();
  apply((draft) => {
    const row = draft.work_orders.find((w) => w.wo_no === input.wo_no);
    if (!row) return;
    row.status = "DONE";
    if (input.reason?.trim()) row.note = input.reason.trim();
    writeAudit(draft, {
      service: SERVICE, entity: "work_order", entity_no: wo.wo_no,
      action: "close", outcome: "ok", reason: input.reason?.trim() ?? null,
      detail: { completed: view.completed, ordered: wo.qty, by: user.email },
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "production.work_order.closed",
      payload: { wo_no: wo.wo_no, completed: view.completed, ordered: wo.qty },
    });
  });
  return getWorkOrder(wo.wo_no);
}

/** Every entry behind a work order, newest first — the audit a supervisor
 *  actually reads. */
export async function listProgress(woNo: string): Promise<Result<ProgressEntry[]>> {
  await latency();
  const state = getState();
  const wo = state.work_orders.find((w) => w.wo_no === woNo);
  if (!wo) return notFound(SERVICE, "wo_not_found", `No work order ${woNo}.`);
  const rows = state.production_progress
    .filter((p) => p.wo_id === wo.id)
    .sort((a, b) => b.work_date.localeCompare(a.work_date) || b.recorded_at.localeCompare(a.recorded_at));
  return ok(SERVICE, rows);
}
