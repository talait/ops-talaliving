/** Implements `/api/v1/accounting` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Account, AccountBalance, Transaction, TransactionView, TransactionTypeCode,
  Direction, PaymentAllocation, EvidenceInboxRow, InboxHealth, AllocMethod,
} from "@/services/accounting/contracts";
import { LOCALE } from "@/lib/format";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import {
  accountBalances, transactionView, allocatedTotal, inboxHealth, lineCoverage,
} from "../derive";
import { latency, actingUser, requireAuthority, conflict, replayed, remember, paged } from "./_kit";

const SERVICE = "accounting" as const;

export async function listAccounts(): Promise<Result<AccountBalance[]>> {
  await latency();
  return ok(SERVICE, accountBalances(getState()));
}

export async function listAccountRows(): Promise<Result<Account[]>> {
  await latency();
  return ok(SERVICE, getState().accounts);
}

export async function listTransactions(
  opts: { account_id?: string; type_code?: string; q?: string; limit?: number; offset?: number } = {},
): Promise<Result<TransactionView[]>> {
  await latency();
  const state = getState();
  let rows = state.transactions;
  if (opts.account_id) rows = rows.filter((t) => t.account_id === opts.account_id);
  if (opts.type_code) rows = rows.filter((t) => t.type_code === opts.type_code);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((t) => t.description.toLowerCase().includes(q) || t.trx_no.includes(q));
  }
  const views = rows
    .map((t) => transactionView(state, t))
    .sort((a, b) => b.trx_date.localeCompare(a.trx_date) || b.trx_no.localeCompare(a.trx_no));
  return paged(SERVICE, views, opts.limit ?? 50, opts.offset ?? 0);
}

export async function getTransaction(trxNo: string): Promise<Result<TransactionView>> {
  await latency();
  const state = getState();
  const trx = state.transactions.find((t) => t.trx_no === trxNo);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `Transaction ${trxNo} not found.`);
  return ok(SERVICE, transactionView(state, trx));
}

/** The one write seam. Everything that creates a ledger row comes through
 *  here, and `source_ref` is the claim that makes a retry a no-op — the reason
 *  double posting is impossible rather than merely unlikely (A4, ADR-006). */
export async function postTransaction(
  input: {
    trx_date: string;
    account_id: string;
    direction: Direction;
    amount_idr: number;
    type_code: TransactionTypeCode;
    vendor_id?: string | null;
    project_id?: string | null;
    description: string;
    source_ref: string;
  },
  idempotencyKey?: string,
): Promise<Result<TransactionView>> {
  await latency();
  const cached = replayed<TransactionView>(SERVICE, "postTransaction", idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) {
    apply((draft) => {
      writeAudit(draft, {
        service: SERVICE, entity: "transaction", entity_no: input.source_ref,
        action: "post", outcome: "refused", reason: "tanpa authority post_ledger",
      });
    });
    return denied;
  }

  if (input.amount_idr <= 0) {
    return invalid(SERVICE, "amount_positive", "Amount must be greater than zero. Direction lives in the IN/OUT column.", { field: "amount_idr" });
  }
  if (!input.description.trim()) {
    return invalid(SERVICE, "description_required", "Description is required.", { field: "description" });
  }

  const existing = getState().transactions.find((t) => t.source_ref === input.source_ref);
  if (existing) {
    return conflict(
      SERVICE, "already_posted",
      `Already posted as ${existing.trx_no} — nothing changed.`,
      { trx_no: existing.trx_no },
    );
  }

  const user = actingUser();
  let trxNo = "";
  apply((draft) => {
    trxNo = nextDocNumber(draft, "trx");
    draft.transactions.unshift({
      id: newId("trx"), trx_no: trxNo, trx_date: input.trx_date,
      account_id: input.account_id, direction: input.direction, amount_idr: input.amount_idr,
      type_code: input.type_code, vendor_id: input.vendor_id ?? null,
      project_id: input.project_id ?? null, description: input.description,
      remark: null, status: "POSTED", source_ref: input.source_ref,
      posted_by: user.id, posted_at: new Date().toISOString(), void_reason: null,
    });
    writeAudit(draft, { service: SERVICE, entity: "transaction", entity_no: trxNo, action: "post", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "accounting.transaction.posted", payload: { trx_no: trxNo, amount: input.amount_idr } });
  });

  const state = getState();
  const view = transactionView(state, state.transactions.find((t) => t.trx_no === trxNo)!);
  remember(SERVICE, "postTransaction", idempotencyKey, view);
  return ok(SERVICE, view);
}

