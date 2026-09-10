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
  PurchaseFact, CategoryCount, VendorItemSummary, ItemSource, MeetingState,
  VarianceView, LineNote, ApprovalRequest, PoJourney, PoLineJourney, VendorJourney,
} from "@/services/procurement/contracts";
import { COUNTING_CONDITIONS, PROBLEM_CONDITIONS } from "@/services/procurement/contracts";
import type {
  Transaction, AccountBalance, TransactionView, InboxHealth,
} from "@/services/accounting/contracts";
import type { DocKind } from "@/services/documents/contracts";
import { LOCALE } from "@/lib/format";

/** One definition, read from settings — never a literal repeated in three
 *  files, which is how `john-lau` ended up with three different tolerances. */
export const PAYMENT_TOLERANCE_IDR = 1_000;

/** Compare two timestamps as instants, never as strings.
 *
 *  The fixtures carry `+08:00` (the office is in WITA) and anything written
 *  while the app runs carries `Z`. Sorted as text, `09:05:00+08:00` lands
 *  after `06:45:00Z` even though it happened three hours earlier — and since
 *  "the current decision is the latest row" is how approval, notes and
 *  variances all work, that reads as the wrong answer rather than as a wrong
 *  order. */
export const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);

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
    .sort((a, b) => byTime(a.recorded_at, b.recorded_at));
  return rows.length ? rows[rows.length - 1] : null;
}

/** The latest note on a line. Append-only, so the current word is the last
 *  row and the earlier ones stay readable in the trail. */
export function currentNote(state: DemoState, lineId: string): LineNote | null {
  const rows = state.line_notes
    .filter((n) => n.line_id === lineId)
    .sort((a, b) => byTime(a.recorded_at, b.recorded_at));
  return rows.length ? rows[rows.length - 1] : null;
}

/** An approval asked for through chat and not answered yet.
 *
 *  Answered means answered — a line the approver decided in the app instead
 *  leaves the card standing, and the chat screen marks it stale rather than
 *  pretending the question is still open (D69). */
