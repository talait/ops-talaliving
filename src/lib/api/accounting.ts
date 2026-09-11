/** Implements `/api/v1/accounting` against the database.
 *
 *  The same rules as `procurement.ts`: nothing derived is computed here,
 *  no permission is checked here, and no refusal is reworded here. In this
 *  service that matters more than anywhere else — a guard reimplemented in
 *  TypeScript is a guard that can disagree with the one in front of the money.
 *
 *  **Two write seams, and only two** (ADR-006): `postTransaction` and
 *  `allocate`. Everything else that moves money is one of those two under a
 *  different name, and adding a third road is how the check gets skipped.
 */
import type {
  Account, AccountBalance, TransactionView, TransactionDetail,
  TransactionType, Direction, AllocMethod, InboxStatus, InboxHealth,
  TrxStatus,
} from "@/services/accounting/contracts";
import type { DocKind } from "@/services/documents/contracts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fail, fromSeam, fromRows, notFound, ok, type Result } from "./_kit";

const SERVICE = "accounting" as const;

/** A document going in, by its **code**. The contracts carry display strings
 *  (`"Payment Proof"`); the database stores `transfer_proof` and keeps the
 *  wording in `core.doc_kind_labels` so renaming a label is a row rather than
 *  a migration (C1). Callers that already hold a code pass it straight
 *  through; the map is for the screens that still hold the label. */
const KIND_CODE: Partial<Record<DocKind, string>> = {
  "Receipt / Invoice / Nota": "nota",
  "Payment Proof": "transfer_proof",
  "Receiving Item": "goods_photo",
  "Delivery Note": "delivery_note",
  "Purchase Order": "purchase_order",
  "Reference Link": "quotation",
  "Rekening Koran": "rekening_koran",
  "Surat Dokter": "surat_dokter",
  "Surat Lembur": "surat_lembur",
  "Laporan Lembur": "laporan_lembur",
  "Gambar Kerja": "gambar_kerja",
  "Gambar Jadi": "gambar_jadi",
  Others: "other",
};

function toKindCode(kind: string): string {
  return KIND_CODE[kind as DocKind] ?? kind;
}

/* ------------------------------------------------------------------ */
/* Reference                                                           */
/* ------------------------------------------------------------------ */

export async function listAccounts(): Promise<Result<Account[]>> {
  const { data, error } = await supabaseBrowser()
    .from("accounts").select("*").order("code");
  return fromRows<Account[]>(SERVICE, data as Account[], error);
}

/** The balance, as the database computes it (D9). No screen recomputes this,
 *  and one that cannot load it shows an em dash rather than a substitute — a
 *  client-side stand-in is how a page ends up disagreeing with the books.
 *
 *  `balance_locked` is how the leadership accounts read to somebody without
 *  `approve_funds`: **locked, not hidden** (D87). The row is there, the figure
 *  is not, and the screen can say which — hiding the account from people who
 *  can see every transfer into it is a fiction they see through. */
export async function listAccountRows(): Promise<Result<(AccountBalance & { balance_locked: boolean })[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_account_balance").select("*").order("code");
  return fromRows(SERVICE, data as (AccountBalance & { balance_locked: boolean })[], error);
}

export async function listTypeRows(): Promise<Result<TransactionType[]>> {
  const { data, error } = await supabaseBrowser()
    .from("transaction_types").select("*").order("code");
  return fromRows<TransactionType[]>(SERVICE, data as TransactionType[], error);
}

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

export async function listTransactions(
  opts: { limit?: number; offset?: number; account_code?: string; status?: TrxStatus } = {},
): Promise<Result<TransactionView[]>> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  let q = supabaseBrowser().from("v_transaction").select("*");
  if (opts.account_code) q = q.eq("account_code", opts.account_code);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order("trx_date", { ascending: false })
    .order("trx_no", { ascending: false })
    .range(offset, offset + limit - 1);
  return fromRows<TransactionView[]>(SERVICE, data as TransactionView[], error);
}

/** Everything a ledger row is made of, in one call: what it bought, what it
 *  funded, and what proves it. */
export async function getTransaction(trxNo: string): Promise<Result<TransactionDetail>> {
  const { data, error } = await supabaseBrowser()
    .from("v_transaction_detail").select("*").eq("trx_no", trxNo).maybeSingle();
  if (error) return fail(SERVICE, error);
  if (!data) return notFound(SERVICE, "transaction_not_found", `Transaction ${trxNo} not found.`);
  return ok(SERVICE, data as unknown as TransactionDetail);
}

/** The audit trail read from the record it belongs to, rather than from a
 *  screen nobody opens (D84). Anomaly questions are never "who touched the
 *  ledger this month" — they are "what happened to *this* row", asked while
 *  looking at it. */
