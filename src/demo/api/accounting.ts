/** Implements `/api/v1/accounting` from `03-api.md`. */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Account, AccountBalance, Transaction, TransactionView, TransactionTypeCode,
  IncomingMoney, TransactionDetail, AllocationView, TransactionLine, TransactionType,
  VendorPayment, FundingView, FundingDetail,
  CashPlan, CashDue, CashComponent, CashOverride, CashSettlement,
  Direction, PaymentAllocation, EvidenceInboxRow, InboxHealth, AllocMethod,
} from "@/services/accounting/contracts";
import { LOCALE } from "@/lib/format";
import { getState, apply, newId, nextDocNumber, writeAudit, writeOutbox } from "../store";
import type { AuditRow } from "../state";
import {
  accountBalances, transactionView, allocatedTotal, inboxHealth, lineCoverage,
  lineStatus, fundings, fundingView, cashPlan, cashDue,
} from "../derive";
import { latency, actingUser, requireAuthority, requireModule, conflict, replayed, remember, paged } from "./_kit";
import { PRIMARY_DOC_KINDS, type DocKind } from "@/services/documents/contracts";
import * as procurement from "./procurement";

const SERVICE = "accounting" as const;

export async function listAccounts(): Promise<Result<AccountBalance[]>> {
  await latency();
  return ok(SERVICE, accountBalances(getState()));
}

export async function listAccountRows(): Promise<Result<Account[]>> {
  await latency();
  return ok(SERVICE, getState().accounts);
}

/** The thirteen types, with the flag that decides whether a row is expected
 *  to name what it bought and who from (D83, D86). */
export async function listTypeRows(): Promise<Result<TransactionType[]>> {
  await latency();
  return ok(SERVICE, getState().transaction_types);
}

