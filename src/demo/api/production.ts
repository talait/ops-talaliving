/** Implements `/api/v1/production` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import {
  PROCESS_STAGES,
  type WorkOrder, type WorkOrderView, type ProgressEntry, type ProductView,
} from "@/services/production/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import {
  workOrderView, workOrderViews, productView, productViews,
} from "../production-derive";
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
    /** The catalogue product, where there is one. It is what lets the
     *  customer's order line and the floor be compared (D150). */
    product_code?: string | null;
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
      product_code: input.product_code?.trim().toUpperCase() || null,
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

/* ------------------------------------------------------------------ */
/* Master data: products and their bills of material                   */
/* ------------------------------------------------------------------ */

export async function listProducts(
  opts: { include_inactive?: boolean } = {},
): Promise<Result<ProductView[]>> {
  await latency();
  const rows = productViews(getState());
  return ok(SERVICE, opts.include_inactive ? rows : rows.filter((p) => p.active));
}

export async function getProduct(productCode: string): Promise<Result<ProductView>> {
  await latency();
  const state = getState();
  const p = state.products.find((x) => x.product_code === productCode);
  if (!p) return notFound(SERVICE, "product_not_found", `No product ${productCode}.`);
  return ok(SERVICE, productView(state, p));
}

/** Adding a product, or correcting one.
 *
 *  The code is set once and never edited: it is on the drawing, on the work
 *  order and in every bill of material that references it, and a code that
 *  moves is a reference that silently breaks (D149).
 */
