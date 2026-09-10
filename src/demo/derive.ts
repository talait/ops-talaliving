/** The views.
 *
 *  Every derived fact in the system is computed here, on read, from stored
 *  rows — never kept in a column that can disagree with them (A3). In Phase 2
 *  each function below becomes a Postgres view with the same name and the same
 *  predicate; this file is the specification for those views, written in a
 *  language we can run today.
 *
 *  It is also, as `05-workplan.md` puts it, the first time these rules have
 *  been written down anywhere as a single definition. Read it as the money
 *  rules, not as helper code.
 */
import type { DemoState } from "./state";
import type {
  PrLine, PrApproval, LineStatus, LineCoverage, PrLineView,
  PoStatusView, RoundSummary, PaymentRound,
} from "@/services/procurement/contracts";
import { COUNTING_CONDITIONS, PROBLEM_CONDITIONS } from "@/services/procurement/contracts";
import type {
  Transaction, AccountBalance, TransactionView, InboxHealth,
} from "@/services/accounting/contracts";
import type { DocKind } from "@/services/documents/contracts";

/** One definition, read from settings — never a literal repeated in three
 *  files, which is how `john-lau` ended up with three different tolerances. */
export const PAYMENT_TOLERANCE_IDR = 1_000;

/* ------------------------------------------------------------------ */
/* Approval                                                            */
/* ------------------------------------------------------------------ */

/** The current decision is the latest row, because approval is append-only:
 *  ticking, un-ticking and re-ticking all leave rows behind, and the trail is
 *  where the nuance lives now that the status is a checkbox (D28). */
export function currentApproval(
  state: DemoState,
  lineId: string,
  step: "GOODS" | "FUNDS" = "GOODS",
): PrApproval | null {
  const rows = state.pr_approvals
    .filter((a) => a.line_id === lineId && a.step === step)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return rows.length ? rows[rows.length - 1] : null;
}

export function isApproved(state: DemoState, lineId: string): boolean {
  return currentApproval(state, lineId)?.approved === true;
}

/* ------------------------------------------------------------------ */
/* Coverage — how much money actually reached a line                   */
/* ------------------------------------------------------------------ */

/** Allocations only count while the transaction behind them still exists and
 *  has not been voided. "A stamp pointing at nothing is not paid" (A10), and a
 *  voided payment must pull its coverage back with it. */
export function fundingTransactions(state: DemoState, lineNoFull: string): Transaction[] {
  return state.payment_allocations
    .filter((a) => a.superseded_by === null && a.pr_line_no === lineNoFull)
    .map((a) => state.transactions.find((t) => t.id === a.trx_id))
    .filter((t): t is Transaction => !!t && t.status !== "VOID");
}

export function lineCoverage(state: DemoState, line: PrLine): LineCoverage {
  const approval = currentApproval(state, line.id);
  /* The fallback is load-bearing: a line with no approved amount is covered
   * against what was asked, so an unapproved line never looks settled. */
  const approved = approval?.approved
    ? approval.approved_amount ?? line.item_total ?? 0
    : line.item_total ?? 0;

  const live = new Set(fundingTransactions(state, line.line_no_full).map((t) => t.id));
  const covered = state.payment_allocations
    .filter((a) => a.superseded_by === null && a.pr_line_no === line.line_no_full && live.has(a.trx_id))
    .reduce((sum, a) => sum + a.amount, 0);

  const settledByPayment = approved > 0 && covered >= approved - PAYMENT_TOLERANCE_IDR;
  /* Or by a named human decision with a mandatory reason — never a silent
   * tolerance (A12). */
  const settledByDecision = state.line_settlements.some((s) => s.line_id === line.id);

  return {
    line_id: line.id,
    approved,
    covered,
    remaining: Math.max(approved - covered, 0),
    settled: settledByPayment || settledByDecision,
  };
}

/* ------------------------------------------------------------------ */
/* Receiving                                                           */
/* ------------------------------------------------------------------ */

