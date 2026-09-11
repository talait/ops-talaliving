/** Implements `/api/v1/procurement` against the database.
 *
 *  **Same names, same signatures, same envelope as `src/demo/api/procurement.ts`.**
 *  That is the whole swap: a screen that calls `procurement.listOpenLines()`
 *  today calls it afterwards and never learns where the rows came from.
 *
 *  Three things this file is deliberately *not* allowed to do, because each one
 *  would quietly end the guarantee above:
 *
 *  1. **It does not compute anything derived.** Status, coverage, the meeting
 *     quadrant, the variance, what a vendor could invoice — all of it arrives
 *     computed, from `0014_procure_views.sql`. A figure worked out here would be
 *     a second definition of a rule this project has argued about once, and the
 *     two would disagree within a month (A3).
 *  2. **It does not check a permission.** Every refusal is the database's. A
 *     check here would be a second place the rule lives, and the failure mode is
 *     the one `john-lau` had: the screen and the guard reading different things.
 *  3. **It does not reshape a refusal.** The database's wording names who the
 *     decision belongs to; "Forbidden" tells a person nothing (A7).
 *
 *  What it *does* do is map flat columns onto the nested shapes in
 *  `src/services/procurement/contracts.ts`. The view returns
 *  `variance_delta`; the screens read `line.variance.delta`. That is a
 *  renaming, not a calculation, and it is the only work here.
 */
import type {
  Vendor, VendorView, Item, ItemView, Uom, ItemCategory, Project,
  PrLineView, PrApproval, LineNote, LineVariance, ApprovalRequest,
  VendorJourney, RoundSummary, VarianceReason, Channel,
} from "@/services/procurement/contracts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fail, fromSeam, fromRows, ok, type Result } from "./_kit";

const SERVICE = "procurement" as const;

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

/** One row of `procure.v_pr_line`, flat. Not exported: nothing outside this
 *  file should know the view's column names, or the swap would have leaked. */
interface LineRow {
  id: string; doc_id: string; line_no: number; line_no_full: string;
  item_id: string | null; description: string;
  qty: number | null; uom: string | null; unit_price: number | null;
  item_total: number; vendor_id: string | null; po_line_id: string | null;
  category: string | null; purpose: string | null; need_by: string | null;
  source_wo_no: string | null;
  removed_at: string | null; removed_by: string | null;

  status: string; meeting_state: string;
  doc_no: string; doc_status: string; submitted_at: string | null;
  requested_by_name: string; project_code: string | null;
  vendor_name: string | null; item_name: string | null;

  coverage_approved: number; coverage_covered: number;
  coverage_remaining: number; coverage_settled: boolean;
  trx_nos: string[];

  received_qty: number; reported_qty: number; has_problem_receipt: boolean;
  evidence_count: number; has_payment_proof: boolean; has_support: boolean;

  variance_requested: number; variance_approved: number; variance_paid: number;
  variance_delta: number; variance_kind: string; variance_material: boolean;
  explanation_id: string | null; explanation_reason: string | null;
  explanation_note: string | null; explanation_amount_at_time: number | null;
  explanation_by: string | null; explanation_at: string | null;

  note_id: string | null; note_instructions: string | null; note_remark: string | null;
  note_by_id: string | null; note_by: string | null; note_at: string | null;

  pending_request_id: string | null; pending_request_batch_id: string | null;
  pending_request_token: string | null;
  pending_request_sent_to_name: string | null; pending_request_sent_to: string | null;
  pending_request_sent_by_id: string | null; pending_request_sent_by: string | null;
  pending_request_sent_at: string | null; pending_request_channel: string | null;
  pending_request_meeting_note: string | null;

  round_no: string | null; round_status: string | null;

  approval_id: string | null; approval_approved: boolean | null;
  approval_qty: number | null; approval_amount: number | null;
  approval_by_id: string | null; approval_by: string | null;
  approval_at: string | null; approval_channel: string | null;
}