/** Amount to zero, reason kept, row stays. Never a delete (A5). Reversible,
 *  because sometimes the bank really did do the thing. */
export async function voidTransaction(
  trxNo: string, reason: string, idempotencyKey?: string,
): Promise<Result<TransactionView>> {
  await latency();
  const cached = replayed<TransactionView>(SERVICE, `void:${trxNo}`, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) return denied;
  if (!reason.trim()) {
    return invalid(SERVICE, "reason_required", "A reason is required to void.", { field: "reason" });
  }

  const trx = getState().transactions.find((t) => t.trx_no === trxNo);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `Transaction ${trxNo} not found.`);
  if (trx.status === "VOID") {
    return conflict(SERVICE, "already_void", `${trxNo} is already VOID — nothing changed.`);
  }

  apply((draft) => {
    const t = draft.transactions.find((x) => x.id === trx.id)!;
    t.status = "VOID";
    t.amount_idr = 0;
    t.void_reason = `VOID ${new Date().toISOString().slice(0, 10)} — ${reason.trim()}`;
    writeAudit(draft, { service: SERVICE, entity: "transaction", entity_no: trxNo, action: "void", outcome: "ok", reason });
    writeOutbox(draft, { service: SERVICE, event_type: "accounting.transaction.voided", payload: { trx_no: trxNo, reason } });
  });

  const state = getState();
  const view = transactionView(state, state.transactions.find((t) => t.id === trx.id)!);
  remember(SERVICE, `void:${trxNo}`, idempotencyKey, view);
  return ok(SERVICE, view);
}

/** §10.1 item 15 of the recap: never built in the old web app. Built here. */
export async function markComplete(trxNo: string): Promise<Result<TransactionView>> {
  await latency();
  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) return denied;

  const trx = getState().transactions.find((t) => t.trx_no === trxNo);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `Transaction ${trxNo} not found.`);
  if (trx.status === "COMPLETED") {
    return conflict(SERVICE, "already_complete", `${trxNo} is already COMPLETED — nothing changed.`);
  }

  apply((draft) => {
    draft.transactions.find((x) => x.id === trx.id)!.status = "COMPLETED";
    writeAudit(draft, { service: SERVICE, entity: "transaction", entity_no: trxNo, action: "complete", outcome: "ok", reason: null });
  });
  const state = getState();
  return ok(SERVICE, transactionView(state, state.transactions.find((t) => t.id === trx.id)!));
}

/** A transaction never funds more than it moved (A9). The PR line is validated
 *  against procurement before anything is written — the seam doing its job,
 *  rather than a text field written hopefully and checked by a sweep hours
 *  later (ADR-004). */