/** Only GOOD, and the received part of PARTIALLY DAMAGED, count toward
 *  completion. Everything else leaves the line open (A18). */
export function receivedQty(state: DemoState, line: PrLine): number {
  return state.receipts
    .filter((r) => r.line_id === line.id && COUNTING_CONDITIONS.includes(r.condition))
    .reduce((sum, r) => sum + r.qty_received, 0);
}

export function hasProblemReceipt(state: DemoState, line: PrLine): boolean {
  return state.receipts.some(
    (r) => r.line_id === line.id && PROBLEM_CONDITIONS.includes(r.condition),
  );
}

/* ------------------------------------------------------------------ */
/* Evidence — one path from money to document                          */
/* ------------------------------------------------------------------ */

/** Evidence reaches a line two ways: attached to the line itself, or attached
 *  to a transaction that funded it. That second path is what makes a receiving
 *  photo visible on every ledger row that paid for the line, and a payment
 *  proof visible on the line it settled. */
export function lineEvidenceKinds(state: DemoState, line: PrLine): Set<DocKind> {
  const kinds = new Set<DocKind>();
  for (const l of state.attachment_links) {
    if (l.entity === "pr_line" && l.entity_no === line.line_no_full) kinds.add(l.kind);
  }
  const funders = fundingTransactions(state, line.line_no_full).map((t) => t.trx_no);
  for (const l of state.attachment_links) {
    if (l.entity === "transaction" && funders.includes(l.entity_no)) kinds.add(l.kind);
  }
  return kinds;
}

/* ------------------------------------------------------------------ */
/* The one ladder                                                      */
/* ------------------------------------------------------------------ */

function isServiceLine(state: DemoState, line: PrLine): boolean {
  if (!line.item_id) return false;
  return state.items.find((i) => i.id === line.item_id)?.kind === "service";
}

/** COMPLETED means the FULL chain exists: request, approval, payment, payment
 *  proof, and — for goods — a receiving report. Missing any piece and it is
 *  not completed. This is the anti-fraud line (A11).
 *
 *  A service line completes on payment proof alone (D25): mowing the grass and
 *  the electricity bill never get delivered, and they used to sit at PAID for
 *  ever because the model had no way to say so.
 *
 *  A line with no quantity that is not a service — a PO deposit, say — cannot
 *  reach COMPLETED here at all, and should not: the goods arrive against the
 *  purchase order, whose two axes carry delivery separately (A1).
 */
function chainComplete(state: DemoState, line: PrLine, coverage: LineCoverage): boolean {
  if (!coverage.settled) return false;
  if (!lineEvidenceKinds(state, line).has("Payment Proof")) return false;
  if (hasProblemReceipt(state, line)) return false;
  if (isServiceLine(state, line)) return true;
  if (line.qty == null || line.qty <= 0) return false;
  return receivedQty(state, line) >= line.qty;
}

function lineInRound(state: DemoState, lineId: string): PaymentRound | null {
  const rl = state.payment_round_lines.find((r) => r.line_id === lineId);
  if (!rl) return null;
  return state.payment_rounds.find((r) => r.id === rl.round_id) ?? null;
}

/** Eight values, resolved in this exact order. `HELD` and `REJECTED` are gone
 *  (D28): an unchecked line stays in the queue exactly as HELD did, and an
 *  unwanted line is REMOVED, which carries the same "can never be paid"
 *  guarantee REJECTED used to. */
export function lineStatus(state: DemoState, line: PrLine): LineStatus {
  const doc = state.pr_documents.find((d) => d.id === line.doc_id);
  if (doc?.status === "DRAFT") return "DRAFT";
  if (line.removed_at) return "REMOVED";

  const coverage = lineCoverage(state, line);
  if (chainComplete(state, line, coverage)) return "COMPLETED";
  if (receivedQty(state, line) > 0) return "PARTIAL";
  if (coverage.settled) return "PAID";

  const approved = isApproved(state, line.id);
  if (approved) {
    const round = lineInRound(state, line.id);
    /* TRANSFERRED means money reached the accounting account, not that a
     * vendor was paid — it never makes a line PAID (A10). */
    if (round && (round.status === "APPROVED" || round.status === "TRANSFERRED")) {
      return "WAITING FOR PAYMENT";
    }
    return "APPROVED";
  }
  return "WAITING FOR APPROVAL";
}