export async function listTransactions(
  opts: {
    account_id?: string; type_code?: string; q?: string;
    include_void?: boolean; limit?: number; offset?: number;
  } = {},
): Promise<Result<TransactionView[]>> {
  await latency();
  const state = getState();
  let rows = state.transactions;
  /* Filtered here rather than in the browser, so "page 2 of 3" counts the
     rows the reader will actually see. */
  if (!opts.include_void) rows = rows.filter((t) => t.status !== "VOID");
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

/** The whole row: what it bought, what it funded, and the line each
 *  allocation points at. One call, because a drawer that needs three is a
 *  drawer that renders in three stages. */
export async function getTransaction(trxNo: string): Promise<Result<TransactionDetail>> {
  await latency();
  const state = getState();
  const trx = state.transactions.find((t) => t.trx_no === trxNo);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `Transaction ${trxNo} not found.`);

  const allocations: AllocationView[] = state.payment_allocations
    .filter((a) => a.trx_id === trx.id)
    .map((a) => {
      const line = state.pr_lines.find((l) => l.line_no_full === a.pr_line_no);
      return {
        ...a,
        line_description: line?.description ?? null,
        line_status: line ? lineStatus(state, line) : null,
      };
    });

  return ok(SERVICE, {
    ...transactionView(state, trx),
    lines: state.transaction_lines.filter((l) => l.trx_id === trx.id),
    allocations,
  });
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
    /** What was bought, in quantity and price. Required for a purchase: an
     *  amount with no detail behind it cannot be checked against anything
     *  later (D86). */
    lines?: { description: string; qty?: number | null; uom?: string | null; unit_price?: number | null; amount: number }[];
    /** At least one of these has to be a nota, a transfer proof or a photo of
     *  what arrived (D85). The files are uploaded first and linked here, in
     *  the same act as the row — so a row without evidence never exists, not
     *  even for a second. */
    documents: { attachment_id: string; kind: DocKind }[];
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
        detail: { attempted_amount: input.amount_idr, account_id: input.account_id },
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

  /* No document, no row (D85). The old system let a number be typed and the
   * paperwork follow "later", and later is where the unexplained rows live. */
  const primary = input.documents.filter((d) => PRIMARY_DOC_KINDS.includes(d.kind));
  if (primary.length === 0) {
    return invalid(
      SERVICE, "evidence_required",
      "A ledger row needs at least one nota, transfer proof or photo of what arrived. Supporting documents — a delivery note, the PO — are welcome, but they cannot stand alone.",
      { field: "documents", accepted: PRIMARY_DOC_KINDS },
    );
  }

  const state = getState();
  const type = state.transaction_types.find((t) => t.code === input.type_code);
  const lines = input.lines ?? [];

  if (type?.is_purchase) {
    if (lines.length === 0) {
      return invalid(
        SERVICE, "detail_required",
        `${input.type_code} is a purchase: it needs what was bought, how many and at what price. An amount on its own cannot be checked against a delivery, a quote or next month.`,
        { field: "lines" },
      );
    }
    const missing = lines.find((l) => l.qty == null || l.unit_price == null);
    if (missing) {
      return invalid(
        SERVICE, "line_detail_required",
        `"${missing.description}" has no quantity or no unit price. Both are what make a price comparable to the next one.`,
        { field: "lines" },
      );
    }
    if (!input.vendor_id) {
      return invalid(
        SERVICE, "vendor_required",
        "A purchase has somebody it was bought from. Without it the question \"where do we buy this\" has no answer.",
        { field: "vendor_id" },
      );
    }
  }

  if (lines.length > 0) {
    const sum = lines.reduce((acc, l) => acc + l.amount, 0);
    if (sum !== input.amount_idr) {
      return invalid(
        SERVICE, "lines_do_not_add_up",
        `The detail adds up to ${sum.toLocaleString(LOCALE)} but the transaction is ${input.amount_idr.toLocaleString(LOCALE)}. One of the two is wrong, and the ledger will not guess which.`,
        { field: "lines", lines_total: sum, amount: input.amount_idr },
      );
    }
  }

  const existing = state.transactions.find((t) => t.source_ref === input.source_ref);
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
    const trxId = newId("trx");
    draft.transactions.unshift({
      id: trxId, trx_no: trxNo, trx_date: input.trx_date,
      account_id: input.account_id, direction: input.direction, amount_idr: input.amount_idr,
      type_code: input.type_code, vendor_id: input.vendor_id ?? null,
      project_id: input.project_id ?? null, description: input.description,
      remark: null, status: "POSTED", source_ref: input.source_ref,
      posted_by: user.id, posted_at: new Date().toISOString(), void_reason: null,
    });
    lines.forEach((l, i) => {
      draft.transaction_lines.push({
        id: newId("trl"), trx_id: trxId, line_no: i + 1, item_id: null,
        description: l.description, qty: l.qty ?? null, uom: (l.uom ?? null) as never,
        unit_price: l.unit_price ?? null, amount: l.amount,
      });
    });
    for (const d of input.documents) {
      draft.attachment_links.push({
        id: newId("lnk"), attachment_id: d.attachment_id,
        entity: "transaction", entity_no: trxNo, kind: d.kind,
        linked_by: user.id, linked_at: new Date().toISOString(),
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "transaction", entity_no: trxNo,
      action: "post", outcome: "ok", reason: null,
      /* Everything a later question would ask: how much, out of which
         account, to whom, with what behind it (D84). */
      detail: {
        amount: input.amount_idr, direction: input.direction,
        account: draft.accounts.find((a) => a.id === input.account_id)?.code ?? null,
        type: input.type_code,
        vendor: draft.vendors.find((v) => v.id === input.vendor_id)?.name ?? null,
        lines: lines.length,
        documents: input.documents.map((d) => d.kind),
        source_ref: input.source_ref,
      },
    });
    writeOutbox(draft, { service: SERVICE, event_type: "accounting.transaction.posted", payload: { trx_no: trxNo, amount: input.amount_idr } });
  });

  const after = getState();
  const view = transactionView(after, after.transactions.find((t) => t.trx_no === trxNo)!);
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
    writeAudit(draft, {
      service: SERVICE, entity: "transaction", entity_no: trxNo, action: "void",
      outcome: "ok", reason,
      /* The amount that disappeared is the whole point of the entry: a void
         is the one action that makes money vanish from a total (D84). */
      detail: {
        amount_before: trx.amount_idr, amount_after: 0,
        status_before: trx.status, status_after: "VOID",
        account: draft.accounts.find((a) => a.id === trx.account_id)?.code ?? null,
      },
    });
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
    writeAudit(draft, {
      service: SERVICE, entity: "transaction", entity_no: trxNo, action: "complete",
      outcome: "ok", reason: null,
      detail: { status_before: trx.status, status_after: "COMPLETED" },
    });
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

/** Everything that has happened to one ledger row, newest first.
 *
 *  The audit trail read from the record it belongs to, rather than from a
 *  screen nobody opens (D84). Anomaly and fraud questions are never "who
 *  touched the ledger this month" — they are "what happened to *this* row",
 *  asked while looking at it.
 */