export async function allocate(
  input: { trx_no: string; pr_line_no: string; amount: number; method?: AllocMethod },
  idempotencyKey?: string,
): Promise<Result<PaymentAllocation>> {
  await latency();
  const endpoint = `allocate:${input.trx_no}:${input.pr_line_no}`;
  const cached = replayed<PaymentAllocation>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) return denied;

  const state = getState();
  const trx = state.transactions.find((t) => t.trx_no === input.trx_no);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `Transaction ${input.trx_no} not found.`);
  if (trx.status === "VOID") {
    return conflict(SERVICE, "transaction_void", `${input.trx_no} is VOID and cannot fund anything.`);
  }

  const line = state.pr_lines.find((l) => l.line_no_full === input.pr_line_no);
  if (!line) {
    return invalid(
      SERVICE, "pr_line_not_found",
      `Line ${input.pr_line_no} does not exist in procurement.`,
      { field: "pr_line_no", pr_line_no: input.pr_line_no },
    );
  }
  if (line.removed_at) {
    return conflict(SERVICE, "line_removed", `Line ${input.pr_line_no} has been removed.`);
  }
  if (input.amount <= 0) {
    return invalid(SERVICE, "amount_positive", "Allocation amount must be greater than zero.", { field: "amount" });
  }

  const already = allocatedTotal(state, trx.id);
  if (already + input.amount > trx.amount_idr) {
    return invalid(
      SERVICE, "over_allocated",
      `This transaction only moved Rp ${trx.amount_idr.toLocaleString(LOCALE)}; Rp ${already.toLocaleString(LOCALE)} is already allocated. A transaction never funds more than it moved.`,
      { field: "amount", moved: trx.amount_idr, already, attempted: input.amount },
    );
  }

  const user = actingUser();
  const alloc: PaymentAllocation = {
    id: newId("alc"), trx_id: trx.id, pr_line_no: input.pr_line_no, po_no: null,
    amount: input.amount, method: input.method ?? "transfer", superseded_by: null,
    allocated_by: user.id, allocated_at: new Date().toISOString(),
  };
  apply((draft) => {
    draft.payment_allocations.push(alloc);
    writeAudit(draft, { service: SERVICE, entity: "allocation", entity_no: input.pr_line_no, action: "allocate", outcome: "ok", reason: null });
    writeOutbox(draft, {
      service: SERVICE, event_type: "accounting.allocation.recorded",
      payload: { trx_no: input.trx_no, pr_line_no: input.pr_line_no, amount: input.amount },
    });
  });
  remember(SERVICE, endpoint, idempotencyKey, alloc);
  return ok(SERVICE, alloc);
}

/* ------------------------------------------------------------------ */
/* The exception inbox                                                 */
/* ------------------------------------------------------------------ */

export async function listInbox(): Promise<Result<EvidenceInboxRow[]>> {
  await latency();
  return ok(SERVICE, getState().evidence_inbox.filter((r) => r.status === "PENDING"));
}

export async function getInboxHealth(): Promise<Result<InboxHealth>> {
  await latency();
  return ok(SERVICE, inboxHealth(getState()));
}

/** Five resolutions, and none of them discards anything (A16). `Others`
 *  branches to notes before the ledger is touched at all. */
export async function resolveInbox(
  input: {
    ref_id: string;
    resolution: "transaction" | "retro_pr_line" | "link" | "note" | "reject";
    trx_no?: string;
  },
  idempotencyKey?: string,
): Promise<Result<EvidenceInboxRow>> {
  await latency();
  const endpoint = `resolveInbox:${input.ref_id}`;
  const cached = replayed<EvidenceInboxRow>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "resolve_inbox");
  if (denied) return denied;

  const row = getState().evidence_inbox.find((r) => r.ref_id === input.ref_id);
  if (!row) return notFound(SERVICE, "inbox_row_not_found", `Row ${input.ref_id} not found.`);
  if (row.status !== "PENDING") {
    return conflict(SERVICE, "already_resolved", `This row is already ${row.status} — nothing changed.`);
  }

  const nextStatus = {
    transaction: "CONFIRMED", retro_pr_line: "CONFIRMED", link: "ATTACHED",
    note: "NOTED", reject: "REJECTED",
  }[input.resolution] as EvidenceInboxRow["status"];

  apply((draft) => {
    const r = draft.evidence_inbox.find((x) => x.ref_id === input.ref_id)!;
    r.status = nextStatus;
    writeAudit(draft, {
      service: SERVICE, entity: "evidence_inbox", entity_no: input.ref_id,
      action: `resolve.${input.resolution}`, outcome: "ok", reason: null,
    });
  });

  const updated = getState().evidence_inbox.find((r) => r.ref_id === input.ref_id)!;
  remember(SERVICE, endpoint, idempotencyKey, updated);
  return ok(SERVICE, updated);
}

/** Used by the PR line drawer: how much of this line has money against it. */
export async function coverageFor(lineNoFull: string): Promise<Result<ReturnType<typeof lineCoverage>>> {
  await latency();
  const state = getState();
  const line = state.pr_lines.find((l) => l.line_no_full === lineNoFull);
  if (!line) return notFound(SERVICE, "line_not_found", `Line ${lineNoFull} not found.`);
  return ok(SERVICE, lineCoverage(state, line));
}

export type { Transaction };
