/** Implements `/api/v1/procurement` from `03-api.md`. */
import { ok, noop, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Vendor, Item, Uom, Project, ItemCategory,
  PrDocument, PrLine, PrLineView, PaymentRound, RoundSummary,
  PurchaseOrder, PoLine, PoStatusView, Receipt, ReceiptCondition, PrCategory, UomCode,
  VendorView, ItemView,
} from "@/services/procurement/contracts";
import type { PrLine as PrLineRow } from "@/services/procurement/contracts";
import { PROBLEM_CONDITIONS } from "@/services/procurement/contracts";
import { LOCALE } from "@/lib/format";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import {
  prLineView, approvalQueue, lineCoverage, roundSummary, poStatus, isApproved,
  boughtCategories, itemsBoughtFrom, itemSources, purchaseFacts, openLines,
} from "../derive";
import {
  latency, actingUser, requireAuthority, conflict, replayed, remember, paged,
} from "./_kit";

const SERVICE = "procurement" as const;

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export async function listVendors(opts: { q?: string; curated?: boolean } = {}): Promise<Result<Vendor[]>> {
  await latency();
  let rows = getState().vendors;
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((v) => v.name.toLowerCase().includes(q) || v.aka.some((a) => a.toLowerCase().includes(q)));
  }
  /* Uncurated vendors are shown and marked in lists; only a dropdown filters
   * them out. `active=false` means RECORDED, NOT YET CURATED — never hidden. */
  if (opts.curated !== undefined) rows = rows.filter((v) => v.is_curated === opts.curated);
  return ok(SERVICE, rows);
}

/** A vendor name a human types is always accepted, and is born uncurated.
 *  Auto-curating would feed every spelling variant into the catalogue as if it
 *  were canonical. */