export async function saveProduct(
  input: {
    product_code: string;
    name: string;
    category: string;
    uom: string;
    description?: string | null;
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
    dimension_note?: string | null;
    lead_time_days?: number | null;
    active?: boolean;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<ProductView>> {
  await latency();
  const cached = replayed<ProductView>(SERVICE, "saveProduct", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  const code = input.product_code.trim().toUpperCase();
  if (!code) {
    return invalid(SERVICE, "code_required", "Kode produk dipakai di gambar dan di SPK.", { field: "product_code" });
  }
  if (!input.name.trim()) {
    return invalid(SERVICE, "name_required", "Namanya apa?", { field: "name" });
  }

  const user = actingUser();
  const existing = getState().products.find((p) => p.product_code === code);
  apply((draft) => {
    if (existing) {
      const row = draft.products.find((p) => p.product_code === code);
      if (!row) return;
      Object.assign(row, {
        name: input.name.trim(),
        category: input.category.trim() || row.category,
        uom: input.uom.trim() || row.uom,
        description: input.description?.trim() ?? row.description,
        length_mm: input.length_mm ?? row.length_mm,
        width_mm: input.width_mm ?? row.width_mm,
        height_mm: input.height_mm ?? row.height_mm,
        dimension_note: input.dimension_note?.trim() ?? row.dimension_note,
        lead_time_days: input.lead_time_days ?? row.lead_time_days,
        active: input.active ?? row.active,
        note: input.note?.trim() ?? row.note,
      });
      writeAudit(draft, {
        service: SERVICE, entity: "product", entity_no: code,
        action: "update", outcome: "ok", reason: null,
        detail: { name: row.name, by: user.email },
      });
    } else {
      draft.products.push({
        id: newId("prd"), product_code: code,
        name: input.name.trim(),
        category: input.category.trim() || "Lain-lain",
        uom: input.uom.trim() || "unit",
        description: input.description?.trim() || null,
        length_mm: input.length_mm ?? null,
        width_mm: input.width_mm ?? null,
        height_mm: input.height_mm ?? null,
        dimension_note: input.dimension_note?.trim() || null,
        lead_time_days: input.lead_time_days ?? null,
        active: input.active ?? true,
        note: input.note?.trim() || null,
      });
      writeAudit(draft, {
        service: SERVICE, entity: "product", entity_no: code,
        action: "create", outcome: "ok", reason: null,
        detail: { name: input.name.trim(), by: user.email },
      });
    }
  });
  const view = await getProduct(code);
  if (view.data) remember(SERVICE, "saveProduct", idempotencyKey, view.data);
  return view;
}

/** Putting a component on a bill of material, or changing its quantity.
 *
 *  The reference is a **public code** — a catalogue item or another product —
 *  and it is not validated against the catalogue here. A workshop knows it
 *  needs a steel frame before procurement has an item code for one, and
 *  refusing the line would mean the BOM stays in somebody's head. The screen
 *  shows unresolved codes plainly instead (A6, D149).
 */
export async function saveBomComponent(
  input: {
    product_code: string;
    component_id?: string | null;
    kind: "material" | "product";
    ref_code: string;
    qty: number;
    uom: string;
    waste_percent?: number;
    note?: string | null;
  },
): Promise<Result<ProductView>> {
  await latency();
  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  const state = getState();
  const product = state.products.find((p) => p.product_code === input.product_code);
  if (!product) return notFound(SERVICE, "product_not_found", `No product ${input.product_code}.`);

  const ref = input.ref_code.trim().toUpperCase();
  if (!ref) {
    return invalid(SERVICE, "ref_required", "Komponennya apa?", { field: "ref_code" });
  }
  if (!input.qty || input.qty <= 0) {
    return invalid(SERVICE, "qty_required", "Jumlah per unit harus lebih dari nol.", { field: "qty" });
  }
  if (input.kind === "product" && ref === product.product_code) {
    return invalid(
      SERVICE, "self_reference",
      "Sebuah produk tidak bisa menjadi komponen dirinya sendiri.",
      { field: "ref_code" },
    );
  }
  const dup = state.bom_components.find(
    (b) => b.product_id === product.id && b.ref_code === ref && b.id !== input.component_id,
  );
  if (dup) {
    return conflict(
      SERVICE, "already_on_bom",
      `${ref} sudah ada di BOM ini — ubah jumlahnya, jangan tambah baris kedua.`,
    );
  }

  const user = actingUser();
  apply((draft) => {
    const row = input.component_id
      ? draft.bom_components.find((b) => b.id === input.component_id)
      : null;
    if (row) {
      Object.assign(row, {
        kind: input.kind, ref_code: ref, qty: input.qty,
        uom: input.uom.trim() || row.uom,
        waste_percent: input.waste_percent ?? row.waste_percent,
        note: input.note?.trim() ?? row.note,
      });
    } else {
      draft.bom_components.push({
        id: newId("bom"), product_id: product.id,
        kind: input.kind, ref_code: ref, qty: input.qty,
        uom: input.uom.trim() || "pcs",
        waste_percent: input.waste_percent ?? 0,
        note: input.note?.trim() || null,
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "bom", entity_no: product.product_code,
      action: row ? "update_component" : "add_component", outcome: "ok",
      reason: input.note?.trim() ?? null,
      detail: { ref: ref, qty: input.qty, waste: input.waste_percent ?? 0, by: user.email },
    });
  });
  return getProduct(product.product_code);
}

/** Taking a component off. An act with a name on it like any other — the BOM
 *  is what a purchase request is built from, so "who removed the hinges" is a
 *  question somebody will ask. */
export async function removeBomComponent(
  input: { product_code: string; component_id: string },
): Promise<Result<ProductView>> {
  await latency();
  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  const state = getState();
  const product = state.products.find((p) => p.product_code === input.product_code);
  if (!product) return notFound(SERVICE, "product_not_found", `No product ${input.product_code}.`);
  const row = state.bom_components.find((b) => b.id === input.component_id);
  if (!row) return notFound(SERVICE, "component_not_found", "Komponen itu tidak ada.");

  const user = actingUser();
  apply((draft) => {
    draft.bom_components = draft.bom_components.filter((b) => b.id !== input.component_id);
    writeAudit(draft, {
      service: SERVICE, entity: "bom", entity_no: product.product_code,
      action: "remove_component", outcome: "ok", reason: null,
      detail: { ref: row.ref_code, qty: row.qty, by: user.email },
    });
  });
  return getProduct(product.product_code);
}

/** What one production run of this product needs, in materials.
 *
 *  The bridge between the master data and the thing somebody actually does
 *  with it: *twelve doors — what do I have to buy?* Quantities carry the waste
 *  already, because the number to buy and the number in the drawing are
 *  different numbers (D149).
 */
export async function materialsFor(
  input: { product_code: string; qty: number },
): Promise<Result<{
  product_code: string;
  qty: number;
  lines: { ref_code: string; ref_name: string | null; kind: string; qty: number; uom: string; subtotal: number | null }[];
  total: number | null;
  unpriced: number;
}>> {
  await latency();
  const state = getState();
  const product = state.products.find((p) => p.product_code === input.product_code);
  if (!product) return notFound(SERVICE, "product_not_found", `No product ${input.product_code}.`);
  if (!input.qty || input.qty <= 0) {
    return invalid(SERVICE, "qty_required", "Berapa unit?", { field: "qty" });
  }

  const view = productView(state, product);
  const lines = view.components.map((c) => ({
    ref_code: c.ref_code,
    ref_name: c.ref_name,
    kind: c.kind,
    qty: Math.round(c.qty_with_waste * input.qty * 10_000) / 10_000,
    uom: c.uom,
    subtotal: c.subtotal == null ? null : c.subtotal * input.qty,
  }));
  const priced = lines.filter((l) => l.subtotal != null);
  return ok(SERVICE, {
    product_code: product.product_code,
    qty: input.qty,
    lines,
    total: priced.length > 0 ? priced.reduce((a, l) => a + (l.subtotal ?? 0), 0) : null,
    unpriced: lines.length - priced.length,
  });
}


/** Filing a drawing against a product.
 *
 *  **Gambar kerja** is what the workshop builds from; **gambar jadi** is what
 *  the client was shown and what QC checks against. They answer different
 *  questions, so they are two kinds rather than one "drawing" field, and a
 *  product missing either says so on the catalogue screen (D150).
 *
 *  A revision is a **new file filed against the same product**, not an edit:
 *  the newest is what the screen shows, and the older one stays, because a
 *  piece built last month was built from it (A5).
 */
export async function attachProductDrawing(
  input: { product_code: string; attachment_id: string; kind: "Gambar Kerja" | "Gambar Jadi" },
): Promise<Result<ProductView>> {
  await latency();
  const denied = requireModule(SERVICE, "production");
  if (denied) return denied;

  const state = getState();
  const product = state.products.find((p) => p.product_code === input.product_code);
  if (!product) return notFound(SERVICE, "product_not_found", `No product ${input.product_code}.`);
  if (!state.attachments.some((a) => a.id === input.attachment_id)) {
    return notFound(SERVICE, "attachment_not_found", "That file is not on the system.");
  }

  const user = actingUser();
  apply((draft) => {
    draft.attachment_links.push({
      id: newId("lnk"), attachment_id: input.attachment_id,
      entity: "product", entity_no: product.product_code, kind: input.kind,
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    writeAudit(draft, {
      service: SERVICE, entity: "product", entity_no: product.product_code,
      action: "attach_drawing", outcome: "ok", reason: null,
      detail: { kind: input.kind, attachment_id: input.attachment_id, by: user.email },
    });
  });
  return getProduct(product.product_code);
}
