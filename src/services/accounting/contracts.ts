/** Accounting contracts — cut to `docs/plan/02-database.md`, schema `acct`. */

/* ------------------------------------------------------------------ */
/* Vocabulary — copied verbatim. Do not tidy the spelling.             */
/* ------------------------------------------------------------------ */

/** The five accounts, spelled exactly as production spells them. */
export const ACCOUNT_CODES = [
  "PETTY CASH",
  "BNI 325",
  "BCA 271",
  "BCA 064",
  "BCA USD 081",
] as const;
export type AccountCode = (typeof ACCOUNT_CODES)[number];

/** Accounting holds three and they pay vendors; leadership holds two and they
 *  never pay a vendor directly — money only enters them via a statement. */
export type AccountCustody = "accounting" | "leadership";

/** Thirteen types. `RECCURING` keeps its doubled C: it is the value in the
 *  data, and correcting the spelling here would simply fail to match. */
export const TRANSACTION_TYPE_CODES = [
  "RECCURING - UTILITIES",
  "CREDIT CARD",
  "PREPAID VENDOR",
  "SUPPLIERS",
  "BANK CHARGES",
  "ONLINE",
  "CHINA",
  "RECCURING - PAYROLL",
  "CASHFLOW",
  "OTHERS",
  "PRODUCTION",
  "OFFICE",
  "WAREHOUSE",
] as const;
export type TransactionTypeCode = (typeof TRANSACTION_TYPE_CODES)[number];

export type Direction = "IN" | "OUT";

/** VOID keeps the row and zeroes the amount with a reason (A5). */
export type TrxStatus = "POSTED" | "COMPLETED" | "UNTRACKED" | "VOID";

export type AllocMethod = "transfer" | "cash" | "other";

/** The exception road only (ADR-010). Everything with a known parent is
 *  attached from the record and never reaches this. */
export type InboxOrigin = "chat" | "web";
export type InboxStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ATTACHED"
  | "REJECTED"
  | "CANCELLED"
  | "NOTED";

export type StatementStatus = "PENDING" | "BOOKED" | "ABANDONED";

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export interface Account {
  id: string;
  code: AccountCode;
  name: string;
  custody: AccountCustody;
  is_paying: boolean;
  currency: string;
  opening_balance: number;
  opened_on: string;
  is_active: boolean;
}

export interface TransactionType {
  code: TransactionTypeCode;
  /** Vetoes auto-complete: goods that were bought can still be delivered. */
  is_purchase: boolean;
  /** Ships inert (D26). Fuel and utilities are marked complete by hand for
   *  now; turning the rule on later is a data change, not a code change. */
  auto_complete: boolean;
  creates_catalog_item: boolean;
}

export interface Transaction {
  id: string;
  trx_no: string;
  trx_date: string;
  account_id: string;
  direction: Direction;
  /** Always positive. Direction lives in its own column. Whole rupiah. */
  amount_idr: number;
  type_code: TransactionTypeCode;
  vendor_id: string | null;
  project_id: string | null;
  description: string;
  remark: string | null;
  status: TrxStatus;
  /** The idempotency claim. A repeat with the same ref is a no-op (A4). */
  source_ref: string;
  posted_by: string;
  posted_at: string;
  void_reason: string | null;
}

export interface TransactionLine {
  id: string;
  trx_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  qty: number | null;
  uom: string | null;
  unit_price: number | null;
  amount: number;
}

/** Owned by accounting; references the PR line by its public id, validated at
 *  the seam (ADR-004). Corrections supersede, never delete (A2). */
export interface PaymentAllocation {
  id: string;
  trx_id: string;
  pr_line_no: string | null;
  po_no: string | null;
  amount: number;
  method: AllocMethod;
  superseded_by: string | null;
  allocated_by: string;
  allocated_at: string;
}

export interface EvidenceInboxRow {
  id: string;
  ref_id: string;
  origin: InboxOrigin;
  status: InboxStatus;
  attachment_id: string;
  reported_by: string;
  reported_at: string;
  /** The AI's reading. A proposal, never a posting.
   *  Every field is nullable because "could not read it" is a real answer and
   *  a more useful one than a guess — low confidence leaves the field empty
   *  and asks, rather than filling it in hopefully. */
  extracted: {
    vendor_name?: string | null;
    document_date?: string | null;
    amount_idr?: number | null;
    doc_type?: string | null;
    confidence?: number | null;
    note?: string | null;
  };
  produced_trx_id: string | null;
  produced_pr_line_no: string | null;
  similar_trx_nos: string[];
  /** Which way the money went, when that is known from the document itself.
   *  Almost everything here is money going OUT — somebody bought first. A
   *  transfer proof from leadership is the other direction, and it is worth
   *  telling apart because the two are resolved by different people for
   *  different reasons (D81). */
  money_direction?: Direction | null;
}

/** Money already booked into a paying account, with whatever proof is on it.
 *
 *  The payment-round screen reads this instead of asking somebody to retype an
 *  amount the ledger already holds. `proof_attachment_id` is what a round
 *  needs before it can call itself funded (D80). */
export interface IncomingMoney {
  trx_no: string;
  trx_date: string;
  account_code: string;
  amount_idr: number;
  description: string;
  proof_attachment_id: string | null;
  proof_filename: string | null;
}

export interface BankStatement {
  id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  status: StatementStatus;
  attachment_id: string;
}

export interface StatementLine {
  id: string;
  statement_id: string;
  line_no: number;
  value_date: string;
  direction: Direction;
  amount_idr: number;
  raw_description: string;
  booked_trx_id: string | null;
}

/* ------------------------------------------------------------------ */
/* Derived views                                                       */
/* ------------------------------------------------------------------ */

export interface AccountBalance {
  account_id: string;
  code: AccountCode;
  name: string;
  custody: AccountCustody;
  is_paying: boolean;
  opening_balance: number;
  total_in: number;
  total_out: number;
  /** opening + in − out, excluding VOID. The database owns this number (D9);
   *  no screen recomputes it, and a screen that cannot load it shows an em
   *  dash rather than a substitute. */
  balance: number;
}

export interface TransactionView extends Transaction {
  account_code: AccountCode;
  vendor_name: string | null;
  allocated_total: number;
  /** amount − allocated. A transaction never funds more than it moved (A9). */
  unallocated: number;
  evidence_count: number;
  has_payment_proof: boolean;
  has_receipt_doc: boolean;
  pr_line_nos: string[];
}

export interface InboxHealth {
  week_start: string;
  arrived: number;
  unresolved: number;
  by_origin: Record<InboxOrigin, number>;
}
