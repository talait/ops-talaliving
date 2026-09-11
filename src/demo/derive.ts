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
  FundingView, FundingDetail, FundingSpendGroup, FundingSpendRow,
  CashPlan, CashRow, CashCell, CashCellState, CashMonth, CashUnplanned, CashDue,
  CashComponent, CashEvent, CashMonthDetail, CashDayRow, Transaction as TrxRow,
} from "@/services/accounting/contracts";
import type { DocKind } from "@/services/documents/contracts";
import { REQUEST_SUPPORT_KINDS } from "@/services/documents/contracts";
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

  /* One value for approved-and-unpaid, whether or not a round has money in it
     for this line. TRANSFERRED never meant a vendor was paid (A10) — and it
     never meant the money was reserved either, which is why the second status
     was removed rather than renamed (D126). */
  if (isApproved(state, line.id)) return "APPROVED";
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
    round_no: lineInRound(state, line.id)?.round_no ?? null,
    round_status: lineInRound(state, line.id)?.status ?? null,
    has_support: [...lineEvidenceKinds(state, line)].some((k) => REQUEST_SUPPORT_KINDS.includes(k)),
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

/** Is this kind of spending expected to name the decision behind it?
 *
 *  A purchase is. Payroll and the electricity bill are not (D83). And a type
 *  nobody has classified yet **is**, deliberately: `EJO` and `PACKING` are
 *  carried as-is rather than folded into `OTHERS` (Q10), and if an unknown
 *  type defaulted to *not expected*, the way to make spending escape the
 *  check would be to type a category that does not exist yet (D107).
 */