function toLineView(r: LineRow): PrLineView {
  return {
    id: r.id, doc_id: r.doc_id, line_no: r.line_no, line_no_full: r.line_no_full,
    item_id: r.item_id, description: r.description,
    qty: r.qty, uom: r.uom as PrLineView["uom"], unit_price: r.unit_price,
    item_total: r.item_total, vendor_id: r.vendor_id, po_line_id: r.po_line_id,
    category: r.category as PrLineView["category"],
    purpose: r.purpose, need_by: r.need_by, source_wo_no: r.source_wo_no,
    removed_at: r.removed_at, removed_by: r.removed_by,

    status: r.status as PrLineView["status"],
    meeting_state: r.meeting_state as PrLineView["meeting_state"],
    doc_no: r.doc_no, submitted_at: r.submitted_at,
    requested_by_name: r.requested_by_name, project_code: r.project_code,
    vendor_name: r.vendor_name, item_name: r.item_name,

    coverage: {
      line_id: r.id,
      approved: r.coverage_approved,
      covered: r.coverage_covered,
      remaining: r.coverage_remaining,
      settled: r.coverage_settled,
    },
    trx_nos: r.trx_nos ?? [],
    received_qty: r.received_qty,
    has_problem_receipt: r.has_problem_receipt,
    evidence_count: r.evidence_count,
    has_payment_proof: r.has_payment_proof,
    has_support: r.has_support,

    variance: {
      requested: r.variance_requested,
      approved: r.variance_approved,
      paid: r.variance_paid,
      delta: r.variance_delta,
      kind: r.variance_kind as PrLineView["variance"]["kind"],
      material: r.variance_material,
      explanation: r.explanation_id
        ? {
          id: r.explanation_id,
          line_id: r.id,
          reason: r.explanation_reason as VarianceReason,
          note: r.explanation_note,
          amount_at_time: r.explanation_amount_at_time ?? 0,
          /* The view carries the email, which is the readable half and the one
             a trail is actually read by (ADR-004). The uuid is not on the row
             because nothing renders it. */
          recorded_by: "",
          recorded_by_email: r.explanation_by ?? "",
          recorded_at: r.explanation_at ?? "",
        }
        : null,
    },

    note: r.note_id
      ? {
        id: r.note_id, line_id: r.id,
        instructions: r.note_instructions, remark: r.note_remark,
        recorded_by: r.note_by_id ?? "",
        recorded_by_email: r.note_by ?? "",
        recorded_at: r.note_at ?? "",
      }
      : null,

    pending_request: r.pending_request_id
      ? {
        id: r.pending_request_id, line_id: r.id,
        batch_id: r.pending_request_batch_id ?? "",
        token: r.pending_request_token ?? "",
        sent_to: r.pending_request_sent_to_name ?? "",
        sent_to_email: r.pending_request_sent_to ?? "",
        sent_by: r.pending_request_sent_by_id ?? "",
        sent_by_email: r.pending_request_sent_by ?? "",
        sent_at: r.pending_request_sent_at ?? "",
        channel: (r.pending_request_channel ?? "chat") as Channel,
        meeting_note: r.pending_request_meeting_note,
        /* Pending by definition — the view selects only unanswered cards. */
        answered_at: null,
        outcome: null,
      }
      : null,

    round_no: r.round_no,
    round_status: r.round_status as PrLineView["round_status"],

    approval: r.approval_id
      ? {
        id: r.approval_id, line_id: r.id, step: "GOODS",
        approved: r.approval_approved ?? false,
        approved_qty: r.approval_qty,
        approved_amount: r.approval_amount,
        recorded_by: r.approval_by_id ?? "",
        recorded_by_email: r.approval_by ?? "",
        recorded_at: r.approval_at ?? "",
        channel: (r.approval_channel ?? "web") as Channel,
      }
      : null,
  };
}

/** Every line that is still someone's problem. Newest submission first, which
 *  is the board's own order — the queue below sorts the other way, and both
 *  orders are the view's, not this file's. */
export async function listOpenLines(): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_open_lines").select("*").order("submitted_at", { ascending: false });
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

export async function listAllLines(): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_pr_line").select("*")
    .not("doc_status", "in", "(DRAFT,CANCELLED)")
    .is("removed_at", null)
    .order("submitted_at", { ascending: false });
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

/** The standing queue (D21). Oldest first: nothing ages out and nothing is
 *  prioritised, but a line that has waited a week should not be below one filed
 *  this morning just because the table happens to be in that order. */
export async function queue(): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_approval_queue").select("*").order("submitted_at", { ascending: true });
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

export async function decidedLines(limit = 12): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_pr_line").select("*")
    .eq("approval_approved", true)
    .order("approval_at", { ascending: false })
    .limit(limit);
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

/** A difference outlives the line: the plywood that closed Rp 180.000 cheaper
 *  is off the open board and still part of the answer to "does this keep
 *  happening". So this reads every line with a material variance, settled or
 *  not. */