export async function historyFor(trxNo: string): Promise<Result<AuditRow[]>> {
  await latency();
  return ok(SERVICE, getState().audit_log.filter(
    (a) => a.entity === "transaction" && a.entity_no === trxNo,
  ));
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

/** Five resolutions, and none of them discards anything (A16).
 *
 *  The inbox holds documents whose parent is genuinely unknown — somebody
 *  bought first and the paperwork arrived in a chat thread. Every road out of
 *  it is recorded, including the two that never touch the ledger:
 *
 *    transaction    it becomes a ledger row (the document is its evidence)
 *    retro_pr_line  a request line written after the fact, then paid
 *    link           the money is already booked; this is its missing proof
 *    note           not a company transaction — kept, never posted
 *    reject         not ours, or unreadable. Kept with a reason, never posted
 *
 *  **A rejected row is the opposite of a ledger row** (D94). Rejecting is how
 *  you say "no money of ours moved here", and the file stays so the decision
 *  can be read later — which is the whole reason nothing is deleted.
 */
export async function resolveInbox(
  input: {
    ref_id: string;
    resolution: "transaction" | "retro_pr_line" | "link" | "note" | "reject";
    /** What it produced, when it produced something. */
    trx_no?: string;
    pr_line_no?: string;
    /** Mandatory for `reject` and `note`: a row nobody explained is a row
     *  nobody can review. */
    reason?: string;
  },
  idempotencyKey?: string,
): Promise<Result<EvidenceInboxRow>> {
  await latency();
  const endpoint = `resolveInbox:${input.ref_id}`;
  const cached = replayed<EvidenceInboxRow>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "resolve_inbox");
  if (denied) return denied;

  const state = getState();
  const row = state.evidence_inbox.find((r) => r.ref_id === input.ref_id);
  if (!row) return notFound(SERVICE, "inbox_row_not_found", `Row ${input.ref_id} not found.`);
  if (row.status !== "PENDING") {
    return conflict(SERVICE, "already_resolved", `This row is already ${row.status} — nothing changed.`);
  }
  if ((input.resolution === "reject" || input.resolution === "note") && !input.reason?.trim()) {
    return invalid(
      SERVICE, "reason_required",
      input.resolution === "reject"
        ? "Say why this is not ours. A rejection nobody explained cannot be reviewed later."
        : "Say what this is. A note with no words is a file in a drawer.",
      { field: "reason" },
    );
  }
  if ((input.resolution === "transaction" || input.resolution === "link") && !input.trx_no) {
    return invalid(SERVICE, "trx_required", "Which ledger row does this belong to?", { field: "trx_no" });
  }

  const nextStatus = {
    transaction: "CONFIRMED", retro_pr_line: "CONFIRMED", link: "ATTACHED",
    note: "NOTED", reject: "REJECTED",
  }[input.resolution] as EvidenceInboxRow["status"];

  apply((draft) => {
    const r = draft.evidence_inbox.find((x) => x.ref_id === input.ref_id)!;
    r.status = nextStatus;
    if (input.trx_no) {
      r.produced_trx_id = draft.transactions.find((t) => t.trx_no === input.trx_no)?.id ?? null;
    }
    if (input.pr_line_no) r.produced_pr_line_no = input.pr_line_no;
    if (input.reason?.trim()) {
      r.extracted = { ...r.extracted, note: input.reason.trim() };
    }
    writeAudit(draft, {
      service: SERVICE, entity: "evidence_inbox", entity_no: input.ref_id,
      action: `resolve.${input.resolution}`, outcome: "ok", reason: input.reason?.trim() ?? null,
      detail: {
        status_before: row.status, status_after: nextStatus,
        trx_no: input.trx_no ?? null, pr_line_no: input.pr_line_no ?? null,
        amount_read: row.extracted.amount_idr ?? null,
      },
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "accounting.inbox.resolved",
      payload: { ref_id: input.ref_id, resolution: input.resolution, trx_no: input.trx_no ?? null },
    });
  });

  const updated = getState().evidence_inbox.find((r) => r.ref_id === input.ref_id)!;
  remember(SERVICE, endpoint, idempotencyKey, updated);
  return ok(SERVICE, updated);
}

/** Everything the inbox has ever held, resolved or not — because "what did we
 *  decide about that photo" is asked long after the row leaves the queue. */