export function expectsDecision(state: DemoState, typeCode: string): boolean {
  const type = state.transaction_types.find((t) => t.code === typeCode);
  return type ? type.is_purchase : true;
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
    expects_allocation: trx.direction === "OUT" && expectsDecision(state, trx.type_code),
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

/* ------------------------------------------------------------------ */
/* Liquidation — one transfer in, and where it went                    */
/* ------------------------------------------------------------------ */

const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00+08:00`) - Date.parse(`${from}T00:00:00+08:00`)) / 86_400_000);

/** Ledger rows in the order a bank statement has them: by day, then by the
 *  number that was minted that day. */
const byLedgerOrder = (a: Transaction, b: Transaction) =>
  a.trx_date === b.trx_date ? a.trx_no.localeCompare(b.trx_no) : a.trx_date.localeCompare(b.trx_date);

/** Did this row go out against something somebody decided — an approved
 *  request line, or a purchase order? Both are decisions; a PO payment with no
 *  PR behind it went through the order, not around it. */
function isDecided(state: DemoState, trx: Transaction): boolean {
  return state.payment_allocations.some(
    (a) => a.trx_id === trx.id && a.superseded_by === null
      && (a.pr_line_no !== null || a.po_no !== null),
  );
}

/** Money entering an operating account. Leadership's own account is not one:
 *  money arriving there has not yet been given to the business, and counting
 *  it as funding would answer the wrong question. */
function fundingRows(state: DemoState): Transaction[] {
  const operating = new Set(
    state.accounts.filter((a) => a.custody === "accounting").map((a) => a.id),
  );
  return state.transactions
    .filter((t) => t.direction === "IN" && t.status !== "VOID" && operating.has(t.account_id))
    .sort(byLedgerOrder);
}

function group(
  rows: FundingSpendRow[],
  keyOf: (r: FundingSpendRow) => string,
  labelOf: (r: FundingSpendRow) => string,
  total: number,
): FundingSpendGroup[] {
  const map = new Map<string, FundingSpendGroup>();
  rows.forEach((r) => {
    const key = keyOf(r);
    const found = map.get(key) ?? { key, label: labelOf(r), amount: 0, share: 0, count: 0 };
    found.amount += r.amount;
    found.count += 1;
    map.set(key, found);
  });
  return [...map.values()]
    .map((g) => ({ ...g, share: total > 0 ? g.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** One transfer, and what happened to the account it landed in until the next
 *  one arrived. See `FundingView` for why the window is drawn this way. */
export function fundingView(state: DemoState, trx: Transaction, all?: Transaction[]): FundingDetail {
  const fundings = all ?? fundingRows(state);
  const idx = fundings.findIndex((f) => f.trx_no === trx.trx_no);
  const next = fundings.slice(idx + 1).find((f) => f.account_id === trx.account_id) ?? null;
  const account = state.accounts.find((a) => a.id === trx.account_id);

  /* Everything on this account before the money landed — the balance the
     transfer was added to, stated so nobody reads the excess as a hole. */
  const priorRows = state.transactions.filter(
    (t) => t.account_id === trx.account_id && t.status !== "VOID" && byLedgerOrder(t, trx) < 0,
  );
  const balance_before = (account?.opening_balance ?? 0)
    + priorRows.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount_idr, 0)
    - priorRows.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount_idr, 0);

  const inWindow = state.transactions
    .filter((t) =>
      t.account_id === trx.account_id
      && t.direction === "OUT"
      && t.status !== "VOID"
      && byLedgerOrder(t, trx) > 0
      && (next === null || byLedgerOrder(t, next) < 0))
    .sort(byLedgerOrder);

  let running = trx.amount_idr;
  let consumed_on: string | null = null;
  const rows: FundingSpendRow[] = inWindow.map((t) => {
    running -= t.amount_idr;
    if (consumed_on === null && running <= 0) consumed_on = t.trx_date;
    return {
      trx_no: t.trx_no,
      trx_date: t.trx_date,
      description: t.description,
      type_code: t.type_code,
      vendor_name: state.vendors.find((v) => v.id === t.vendor_id)?.name ?? null,
      project_name: state.projects.find((p) => p.id === t.project_id)?.name ?? null,
      amount: t.amount_idr,
      left_of_transfer: running,
      decided: isDecided(state, t),
      expects_link: expectsDecision(state, t.type_code),
      status: t.status,
    };
  });

  const spent = rows.reduce((s, r) => s + r.amount, 0);
  const decided = rows.filter((r) => r.decided).reduce((s, r) => s + r.amount, 0);
  /* Only a purchase is expected to name one (D83). Payroll, the electricity
     bill and the bank's own fee are not loose ends. */
  const undecided = rows
    .filter((r) => !r.decided && r.expects_link)
    .reduce((s, r) => s + r.amount, 0);
  const days_lasted = consumed_on ? daysBetween(trx.trx_date, consumed_on) : null;
  const is_open = next === null;

  /* The mirror row: the same amount leaving a leadership account on the same
     day. Nothing in the data says "these two are one transfer" (F29), so this
     is a match on what is there, and it is only used to name the source. */
  const mirror = state.transactions.find(
    (t) => t.direction === "OUT"
      && t.status !== "VOID"
      && t.trx_date === trx.trx_date
      && t.amount_idr === trx.amount_idr
      && t.account_id !== trx.account_id
      && (state.accounts.find((a) => a.id === t.account_id)?.custody === "leadership"),
  );
  const proof = state.attachment_links.find(
    (l) => l.entity === "transaction" && l.entity_no === trx.trx_no && l.kind === "Payment Proof",
  );

  const headline = consumed_on
    ? `Spent through in ${days_lasted} day(s)${spent > trx.amount_idr ? `, and ${formatShort(spent - trx.amount_idr)} beyond it` : ""}`
    : is_open
      ? `${formatShort(trx.amount_idr - spent)} of it still unspent`
      : `${formatShort(trx.amount_idr - spent)} was still unspent when the next transfer arrived`;

  return {
    trx_no: trx.trx_no,
    trx_date: trx.trx_date,
    account_id: trx.account_id,
    account_code: account?.code ?? "PETTY CASH",
    amount: trx.amount_idr,
    description: trx.description,
    from_account_code: mirror
      ? state.accounts.find((a) => a.id === mirror.account_id)?.code ?? null
      : null,
    balance_before,
    next_funding_no: next?.trx_no ?? null,
    window_end: next?.trx_date ?? null,
    spent,
    consumed_on,
    days_lasted,
    remaining: Math.max(trx.amount_idr - spent, 0),
    beyond: Math.max(spent - trx.amount_idr, 0),
    decided,
    undecided,
    is_open,
    headline,
    proof_filename: proof
      ? state.attachments.find((a) => a.id === proof.attachment_id)?.filename ?? null
      : null,
    rows,
    by_type: group(rows, (r) => r.type_code, (r) => r.type_code, spent),
    by_vendor: group(rows, (r) => r.vendor_name ?? "—", (r) => r.vendor_name ?? "no vendor named", spent),
    by_project: group(rows, (r) => r.project_name ?? "—", (r) => r.project_name ?? "no project named", spent),
  };
}

/** Every funding, newest first. */
export function fundings(state: DemoState): FundingView[] {
  const rows = fundingRows(state);
  return rows
    .map((t) => {
      const { rows: _rows, by_type: _t, by_vendor: _v, by_project: _p, proof_filename: _f, ...view } =
        fundingView(state, t, rows);
      return view as FundingView;
    })
    .reverse();
}

/* ------------------------------------------------------------------ */
/* Payment calendar — twelve months, planned against actual            */
/* ------------------------------------------------------------------ */

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
/** The 31st of a 30-day month is the 30th. A due date that does not exist is
 *  a date nobody can be reminded on. */
const dueDateOf = (month: string, day: number) =>
  `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
};