export async function listVariances(): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_pr_line").select("*")
    .eq("variance_material", true)
    .order("submitted_at", { ascending: false });
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

export async function listLinesForWorkOrder(woNo: string): Promise<Result<PrLineView[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_pr_line").select("*").eq("source_wo_no", woNo).is("removed_at", null);
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, (data as LineRow[]).map(toLineView));
}

/** The whole trail of decisions on one line, oldest first.
 *
 *  Append-only means the story is the rows, not the last row: "approved at
 *  10:18, un-approved at 14:07" is a fact about how the decision was made and
 *  the screen has no business hiding it behind the current value (D28). */
export async function lineHistory(lineNo: string): Promise<Result<PrApproval[]>> {
  const sb = supabaseBrowser();
  const { data: line, error: e1 } = await sb
    .from("pr_lines").select("id").eq("line_no_full", lineNo).maybeSingle();
  if (e1) return fail(SERVICE, e1);
  if (!line) return ok(SERVICE, []);

  const { data, error } = await sb
    .from("pr_approvals").select("*")
    .eq("line_id", (line as { id: string }).id)
    .order("recorded_at", { ascending: true });
  return fromRows<PrApproval[]>(SERVICE, data as PrApproval[], error);
}

/* ------------------------------------------------------------------ */
/* Deciding                                                            */
/* ------------------------------------------------------------------ */

/** `approve_goods` or 403, a bare number 422, a second yes 409 — every one of
 *  them the database's, from `procure.approve_line()`. Nothing is checked here
 *  and nothing is reworded. */