export async function listInboxAll(): Promise<Result<EvidenceInboxRow[]>> {
  await latency();
  return ok(SERVICE, [...getState().evidence_inbox].sort(
    (a, b) => b.reported_at.localeCompare(a.reported_at),
  ));
}

/** Every payment made to one vendor, newest first, with what each one closed.
 *
 *  Read from the ledger rather than from procurement's side, because a payment
 *  is a ledger fact — and because the proof lives on the transaction (D85).
 *  The purchase journey screen puts this beside the orders; neither service
 *  reaches into the other (ADR-004).
 */
export async function paymentsForVendor(vendorId: string): Promise<Result<VendorPayment[]>> {
  await latency();
  const state = getState();
  const rows = state.transactions
    .filter((t) => t.vendor_id === vendorId && t.direction === "OUT")
    .map((t) => {
      const link = state.attachment_links.find(
        (l) => l.entity === "transaction" && l.entity_no === t.trx_no && l.kind === "Payment Proof",
      );
      const att = link ? state.attachments.find((a) => a.id === link.attachment_id) : undefined;
      return {
        trx_no: t.trx_no,
        trx_date: t.trx_date,
        amount: t.amount_idr,
        description: t.description,
        status: t.status,
        applies_to: state.payment_allocations
          .filter((a) => a.trx_id === t.id && a.superseded_by === null && a.po_no)
          .map((a) => ({ po_no: a.po_no as string, amount: a.amount })),
        proof_attachment_id: att?.id ?? null,
        proof_filename: att?.filename ?? null,
      };
    })
    .sort((a, b) => a.trx_date.localeCompare(b.trx_date) || a.trx_no.localeCompare(b.trx_no));
  return ok(SERVICE, rows);
}

/* ------------------------------------------------------------------ */
/* Money coming IN — the second road (D81)                             */
/* ------------------------------------------------------------------ */

/** Money already booked into a paying account, with whatever proof is on it.
 *
 *  The round screen reads this rather than asking somebody to retype an
 *  amount that is already in the ledger. Filtered to IN rows on the account
 *  that pays suppliers, newest first.
 */
export async function listIncoming(
  opts: { account_code?: string } = {},
): Promise<Result<IncomingMoney[]>> {
  await latency();
  const state = getState();
  const code = opts.account_code ?? "BCA 271";
  const rows = state.transactions
    .filter((t) => t.direction === "IN" && t.status !== "VOID")
    .filter((t) => state.accounts.find((a) => a.id === t.account_id)?.code === code)
    .map((t) => {
      const link = state.attachment_links.find(
        (l) => l.entity === "transaction" && l.entity_no === t.trx_no && l.kind === "Payment Proof",
      );
      const att = link ? state.attachments.find((a) => a.id === link.attachment_id) : undefined;
      return {
        trx_no: t.trx_no,
        trx_date: t.trx_date,
        account_code: code,
        amount_idr: t.amount_idr,
        description: t.description,
        proof_attachment_id: att?.id ?? null,
        proof_filename: att?.filename ?? null,
      };
    })
    .sort((a, b) => b.trx_date.localeCompare(a.trx_date) || b.trx_no.localeCompare(a.trx_no));
  return ok(SERVICE, rows);
}

/** Rows waiting in the inbox that are money coming IN.
 *
 *  Almost everything in that inbox is somebody who bought first. A transfer
 *  proof dropped in chat by leadership is the other direction, and it is
 *  waiting for a different act by a different person — booking it, not
 *  matching it to a purchase. */
export async function listIncomingReview(): Promise<Result<EvidenceInboxRow[]>> {
  await latency();
  return ok(SERVICE, getState().evidence_inbox.filter(
    (r) => r.status === "PENDING" && r.money_direction === "IN",
  ));
}

/** Book a chat-uploaded transfer proof as money in.
 *
 *  One act: the IN transaction, the document linked to it, and the inbox row
 *  closed with a pointer to what it produced. The amount is confirmed by a
 *  person rather than taken from the extraction — the reading is a proposal,
 *  never a posting (A13).
 */
