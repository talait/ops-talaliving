/** Procurement contracts — cut to `docs/plan/02-database.md`, schema `procure`.
 *
 *  Vocabulary here is copied verbatim from `00-context.md` §B. These strings
 *  are data, not prose: do not translate them, do not tidy the spelling.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** 18 units, exactly as the running system spells them. */
export const UNITS = [
  "pcs", "buah", "kg", "gr", "meter", "m2", "m3", "cm", "sak",
  "box", "roll", "set", "pack", "ltr", "lembar", "batang", "unit", "lusin",
] as const;
export type UomCode = (typeof UNITS)[number];

export type UomDimension = "count" | "mass" | "length" | "area" | "volume";
export type ItemKind = "goods" | "service";

export const PR_CATEGORIES = [
  "RAW MATERIAL", "MACHINING", "FINISHING", "SANDING", "PACKING", "OTHER",
] as const;
export type PrCategory = (typeof PR_CATEGORIES)[number];

export const FUND_CATEGORIES = [
  "PAYROLL", "RECURRING", "INVOICE", "TOPUP", "OFFICE", "WAREHOUSE", "OTHER",
] as const;

export type PrDocType = "PR" | "FUND";
export type PrDocStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CLOSED" | "CANCELLED";

/** The one ladder (D28). Eight values, resolved in the order given by
 *  `derive.lineStatus`. `HELD` and `REJECTED` are gone: an unchecked line
 *  stays in the queue exactly as HELD did, and an unwanted line is REMOVED. */
export const LINE_STATUSES = [
  "DRAFT",
  "WAITING FOR APPROVAL",
  "APPROVED",
  "WAITING FOR PAYMENT",
  "PAID",
  "PARTIAL",
  "COMPLETED",
  "REMOVED",
] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** No IT step (D20). */
export type ApprovalStep = "GOODS" | "FUNDS";
export type Channel = "web" | "chat" | "sheet" | "script" | "api";

export type RoundStatus = "OPEN" | "APPROVED" | "TRANSFERRED" | "CLOSED";

/** Seven conditions. Only GOOD, and the received part of PARTIALLY DAMAGED,
 *  count toward completion. The rest leave the line open (A18). */
export const RECEIPT_CONDITIONS = [
  "GOOD",
  "DAMAGED",
  "PARTIALLY DAMAGED",
  "MISSING PARTS",
  "WRONG ITEM",
  "RETURN TO SENDER",
  "WAITING FOR CONFIRMATION",
] as const;
export type ReceiptCondition = (typeof RECEIPT_CONDITIONS)[number];

export const COUNTING_CONDITIONS: ReceiptCondition[] = ["GOOD", "PARTIALLY DAMAGED"];
export const PROBLEM_CONDITIONS: ReceiptCondition[] = [
  "WRONG ITEM",
  "RETURN TO SENDER",
  "DAMAGED",
  "MISSING PARTS",
];

export type PoStatus = "DRAFT" | "ISSUED" | "CLOSED" | "CANCELLED";
export type PoPaymentState = "UNPAID" | "PARTIAL" | "SETTLED";
export type PoDeliveryState = "PENDING" | "PARTIAL" | "COMPLETE";
export type PoPaymentKind = "DP" | "PROGRESS" | "FINAL";
export type ScheduleBasis = "percent" | "amount";
export type DueRule = "on_issue" | "on_delivery" | "date";

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export interface Vendor {
  id: string;
  code: string;
  name: string;
  /** Spellings absorbed by a merge. They keep the extractor able to recognise
   *  what people actually write. */
  aka: string[];
  /** Set when this row was merged into another. The row is KEPT: every
   *  transaction that referenced it still does, so history does not move when
   *  a name is later corrected (D4). Readers follow the pointer. */
  merged_into?: string | null;
  /** false means RECORDED BUT NOT YET CURATED — visible in lists, absent from
   *  dropdowns. A name a human types is always accepted (owner, 2026-08-05). */
  is_curated: boolean;
  /** The company line. `pic_phone` is the person you actually call. */
  phone: string | null;
  address: string | null;
  /** Who to contact, by name. A vendor is a person before it is a company —
   *  "call Toko Amplas" is not an instruction anyone can follow. */
  pic_name: string | null;
  pic_phone: string | null;
  bank_account: string | null;
  /** Some vendors invoice from one account and collect on another. Paying into
   *  the wrong one is a week of chasing, so both are on record. */
  bank_account_secondary: string | null;
  npwp: string | null;
  /** What they say they supply. DECLARED, and therefore able to go stale — see
   *  `bought_categories` on the view for what we have actually bought. Useful
   *  precisely where history is silent: a vendor we have not ordered from yet. */
  supplied_categories: string[];
}