/** Twelve months starting with the one we are in. */
function planMonths(from: Date, count = 12): string[] {
  const out: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = 0; i < count; i += 1) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

const inMonth = (t: TrxRow, month: string) => t.trx_date.startsWith(month);

function activeIn(c: CashComponent, month: string): boolean {
  if (!c.active) return false;
  if (c.frequency === "once") return c.due_date !== null && c.due_date.startsWith(month);
  if (month < c.starts_on) return false;
  if (c.ends_on !== null && month > c.ends_on) return false;
  return true;
}

/** Every day this line falls due inside one month.
 *
 *  A weekly line has four of them in most months and five in some, and that
 *  difference is real money — the old model, one figure per month, could not
 *  say it (D113). */
function occurrenceDates(c: CashComponent, month: string): string[] {
  if (!activeIn(c, month)) return [];
  if (c.frequency === "once") return c.due_date ? [c.due_date] : [];
  if (c.frequency === "monthly") return [dueDateOf(month, c.due_day)];

  const [y, m] = month.split("-").map(Number);
  const want = c.due_weekday ?? 5;
  const out: string[] = [];
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    if (new Date(y, m - 1, day).getDay() === want) {
      out.push(`${month}-${String(day).padStart(2, "0")}`);
    }
  }
  return out;
}

/** Does this ledger row look like this line's category?
 *
 *  A guess, and the screen labels it as one. */
function matchesComponent(c: CashComponent, t: TrxRow): boolean {
  if (t.status === "VOID") return false;
  if (t.direction !== c.direction) return false;
  if (c.type_code !== null && t.type_code !== c.type_code) return false;
  if (c.vendor_id !== null && t.vendor_id !== c.vendor_id) return false;
  return true;
}

/** Most specific claim first, so a one-off settlement takes its own payment
 *  before the standing line for that category sweeps it up (D110).
 *
 *  A dated one-off is the narrowest claim there is; then a line naming a
 *  vendor; then a plain category. Without this order, *pelunasan kartu kredit*
 *  in November would be swallowed by the monthly card bill and the plan would
 *  show the routine amount twice. */
function claimOrder(c: CashComponent): number {
  if (c.frequency === "once") return 0;
  if (c.vendor_id !== null) return 1;
  return 2;
}