export async function approveLine(
  input: {
    line_no: string;
    approved: boolean;
    approved_qty?: number | null;
    approved_amount?: number | null;
    instructions?: string | null;
    remark?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<PrLineView>> {
  const { data, error } = await supabaseBrowser().rpc("approve_line", {
    p_line_no: input.line_no,
    p_approved: input.approved,
    p_approved_qty: input.approved_qty ?? null,
    p_approved_amount: input.approved_amount ?? null,
    p_instructions: input.instructions ?? null,
    p_remark: input.remark ?? null,
    p_channel: "web",
    p_key: idempotencyKey ?? null,
  });
  const res = fromSeam<unknown>(SERVICE, data, error);
  if (res.error) return res;
  return getLine(input.line_no);
}

export async function removeLine(
  input: { line_no: string },
  idempotencyKey?: string,
): Promise<Result<PrLineView>> {
  const { data, error } = await supabaseBrowser().rpc("remove_line", {
    p_line_no: input.line_no, p_key: idempotencyKey ?? null,
  });
  const res = fromSeam<unknown>(SERVICE, data, error);
  if (res.error) return res;
  return getLine(input.line_no);
}

export async function noteLine(
  input: { line_no: string; instructions?: string | null; remark?: string | null },
): Promise<Result<PrLineView>> {
  const { data, error } = await supabaseBrowser().rpc("note_line", {
    p_line_no: input.line_no,
    p_instructions: input.instructions ?? null,
    p_remark: input.remark ?? null,
  });
  const res = fromSeam<unknown>(SERVICE, data, error);
  if (res.error) return res;
  return getLine(input.line_no);
}

export async function explainVariance(
  input: { line_no: string; reason: VarianceReason; note?: string | null },
): Promise<Result<PrLineView>> {
  const { data, error } = await supabaseBrowser().rpc("explain_variance", {
    p_line_no: input.line_no, p_reason: input.reason, p_note: input.note ?? null,
  });
  const res = fromSeam<unknown>(SERVICE, data, error);
  if (res.error) return res;
  return getLine(input.line_no);
}

export async function submitPr(
  docNo: string, idempotencyKey?: string,
): Promise<Result<{ doc_no: string; status: string; lines: number }>> {
  const { data, error } = await supabaseBrowser().rpc("submit_pr", {
    p_doc_no: docNo, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** The answer coming back from chat. **Not called from a screen** — it is here
 *  so the webhook handler that verifies Google's signature has one place to land,
 *  and so that `answered_by_email` is visibly a parameter rather than something
 *  taken from the session. Taking it from the session is the bug D69 exists to
 *  prevent. */
export async function answerFromChat(
  input: { token: string; approved: boolean; answered_by_email: string; instructions?: string | null },
  idempotencyKey?: string,
): Promise<Result<{ line_no: string; approved: boolean; by: string; channel: string }>> {
  const { data, error } = await supabaseBrowser().rpc("answer_request", {
    p_token: input.token,
    p_approved: input.approved,
    p_answered_by_email: input.answered_by_email,
    p_instructions: input.instructions ?? null,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

async function getLine(lineNo: string): Promise<Result<PrLineView>> {
  const { data, error } = await supabaseBrowser()
    .from("v_pr_line").select("*").eq("line_no_full", lineNo).maybeSingle();
  if (error) return fail(SERVICE, error);
  if (!data) {
    return {
      error: {
        code: "line_not_found", message: `Line ${lineNo} not found.`,
        outcome: "refused", status: 404,
      },
      meta: { request_id: "", service: SERVICE, version: "1", outcome: "refused" },
    };
  }
  return ok(SERVICE, toLineView(data as LineRow));
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

/** Uncurated vendors are **in the list and absent from dropdowns** — `curated`
 *  is the caller's filter, not a rule applied here. Refusing them outright is
 *  how a workshop ends up buying off-system (D30). */
export async function listVendors(
  opts: { q?: string; curated?: boolean } = {},
): Promise<Result<Vendor[]>> {
  let q = supabaseBrowser().from("vendors").select("*").is("merged_into", null);
  if (opts.curated !== undefined) q = q.eq("is_curated", opts.curated);
  if (opts.q) q = q.ilike("name", `%${opts.q}%`);
  const { data, error } = await q.order("name");
  return fromRows<Vendor[]>(SERVICE, data as Vendor[], error);
}

export async function listVendorViews(opts: { q?: string } = {}): Promise<Result<VendorView[]>> {
  let q = supabaseBrowser().from("v_vendor_view").select("*").is("merged_into", null);
  if (opts.q) q = q.ilike("name", `%${opts.q}%`);
  const { data, error } = await q.order("name");
  return fromRows<VendorView[]>(SERVICE, data as VendorView[], error);
}

export async function listItems(
  opts: { q?: string; curated?: boolean } = {},
): Promise<Result<Item[]>> {
  let q = supabaseBrowser().from("items").select("*").is("merged_into", null);
  if (opts.curated !== undefined) q = q.eq("is_curated", opts.curated);
  if (opts.q) q = q.ilike("name", `%${opts.q}%`);
  const { data, error } = await q.order("name");
  return fromRows<Item[]>(SERVICE, data as Item[], error);
}

export async function listItemViews(opts: { q?: string } = {}): Promise<Result<ItemView[]>> {
  let q = supabaseBrowser().from("v_item_view").select("*").is("merged_into", null);
  if (opts.q) q = q.ilike("name", `%${opts.q}%`);
  const { data, error } = await q.order("name");
  return fromRows<ItemView[]>(SERVICE, data as ItemView[], error);
}

export async function listUom(): Promise<Result<Uom[]>> {
  const { data, error } = await supabaseBrowser().from("uom").select("*").order("code");
  return fromRows<Uom[]>(SERVICE, data as Uom[], error);
}

export async function listCategories(): Promise<Result<ItemCategory[]>> {
  const { data, error } = await supabaseBrowser()
    .from("item_categories").select("*").order("name");
  return fromRows<ItemCategory[]>(SERVICE, data as ItemCategory[], error);
}

export async function listProjects(): Promise<Result<Project[]>> {
  const { data, error } = await supabaseBrowser().from("projects").select("*").order("code");
  return fromRows<Project[]>(SERVICE, data as Project[], error);
}

export async function curateVendor(code: string, curated: boolean): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("curate_vendor", {
    p_code: code, p_curated: curated,
  });
  return fromSeam(SERVICE, data, error);
}

/** A pointer, never a delete (D33). Takes **codes**, not uuids, because that is
 *  what crosses every seam in this system and what a person can read back. */
export async function mergeVendor(loserCode: string, winnerCode: string): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("merge_vendor", {
    p_loser_code: loserCode, p_winner_code: winnerCode,
  });
  return fromSeam(SERVICE, data, error);
}

/* ------------------------------------------------------------------ */
/* Rounds, orders, receiving                                           */
/* ------------------------------------------------------------------ */

export async function listRounds(): Promise<Result<RoundSummary[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_round_summary").select("*").order("opened_at", { ascending: false });
  return fromRows<RoundSummary[]>(SERVICE, data as RoundSummary[], error);
}

export async function getRound(roundNo: string): Promise<Result<RoundSummary>> {
  const { data, error } = await supabaseBrowser()
    .from("v_round_summary").select("*").eq("round_no", roundNo).single();
  return fromRows<RoundSummary>(SERVICE, data as RoundSummary, error);
}

export async function approveRound(roundNo: string, idempotencyKey?: string): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("approve_round", {
    p_round_no: roundNo, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** Recording an instalment. It moves the round to TRANSFERRED and **makes not
 *  one line PAID** — that is D6, and it is the database's business, not this
 *  file's. */
export async function transferRound(
  input: { round_no: string; amount: number; trx_no: string; proof_attachment_id: string },
  idempotencyKey?: string,
): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("transfer_round", {
    p_round_no: input.round_no,
    p_amount: input.amount,
    p_trx_no: input.trx_no,
    p_proof: input.proof_attachment_id,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

export async function listVendorJourneys(): Promise<Result<VendorJourney[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_vendor_journey").select("*").gt("orders", 0).order("vendor_name");
  return fromRows<VendorJourney[]>(SERVICE, data as VendorJourney[], error);
}

export async function getVendorJourney(vendorId: string): Promise<Result<VendorJourney>> {
  const { data, error } = await supabaseBrowser()
    .from("v_vendor_journey").select("*").eq("vendor_id", vendorId).single();
  return fromRows<VendorJourney>(SERVICE, data as VendorJourney, error);
}

export async function approvePo(
  poNo: string, note?: string | null, idempotencyKey?: string,
): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("approve_po", {
    p_po_no: poNo, p_note: note ?? null, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

export async function issuePo(poNo: string, idempotencyKey?: string): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("issue_po", {
    p_po_no: poNo, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

export async function amendPoLine(
  input: { po_no: string; line_no: number; qty: number; unit_price: number; description?: string | null },
  idempotencyKey?: string,
): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("amend_po_line", {
    p_po_no: input.po_no, p_line_no: input.line_no,
    p_qty: input.qty, p_unit_price: input.unit_price,
    p_description: input.description ?? null,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** Refuses while anything is outstanding, and the refusal's `detail.blockers`
 *  says which — a refusal that only says no leaves somebody clicking it again
 *  next week (D132). */
export async function closePo(poNo: string, idempotencyKey?: string): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("close_po", {
    p_po_no: poNo, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

export async function confirmReceipt(
  input: { receipt_no: string; qc_by?: string | null; note?: string | null },
  idempotencyKey?: string,
): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("confirm_receipt", {
    p_receipt_no: input.receipt_no,
    p_qc_by: input.qc_by ?? null,
    p_note: input.note ?? null,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** Arrived and reported, with no signed tanda terima yet. The morning list
 *  (D131). */
export async function listReported(): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("receipts").select("*").eq("status", "REPORTED")
    .order("received_at", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

export async function listVariancesRaw(lineNo: string): Promise<Result<LineVariance[]>> {
  const sb = supabaseBrowser();
  const { data: line, error: e1 } = await sb
    .from("pr_lines").select("id").eq("line_no_full", lineNo).maybeSingle();
  if (e1) return fail(SERVICE, e1);
  if (!line) return ok(SERVICE, []);
  const { data, error } = await sb
    .from("line_variances").select("*")
    .eq("line_id", (line as { id: string }).id)
    .order("recorded_at", { ascending: true });
  return fromRows<LineVariance[]>(SERVICE, data as LineVariance[], error);
}

export async function listNotes(lineNo: string): Promise<Result<LineNote[]>> {
  const sb = supabaseBrowser();
  const { data: line, error: e1 } = await sb
    .from("pr_lines").select("id").eq("line_no_full", lineNo).maybeSingle();
  if (e1) return fail(SERVICE, e1);
  if (!line) return ok(SERVICE, []);
  const { data, error } = await sb
    .from("line_notes").select("*")
    .eq("line_id", (line as { id: string }).id)
    .order("recorded_at", { ascending: true });
  return fromRows<LineNote[]>(SERVICE, data as LineNote[], error);
}

export async function listPendingRequests(): Promise<Result<ApprovalRequest[]>> {
  const { data, error } = await supabaseBrowser()
    .from("approval_requests").select("*").is("answered_at", null)
    .order("sent_at", { ascending: false });
  return fromRows<ApprovalRequest[]>(SERVICE, data as ApprovalRequest[], error);
}