export interface Uom {
  code: UomCode;
  name: string;
  dimension: UomDimension;
}

export interface UomConversion {
  id: string;
  from_uom: UomCode;
  to_uom: UomCode;
  factor: number;
  /** null unless the conversion loses material — the wood chain lands here. */
  yield_ratio: number | null;
  note: string | null;
}

export interface ItemCategory {
  code: string;
  parent_code: string | null;
  name: string;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  aka: string[];
  merged_into?: string | null;
  category_code: string;
  base_uom: UomCode;
  kind: ItemKind;
  is_curated: boolean;
  /** Curated. Never written automatically. */
  standard_price: number | null;
  /** A hint, not a price list. Only ever moves forward in time. */
  last_price: number | null;
  last_vendor_id: string | null;
  last_purchased_at: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

/* ------------------------------------------------------------------ */
/* PR chain                                                            */
/* ------------------------------------------------------------------ */

/** A submission batch, not a subject.
 *
 *  A document records that these lines arrived together on a given day from a
 *  given person. It carries no purpose of its own, because a request can hold
 *  items for three different jobs from three different suppliers, and a single
 *  "purpose" on the container would have to be a lie about at least two of
 *  them (owner, 2026-09-11). What each item is for belongs to the item.
 */
export interface PrDocument {
  id: string;
  doc_no: string;
  doc_type: PrDocType;
  status: PrDocStatus;
  requested_by: string;
  project_id: string | null;
  created_at: string;
  submitted_at: string | null;
}

export interface PrLine {
  id: string;
  doc_id: string;
  line_no: number;
  /** `pr-26-09-10_01-L03` — generated, and what URLs and other systems use. */
  line_no_full: string;
  item_id: string | null;
  description: string;
  qty: number | null;
  uom: UomCode | null;
  unit_price: number | null;
  /** What was ASKED. Never zeroed to cancel a line (A5). */
  item_total: number;
  vendor_id: string | null;
  po_line_id: string | null;
  category: PrCategory | null;
  /** What this item is FOR, in the requester's words. The single most useful
   *  field on the line for whoever has to approve it: "2 pail lem putih" is a
   *  cost, "2 pail lem putih — laminating meja HOTEL UBUD" is a decision. */
  purpose: string | null;
  need_by: string | null;
  /** Removal is soft and audited (D29). Refused once money has reached it. */
  removed_at: string | null;
  removed_by: string | null;
}

/** A checkbox, not a vocabulary (D28). Append-only: every toggle is a row, so
 *  "approved 14:02, un-approved 14:09" stays legible. */
export interface PrApproval {
  id: string;
  line_id: string;
  step: ApprovalStep;
  approved: boolean;
  approved_qty: number | null;
  /** May be reduced below what was requested, never raised (A8). */
  approved_amount: number | null;
  recorded_by: string;
  recorded_by_email: string;
  recorded_at: string;
  channel: Channel;
}

/** Leadership's own words on a line, kept apart from the decision.
 *
 *  Two fields, because they are two different acts. `instructions` is
 *  something the requester is expected to DO — "negotiate first", "buy the
 *  smaller pack", "use the Denpasar supplier this time". `remark` is a note
 *  for the record — why the amount was cut, what to watch next month.
 *
 *  They are not columns on the approval row on purpose: a note can be left on
 *  a line nobody has decided yet, which is exactly when "get another quote"
 *  is worth saying. Append-only, like every other statement here.
 */
export interface LineNote {
  id: string;
  line_id: string;
  instructions: string | null;
  remark: string | null;
  recorded_by: string;
  recorded_by_email: string;
  recorded_at: string;
}

/** An approval asked for through a channel that knows who answers.
 *
 *  The problem this exists for: a leadership meeting runs on whoever's laptop
 *  is open. If procurement ticks the box while the CEO says yes across the
 *  table, the record says procurement approved it — which is false, and it is
 *  false in the one place the whole system is supposed to be trustworthy.
 *
 *  So the yes leaves the room: the line is sent to the approver in Google
 *  Chat, they answer there, and the identity on the record comes from the
 *  chat platform's own authentication rather than from whoever is logged in
 *  here (D69). The metadata then reads what actually happened —
 *  `chat · evin@talaliving.com · 14:00`.
 *
 *  `token` identifies the REQUEST, never the person. In Phase 2 the answer
 *  arrives as a signed webhook from Google and the identity comes from that
 *  signature; a token that carried an identity would be a password anybody
 *  who saw the card could reuse.
 */
export interface ApprovalRequest {
  id: string;
  line_id: string;
  /** The send this line went out in. Approval is asked for in batches because
   *  that is how a meeting works — a list, a total, and one answer session
   *  (D70). */
  batch_id: string;
  token: string;
  /** Whose yes this is. The request is addressed, not broadcast. */
  sent_to: string;
  sent_to_email: string;
  /** Whoever pressed send — usually not the approver. Kept because "who
   *  chased this" is a different question from "who decided it". */
  sent_by: string;
  sent_by_email: string;
  sent_at: string;
  channel: Channel;
  answered_at: string | null;
  outcome: "approved" | "declined" | null;
}

/** One card as the approver sees it in chat: the line, and enough of it to
 *  decide without opening anything. */
export interface ApprovalRequestView extends ApprovalRequest {
  line_no_full: string;
  description: string;
  purpose: string | null;
  qty: number | null;
  uom: UomCode | null;
  unit_price: number | null;
  item_total: number;
  vendor_name: string | null;
  requested_by_name: string;
  project_code: string | null;
  /** True once the line has been decided by any route — the card is stale and
   *  the screen says so rather than offering a button that will 409. */
  line_decided: boolean;
  /** What the approver settled on, once they have. */
  approved_amount: number | null;
  /** Approved minus what has already reached this line. The number that has
   *  to leave the bank if this is said yes to — not the same as the amount
   *  approved, because part of it may already have been paid. */
  to_pay: number;
}

/** One transfer into the paying account against one round.
 *
 *  A round is funded in parts more often than not — leadership sends half on
 *  Monday and the rest when a client pays — so the record is a list, not a
 *  single amount. Each instalment carries its own proof, because each is its
 *  own claim about the bank (D80, D82).
 */
export interface RoundTransfer {
  id: string;
  round_id: string;
  amount: number;
  trx_no: string;
  proof_attachment_id: string;
  recorded_by: string;
  recorded_by_email: string;
  recorded_at: string;
}

/** One send: the list, and the three totals a person needs to answer it.
 *
 *  A card per line would ask the approver to add up fifteen numbers in their
 *  head to know what they have just committed the company to. The batch says
 *  it: this much asked, this much approved so far, this much has to be paid
 *  (D70).
 */
export interface ApprovalBatch {
  id: string;
  batch_no: string;
  token: string;
  sent_to: string;
  sent_to_email: string;
  sent_by: string;
  sent_by_email: string;
  sent_at: string;
  channel: Channel;
}

export interface ApprovalBatchView extends ApprovalBatch {
  items: ApprovalRequestView[];
  /** Every item as asked. */
  requested_total: number;
  /** Only the ones said yes to. */
  approved_total: number;
  /** Approved, minus whatever already reached those lines. */
  to_pay_total: number;
  answered: number;
  pending: number;
}

export interface PaymentRound {
  id: string;
  round_no: string;
  status: RoundStatus;
  opened_at: string;
  approved_by: string | null;
  approved_at: string | null;
  /* What was transferred does not live here: a round is funded in as many
   * instalments as it takes, so the record is the list of them (D82). */
  closed_by: string | null;
  closed_at: string | null;
}

export interface PaymentRoundLine {
  id: string;
  round_id: string;
  line_id: string;
  /** Frozen when the round is approved — the record of a decision. */
  requested_amount: number;
}

export interface Receipt {
  id: string;
  receipt_no: string;
  /** Exactly one of these two is set. */
  line_id: string | null;
  po_line_id: string | null;
  qty_received: number;
  condition: ReceiptCondition;
  received_by: string;
  received_at: string;
  qc_by: string | null;
  note: string | null;
}

export interface LineSettlement {
  id: string;
  line_id: string;
  shortfall: number;
  /** Mandatory. A named human decision, never a silent tolerance (A12). */
  reason: string;
  decided_by: string;
  decided_at: string;
}

/* ------------------------------------------------------------------ */
/* PO                                                                  */
/* ------------------------------------------------------------------ */

export interface PurchaseOrder {
  id: string;
  po_no: string;
  vendor_id: string;
  status: PoStatus;
  created_at: string;
  issued_at: string | null;
  issued_by: string | null;
  note: string | null;
}

export interface PoLine {
  id: string;
  po_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  qty: number;
  uom: UomCode;
  unit_price: number;
  line_total: number;
  superseded_by: string | null;
}

export interface PoScheduleTerm {
  id: string;
  po_id: string;
  term_no: string;
  kind: PoPaymentKind;
  basis: ScheduleBasis;
  basis_value: number;
  due_rule: DueRule;
  due_date: string | null;
}

/* ------------------------------------------------------------------ */
/* Derived views — computed on read, never stored (A3)                 */
/* ------------------------------------------------------------------ */

export interface LineCoverage {
  line_id: string;
  approved: number;
  covered: number;
  remaining: number;
  settled: boolean;
}

export interface PoStatusView {
  po_id: string;
  contract_value: number;
  paid_to_date: number;
  outstanding: number;
  value_received: number;
  /** paid − received. Positive means we are carrying the vendor's risk. */
  exposure: number;
  payment_state: PoPaymentState;
  delivery_state: PoDeliveryState;
}

/** One PO line, as the vendor journey reads it: what was ordered, what has
 *  arrived, and in what condition. */
export interface PoLineJourney {
  po_line_id: string;
  description: string;
  qty: number;
  uom: UomCode;
  unit_price: number;
  line_total: number;
  received: number;
  /** received − ordered when the vendor sent more than was asked for. Kept
   *  visible rather than trimmed: two extra sheets are a credit, not a
   *  rounding error (D98). */
  over: number;
  condition: "GOOD" | "OVER" | "NOT ARRIVED" | "PARTIAL" | "PROBLEM";
  receipts: {
    receipt_no: string;
    qty: number;
    condition: ReceiptCondition;
    at: string;
    /** Who took delivery, and who checked it — two people, or the same one
     *  named twice. A delivery accepted and checked by nobody in particular is
     *  the one nobody can ask about later (D101). */
    by: string;
    qc_by: string;
    note: string | null;
    /** Both halves of the evidence, tracked separately: the photo of what
     *  arrived, and the signed tanda terima. */
    has_photo: boolean;
    has_delivery_note: boolean;
  }[];
}

/** One order, with both axes: what was paid and what arrived, never merged. */
export interface PoJourney {
  po_no: string;
  status: PoStatus;
  issued_at: string | null;
  note: string | null;
  dp_percent: number | null;
  contract_value: number;
  paid: number;
  value_received: number;
  /** What could honestly be invoiced today: the deposit share once the order
   *  is issued, plus the delivered share of everything else, minus what has
   *  already been paid. Never negative — an overpayment is a different
   *  conversation, and this number's only job is "what is safe to ask for
   *  next" (D99). */
  billable_now: number;
  /** Priced over-delivery: what the vendor sent beyond the order. A credit
   *  with them, never billable and never ours to spend (D98). */
  credit: number;
  payment_state: PoPaymentState;
  delivery_state: PoDeliveryState;
  lines: PoLineJourney[];
}

/** Everything one vendor has going with us, in one block.
 *
 *  The question this answers is the one nobody could answer from the sheet:
 *  *where are we with this supplier* — how much is contracted, how much has
 *  been paid, what has actually arrived, and what they could invoice next. A
 *  vendor with three open orders and one transfer covering all three cannot be
 *  read order by order (D97).
 */
export interface VendorJourney {
  vendor_id: string;
  vendor_name: string;
  orders: number;
  contract_value: number;
  paid: number;
  outstanding: number;
  value_received: number;
  billable_now: number;
  credit: number;
  /** One sentence a person can act on, rather than four numbers to compare. */
  headline: string;
  pos: PoJourney[];
}

export interface RoundSummary {
  round_id: string;
  round_no: string;
  status: RoundStatus;
  requested_total: number;
  /** Every instalment that has landed, and what they add up to. A funded
   *  round still pays nobody (A10). */
  transfers: RoundTransfer[];
  transferred_total: number;
  /** Requested, less what has actually been transferred in. Zero once the
   *  round is fully funded; positive while instalments are still owed. */
  transfer_shortfall: number;
  paying_balance: number;
  to_transfer: number;
  remaining_after_payment: number;
  line_count: number;
}

/** What the approval queue and the PR list hand a screen: the line, plus
 *  everything derived from it, in one object so nothing is recomputed twice. */
/** The four states a leadership meeting sorts by — and the reason the middle
 *  two are kept apart rather than merged into "in progress".
 *
 *  `paid_unapproved` is the one that matters: money left before anyone said
 *  yes. Folding it in with the others is precisely how that used to stay
 *  invisible (A1, and the recap's own meeting board).
 */
export type MeetingState =
  | "settled"          // approved and paid
  | "approved_unpaid"  // said yes, money has not moved
  | "paid_unapproved"  // money moved, nobody said yes
  | "neither";         // still just a request

export const MEETING_STATE_LABEL: Record<MeetingState, string> = {
  /* "Approved and paid", not "Settled": the quadrant answers two questions and
     neither of them is whether the line is finished. A line can be approved
     and paid and still be Rp 580.000 short. */
  settled: "Approved and paid",
  approved_unpaid: "Approved, not paid",
  paid_unapproved: "Paid, not approved",
  neither: "Waiting for approval",
};

/** Why the money that moved is not the money that was approved.
 *
 *  A closed list rather than free text, for one reason: a single Rp 200,000
 *  difference is noise, and no application can tell you whether it was a typo
 *  or carelessness. Twelve of them tagged `price_changed` against the same
 *  vendor is a supplier who quotes badly; six tagged `input_error` from the
 *  same person is a training problem. The app cannot judge one event — it can
 *  count the kinds, and that is what makes the question answerable.
 */
export const VARIANCE_REASONS = [
  "price_changed",
  "quantity_changed",
  "rounding",
  "input_error",
  "partial_payment",
  "overpaid",
  "other",
] as const;
export type VarianceReason = (typeof VARIANCE_REASONS)[number];

export const VARIANCE_REASON_LABEL: Record<VarianceReason, string> = {
  price_changed: "Vendor price differed from the quote",
  quantity_changed: "A different quantity was taken",
  rounding: "Transfer was rounded",
  input_error: "An amount was entered wrongly",
  partial_payment: "Paid in parts — more to come",
  overpaid: "Overpaid — the vendor owes us",
  other: "Something else",
};

/** Append-only. An explanation is a statement somebody made on a date, and
 *  correcting it means making a new one, not editing the old. */
export interface LineVariance {
  id: string;
  line_id: string;
  reason: VarianceReason;
  note: string | null;
  /** The gap at the moment it was explained — kept, so a later payment does
   *  not silently rewrite what was being explained. */
  amount_at_time: number;
  recorded_by: string;
  recorded_by_email: string;
  recorded_at: string;
}

export type VarianceKind = "none" | "under" | "over";

export interface VarianceView {
  requested: number;
  approved: number;
  paid: number;
  /** paid − approved. Negative means less money moved than was authorised. */
  delta: number;
  kind: VarianceKind;
  /** Below the rounding tolerance this is not a variance, it is arithmetic. */
  material: boolean;
  explanation: LineVariance | null;
}

/** One purchase fact, from wherever it can be found. The single derivation
 *  behind both directions of the question: what do we buy from this vendor,
 *  and who do we buy this item from. */
export interface PurchaseFact {
  item_id: string;
  item_name: string;
  category_code: string;
  vendor_id: string;
  vendor_name: string;
  unit_price: number | null;
  uom: string | null;
  date: string;
  source: "pr" | "ledger";
}

export interface CategoryCount {
  code: string;
  name: string;
  count: number;
}

export interface VendorItemSummary {
  item_id: string;
  item_name: string;
  last_price: number | null;
  uom: string | null;
  last_date: string;
  times: number;
}

/** A vendor with what we have actually bought from it. */
export interface VendorView extends Vendor {
  /** `supplied_categories` resolved to their display names. */
  supplied_category_names: string[];
  transaction_count: number;
  total_spend: number;
  last_purchase: string | null;
  open_pr_lines: number;
  absorbed: Vendor[];
  /** Derived from purchase history, so it cannot go stale. */
  bought_categories: CategoryCount[];
  items_bought: VendorItemSummary[];
}

/** Who we buy an item from, newest first. This is the answer to "we need
 *  thinner — where do we get it?", and it is derived rather than maintained. */
export interface ItemSource {
  vendor_id: string;
  vendor_name: string;
  is_curated: boolean;
  pic_name: string | null;
  pic_phone: string | null;
  last_price: number | null;
  uom: string | null;
  last_date: string;
  times: number;
}

export interface ItemView extends Item {
  category_name: string;
  last_vendor_name: string | null;
  sourced_from: ItemSource[];
  /** What a form would prefill: the curated price if there is one, otherwise
   *  the last price paid. A hint, never a price list. */
  suggested_price: number | null;
  purchase_count: number;
}

export interface PrLineView extends PrLine {
  status: LineStatus;
  meeting_state: MeetingState;
  requested_by_name: string;
  project_code: string | null;
  submitted_at: string | null;
  evidence_count: number;
  has_payment_proof: boolean;
  variance: VarianceView;
  /** The latest word from leadership, if there is one. */
  note: LineNote | null;
  /** Sent to the approver and not answered yet. */
  pending_request: ApprovalRequest | null;
  /** The ledger rows that funded this line, by public id. */
  trx_nos: string[];
  coverage: LineCoverage;
  approval: PrApproval | null;
  doc_no: string;
  vendor_name: string | null;
  item_name: string | null;
  received_qty: number;
  has_problem_receipt: boolean;
}