export function prLineView(state: DemoState, line: PrLine): PrLineView {
  const doc = state.pr_documents.find((d) => d.id === line.doc_id);
  const vendor = state.vendors.find((v) => v.id === line.vendor_id);
  const item = state.items.find((i) => i.id === line.item_id);
  return {
    ...line,
    status: lineStatus(state, line),
    coverage: lineCoverage(state, line),
    approval: currentApproval(state, line.id),
    doc_no: doc?.doc_no ?? "",
    vendor_name: vendor?.name ?? null,
    item_name: item?.name ?? null,
    received_qty: receivedQty(state, line),
    has_problem_receipt: hasProblemReceipt(state, line),
  };
}

/** The standing queue (D21): every submitted line that is neither approved nor
 *  removed. Nothing ages out, nothing is prioritised — the CEO reads the whole
 *  list either way, which is why there is no urgency column. */
export function approvalQueue(state: DemoState): PrLineView[] {
  return state.pr_lines
    .filter((line) => {
      const doc = state.pr_documents.find((d) => d.id === line.doc_id);
      if (!doc || doc.status === "DRAFT" || doc.status === "CANCELLED") return false;
      if (line.removed_at) return false;
      return !isApproved(state, line.id);
    })
    .map((line) => prLineView(state, line));
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** The database owns this number (D9). No screen recomputes it, and a screen
 *  that cannot load it shows an em dash rather than a substitute — a
 *  client-side stand-in is how a page ends up disagreeing with the books. */
export function accountBalances(state: DemoState): AccountBalance[] {
  return state.accounts.map((acc) => {
    const rows = state.transactions.filter(
      (t) => t.account_id === acc.id && t.status !== "VOID",
    );
    const total_in = rows.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount_idr, 0);
    const total_out = rows.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount_idr, 0);
    return {
      account_id: acc.id,
      code: acc.code,
      name: acc.name,
      custody: acc.custody,
      is_paying: acc.is_paying,
      opening_balance: acc.opening_balance,
      total_in,
      total_out,
      balance: acc.opening_balance + total_in - total_out,
    };
  });
}

export function allocatedTotal(state: DemoState, trxId: string): number {
  return state.payment_allocations
    .filter((a) => a.trx_id === trxId && a.superseded_by === null)
    .reduce((s, a) => s + a.amount, 0);
}

export function transactionView(state: DemoState, trx: Transaction): TransactionView {
  const account = state.accounts.find((a) => a.id === trx.account_id);
  const vendor = state.vendors.find((v) => v.id === trx.vendor_id);
  const allocated = allocatedTotal(state, trx.id);
  const links = state.attachment_links.filter(
    (l) => l.entity === "transaction" && l.entity_no === trx.trx_no,
  );
  return {
    ...trx,
    account_code: account?.code ?? "PETTY CASH",
    vendor_name: vendor?.name ?? null,
    allocated_total: allocated,
    unallocated: trx.amount_idr - allocated,
    evidence_count: links.length,
    has_payment_proof: links.some((l) => l.kind === "Payment Proof"),
    has_receipt_doc: links.some((l) => l.kind === "Receipt / Invoice / Nota"),
    pr_line_nos: state.payment_allocations
      .filter((a) => a.trx_id === trx.id && a.superseded_by === null && a.pr_line_no)
      .map((a) => a.pr_line_no as string),
  };
}

/* ------------------------------------------------------------------ */
/* PO — two axes, never collapsed                                      */
/* ------------------------------------------------------------------ */

/** Payment and delivery are computed apart and stay apart. "Everything follows
 *  from refusing to collapse them" — a PO can be fully paid and empty, or full
 *  and unpaid, and one progress bar can say neither (A1). */