export async function historyFor(trxNo: string): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("audit_log").select("*")
    .eq("entity", "transaction").eq("entity_no", trxNo)
    .order("at", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

export async function coverageFor(prLineNo: string): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_allocation").select("*")
    .eq("pr_line_no", prLineNo).is("superseded_by", null)
    .order("allocated_at");
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

/* ------------------------------------------------------------------ */
/* The two seams                                                       */
/* ------------------------------------------------------------------ */

/** **No document, no row** (D85), and a purchase needs to be checkable (D86).
 *  Both refusals are the database's, with its own wording — which names what is
 *  missing rather than saying the form is invalid. */
export async function postTransaction(
  input: {
    account_code: string;
    direction: Direction;
    amount_idr: number;
    type_code: string;
    description: string;
    documents: { attachment_id: string; kind: string }[];
    trx_date?: string | null;
    vendor_code?: string | null;
    project_code?: string | null;
    lines?: { description: string; qty?: number | null; uom?: string | null;
              unit_price?: number | null; amount: number; item_id?: string | null }[];
    remark?: string | null;
    /** The claim on the row itself (A4). A repeat with the same ref is the
     *  same event arriving twice — a re-run import, a retried webhook — and is
     *  a no-op whether or not an idempotency key was passed. */
    source_ref?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<{ trx_no: string; amount: number; status: string }>> {
  const { data, error } = await supabaseBrowser().rpc("post_transaction", {
    p_account_code: input.account_code,
    p_direction: input.direction,
    p_amount: input.amount_idr,
    p_type_code: input.type_code,
    p_description: input.description,
    p_documents: input.documents.map((d) => ({ ...d, kind: toKindCode(d.kind) })),
    p_trx_date: input.trx_date ?? null,
    p_vendor_code: input.vendor_code ?? null,
    p_project_code: input.project_code ?? null,
    p_lines: input.lines ?? [],
    p_remark: input.remark ?? null,
    p_source_ref: input.source_ref ?? null,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** VOID keeps the row and the amount, with a reason beside it (A5, D84). The
 *  correction is a new row; this one stays, saying what was once believed. */
export async function voidTransaction(
  trxNo: string, reason: string, idempotencyKey?: string,
): Promise<Result<{ trx_no: string; status: string }>> {
  const { data, error } = await supabaseBrowser().rpc("void_transaction", {
    p_trx_no: trxNo, p_reason: reason, p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** The second seam: what a payment was *for*. A transaction never funds more
 *  than it moved (A9), and the target may be an order rather than a request
 *  line — the deposit on a PO answers to no PR (D106). */
export async function allocate(
  input: {
    trx_no: string;
    amount: number;
    pr_line_no?: string | null;
    po_no?: string | null;
    method?: AllocMethod;
  },
  idempotencyKey?: string,
): Promise<Result<{ trx_no: string; amount: number; unallocated: number }>> {
  const { data, error } = await supabaseBrowser().rpc("allocate_payment", {
    p_trx_no: input.trx_no,
    p_amount: input.amount,
    p_pr_line_no: input.pr_line_no ?? null,
    p_po_no: input.po_no ?? null,
    p_method: input.method ?? "transfer",
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/** A correction supersedes; it never deletes (A2). Pass no amount to withdraw
 *  the allocation entirely — the row stays, retired, so "who applied this money
 *  where, and who changed their mind" is still readable. */
export async function supersedeAllocation(
  allocationId: string, newAmount?: number | null,
): Promise<Result<unknown>> {
  const { data, error } = await supabaseBrowser().rpc("supersede_allocation", {
    p_allocation_id: allocationId, p_new_amount: newAmount ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/* ------------------------------------------------------------------ */
/* The exception road                                                  */
/* ------------------------------------------------------------------ */

export async function listInbox(): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("evidence_inbox").select("*")
    .eq("status", "PENDING").order("reported_at", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

export async function listInboxAll(): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("evidence_inbox").select("*").order("reported_at", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

/** Not decoration. If this number grows, people are routing around the normal
 *  road — attaching from the record — and the reason is worth finding
 *  (ADR-010). */
export async function getInboxHealth(): Promise<Result<InboxHealth>> {
  const { data, error } = await supabaseBrowser()
    .from("v_inbox_health").select("*").maybeSingle();
  if (error) return fail(SERVICE, error);
  return ok(SERVICE, data as unknown as InboxHealth);
}

/** Five roads out, **none of which delete** (F26, D94). A document that
 *  reached the inbox and left it without a trace is the failure this road
 *  exists to prevent: somebody sent it, and "we never got it" must never be
 *  the answer. */
export async function resolveInbox(
  input: { ref_id: string; status: InboxStatus; trx_no?: string | null; note?: string | null },
  idempotencyKey?: string,
): Promise<Result<{ ref_id: string; status: string }>> {
  const { data, error } = await supabaseBrowser().rpc("resolve_inbox", {
    p_ref_id: input.ref_id,
    p_status: input.status,
    p_trx_no: input.trx_no ?? null,
    p_note: input.note ?? null,
    p_key: idempotencyKey ?? null,
  });
  return fromSeam(SERVICE, data, error);
}

/* ------------------------------------------------------------------ */
/* Vendors and statements                                              */
/* ------------------------------------------------------------------ */

/** One payment, and what it settled. `applies_to` is a list because one
 *  transfer really does close three orders — the bank saw one payment, the
 *  vendor closed three, and both are true (D97). */
export async function paymentsForVendor(vendorId: string): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_vendor_payment").select("*")
    .eq("vendor_id", vendorId).order("trx_date", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

export async function listStatements(): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_bank_statement").select("*").order("period_start", { ascending: false });
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}

/** A ledger row that looks like this statement line. **A suggestion, never
 *  applied by itself** (D180) — the view proposes and a person decides. */
export async function suggestionsFor(statementLineId: string): Promise<Result<unknown[]>> {
  const { data, error } = await supabaseBrowser()
    .from("v_statement_suggestion").select("*")
    .eq("statement_line_id", statementLineId).order("days_apart");
  return fromRows<unknown[]>(SERVICE, data as unknown[], error);
}