export function pendingRequest(state: DemoState, lineId: string): ApprovalRequest | null {
  return state.approval_requests
    .filter((r) => r.line_id === lineId && !r.answered_at)
    .sort((a, b) => byTime(a.sent_at, b.sent_at))
    .pop() ?? null;
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

/** Approved-or-not against paid-or-not. Two independent facts, four
 *  combinations, and the interesting one is the corner where money moved
 *  without a yes — which is exactly the corner a single "in progress" status
 *  would hide (A1). */
export function meetingState(state: DemoState, line: PrLine): MeetingState {
  const approved = isApproved(state, line.id);
  const paid = lineCoverage(state, line).covered > 0;
  if (approved && paid) return "settled";
  if (approved) return "approved_unpaid";
  if (paid) return "paid_unapproved";
  return "neither";
}

/** Three numbers that are allowed to differ, and the two gaps between them.
 *
 *  requested → approved is a DECISION: the CEO cut it, and money may only
 *  shrink on the way through approval (A8). That is not a variance and is not
 *  reported as one.
 *
 *  approved → paid is the gap leadership is asking about: money that moved is
 *  not money that was authorised. Under means still owed, or settled cheaper.
 *  Over means money left beyond the yes — which is the direction that matters,
 *  and the one a "paid" flag would have hidden entirely.
 */
export function varianceOf(state: DemoState, line: PrLine): VarianceView {
  const approval = currentApproval(state, line.id);
  const cov = lineCoverage(state, line);
  const approved = approval?.approved ? approval.approved_amount ?? line.item_total : line.item_total;
  const paid = cov.covered;
  const delta = paid - approved;

  const explanation = state.line_variances
    .filter((v) => v.line_id === line.id)
    .sort((a, b) => byTime(a.recorded_at, b.recorded_at))
    .pop() ?? null;

  return {
    requested: line.item_total,
    approved,
    paid,
    delta,
    kind: delta === 0 ? "none" : delta > 0 ? "over" : "under",
    /* Below the tolerance it is rounding, not a variance. Reporting arithmetic
     * as an exception is how people learn to ignore exceptions. */
    material: paid > 0 && Math.abs(delta) > PAYMENT_TOLERANCE_IDR,
    explanation,
  };
}

export function prLineView(state: DemoState, line: PrLine): PrLineView {
  const doc = state.pr_documents.find((d) => d.id === line.doc_id);
  const vendor = state.vendors.find((v) => v.id === line.vendor_id);
  const item = state.items.find((i) => i.id === line.item_id);
  const links = state.attachment_links.filter(
    (l) => l.entity === "pr_line" && l.entity_no === line.line_no_full,
  );
  const kinds = lineEvidenceKinds(state, line);
  return {
    ...line,
    status: lineStatus(state, line),
    meeting_state: meetingState(state, line),
    coverage: lineCoverage(state, line),
    approval: currentApproval(state, line.id),
    doc_no: doc?.doc_no ?? "",
    requested_by_name: state.users.find((u) => u.id === doc?.requested_by)?.full_name ?? "—",
    project_code: state.projects.find((p) => p.id === doc?.project_id)?.code ?? null,
    submitted_at: doc?.submitted_at ?? null,
    vendor_name: vendor?.name ?? null,
    item_name: item?.name ?? null,
    received_qty: receivedQty(state, line),
    has_problem_receipt: hasProblemReceipt(state, line),
    evidence_count: links.length,
    has_payment_proof: kinds.has("Payment Proof"),
    variance: varianceOf(state, line),
    note: currentNote(state, line.id),
    pending_request: pendingRequest(state, line.id),
    trx_nos: fundingTransactions(state, line.line_no_full).map((t) => t.trx_no),
  };
}

/** Every line that is still someone's problem, across every document.
 *
 *  This is the view the whole redefinition turns on. A line does not belong to
 *  the meeting it first appeared in — it stays here until it is settled or
 *  removed, so "it comes back at the next meeting" needs no machinery at all.
 *  The old system moved unpaid lines into a fresh document to make them
 *  reappear; that existed because the surface was a spreadsheet with one tab
 *  per submission. With a line-first board there is nothing to carry forward.
 */
export function openLines(state: DemoState): PrLineView[] {
  return state.pr_lines
    .filter((line) => {
      const doc = state.pr_documents.find((d) => d.id === line.doc_id);
      if (!doc || doc.status === "DRAFT" || doc.status === "CANCELLED") return false;
      return !line.removed_at;
    })
    .map((line) => prLineView(state, line))
    /* A line that paid more than was approved and carries nobody's explanation
     * is not finished, whatever its status ladder says. Letting it drop off
     * the board because the goods arrived is precisely how an overpayment
     * stops being anyone's problem. */
    .filter((l) => l.status !== "COMPLETED" || (l.variance.material && !l.variance.explanation))
    .sort((a, b) => byTime(b.submitted_at ?? "", a.submitted_at ?? ""));
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
    .map((line) => prLineView(state, line))
    /* Oldest first. Nothing ages out and nothing is prioritised (D21), but a
     * line that has waited a week should not be below one filed this morning
     * just because the list happens to be built in table order. */
    .sort((a, b) => byTime(a.submitted_at ?? "", b.submitted_at ?? ""));
}

/* ------------------------------------------------------------------ */
/* The vendor journey — both axes, one block (D97)                     */
/* ------------------------------------------------------------------ */

/** What a vendor could honestly invoice today.
 *
 *  Two things are earned at different moments. A **deposit** is earned when
 *  the order is issued — that is what a deposit is. Everything else is earned
 *  as goods arrive, in proportion to their value. So:
 *
 *      earned = contract × dp%  +  value_received × (1 − dp%)
 *      billable now = earned − already paid, floored at zero
 *
 *  The floor matters: paying ahead of delivery is a real thing that happens,
 *  and it is reported as exposure on the order rather than as a negative
 *  number here. This figure has one job — *what is safe to send money for
 *  next* — and a negative answer to that question is not a smaller number, it
 *  is a different conversation (D99).
 */
function billableNow(
  contract: number, valueReceived: number, paid: number, dpPercent: number | null,
  issued: boolean,
): number {
  /* A deposit is earned when the order is issued — that is what a deposit is.
   * A draft PO is a document nobody has sent, so nothing on it is billable,
   * however large the contract (D99). */
  const dp = issued ? (dpPercent ?? 0) / 100 : 0;
  const earned = issued ? contract * dp + valueReceived * (1 - dp) : 0;
  return Math.max(Math.round(earned - paid), 0);
}

export function poJourney(state: DemoState, poId: string): PoJourney {
  const po = state.purchase_orders.find((p) => p.id === poId)!;
  const status = poStatus(state, poId);
  const dpTerm = state.po_schedule.find(
    (t) => t.po_id === poId && t.kind === "DP" && t.basis === "percent",
  );

  const lines: PoLineJourney[] = state.po_lines
    .filter((l) => l.po_id === poId && l.superseded_by === null)
    .map((l) => {
      const rows = state.receipts.filter((r) => r.po_line_id === l.id);
      const received = rows
        .filter((r) => COUNTING_CONDITIONS.includes(r.condition))
        .reduce((sum, r) => sum + r.qty_received, 0);
      const problem = rows.some((r) => PROBLEM_CONDITIONS.includes(r.condition));
      const over = Math.max(received - l.qty, 0);
      return {
        po_line_id: l.id,
        description: l.description,
        qty: l.qty,
        uom: l.uom,
        unit_price: l.unit_price,
        line_total: l.line_total,
        received,
        over,
        condition: problem ? "PROBLEM"
          : received === 0 ? "NOT ARRIVED"
            : over > 0 ? "OVER"
              : received < l.qty ? "PARTIAL" : "GOOD",
        receipts: rows.map((r) => {
          const links = state.attachment_links.filter(
            (a) => a.entity === "receipt" && a.entity_no === r.receipt_no,
          );
          return {
            receipt_no: r.receipt_no,
            qty: r.qty_received,
            condition: r.condition,
            at: r.received_at,
            by: state.users.find((u) => u.id === r.received_by)?.full_name ?? "—",
            qc_by: state.users.find((u) => u.id === r.qc_by)?.full_name ?? "—",
            note: r.note,
            has_photo: links.some((l) => l.kind === "Receiving Item"),
            has_delivery_note: links.some((l) => l.kind === "Delivery Note"),
          };
        }),
      };
    });

  return {
    po_no: po.po_no,
    status: po.status,
    issued_at: po.issued_at,
    note: po.note,
    dp_percent: dpTerm?.basis_value ?? null,
    contract_value: status.contract_value,
    paid: status.paid_to_date,
    value_received: status.value_received,
    billable_now: billableNow(
      status.contract_value, status.value_received, status.paid_to_date,
      dpTerm?.basis_value ?? null, !!po.issued_at,
    ),
    /* What the vendor over-delivered, priced. Not billable and not ours to
     * spend — it is a credit sitting with them (D98). */
    credit: lines.reduce((sum, l) => sum + l.over * l.unit_price, 0),
    payment_state: status.payment_state,
    delivery_state: status.delivery_state,
    lines,
  };
}

export function vendorJourney(state: DemoState, vendorId: string): VendorJourney {
  const vendor = state.vendors.find((v) => v.id === vendorId);
  const pos = state.purchase_orders
    .filter((p) => p.vendor_id === vendorId && p.status !== "CANCELLED")
    .map((p) => poJourney(state, p.id))
    .sort((a, b) => a.po_no.localeCompare(b.po_no));

  const contract_value = pos.reduce((s, p) => s + p.contract_value, 0);
  const paid = pos.reduce((s, p) => s + p.paid, 0);
  const value_received = pos.reduce((s, p) => s + p.value_received, 0);
  const billable_now = pos.reduce((s, p) => s + p.billable_now, 0);
  const credit = pos.reduce((s, p) => s + p.credit, 0);
  const outstanding = Math.max(contract_value - paid, 0);

  /* One sentence rather than four numbers to compare — the reader is standing
   * in front of a supplier, not reading a report. */
  const headline = billable_now > 0
    ? `${formatShort(billable_now)} can be invoiced now — goods have arrived that nobody has paid for`
    : outstanding > 0
      ? `${formatShort(outstanding)} still contracted, and nothing is billable until more arrives`
      : "Fully settled — every order paid against what has arrived";

  return {
    vendor_id: vendorId,
    vendor_name: vendor?.name ?? "—",
    orders: pos.length,
    contract_value,
    paid,
    outstanding,
    value_received,
    billable_now,
    credit,
    headline,
    pos,
  };
}

/** Rp 12,7 jt — for a sentence, not a column. */
function formatShort(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} M`;
  return `Rp ${n.toLocaleString(LOCALE)}`;
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
      currency: acc.currency,
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
    /* Only a purchase is expected to name a request line. Payroll and the
     * electricity bill are money leaving for reasons nobody raises a PR for,
     * and flagging them would drown the rows that matter (D83). */
    expects_allocation: trx.direction === "OUT"
      && (state.transaction_types.find((t) => t.code === trx.type_code)?.is_purchase ?? false),
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
    /* Capped at what was ordered. A vendor who ships two sheets more than the
     * order has given us a credit, not sold us more — we owe for what we
     * asked for, and the extra is theirs to apply to a later order (D98).
     * Counting it here would quietly turn an unasked-for delivery into money
     * they can invoice. */
    return sum + Math.min(qty, l.qty) * l.unit_price;
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

  const transfers = state.round_transfers
    .filter((t) => t.round_id === roundId)
    .sort((a, b) => byTime(a.recorded_at, b.recorded_at));
  const transferred_total = transfers.reduce((sum, t) => sum + t.amount, 0);

  const paying_balance = accountBalances(state)
    .filter((b) => b.is_paying && b.code === "BCA 271")
    .reduce((s, b) => s + b.balance, 0);

  return {
    round_id: roundId,
    round_no: round?.round_no ?? "",
    status: round?.status ?? "OPEN",
    requested_total,
    transfers,
    transferred_total,
    /* What is still to come IN, not what is still owed to suppliers: a round
     * can be half funded and fully approved at the same time. */
    transfer_shortfall: Math.max(requested_total - transferred_total, 0),
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

/* ------------------------------------------------------------------ */
/* Purchase facts — one derivation, asked from both ends               */
/* ------------------------------------------------------------------ */

/** Every "we bought this item from that vendor" we can establish, gathered from
 *  both places it is recorded: requested lines, and itemised ledger rows.
 *
 *  Both directions of the sourcing question read from here, so the vendor page
 *  and the catalogue page can never disagree about what was bought from whom.
 *  A declared category on a vendor record is a claim; this is what happened.
 */
export function purchaseFacts(state: DemoState): PurchaseFact[] {
  const facts: PurchaseFact[] = [];

  const itemOf = (id: string | null) => (id ? state.items.find((i) => i.id === id) : undefined);
  const vendorOf = (id: string | null) => (id ? state.vendors.find((v) => v.id === id) : undefined);
  /* A merged vendor's history stays on its own row (D41), so a reader has to
   * follow the pointer to see it under the surviving name. */
  const canonical = (v: ReturnType<typeof vendorOf>) =>
    v?.merged_into ? state.vendors.find((x) => x.id === v.merged_into) ?? v : v;

  for (const line of state.pr_lines) {
    if (line.removed_at) continue;
    const item = itemOf(line.item_id);
    const vendor = canonical(vendorOf(line.vendor_id));
    if (!item || !vendor) continue;
    const doc = state.pr_documents.find((d) => d.id === line.doc_id);
    facts.push({
      item_id: item.id, item_name: item.name, category_code: item.category_code,
      vendor_id: vendor.id, vendor_name: vendor.name,
      unit_price: line.unit_price, uom: line.uom,
      date: (doc?.submitted_at ?? doc?.created_at ?? "").slice(0, 10),
      source: "pr",
    });
  }

  for (const tl of state.transaction_lines) {
    const trx = state.transactions.find((t) => t.id === tl.trx_id);
    if (!trx || trx.status === "VOID") continue;
    const item = itemOf(tl.item_id);
    const vendor = canonical(vendorOf(trx.vendor_id));
    if (!vendor) continue;
    facts.push({
      item_id: item?.id ?? "",
      item_name: item?.name ?? tl.description,
      category_code: item?.category_code ?? "uncurated",
      vendor_id: vendor.id, vendor_name: vendor.name,
      unit_price: tl.unit_price, uom: tl.uom,
      date: trx.trx_date, source: "ledger",
    });
  }

  return facts.sort((a, b) => b.date.localeCompare(a.date));
}

/** What we actually buy from a vendor, by category. */
export function boughtCategories(state: DemoState, vendorId: string): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const f of purchaseFacts(state)) {
    if (f.vendor_id !== vendorId) continue;
    counts.set(f.category_code, (counts.get(f.category_code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      name: state.item_categories.find((c) => c.code === code)?.name ?? code,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function itemsBoughtFrom(state: DemoState, vendorId: string): VendorItemSummary[] {
  const byItem = new Map<string, VendorItemSummary>();
  for (const f of purchaseFacts(state)) {
    if (f.vendor_id !== vendorId || !f.item_id) continue;
    const found = byItem.get(f.item_id);
    if (found) { found.times += 1; continue; }
    byItem.set(f.item_id, {
      item_id: f.item_id, item_name: f.item_name,
      last_price: f.unit_price, uom: f.uom, last_date: f.date, times: 1,
    });
  }
  return [...byItem.values()].sort((a, b) => b.last_date.localeCompare(a.last_date));
}

/** The reverse: who we buy this item from. Newest first, because "where did we
 *  get it last time" is almost always the question being asked. */
export function itemSources(state: DemoState, itemId: string): ItemSource[] {
  const byVendor = new Map<string, ItemSource>();
  for (const f of purchaseFacts(state)) {
    if (f.item_id !== itemId) continue;
    const found = byVendor.get(f.vendor_id);
    if (found) { found.times += 1; continue; }
    const v = state.vendors.find((x) => x.id === f.vendor_id);
    byVendor.set(f.vendor_id, {
      vendor_id: f.vendor_id, vendor_name: f.vendor_name,
      is_curated: v?.is_curated ?? false,
      pic_name: v?.pic_name ?? null, pic_phone: v?.pic_phone ?? null,
      last_price: f.unit_price, uom: f.uom, last_date: f.date, times: 1,
    });
  }
  return [...byVendor.values()].sort((a, b) => b.last_date.localeCompare(a.last_date));
}