export function poStatus(state: DemoState, poId: string): PoStatusView {
  const po = state.purchase_orders.find((p) => p.id === poId);
  const lines = state.po_lines.filter((l) => l.po_id === poId && l.superseded_by === null);
  const contract_value = lines.reduce((s, l) => s + l.line_total, 0);

  const paid_to_date = state.payment_allocations
    .filter((a) => a.superseded_by === null && a.po_no === po?.po_no)
    .filter((a) => {
      const t = state.transactions.find((x) => x.id === a.trx_id);
      return !!t && t.status !== "VOID";
    })
    .reduce((s, a) => s + a.amount, 0);

  const value_received = lines.reduce((sum, l) => {
    const qty = state.receipts
      .filter((r) => r.po_line_id === l.id && COUNTING_CONDITIONS.includes(r.condition))
      .reduce((s, r) => s + r.qty_received, 0);
    return sum + qty * l.unit_price;
  }, 0);

  const fullyDelivered = lines.length > 0 && lines.every((l) => {
    const qty = state.receipts
      .filter((r) => r.po_line_id === l.id && COUNTING_CONDITIONS.includes(r.condition))
      .reduce((s, r) => s + r.qty_received, 0);
    return qty >= l.qty;
  });

  return {
    po_id: poId,
    contract_value,
    paid_to_date,
    outstanding: Math.max(contract_value - paid_to_date, 0),
    value_received,
    /* Positive means we are carrying the vendor's risk; negative means we owe
     * them for goods already delivered. */
    exposure: paid_to_date - value_received,
    payment_state:
      paid_to_date <= 0 ? "UNPAID"
        : paid_to_date >= contract_value - PAYMENT_TOLERANCE_IDR ? "SETTLED"
          : "PARTIAL",
    delivery_state:
      value_received <= 0 ? "PENDING" : fullyDelivered ? "COMPLETE" : "PARTIAL",
  };
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

export function roundSummary(state: DemoState, roundId: string): RoundSummary {
  const round = state.payment_rounds.find((r) => r.id === roundId);
  const rows = state.payment_round_lines.filter((r) => r.round_id === roundId);

  /* An OPEN round is recomputed from what is still owed; an APPROVED one keeps
   * the numbers it froze, because they are the record of a decision. */
  const requested_total = round?.status === "OPEN"
    ? rows.reduce((s, rl) => {
      const line = state.pr_lines.find((l) => l.id === rl.line_id);
      return s + (line ? lineCoverage(state, line).remaining : 0);
    }, 0)
    : rows.reduce((s, rl) => s + rl.requested_amount, 0);

  const paying_balance = accountBalances(state)
    .filter((b) => b.is_paying && b.code === "BCA 271")
    .reduce((s, b) => s + b.balance, 0);

  return {
    round_id: roundId,
    round_no: round?.round_no ?? "",
    status: round?.status ?? "OPEN",
    requested_total,
    paying_balance,
    /* Never negative, and a shortfall never blocks approval — the balance is
     * information, not a gate. */
    to_transfer: Math.max(requested_total - paying_balance, 0),
    remaining_after_payment: paying_balance - requested_total,
    line_count: rows.length,
  };
}

/* ------------------------------------------------------------------ */
/* The exception road's health                                         */
/* ------------------------------------------------------------------ */

/** Not decoration. If this number grows, people are routing around the normal
 *  road — attaching from the record — and the reason is worth finding
 *  (ADR-010). */
export function inboxHealth(state: DemoState, now = new Date()): InboxHealth {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const recent = state.evidence_inbox.filter((r) => r.reported_at >= weekAgo);
  return {
    week_start: weekAgo.slice(0, 10),
    arrived: recent.length,
    unresolved: state.evidence_inbox.filter((r) => r.status === "PENDING").length,
    by_origin: {
      chat: recent.filter((r) => r.origin === "chat").length,
      web: recent.filter((r) => r.origin === "web").length,
    },
  };
}