export async function createVendor(input: { name: string }, idempotencyKey?: string): Promise<Result<Vendor>> {
  await latency();
  const cached = replayed<Vendor>(SERVICE, "createVendor", idempotencyKey);
  if (cached) return cached;

  const name = input.name.trim();
  if (!name) return invalid(SERVICE, "name_required", "Vendor name is required.", { field: "name" });

  const existing = getState().vendors.find((v) => v.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return conflict(SERVICE, "vendor_exists", `Vendor "${existing.name}" already exists — nothing changed.`, { vendor_id: existing.id });
  }

  const vendor: Vendor = {
    id: newId("vnd"), code: `V-${String(getState().vendors.length + 1).padStart(4, "0")}`,
    name, aka: [], is_curated: false,
    phone: null, address: null, pic_name: null, pic_phone: null,
    bank_account: null, bank_account_secondary: null, npwp: null,
    supplied_categories: [],
  };
  apply((draft) => {
    draft.vendors.push(vendor);
    writeAudit(draft, { service: SERVICE, entity: "vendor", entity_no: vendor.code, action: "create", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.vendor.created", payload: { vendor_id: vendor.id, name } });
  });
  remember(SERVICE, "createVendor", idempotencyKey, vendor);
  return ok(SERVICE, vendor);
}

export async function listItems(opts: { q?: string; curated?: boolean } = {}): Promise<Result<Item[]>> {
  await latency();
  let rows = getState().items;
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }
  if (opts.curated !== undefined) rows = rows.filter((i) => i.is_curated === opts.curated);
  return ok(SERVICE, rows);
}

export async function listUom(): Promise<Result<Uom[]>> {
  await latency();
  return ok(SERVICE, getState().uom);
}

export async function listProjects(): Promise<Result<Project[]>> {
  await latency();
  return ok(SERVICE, getState().projects);
}

export async function listCategories(): Promise<Result<ItemCategory[]>> {
  await latency();
  return ok(SERVICE, getState().item_categories);
}

/* ------------------------------------------------------------------ */
/* PR                                                                  */
/* ------------------------------------------------------------------ */

export interface PrDocumentView extends PrDocument {
  lines: PrLineView[];
  requested_by_name: string;
  project_code: string | null;
  requested_total: number;
  approved_total: number;
}

/** The board: every open line, everywhere. */
export async function listOpenLines(): Promise<Result<PrLineView[]>> {
  await latency();
  return ok(SERVICE, openLines(getState()));
}

/** Every line including settled ones, for the "show everything" view. */
export async function listAllLines(): Promise<Result<PrLineView[]>> {
  await latency();
  const state = getState();
  return ok(SERVICE, state.pr_lines
    .filter((l) => {
      const doc = state.pr_documents.find((d) => d.id === l.doc_id);
      return doc && doc.status !== "CANCELLED";
    })
    .map((l) => prLineView(state, l))
    .sort((a, b) => (b.submitted_at ?? b.doc_no).localeCompare(a.submitted_at ?? a.doc_no)));
}

function docView(docId: string): PrDocumentView | null {
  const state = getState();
  const doc = state.pr_documents.find((d) => d.id === docId);
  if (!doc) return null;
  const lines = state.pr_lines.filter((l) => l.doc_id === docId).map((l) => prLineView(state, l));
  return {
    ...doc,
    lines,
    requested_by_name: state.users.find((u) => u.id === doc.requested_by)?.full_name ?? "—",
    project_code: state.projects.find((p) => p.id === doc.project_id)?.code ?? null,
    requested_total: lines.reduce((s, l) => s + l.item_total, 0),
    approved_total: lines
      .filter((l) => l.approval?.approved)
      .reduce((s, l) => s + (l.approval?.approved_amount ?? l.item_total), 0),
  };
}

export async function listPr(opts: { limit?: number; offset?: number } = {}): Promise<Result<PrDocumentView[]>> {
  await latency();
  const rows = getState().pr_documents
    .map((d) => docView(d.id))
    .filter((d): d is PrDocumentView => !!d)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return paged(SERVICE, rows, opts.limit ?? 50, opts.offset ?? 0);
}

export async function getPr(docNo: string): Promise<Result<PrDocumentView>> {
  await latency();
  const doc = getState().pr_documents.find((d) => d.doc_no === docNo);
  const view = doc ? docView(doc.id) : null;
  if (!view) return notFound(SERVICE, "pr_not_found", `Document ${docNo} not found.`);
  return ok(SERVICE, view);
}

export interface NewLineInput {
  item_id?: string | null;
  description: string;
  qty?: number | null;
  uom?: UomCode | null;
  unit_price?: number | null;
  item_total?: number | null;
  vendor_id?: string | null;
  category?: PrCategory | null;
  purpose?: string | null;
  need_by?: string | null;
}

export async function createPr(
  input: { project_id?: string | null; lines: NewLineInput[] },
  idempotencyKey?: string,
): Promise<Result<PrDocumentView>> {
  await latency();
  const cached = replayed<PrDocumentView>(SERVICE, "createPr", idempotencyKey);
  if (cached) return cached;
  if (!input.lines.length) return invalid(SERVICE, "lines_required", "A purchase request needs at least one line.", { field: "lines" });

  const user = actingUser();
  let docNo = "";
  apply((draft) => {
    docNo = nextDocNumber(draft, "pr");
    const docId = newId("doc");
    draft.pr_documents.push({
      id: docId, doc_no: docNo, doc_type: "PR", status: "DRAFT",
      requested_by: user.id, project_id: input.project_id ?? null,
      created_at: new Date().toISOString(), submitted_at: null,
    });
    input.lines.forEach((l, i) => {
      const lineNo = i + 1;
      draft.pr_lines.push({
        id: newId("prl"), doc_id: docId, line_no: lineNo,
        line_no_full: `${docNo}-L${String(lineNo).padStart(2, "0")}`,
        item_id: l.item_id ?? null, description: l.description,
        qty: l.qty ?? null, uom: l.uom ?? null, unit_price: l.unit_price ?? null,
        item_total: l.item_total ?? Math.round((l.qty ?? 0) * (l.unit_price ?? 0)),
        vendor_id: l.vendor_id ?? null, po_line_id: null,
        category: l.category ?? null, purpose: l.purpose ?? null,
        need_by: l.need_by ?? null,
        removed_at: null, removed_by: null,
      });
    });
    writeAudit(draft, { service: SERVICE, entity: "pr_document", entity_no: docNo, action: "create", outcome: "ok", reason: null });
  });
  const view = docView(getState().pr_documents.find((d) => d.doc_no === docNo)!.id)!;
  remember(SERVICE, "createPr", idempotencyKey, view);
  return ok(SERVICE, view);
}

export async function submitPr(docNo: string, idempotencyKey?: string): Promise<Result<PrDocumentView>> {
  await latency();
  const cached = replayed<PrDocumentView>(SERVICE, `submitPr:${docNo}`, idempotencyKey);
  if (cached) return cached;

  const doc = getState().pr_documents.find((d) => d.doc_no === docNo);
  if (!doc) return notFound(SERVICE, "pr_not_found", `Document ${docNo} not found.`);
  if (doc.status !== "DRAFT") {
    return conflict(SERVICE, "already_submitted", `${docNo} has already been submitted — nothing changed.`, { status: doc.status });
  }

  apply((draft) => {
    const d = draft.pr_documents.find((x) => x.id === doc.id)!;
    d.status = "SUBMITTED";
    d.submitted_at = new Date().toISOString();
    writeAudit(draft, { service: SERVICE, entity: "pr_document", entity_no: docNo, action: "submit", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.pr.submitted", payload: { doc_no: docNo } });
  });
  const view = docView(doc.id)!;
  remember(SERVICE, `submitPr:${docNo}`, idempotencyKey, view);
  return ok(SERVICE, view);
}

/* ------------------------------------------------------------------ */
/* Approval — a checkbox (D28)                                         */
/* ------------------------------------------------------------------ */

export async function queue(): Promise<Result<PrLineView[]>> {
  await latency();
  return ok(SERVICE, approvalQueue(getState()));
}

/** The whole decision. `approved_amount` may be reduced below what was asked
 *  and never raised — money can only shrink on its way through approval (A8).
 */
export async function approveLine(
  input: { line_no: string; approved: boolean; approved_qty?: number | null; approved_amount?: number | null },
  idempotencyKey?: string,
): Promise<Result<PrLineView>> {
  await latency();
  const endpoint = `approveLine:${input.line_no}`;
  const cached = replayed<PrLineView>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "approve_goods");
  if (denied) {
    apply((draft) => {
      writeAudit(draft, {
        service: SERVICE, entity: "pr_line", entity_no: input.line_no,
        action: "approve", outcome: "refused", reason: "tanpa authority approve_goods",
      });
    });
    return denied;
  }

  const state = getState();
  const line = state.pr_lines.find((l) => l.line_no_full === input.line_no);
  if (!line) return notFound(SERVICE, "line_not_found", `Line ${input.line_no} not found.`);
  if (line.removed_at) {
    return conflict(SERVICE, "line_removed", `Line ${input.line_no} has been removed and cannot be approved.`);
  }

  const amount = input.approved_amount ?? line.item_total;
  if (input.approved && amount > line.item_total) {
    return invalid(
      SERVICE, "approved_above_requested",
      `Approved amount (${amount.toLocaleString(LOCALE)}) exceeds the amount requested (${line.item_total.toLocaleString(LOCALE)}). Approval can only reduce.`,
      { field: "approved_amount", requested: line.item_total, attempted: amount },
    );
  }

  const already = isApproved(state, line.id);
  if (already === input.approved) {
    return conflict(
      SERVICE, "already_decided",
      `This line is already ${input.approved ? "approved" : "not approved"} — nothing changed.`,
    );
  }

  const user = actingUser();
  apply((draft) => {
    draft.pr_approvals.push({
      id: newId("apr"), line_id: line.id, step: "GOODS",
      approved: input.approved,
      approved_qty: input.approved ? input.approved_qty ?? line.qty : null,
      approved_amount: input.approved ? amount : null,
      recorded_by: user.id, recorded_by_email: user.email,
      recorded_at: new Date().toISOString(), channel: "web",
    });
    writeAudit(draft, {
      service: SERVICE, entity: "pr_line", entity_no: input.line_no,
      action: input.approved ? "approve" : "unapprove", outcome: "ok", reason: null,
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "procurement.line.approved",
      payload: { line_no: input.line_no, approved: input.approved, amount },
    });
  });

  const view = prLineView(getState(), getState().pr_lines.find((l) => l.id === line.id)!);
  remember(SERVICE, endpoint, idempotencyKey, view);
  return ok(SERVICE, view);
}

/** Removed because it is no longer needed. No deadline, nothing ages out —
 *  but refused once money has reached the line, because past that point the
 *  words are return, credit or void, never a quiet disappearance (D29). */
export async function removeLine(
  input: { line_no: string },
  idempotencyKey?: string,
): Promise<Result<PrLineView>> {
  await latency();
  const endpoint = `removeLine:${input.line_no}`;
  const cached = replayed<PrLineView>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const state = getState();
  const line = state.pr_lines.find((l) => l.line_no_full === input.line_no);
  if (!line) return notFound(SERVICE, "line_not_found", `Line ${input.line_no} not found.`);
  if (line.removed_at) {
    return conflict(SERVICE, "already_removed", "This line has already been removed — nothing changed.");
  }

  const covered = lineCoverage(state, line).covered;
  if (covered > 0) {
    return conflict(
      SERVICE, "money_already_allocated",
      `This line has already received Rp ${covered.toLocaleString(LOCALE)}. What applies now is a return, a vendor credit, or voiding the transaction — not removal.`,
      { covered },
    );
  }

  const user = actingUser();
  apply((draft) => {
    const l = draft.pr_lines.find((x) => x.id === line.id)!;
    l.removed_at = new Date().toISOString();
    l.removed_by = user.id;
    /* Also pull it out of any round that has not frozen its numbers yet. */
    draft.payment_round_lines = draft.payment_round_lines.filter((rl) => {
      if (rl.line_id !== line.id) return true;
      const round = draft.payment_rounds.find((r) => r.id === rl.round_id);
      return round?.status !== "OPEN";
    });
    writeAudit(draft, { service: SERVICE, entity: "pr_line", entity_no: input.line_no, action: "remove", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.line.removed", payload: { line_no: input.line_no } });
  });

  const view = prLineView(getState(), getState().pr_lines.find((l) => l.id === line.id)!);
  remember(SERVICE, endpoint, idempotencyKey, view);
  return ok(SERVICE, view);
}

/* ------------------------------------------------------------------ */
/* Payment rounds                                                      */
/* ------------------------------------------------------------------ */

export interface RoundView extends RoundSummary {
  lines: PrLineView[];
}

function roundView(roundId: string): RoundView | null {
  const state = getState();
  const round = state.payment_rounds.find((r) => r.id === roundId);
  if (!round) return null;
  const lines = state.payment_round_lines
    .filter((rl) => rl.round_id === roundId)
    .map((rl) => state.pr_lines.find((l) => l.id === rl.line_id))
    .filter((l): l is PrLine => !!l)
    .map((l) => prLineView(state, l));
  return { ...roundSummary(state, roundId), lines };
}

export async function listRounds(): Promise<Result<RoundView[]>> {
  await latency();
  const rows = getState().payment_rounds
    .map((r) => roundView(r.id))
    .filter((r): r is RoundView => !!r);
  return ok(SERVICE, rows);
}

export async function getRound(roundNo: string): Promise<Result<RoundView>> {
  await latency();
  const round = getState().payment_rounds.find((r) => r.round_no === roundNo);
  const view = round ? roundView(round.id) : null;
  if (!view) return notFound(SERVICE, "round_not_found", `Round ${roundNo} not found.`);
  return ok(SERVICE, view);
}

/** Rolls every approved-and-still-owed line, from every document and every
 *  requester, into the single OPEN round. Idempotent — safe to call on every
 *  page load, which is why it can be the thing that keeps the round honest. */
export async function syncRound(): Promise<Result<RoundView>> {
  await latency();
  const state = getState();
  let open = state.payment_rounds.find((r) => r.status === "OPEN");

  const eligible = state.pr_lines.filter((line) => {
    if (line.removed_at) return false;
    if (!isApproved(state, line.id)) return false;
    const cov = lineCoverage(state, line);
    if (cov.settled) return false;
    const existing = state.payment_round_lines.find((rl) => rl.line_id === line.id);
    if (!existing) return true;
    const round = state.payment_rounds.find((r) => r.id === existing.round_id);
    /* A line in a closed round that is still owed comes back; a line in a
     * round that has frozen its numbers stays where it is. */
    return round?.status === "CLOSED";
  });

  if (!open && eligible.length === 0) {
    return noop(SERVICE, roundView(state.payment_rounds[0]?.id ?? "") ?? ({} as RoundView));
  }

  let roundId = open?.id ?? "";
  let added = 0;
  apply((draft) => {
    if (!roundId) {
      roundId = newId("rnd");
      draft.payment_rounds.unshift({
        id: roundId, round_no: nextDocNumber(draft, "pay"), status: "OPEN",
        opened_at: new Date().toISOString(), approved_by: null, approved_at: null,
        transferred_amount: null, transferred_trx_no: null, closed_by: null, closed_at: null,
      });
    }
    for (const line of eligible) {
      const already = draft.payment_round_lines.some(
        (rl) => rl.line_id === line.id && rl.round_id === roundId,
      );
      if (already) continue;
      draft.payment_round_lines.push({
        id: newId("rl"), round_id: roundId, line_id: line.id,
        requested_amount: lineCoverage(draft, line).remaining,
      });
      added += 1;
    }
    if (added > 0) {
      writeAudit(draft, {
        service: SERVICE, entity: "payment_round", entity_no: roundId,
        action: "sync", outcome: "ok", reason: `${added} line(s) rolled in`,
      });
    }
  });

  const view = roundView(roundId)!;
  return added === 0 ? noop(SERVICE, view) : ok(SERVICE, view);
}

export async function approveRound(roundNo: string, idempotencyKey?: string): Promise<Result<RoundView>> {
  await latency();
  const cached = replayed<RoundView>(SERVICE, `approveRound:${roundNo}`, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "approve_funds");
  if (denied) return denied;

  const round = getState().payment_rounds.find((r) => r.round_no === roundNo);
  if (!round) return notFound(SERVICE, "round_not_found", `Round ${roundNo} not found.`);
  if (round.status !== "OPEN") {
    return conflict(SERVICE, "round_not_open", `Round ${roundNo} is already ${round.status} — nothing changed.`);
  }

  const user = actingUser();
  apply((draft) => {
    const r = draft.payment_rounds.find((x) => x.id === round.id)!;
    r.status = "APPROVED";
    r.approved_by = user.id;
    r.approved_at = new Date().toISOString();
    /* Freeze what was asked. The number stops being a live calculation and
     * becomes the record of a decision. */
    for (const rl of draft.payment_round_lines.filter((x) => x.round_id === round.id)) {
      const line = draft.pr_lines.find((l) => l.id === rl.line_id);
      if (line) rl.requested_amount = lineCoverage(draft, line).remaining;
    }
    writeAudit(draft, { service: SERVICE, entity: "payment_round", entity_no: roundNo, action: "approve", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.round.approved", payload: { round_no: roundNo } });
  });
  const view = roundView(round.id)!;
  remember(SERVICE, `approveRound:${roundNo}`, idempotencyKey, view);
  return ok(SERVICE, view);
}

/** Money reaching the accounting account. Deliberately does NOT make any line
 *  PAID: "send money ≠ payment" (A10). */
export async function transferRound(
  roundNo: string, input: { amount: number; trx_no: string }, idempotencyKey?: string,
): Promise<Result<RoundView>> {
  await latency();
  const cached = replayed<RoundView>(SERVICE, `transferRound:${roundNo}`, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "approve_funds");
  if (denied) return denied;

  const round = getState().payment_rounds.find((r) => r.round_no === roundNo);
  if (!round) return notFound(SERVICE, "round_not_found", `Round ${roundNo} not found.`);
  if (round.status !== "APPROVED") {
    return conflict(SERVICE, "round_not_approved", `Round ${roundNo} is ${round.status}.`);
  }

  apply((draft) => {
    const r = draft.payment_rounds.find((x) => x.id === round.id)!;
    r.status = "TRANSFERRED";
    r.transferred_amount = input.amount;
    r.transferred_trx_no = input.trx_no;
    writeAudit(draft, { service: SERVICE, entity: "payment_round", entity_no: roundNo, action: "transfer", outcome: "ok", reason: null });
  });
  const view = roundView(round.id)!;
  remember(SERVICE, `transferRound:${roundNo}`, idempotencyKey, view);
  return ok(SERVICE, view);
}

export interface CloseRoundResult {
  round: RoundView;
  /** What closing releases. The step everyone forgets, so the answer says
   *  exactly what it is letting go of. */
  still_owed: PrLineView[];
}

export async function closeRound(roundNo: string, idempotencyKey?: string): Promise<Result<CloseRoundResult>> {
  await latency();
  const cached = replayed<CloseRoundResult>(SERVICE, `closeRound:${roundNo}`, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "approve_funds");
  if (denied) return denied;

  const state = getState();
  const round = state.payment_rounds.find((r) => r.round_no === roundNo);
  if (!round) return notFound(SERVICE, "round_not_found", `Round ${roundNo} not found.`);
  if (round.status === "CLOSED") {
    return conflict(SERVICE, "already_closed", `Round ${roundNo} is already closed — nothing changed.`);
  }

  const stillOwed = state.payment_round_lines
    .filter((rl) => rl.round_id === round.id)
    .map((rl) => state.pr_lines.find((l) => l.id === rl.line_id))
    .filter((l): l is PrLine => !!l)
    .filter((l) => !lineCoverage(state, l).settled)
    .map((l) => prLineView(state, l));

  const user = actingUser();
  apply((draft) => {
    const r = draft.payment_rounds.find((x) => x.id === round.id)!;
    r.status = "CLOSED";
    r.closed_by = user.id;
    r.closed_at = new Date().toISOString();
    writeAudit(draft, {
      service: SERVICE, entity: "payment_round", entity_no: roundNo, action: "close",
      outcome: "ok", reason: stillOwed.length ? `${stillOwed.length} line(s) still owed` : null,
    });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.round.closed", payload: { round_no: roundNo, still_owed: stillOwed.length } });
  });

  const result: CloseRoundResult = { round: roundView(round.id)!, still_owed: stillOwed };
  remember(SERVICE, `closeRound:${roundNo}`, idempotencyKey, result);
  return ok(SERVICE, result);
}

/* ------------------------------------------------------------------ */
/* PO and receiving                                                    */
/* ------------------------------------------------------------------ */

export interface PoView extends PurchaseOrder {
  status_view: PoStatusView;
  lines: PoLine[];
  vendor_name: string;
}

export async function listPo(): Promise<Result<PoView[]>> {
  await latency();
  const state = getState();
  return ok(SERVICE, state.purchase_orders.map((po) => ({
    ...po,
    status_view: poStatus(state, po.id),
    lines: state.po_lines.filter((l) => l.po_id === po.id && l.superseded_by === null),
    vendor_name: state.vendors.find((v) => v.id === po.vendor_id)?.name ?? "—",
  })));
}

export async function getPo(poNo: string): Promise<Result<PoView>> {
  await latency();
  const state = getState();
  const po = state.purchase_orders.find((p) => p.po_no === poNo);
  if (!po) return notFound(SERVICE, "po_not_found", `PO ${poNo} not found.`);
  return ok(SERVICE, {
    ...po,
    status_view: poStatus(state, po.id),
    lines: state.po_lines.filter((l) => l.po_id === po.id && l.superseded_by === null),
    vendor_name: state.vendors.find((v) => v.id === po.vendor_id)?.name ?? "—",
  });
}

/** A photo is mandatory. A problem condition leaves the line open and says who
 *  was told — the system never quietly closes a problem delivery (A18). */
export async function createReceipt(
  input: {
    line_no?: string | null;
    po_line_id?: string | null;
    qty_received: number;
    condition: ReceiptCondition;
    attachment_ids: string[];
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<{ receipt: Receipt; notified: boolean }>> {
  await latency();
  const endpoint = `createReceipt:${input.line_no ?? input.po_line_id}`;
  const cached = replayed<{ receipt: Receipt; notified: boolean }>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  if (!input.attachment_ids.length) {
    return invalid(SERVICE, "photo_required", "A photo of the goods is required.", { field: "attachment_ids" });
  }
  if (!input.line_no && !input.po_line_id) {
    return invalid(SERVICE, "anchor_required", "A receiving report must point at a PR line or a PO line.", { field: "line_no" });
  }

  const state = getState();
  const line = input.line_no ? state.pr_lines.find((l) => l.line_no_full === input.line_no) : null;
  if (input.line_no && !line) return notFound(SERVICE, "line_not_found", `Line ${input.line_no} not found.`);

  const user = actingUser();
  const receipt: Receipt = {
    id: newId("rcp"), receipt_no: `rcv-${new Date().toISOString().slice(2, 10)}_01`,
    line_id: line?.id ?? null, po_line_id: input.po_line_id ?? null,
    qty_received: input.qty_received, condition: input.condition,
    received_by: user.id, received_at: new Date().toISOString(),
    qc_by: user.id, note: input.note ?? null,
  };
  const notified = PROBLEM_CONDITIONS.includes(input.condition);

  apply((draft) => {
    draft.receipts.push(receipt);
    for (const attId of input.attachment_ids) {
      draft.attachment_links.push({
        id: newId("lnk"), attachment_id: attId,
        entity: "receipt", entity_no: receipt.receipt_no,
        kind: "Receiving Item", linked_by: user.id, linked_at: new Date().toISOString(),
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "receipt", entity_no: receipt.receipt_no, action: "create",
      outcome: "ok", reason: notified ? `condition ${input.condition} — line stays open` : null,
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "procurement.receipt.recorded",
      payload: { receipt_no: receipt.receipt_no, condition: input.condition, notified },
    });
  });

  const result = { receipt, notified };
  remember(SERVICE, endpoint, idempotencyKey, result);
  return ok(SERVICE, result);
}

/* ------------------------------------------------------------------ */
/* Reference data — curation                                           */
/* ------------------------------------------------------------------ */

function vendorView(state: ReturnType<typeof getState>, v: Vendor): VendorView {
  const absorbed = state.vendors.filter((x) => x.merged_into === v.id);
  const ids = new Set([v.id, ...absorbed.map((a) => a.id)]);
  const trx = state.transactions.filter((t) => t.vendor_id && ids.has(t.vendor_id) && t.status !== "VOID");
  return {
    ...v,
    supplied_category_names: v.supplied_categories.map(
      (c) => state.item_categories.find((x) => x.code === c)?.name ?? c,
    ),
    transaction_count: trx.length,
    total_spend: trx.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount_idr, 0),
    last_purchase: trx.map((t) => t.trx_date).sort().pop() ?? null,
    open_pr_lines: state.pr_lines.filter((l) => l.vendor_id && ids.has(l.vendor_id) && !l.removed_at).length,
    absorbed,
    bought_categories: boughtCategories(state, v.id),
    items_bought: itemsBoughtFrom(state, v.id),
  };
}

/** Search reaches past the vendor's own name into what they supply and what we
 *  have actually bought from them — so typing "thinner" finds the vendor rather
 *  than requiring someone to already know which one it is. */
export async function listVendorViews(opts: { q?: string } = {}): Promise<Result<VendorView[]>> {
  await latency();
  const state = getState();
  let rows = state.vendors.filter((v) => !v.merged_into);

  if (opts.q) {
    const q = opts.q.toLowerCase();
    const facts = purchaseFacts(state);
    const categoryName = (code: string) =>
      (state.item_categories.find((c) => c.code === code)?.name ?? code).toLowerCase();

    rows = rows.filter((v) => {
      if (v.name.toLowerCase().includes(q)) return true;
      if (v.aka.some((a) => a.toLowerCase().includes(q))) return true;
      if (v.pic_name?.toLowerCase().includes(q)) return true;
      if (v.supplied_categories.some((c) => c.includes(q) || categoryName(c).includes(q))) return true;
      /* …and the items we have bought from them. */
      return facts.some((f) => f.vendor_id === v.id && (
        f.item_name.toLowerCase().includes(q) || categoryName(f.category_code).includes(q)
      ));
    });
  }
  return ok(SERVICE, rows.map((v) => vendorView(state, v)));
}

export async function getVendor(id: string): Promise<Result<VendorView>> {
  await latency();
  const state = getState();
  const v = state.vendors.find((x) => x.id === id);
  if (!v) return notFound(SERVICE, "vendor_not_found", "Vendor not found.");
  return ok(SERVICE, vendorView(state, v));
}

/** Promote to curated: it now appears in dropdowns and in the extractor's list
 *  of names it may treat as canonical. Deliberately a human act — auto-curating
 *  would feed every spelling variant in as if it were the real name. */
export async function curateVendor(id: string, curated: boolean): Promise<Result<VendorView>> {
  await latency();
  const v = getState().vendors.find((x) => x.id === id);
  if (!v) return notFound(SERVICE, "vendor_not_found", "Vendor not found.");
  if (v.is_curated === curated) {
    return conflict(SERVICE, "already_set", `Already ${curated ? "curated" : "uncurated"} — nothing changed.`);
  }
  apply((draft) => {
    draft.vendors.find((x) => x.id === id)!.is_curated = curated;
    writeAudit(draft, { service: SERVICE, entity: "vendor", entity_no: v.code, action: curated ? "curate" : "uncurate", outcome: "ok", reason: null });
  });
  return ok(SERVICE, vendorView(getState(), getState().vendors.find((x) => x.id === id)!));
}

/** Merge a duplicate spelling into the real vendor.
 *
 *  The absorbed row is KEPT and marked, never deleted: every transaction that
 *  pointed at it still points at it, so history does not move when somebody
 *  corrects a name years later (D4). Readers follow `merged_into`.
 *
 *  Only ever a human decision. Two spellings differing by nothing but spacing
 *  are one thing; two differing by a WORD are a question, and the answer is
 *  not the machine's.
 */
export async function mergeVendor(loserId: string, winnerId: string): Promise<Result<VendorView>> {
  await latency();
  const state = getState();
  const loser = state.vendors.find((v) => v.id === loserId);
  const winner = state.vendors.find((v) => v.id === winnerId);
  if (!loser || !winner) return notFound(SERVICE, "vendor_not_found", "Vendor not found.");
  if (loserId === winnerId) return invalid(SERVICE, "same_vendor", "A vendor cannot be merged into itself.", { field: "winner" });
  if (loser.merged_into) return conflict(SERVICE, "already_merged", `${loser.name} has already been merged.`);

  apply((draft) => {
    const l = draft.vendors.find((v) => v.id === loserId)!;
    const w = draft.vendors.find((v) => v.id === winnerId)!;
    l.merged_into = winnerId;
    for (const spelling of [l.name, ...l.aka]) {
      if (!w.aka.includes(spelling) && spelling !== w.name) w.aka.push(spelling);
    }
    writeAudit(draft, { service: SERVICE, entity: "vendor", entity_no: l.code, action: "merge", outcome: "ok", reason: `into ${w.name}` });
    writeOutbox(draft, { service: SERVICE, event_type: "procurement.vendor.merged", payload: { loser: l.name, winner: w.name } });
  });
  return ok(SERVICE, vendorView(getState(), getState().vendors.find((v) => v.id === winnerId)!));
}

function itemView(state: ReturnType<typeof getState>, i: Item): ItemView {
  return {
    ...i,
    category_name: state.item_categories.find((c) => c.code === i.category_code)?.name ?? i.category_code,
    last_vendor_name: state.vendors.find((v) => v.id === i.last_vendor_id)?.name ?? null,
    suggested_price: i.standard_price ?? i.last_price,
    sourced_from: itemSources(state, i.id),
    purchase_count: state.transaction_lines.filter((l) => l.item_id === i.id).length
      + state.pr_lines.filter((l) => l.item_id === i.id).length,
  };
}

export async function listItemViews(
  opts: { q?: string; category?: string; curated?: boolean } = {},
): Promise<Result<ItemView[]>> {
  await latency();
  const state = getState();
  let rows = state.items.filter((i) => !i.merged_into);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }
  if (opts.category) rows = rows.filter((i) => i.category_code === opts.category);
  /* The other half of the curation rule: a list is where "not yet curated"
   * means "shown and marked", and a DROPDOWN is where it means "absent". */
  if (opts.curated !== undefined) rows = rows.filter((i) => i.is_curated === opts.curated);
  return ok(SERVICE, rows.map((i) => itemView(state, i)));
}

export async function createItem(
  input: { name: string; base_uom: UomCode; category_code?: string; kind?: "goods" | "service" },
  idempotencyKey?: string,
): Promise<Result<ItemView>> {
  await latency();
  const cached = replayed<ItemView>(SERVICE, "createItem", idempotencyKey);
  if (cached) return cached;

  const name = input.name.trim();
  if (!name) return invalid(SERVICE, "name_required", "Item name is required.", { field: "name" });
  const existing = getState().items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (existing) return conflict(SERVICE, "item_exists", `"${existing.name}" already exists — nothing changed.`, { item_id: existing.id });

  const item: Item = {
    id: newId("itm"),
    code: `ITM-${String(getState().items.length + 1).padStart(4, "0")}`,
    name, aka: [], category_code: input.category_code ?? "uncurated",
    base_uom: input.base_uom, kind: input.kind ?? "goods",
    /* Born uncurated: recorded, visible here, and absent from dropdowns until
     * a human says it is a real catalogue entry. */
    is_curated: false,
    standard_price: null, last_price: null, last_vendor_id: null, last_purchased_at: null,
    merged_into: null,
  };
  apply((draft) => {
    draft.items.push(item);
    writeAudit(draft, { service: SERVICE, entity: "item", entity_no: item.code, action: "create", outcome: "ok", reason: null });
  });
  const view = itemView(getState(), item);
  remember(SERVICE, "createItem", idempotencyKey, view);
  return ok(SERVICE, view);
}

export async function curateItem(
  id: string,
  input: { curated: boolean; category_code?: string; standard_price?: number | null },
): Promise<Result<ItemView>> {
  await latency();
  const item = getState().items.find((i) => i.id === id);
  if (!item) return notFound(SERVICE, "item_not_found", "Item not found.");
  if (input.standard_price != null && input.standard_price < 0) {
    return invalid(SERVICE, "price_negative", "A standard price cannot be negative.", { field: "standard_price" });
  }
  apply((draft) => {
    const i = draft.items.find((x) => x.id === id)!;
    i.is_curated = input.curated;
    if (input.category_code) i.category_code = input.category_code;
    /* `standard_price` is the curated price and is only ever set by a person.
     * `last_price` is a trace of what was actually paid and is never edited
     * here — conflating them is how a one-off panic purchase becomes the
     * official price. */
    if (input.standard_price !== undefined) i.standard_price = input.standard_price;
    writeAudit(draft, { service: SERVICE, entity: "item", entity_no: i.code, action: "curate", outcome: "ok", reason: null });
  });
  return ok(SERVICE, itemView(getState(), getState().items.find((i) => i.id === id)!));
}

/** Contact and banking details. Kept apart from curation: knowing who to call
 *  does not make a vendor canonical, and a curated vendor with no phone number
 *  is still a gap worth seeing. */
export async function updateVendorContact(
  id: string,
  input: Partial<Pick<Vendor,
    "pic_name" | "pic_phone" | "phone" | "address" |
    "bank_account" | "bank_account_secondary" | "npwp" | "supplied_categories">>,
): Promise<Result<VendorView>> {
  await latency();
  const v = getState().vendors.find((x) => x.id === id);
  if (!v) return notFound(SERVICE, "vendor_not_found", "Vendor not found.");
  apply((draft) => {
    Object.assign(draft.vendors.find((x) => x.id === id)!, input);
    writeAudit(draft, { service: SERVICE, entity: "vendor", entity_no: v.code, action: "update_contact", outcome: "ok", reason: null });
  });
  return ok(SERVICE, vendorView(getState(), getState().vendors.find((x) => x.id === id)!));
}

/** "We need thinner — where do we buy it?" asked directly, without going
 *  through a vendor record at all. */
export async function whereToBuy(query: string): Promise<Result<ItemView[]>> {
  await latency();
  const state = getState();
  const q = query.trim().toLowerCase();
  if (!q) return ok(SERVICE, []);
  const rows = state.items
    .filter((i) => !i.merged_into && i.name.toLowerCase().includes(q))
    .map((i) => itemView(state, i))
    .filter((i) => i.sourced_from.length > 0);
  return ok(SERVICE, rows);
}

/* ------------------------------------------------------------------ */
/* Draft editing                                                       */
/* ------------------------------------------------------------------ */

/** Change a line while its document is still a draft.
 *
 *  Only while DRAFT. Once submitted, a line is something other people have
 *  looked at and possibly decided on, and editing it in place would rewrite
 *  what they saw. After that the routes are: the CEO reduces the approved
 *  amount, or the requester removes the line and asks again.
 */
export async function updateDraftLine(
  lineNo: string,
  input: Partial<Pick<PrLineRow,
    "description" | "qty" | "uom" | "unit_price" | "vendor_id" | "category" | "purpose" | "need_by" | "item_id">>,
): Promise<Result<PrLineView>> {
  await latency();
  const state = getState();
  const line = state.pr_lines.find((l) => l.line_no_full === lineNo);
  if (!line) return notFound(SERVICE, "line_not_found", `Line ${lineNo} not found.`);
  const doc = state.pr_documents.find((d) => d.id === line.doc_id);
  if (doc?.status !== "DRAFT") {
    return conflict(
      SERVICE, "not_a_draft",
      `${doc?.doc_no} has already been submitted. Reduce the approved amount, or remove the line and ask again — editing it now would rewrite what the approver saw.`,
    );
  }

  apply((draft) => {
    const l = draft.pr_lines.find((x) => x.id === line.id)!;
    Object.assign(l, input);
    l.item_total = Math.round((l.qty ?? 0) * (l.unit_price ?? 0));
    writeAudit(draft, { service: SERVICE, entity: "pr_line", entity_no: lineNo, action: "edit_draft", outcome: "ok", reason: null });
  });
  return ok(SERVICE, prLineView(getState(), getState().pr_lines.find((l) => l.id === line.id)!));
}

export async function addDraftLine(docNo: string, input: NewLineInput): Promise<Result<PrLineView>> {
  await latency();
  const state = getState();
  const doc = state.pr_documents.find((d) => d.doc_no === docNo);
  if (!doc) return notFound(SERVICE, "pr_not_found", `Document ${docNo} not found.`);
  if (doc.status !== "DRAFT") {
    return conflict(SERVICE, "not_a_draft", `${docNo} has already been submitted.`);
  }
  if (!input.description?.trim()) {
    return invalid(SERVICE, "description_required", "A line needs a description.", { field: "description" });
  }

  let newId_ = "";
  apply((draft) => {
    const lineNo = draft.pr_lines.filter((l) => l.doc_id === doc.id).length + 1;
    newId_ = newId("prl");
    draft.pr_lines.push({
      id: newId_, doc_id: doc.id, line_no: lineNo,
      line_no_full: `${docNo}-L${String(lineNo).padStart(2, "0")}`,
      item_id: input.item_id ?? null, description: input.description.trim(),
      qty: input.qty ?? null, uom: input.uom ?? null, unit_price: input.unit_price ?? null,
      item_total: input.item_total ?? Math.round((input.qty ?? 0) * (input.unit_price ?? 0)),
      vendor_id: input.vendor_id ?? null, po_line_id: null,
      category: input.category ?? null, purpose: input.purpose ?? null,
      need_by: input.need_by ?? null, removed_at: null, removed_by: null,
    });
    writeAudit(draft, { service: SERVICE, entity: "pr_line", entity_no: docNo, action: "add_draft_line", outcome: "ok", reason: null });
  });
  return ok(SERVICE, prLineView(getState(), getState().pr_lines.find((l) => l.id === newId_)!));
}