const absDayGap = (a: string, b: string) => Math.abs(daysBetween(a, b));

/** The accounts the business actually pays out of. Leadership's account is
 *  not one of them: money sitting there has not been given to operations yet,
 *  and counting it would make every month look survivable. */
function payingAccountIds(state: DemoState): Set<string> {
  return new Set(
    state.accounts.filter((a) => a.custody === "accounting" && a.is_active).map((a) => a.id),
  );
}

export function cashPlan(state: DemoState, now = new Date()): CashPlan {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const months = planMonths(now);
  const current = months[0];
  const paying = payingAccountIds(state);
  const ledger = state.transactions.filter((t) => t.status !== "VOID" && paying.has(t.account_id));

  /* Cash as it is right now, across the accounts that pay people. Everything
     below is that number moving forward. */
  const opening_cash = accountBalances(state)
    .filter((a) => paying.has(a.account_id))
    .reduce((s, a) => s + a.balance, 0);

  /* Rows a line has claimed, so nothing is counted twice and "not in the
     plan" cannot count them at all. */
  const claimed = new Set<string>();

  const ordered = [...state.cash_components]
    .filter((c) => c.active)
    .sort((a, b) => claimOrder(a) - claimOrder(b));

  const rowsByComponent = new Map<string, CashRow>();

  ordered.forEach((c) => {
    const cells: CashCell[] = months.map((month) => {
      const override = state.cash_overrides.find(
        (o) => o.component_id === c.id && o.month === month,
      );
      const dates = occurrenceDates(c, month);
      const skipped = dates.length === 0 || (override !== undefined && override.amount === null);

      /* An override on a weekly line is the month's total, and the difference
         lands on the last run — the THR is paid with one payday (D114). */
      const perOccurrence = dates.map((_, i) => {
        if (skipped) return 0;
        if (override?.amount == null) return c.amount;
        if (c.frequency !== "weekly") return override.amount;
        const base = c.amount;
        const rest = override.amount - base * (dates.length - 1);
        return i === dates.length - 1 ? rest : base;
      });

      const linked = state.cash_settlements.filter(
        (st) => st.component_id === c.id && st.month === month,
      );

      const events: CashEvent[] = dates.map((date, i) => {
        const planned = perOccurrence[i];

        /* Somebody's link always wins over a guess. With several runs in one
           month, a linked row belongs to the occurrence it is nearest to. */
        const linkedRows = linked
          .map((st) => ledger.find((t) => t.trx_no === st.trx_no))
          .filter((t): t is TrxRow => !!t)
          .filter((t) => dates.length === 1
            || dates.every((d) => absDayGap(t.trx_date, date) <= absDayGap(t.trx_date, d)));

        let hits: TrxRow[] = linkedRows;
        if (hits.length === 0) {
          const window = c.frequency === "weekly" ? 3 : c.frequency === "once" ? 10 : 31;
          const candidates = ledger
            .filter((t) => matchesComponent(c, t) && !claimed.has(t.trx_no))
            .filter((t) => c.frequency === "monthly"
              ? inMonth(t, month)
              : absDayGap(t.trx_date, date) <= window);
          if (c.frequency === "monthly") {
            hits = candidates;
          } else {
            /* One payment per occurrence: the nearest row, and where two are
               equally near, the one closest to what was expected. */
            const best = candidates.sort((a, b) =>
              absDayGap(a.trx_date, date) - absDayGap(b.trx_date, date)
              || Math.abs(a.amount_idr - planned) - Math.abs(b.amount_idr - planned))[0];
            hits = best ? [best] : [];
          }
        }
        hits.forEach((t) => claimed.add(t.trx_no));
        const actual = hits.reduce((s, t) => s + t.amount_idr, 0);

        let evState: CashCellState;
        if (skipped) evState = "SKIPPED";
        else if (actual > 0 && actual >= planned - PAYMENT_TOLERANCE_IDR) evState = "PAID";
        else if (actual > 0) evState = "PARTIAL";
        else if (date < today) evState = "OVERDUE";
        else evState = daysBetween(today, date) <= 7 ? "DUE" : "PLANNED";

        return {
          component_id: c.id,
          name: c.name,
          direction: c.direction,
          frequency: c.frequency,
          month,
          date,
          planned,
          actual,
          matched_by: hits.length === 0 ? null : linkedRows.length > 0 ? "linked" : "category",
          trx_nos: hits.map((t) => t.trx_no),
          state: evState,
          vendor_name: state.vendors.find((v) => v.id === c.vendor_id)?.name ?? null,
          account_code: state.accounts.find((a) => a.id === c.account_id)?.code ?? null,
          carries_override: override !== undefined && c.frequency === "weekly" && i === dates.length - 1,
          reason: override?.reason ?? null,
        };
      });

      const planned = events.reduce((s, e) => s + e.planned, 0);
      const actual = events.reduce((s, e) => s + e.actual, 0);
      const trx_nos = events.flatMap((e) => e.trx_nos);
      const worst: CashCellState = skipped ? "SKIPPED"
        : events.some((e) => e.state === "OVERDUE") ? "OVERDUE"
          : events.some((e) => e.state === "DUE") ? "DUE"
            : actual > 0 && actual >= planned - PAYMENT_TOLERANCE_IDR ? "PAID"
              : actual > 0 ? "PARTIAL" : "PLANNED";

      return {
        month,
        due_date: dates[0] ?? dueDateOf(month, c.due_day),
        planned,
        actual,
        matched_by: trx_nos.length === 0
          ? null
          : events.some((e) => e.matched_by === "linked") ? "linked" : "category",
        trx_nos,
        state: worst,
        overridden: override !== undefined,
        reason: override?.reason ?? null,
        events,
      };
    });

    rowsByComponent.set(c.id, {
      component: c,
      vendor_name: state.vendors.find((v) => v.id === c.vendor_id)?.name ?? null,
      account_code: state.accounts.find((a) => a.id === c.account_id)?.code ?? null,
      cells,
      planned_total: cells.reduce((s, x) => s + x.planned, 0),
      actual_total: cells.reduce((s, x) => s + x.actual, 0),
    });
  });

  /* Back into the order somebody typed them in, now that claiming is done. */
  const rows: CashRow[] = state.cash_components
    .filter((c) => c.active)
    .map((c) => rowsByComponent.get(c.id))
    .filter((r): r is CashRow => !!r);

  /* Everything that actually left in a month with nothing in the plan claiming
     it. A plan that does not reconcile to the ledger is fiction (D111). */
  const unplanned: CashUnplanned[] = months.map((month) => {
    const loose = ledger.filter(
      (t) => t.direction === "OUT" && inMonth(t, month) && !claimed.has(t.trx_no),
    );
    const byType = new Map<string, number>();
    loose.forEach((t) => byType.set(t.type_code, (byType.get(t.type_code) ?? 0) + t.amount_idr));
    return {
      month,
      amount: loose.reduce((s, t) => s + t.amount_idr, 0),
      trx_nos: loose.map((t) => t.trx_no),
      top_types: [...byType.entries()]
        .map(([type_code, amount]) => ({ type_code, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    };
  });

  /* Running cash. The month we are in counts only what is still ahead of
     today — what already happened is inside the opening balance. */
  let running = opening_cash;
  const monthViews: CashMonth[] = months.map((month, i) => {
    const cells = rows.map((r) => ({ row: r, cell: r.cells[i] }));
    /* A part-paid bill keeps its remainder: dropping a whole line because half
       of it went out would forecast a month that cannot happen. */
    const stillToCome = (c: CashCell) =>
      month === current ? Math.max(c.planned - c.actual, 0) : c.planned;

    const planned_in = cells
      .filter((x) => x.row.component.direction === "IN")
      .reduce((s, x) => s + stillToCome(x.cell), 0);
    const planned_out = cells
      .filter((x) => x.row.component.direction === "OUT")
      .reduce((s, x) => s + stillToCome(x.cell), 0);

    running += planned_in - planned_out;

    const actualRows = ledger.filter((t) => inMonth(t, month));
    return {
      month,
      label: monthLabel(month),
      is_past: month < current,
      is_current: month === current,
      planned_in,
      planned_out,
      actual_in: actualRows.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount_idr, 0),
      actual_out: actualRows.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount_idr, 0),
      unplanned_out: unplanned[i].amount,
      closing: running,
    };
  });

  const short = monthViews.find((m) => m.closing < 0) ?? null;
  const undated_obligations = state.vendors
    .reduce((s, v) => s + vendorJourney(state, v.id).outstanding, 0);

  const verdict = short
    ? `On this plan the money runs out in ${short.label} — ${formatShort(Math.abs(short.closing))} short.`
    : `The plan holds through ${monthViews[monthViews.length - 1].label}, ending at ${formatShort(monthViews[monthViews.length - 1].closing)}.`;

  return {
    generated_for: today,
    opening_cash,
    months: monthViews,
    rows,
    unplanned,
    short_month: short?.month ?? null,
    short_by: short ? Math.abs(short.closing) : 0,
    undated_obligations,
    verdict,
  };
}

/** One month opened up, in date order, with the balance running down.
 *
 *  What the monthly view cannot say: a month can end at Rp 50 juta and still
 *  be unable to pay on the 15th, because reading it by month assumes the money
 *  in arrives before the money out. This is where that assumption is tested
 *  (D115). */
export function cashMonthDetail(state: DemoState, month: string, now = new Date()): CashMonthDetail | null {
  const plan = cashPlan(state, now);
  const index = plan.months.findIndex((m) => m.month === month);
  if (index === -1) return null;
  const today = plan.generated_for;
  const view = plan.months[index];

  const opening = index === 0
    ? plan.opening_cash
    : plan.months[index - 1].closing;

  const events = plan.rows
    .flatMap((r) => r.cells[index].events)
    .filter((e) => e.state !== "SKIPPED")
    .sort((a, b) => a.date.localeCompare(b.date) || (b.direction === "IN" ? 1 : -1));

  let balance = opening;
  let low = opening;
  let low_date: string | null = null;
  let first_negative_date: string | null = null;

  const rows: CashDayRow[] = events.map((e) => {
    const is_past = view.is_current && (e.date < today || e.state === "PAID");
    /* What already happened is inside the opening figure; only what is still
       ahead moves the balance, and a part-paid run moves it by the rest. */
    const moves = is_past ? 0 : Math.max(e.planned - e.actual, 0);
    balance += e.direction === "IN" ? moves : -moves;
    if (balance < low) { low = balance; low_date = e.date; }
    if (balance < 0 && first_negative_date === null) first_negative_date = e.date;
    return { ...e, balance, is_past };
  });

  return {
    month,
    label: view.label,
    opening,
    closing: view.closing,
    rows,
    low_point: low,
    low_date,
    first_negative_date,
    undated_obligations: plan.undated_obligations,
  };
}

/** The reminder half: what falls due next, and what is already late. Built
 *  from the very same events as the month expansion, so the two cannot say
 *  different things (D116). */
export function cashDue(state: DemoState, now = new Date(), withinDays = 21): CashDue[] {
  const plan = cashPlan(state, now);
  const today = plan.generated_for;
  return plan.rows
    .flatMap((r) => r.cells.flatMap((c) => c.events))
    .filter((e) => e.state !== "SKIPPED" && e.state !== "PAID")
    .map((e) => ({ ...e, days_away: daysBetween(today, e.date) }))
    .filter((e) => e.days_away <= withinDays && e.days_away >= -90)
    .sort((a, b) => a.date.localeCompare(b.date));
}