export async function confirmIncoming(
  input: { ref_id: string; account_id: string; trx_date: string; amount_idr: number; description?: string },
  idempotencyKey?: string,
): Promise<Result<IncomingMoney>> {
  await latency();
  const endpoint = `confirmIncoming:${input.ref_id}`;
  const cached = replayed<IncomingMoney>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) return denied;

  const state = getState();
  const row = state.evidence_inbox.find((r) => r.ref_id === input.ref_id);
  if (!row) return notFound(SERVICE, "inbox_row_not_found", `Row ${input.ref_id} not found.`);
  if (row.status !== "PENDING") {
    return conflict(SERVICE, "already_resolved", `This row is already ${row.status} — nothing changed.`);
  }
  if (input.amount_idr <= 0) {
    return invalid(SERVICE, "amount_positive", "Amount must be greater than zero.", { field: "amount_idr" });
  }

  const sourceRef = `inbox-in:${input.ref_id}`;
  const existing = state.transactions.find((t) => t.source_ref === sourceRef);
  if (existing) {
    return conflict(SERVICE, "already_posted", `Already booked as ${existing.trx_no} — nothing changed.`, { trx_no: existing.trx_no });
  }

  const user = actingUser();
  let trxNo = "";
  apply((draft) => {
    trxNo = nextDocNumber(draft, "trx");
    const trxId = newId("trx");
    draft.transactions.unshift({
      id: trxId, trx_no: trxNo, trx_date: input.trx_date,
      account_id: input.account_id, direction: "IN", amount_idr: input.amount_idr,
      type_code: "CASHFLOW", vendor_id: null, project_id: null,
      description: input.description?.trim() || row.extracted.note || "Money in, confirmed from chat",
      remark: null, status: "POSTED", source_ref: sourceRef,
      posted_by: user.id, posted_at: new Date().toISOString(), void_reason: null,
    });
    /* The proof follows the money onto the ledger row, so the transaction can
       be read on its own without going back to the inbox. */
    draft.attachment_links.push({
      id: newId("lnk"), attachment_id: row.attachment_id,
      entity: "transaction", entity_no: trxNo, kind: "Payment Proof",
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    const r = draft.evidence_inbox.find((x) => x.ref_id === input.ref_id)!;
    r.status = "CONFIRMED";
    r.produced_trx_id = trxId;
    writeAudit(draft, {
      service: SERVICE, entity: "evidence_inbox", entity_no: input.ref_id,
      action: "confirm_incoming", outcome: "ok", reason: trxNo,
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "accounting.transaction.posted",
      payload: { trx_no: trxNo, amount: input.amount_idr, direction: "IN" },
    });
  });

  const state2 = getState();
  const att = state2.attachments.find((a) => a.id === row.attachment_id);
  const view: IncomingMoney = {
    trx_no: trxNo,
    trx_date: input.trx_date,
    account_code: state2.accounts.find((a) => a.id === input.account_id)?.code ?? "",
    amount_idr: input.amount_idr,
    description: state2.transactions.find((t) => t.trx_no === trxNo)!.description,
    proof_attachment_id: row.attachment_id,
    proof_filename: att?.filename ?? null,
  };
  remember(SERVICE, endpoint, idempotencyKey, view);
  return ok(SERVICE, view);
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

/** Post a ledger row FROM a paid purchase-request line.
 *
 *  The owner's rule: a request that has been paid, whose document is uploaded
 *  here, is the same event as the ledger entry — supporting document and PR
 *  number included. So this does the whole thing in one act: it posts the
 *  transaction, allocates it to the line, and carries the document across.
 *  Doing it in three separate steps is how two of them get skipped.
 *
 *  The PR number goes in the description and in the allocation, so the ledger
 *  row can say what it was for without anyone opening procurement.
 */
export async function postFromLine(
  input: {
    line_no: string;
    amount: number;
    account_id: string;
    trx_date: string;
    type_code: TransactionTypeCode;
    /** Required (D85). Paying from a line without the transfer proof is the
     *  same empty row as any other undocumented posting. */
    attachment_id: string;
    document_kind?: DocKind;
  },
  idempotencyKey?: string,
): Promise<Result<TransactionView>> {
  await latency();
  const endpoint = `postFromLine:${input.line_no}`;
  const cached = replayed<TransactionView>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const denied = requireAuthority(SERVICE, "post_ledger");
  if (denied) return denied;

  /* Validated at the seam rather than by reaching into procurement's tables
   * (ADR-004). In Phase 2 this line is a fetch. */
  const lineRes = await procurement.lineForPosting(input.line_no);
  if (lineRes.error) return lineRes.error.code === "line_not_found"
    ? invalid(SERVICE, "pr_line_not_found", `Line ${input.line_no} does not exist in procurement.`, { field: "line_no" })
    : lineRes as unknown as Result<TransactionView>;
  const line = lineRes.data;
  if (line.removed) {
    return conflict(SERVICE, "line_removed", `Line ${input.line_no} has been removed.`);
  }
  if (input.amount <= 0) {
    return invalid(SERVICE, "amount_positive", "Amount must be greater than zero.", { field: "amount" });
  }
  if (!input.attachment_id) {
    return invalid(
      SERVICE, "evidence_required",
      "A payment needs its proof. Attach the transfer receipt or the nota before recording it.",
      { field: "attachment_id" },
    );
  }

  const sourceRef = `pr-line:${input.line_no}:${input.trx_date}:${input.amount}`;
  const existing = getState().transactions.find((t) => t.source_ref === sourceRef);
  if (existing) {
    return conflict(SERVICE, "already_posted", `Already posted as ${existing.trx_no} — nothing changed.`, { trx_no: existing.trx_no });
  }

  const user = actingUser();
  let trxNo = "";
  apply((draft) => {
    trxNo = nextDocNumber(draft, "trx");
    const trxId = newId("trx");
    draft.transactions.unshift({
      id: trxId, trx_no: trxNo, trx_date: input.trx_date,
      account_id: input.account_id, direction: "OUT", amount_idr: input.amount,
      type_code: input.type_code, vendor_id: line.vendor_id,
      project_id: line.project_id,
      /* The PR number lives in the description too, so the ledger reads
       * correctly on its own. */
      description: `${line.description} — ${input.line_no}`,
      remark: null, status: "POSTED", source_ref: sourceRef,
      posted_by: user.id, posted_at: new Date().toISOString(), void_reason: null,
    });
    draft.payment_allocations.push({
      id: newId("alc"), trx_id: trxId, pr_line_no: input.line_no, po_no: null,
      amount: input.amount, method: "transfer", superseded_by: null,
      allocated_by: user.id, allocated_at: new Date().toISOString(),
    });
    /* The detail comes from the line itself: what was bought, how many, at
       what price — so the ledger row can be read without opening the PR. */
    draft.transaction_lines.push({
      id: newId("trl"), trx_id: trxId, line_no: 1, item_id: null,
      description: line.description, qty: line.qty, uom: line.uom as never,
      unit_price: line.unit_price, amount: input.amount,
    });
    draft.attachment_links.push({
      id: newId("lnk"), attachment_id: input.attachment_id,
      entity: "transaction", entity_no: trxNo, kind: input.document_kind ?? "Payment Proof",
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    writeAudit(draft, {
      service: SERVICE, entity: "transaction", entity_no: trxNo,
      action: "post_from_line", outcome: "ok", reason: input.line_no,
      detail: {
        amount: input.amount, pr_line: input.line_no,
        account: draft.accounts.find((a) => a.id === input.account_id)?.code ?? null,
        type: input.type_code, document: input.document_kind ?? "Payment Proof",
      },
    });
    writeOutbox(draft, {
      service: SERVICE, event_type: "accounting.transaction.posted",
      payload: { trx_no: trxNo, pr_line_no: input.line_no, amount: input.amount },
    });
  });

  const state = getState();
  const view = transactionView(state, state.transactions.find((t) => t.trx_no === trxNo)!);
  remember(SERVICE, endpoint, idempotencyKey, view);
  return ok(SERVICE, view);
}

/* ------------------------------------------------------------------ */
/* Liquidation                                                         */
/* ------------------------------------------------------------------ */

/** Every transfer of operating money into an account that pays people,
 *  newest first — the list the liquidation report opens from (D106). */
export async function listFundings(): Promise<Result<FundingView[]>> {
  await latency();
  return ok(SERVICE, fundings(getState()));
}

/** One transfer and where it went. */
export async function getFunding(trxNo: string): Promise<Result<FundingDetail>> {
  await latency();
  const state = getState();
  const trx = state.transactions.find((t) => t.trx_no === trxNo && t.direction === "IN");
  if (!trx) return notFound(SERVICE, "funding_not_found", `No incoming transfer ${trxNo}.`);
  return ok(SERVICE, fundingView(state, trx));
}

/* ------------------------------------------------------------------ */
/* Payment calendar                                                    */
/* ------------------------------------------------------------------ */

/** Twelve months forward: what is planned, what actually happened, and
 *  whether the money lasts (D109). */
export async function getCashPlan(): Promise<Result<CashPlan>> {
  await latency();
  return ok(SERVICE, cashPlan(getState()));
}

/** What falls due next, and what is already late. */
export async function listDue(): Promise<Result<CashDue[]>> {
  await latency();
  return ok(SERVICE, cashDue(getState()));
}

export async function listComponents(): Promise<Result<CashComponent[]>> {
  await latency();
  return ok(SERVICE, getState().cash_components);
}

/** Add something that repeats.
 *
 *  Refuses a category another component already claims (D110): with two
 *  components on `RECCURING - PAYROLL`, no ledger row could say which of them
 *  it belongs to, and the plan would show the same money twice.
 */
export async function addComponent(
  input: {
    name: string;
    direction: Direction;
    amount: number;
    due_day: number;
    type_code?: TransactionTypeCode | null;
    vendor_id?: string | null;
    account_id?: string | null;
    starts_on?: string;
    ends_on?: string | null;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<CashComponent>> {
  await latency();
  const cached = replayed<CashComponent>(SERVICE, "addComponent", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "accounting");
  if (denied) return denied;

  if (!input.name.trim()) {
    return invalid(SERVICE, "name_required", "A line on the calendar needs a name somebody will recognise.", { field: "name" });
  }
  if (!input.amount || input.amount <= 0) {
    return invalid(SERVICE, "amount_required", "An estimate of zero plans nothing. Put the number you expect, even roughly.", { field: "amount" });
  }
  if (input.due_day < 1 || input.due_day > 31) {
    return invalid(SERVICE, "due_day_out_of_range", "The day of the month it is due, between 1 and 31.", { field: "due_day" });
  }

  const state = getState();
  const clash = state.cash_components.find(
    (c) => c.active
      && c.type_code === (input.type_code ?? null)
      && (c.vendor_id ?? null) === (input.vendor_id ?? null)
      && c.type_code !== null,
  );
  if (clash) {
    return conflict(
      SERVICE, "category_already_tracked",
      `"${clash.name}" already tracks ${clash.type_code}${clash.vendor_id ? " for that vendor" : ""}. Two lines on one category means no ledger row can say which one it paid — change this one's category, or edit that line instead.`,
      { component_id: clash.id },
    );
  }

  const user = actingUser();
  const now = new Date();
  let created: CashComponent | null = null;
  apply((draft) => {
    created = {
      id: newId("cmp"),
      name: input.name.trim(),
      direction: input.direction,
      amount: Math.round(input.amount),
      due_day: input.due_day,
      type_code: input.type_code ?? null,
      vendor_id: input.vendor_id ?? null,
      account_id: input.account_id ?? null,
      starts_on: input.starts_on ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      ends_on: input.ends_on ?? null,
      note: input.note?.trim() || null,
      active: true,
      created_by: user.id,
      created_at: now.toISOString(),
    };
    draft.cash_components.push(created);
    writeAudit(draft, {
      service: SERVICE, entity: "cash_component", entity_no: created.id,
      action: "create", outcome: "ok", reason: null,
      detail: { name: created.name, amount: created.amount, due_day: created.due_day, direction: created.direction },
    });
  });
  remember(SERVICE, "addComponent", idempotencyKey, created);
  return ok(SERVICE, created as unknown as CashComponent);
}

/** Change the estimate, the day, or the name. The audit row carries what it
 *  was and what it became — a budget nobody can see the history of is a budget
 *  people quietly bend (D84). */
export async function updateComponent(
  id: string,
  patch: { name?: string; amount?: number; due_day?: number; ends_on?: string | null; note?: string | null; active?: boolean },
): Promise<Result<CashComponent>> {
  await latency();
  const denied = requireModule(SERVICE, "accounting");
  if (denied) return denied;

  const state = getState();
  const found = state.cash_components.find((c) => c.id === id);
  if (!found) return notFound(SERVICE, "component_not_found", `No calendar line ${id}.`);
  if (patch.amount !== undefined && patch.amount <= 0) {
    return invalid(SERVICE, "amount_required", "An estimate of zero plans nothing.", { field: "amount" });
  }
  if (patch.due_day !== undefined && (patch.due_day < 1 || patch.due_day > 31)) {
    return invalid(SERVICE, "due_day_out_of_range", "The day of the month it is due, between 1 and 31.", { field: "due_day" });
  }

  let updated: CashComponent | null = null;
  apply((draft) => {
    const row = draft.cash_components.find((c) => c.id === id);
    if (!row) return;
    const before = { name: row.name, amount: row.amount, due_day: row.due_day, active: row.active };
    Object.assign(row, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.amount !== undefined ? { amount: Math.round(patch.amount) } : {}),
      ...(patch.due_day !== undefined ? { due_day: patch.due_day } : {}),
      ...(patch.ends_on !== undefined ? { ends_on: patch.ends_on } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    });
    updated = row;
    writeAudit(draft, {
      service: SERVICE, entity: "cash_component", entity_no: id,
      action: patch.active === false ? "deactivate" : "update", outcome: "ok", reason: null,
      detail: { before, after: { name: row.name, amount: row.amount, due_day: row.due_day, active: row.active } },
    });
  });
  return ok(SERVICE, updated as unknown as CashComponent);
}

/** One month that is not like the others — a bigger payroll in December, a
 *  month the bill does not arrive at all. `amount: null` means skipped. */
export async function setOverride(
  input: { component_id: string; month: string; amount: number | null; due_day?: number | null; reason?: string | null },
): Promise<Result<CashOverride>> {
  await latency();
  const denied = requireModule(SERVICE, "accounting");
  if (denied) return denied;

  const state = getState();
  if (!state.cash_components.some((c) => c.id === input.component_id)) {
    return notFound(SERVICE, "component_not_found", `No calendar line ${input.component_id}.`);
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    return invalid(SERVICE, "month_invalid", "A month reads as YYYY-MM.", { field: "month" });
  }
  if (!input.reason?.trim()) {
    return invalid(
      SERVICE, "reason_required",
      "A month that differs from every other month has a reason. Write it — in three months nobody will remember, including you.",
      { field: "reason" },
    );
  }

  const user = actingUser();
  let saved: CashOverride | null = null;
  apply((draft) => {
    const existing = draft.cash_overrides.find(
      (o) => o.component_id === input.component_id && o.month === input.month,
    );
    const row: CashOverride = existing ?? {
      id: newId("cov"),
      component_id: input.component_id,
      month: input.month,
      amount: null,
      due_day: null,
      reason: null,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    };
    const before = existing ? { amount: existing.amount, due_day: existing.due_day } : null;
    row.amount = input.amount === null ? null : Math.round(input.amount);
    row.due_day = input.due_day ?? null;
    row.reason = input.reason?.trim() ?? null;
    row.recorded_by = user.id;
    row.recorded_at = new Date().toISOString();
    if (!existing) draft.cash_overrides.push(row);
    saved = row;
    writeAudit(draft, {
      service: SERVICE, entity: "cash_override", entity_no: `${input.component_id}:${input.month}`,
      action: existing ? "update" : "create", outcome: "ok", reason: row.reason,
      detail: { before, after: { amount: row.amount, due_day: row.due_day } },
    });
  });
  return ok(SERVICE, saved as unknown as CashOverride);
}

/** Somebody pointing at a ledger row and saying: that one was this bill.
 *  Matching by category is a guess; this is a decision, and it wins. */
export async function linkPayment(
  input: { component_id: string; month: string; trx_no: string },
): Promise<Result<CashSettlement>> {
  await latency();
  const denied = requireModule(SERVICE, "accounting");
  if (denied) return denied;

  const state = getState();
  if (!state.cash_components.some((c) => c.id === input.component_id)) {
    return notFound(SERVICE, "component_not_found", `No calendar line ${input.component_id}.`);
  }
  const trx = state.transactions.find((t) => t.trx_no === input.trx_no);
  if (!trx) return notFound(SERVICE, "transaction_not_found", `No ledger row ${input.trx_no}.`);
  if (trx.status === "VOID") {
    return invalid(SERVICE, "transaction_void", "That row was voided. A voided payment settles nothing.", { field: "trx_no" });
  }
  const taken = state.cash_settlements.find((s) => s.trx_no === input.trx_no);
  if (taken) {
    return conflict(
      SERVICE, "already_linked",
      `${input.trx_no} is already linked to another line on the calendar.`,
      { component_id: taken.component_id, month: taken.month },
    );
  }

  const user = actingUser();
  let saved: CashSettlement | null = null;
  apply((draft) => {
    saved = {
      id: newId("cst"),
      component_id: input.component_id,
      month: input.month,
      trx_no: input.trx_no,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    };
    draft.cash_settlements.push(saved);
    writeAudit(draft, {
      service: SERVICE, entity: "cash_settlement", entity_no: input.trx_no,
      action: "link", outcome: "ok", reason: null,
      detail: { component_id: input.component_id, month: input.month, amount: trx.amount_idr },
    });
  });
  return ok(SERVICE, saved as unknown as CashSettlement);
}
