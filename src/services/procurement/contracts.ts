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

export interface PrDocument {
  id: string;
  doc_no: string;
  doc_type: PrDocType;
  status: PrDocStatus;
  requested_by: string;
  project_id: string | null;
  purpose: string | null;
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

export interface PaymentRound {
  id: string;
  round_no: string;
  status: RoundStatus;
  opened_at: string;
  approved_by: string | null;
  approved_at: string | null;
  transferred_amount: number | null;
  transferred_trx_no: string | null;
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

export interface RoundSummary {
  round_id: string;
  round_no: string;
  status: RoundStatus;
  requested_total: number;
  paying_balance: number;
  to_transfer: number;
  remaining_after_payment: number;
  line_count: number;
}

/** What the approval queue and the PR list hand a screen: the line, plus
 *  everything derived from it, in one object so nothing is recomputed twice. */
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
  coverage: LineCoverage;
  approval: PrApproval | null;
  doc_no: string;
  vendor_name: string | null;
  item_name: string | null;
  received_qty: number;
  has_problem_receipt: boolean;
}
