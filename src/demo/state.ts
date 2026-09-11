import type { Session, User, ModuleGrant, Authority } from "@/services/identity/contracts";
import type {
  Vendor, Uom, UomConversion, ItemCategory, Item, Project, ProjectLine,
  PrDocument, PrLine, PrApproval, PaymentRound, PaymentRoundLine,
  Receipt, LineSettlement, PurchaseOrder, PoLine, PoScheduleTerm, LineVariance,
  LineNote, ApprovalRequest, ApprovalBatch, RoundTransfer,
} from "@/services/procurement/contracts";
import type {
  Account, TransactionType, Transaction, TransactionLine,
  PaymentAllocation, EvidenceInboxRow,
  CashComponent, CashOverride, CashSettlement,
} from "@/services/accounting/contracts";
import type { Attachment, AttachmentLink } from "@/services/documents/contracts";
import type { LogPurchase, LogPiece, SawnBoard } from "@/services/inventory/contracts";
import type {
  Employee, AttendanceScan, DayMark, OvertimeSheet, OvertimeLine, PayrollRun,
  PayrollAdjustment,
} from "@/services/hr/contracts";
import type {
  WorkOrder, ProgressEntry, Product, BomComponent,
} from "@/services/production/contracts";

export interface DemoUser extends User {
  modules: ModuleGrant[];
  authorities: Authority[];
}

/** One audit row per mutation, always. Business rows and their audit row are
 *  written together or not at all (`03-api.md`). */
export interface AuditRow {
  id: string;
  at: string;
  actor_id: string;
  actor_email: string;
  service: string;
  entity: string;
  entity_no: string;
  action: string;
  outcome: "ok" | "refused" | "duplicate" | "noop";
  reason: string | null;
  /** What actually changed, field by field, for the rows where that matters.
   *  A ledger entry says who and when either way; anomaly and fraud questions
   *  need *what* — the amount before and after, the account it moved to, the
   *  document that arrived with it (D84). */
  detail?: Record<string, unknown> | null;
}

/** The third-party seam (ADR-008). Written on every domain event; in Phase 1
 *  nothing subscribes, which is the point — the seam exists before it is
 *  needed, so a Chat bot never needs a second write path. */
export interface OutboxRow {
  id: string;
  service: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  delivered_at: string | null;
}

export interface DemoState {
  /** Which demo user is acting. Phase 2 reads this from Supabase Auth. */
  session_user_id: string;

  users: DemoUser[];

  vendors: Vendor[];
  uom: Uom[];
  uom_conversions: UomConversion[];
  item_categories: ItemCategory[];
  items: Item[];
  projects: Project[];
  /** What the customer actually ordered, line by line (D150). */
  project_lines: ProjectLine[];

  pr_documents: PrDocument[];
  pr_lines: PrLine[];
  pr_approvals: PrApproval[];
  payment_rounds: PaymentRound[];
  payment_round_lines: PaymentRoundLine[];
  receipts: Receipt[];
  line_settlements: LineSettlement[];
  line_notes: LineNote[];
  approval_requests: ApprovalRequest[];
  round_transfers: RoundTransfer[];
  approval_batches: ApprovalBatch[];
  line_variances: LineVariance[];

  purchase_orders: PurchaseOrder[];
  po_lines: PoLine[];
  po_schedule: PoScheduleTerm[];

  accounts: Account[];
  transaction_types: TransactionType[];
  transactions: Transaction[];
  transaction_lines: TransactionLine[];
  payment_allocations: PaymentAllocation[];
  evidence_inbox: EvidenceInboxRow[];

  /** The payment calendar: what repeats, what changed in one month, and which
   *  ledger row somebody says settled it. */
  cash_components: CashComponent[];
  cash_overrides: CashOverride[];
  cash_settlements: CashSettlement[];

  attachments: Attachment[];
  attachment_links: AttachmentLink[];

  /** HR. Payroll lines are derived on read from attendance and approved
   *  overtime, never stored — a stored figure is one that can disagree with
   *  the days behind it (A3). */
  employees: Employee[];
  /** One row per tap on the reader. The day is derived (D141). */
  attendance_scans: AttendanceScan[];
  /** What HRD says about a day that no reader can know (D142). */
  day_marks: DayMark[];
  /** Overtime is a sheet with lines on it — one night, many names for
   *  production, one session for staff (D146). */
  overtime_sheets: OvertimeSheet[];
  overtime_lines: OvertimeLine[];
  payroll_runs: PayrollRun[];
  /** Added or taken off a payslip by a person, with a reason (D155). */
  payroll_adjustments: PayrollAdjustment[];

  /* --- production ------------------------------------------------- */
  /** What is being made, in what quantity, by when (D148). */
  work_orders: WorkOrder[];
  /** Work done, append-only — a correction is a negative entry (A5). */
  production_progress: ProgressEntry[];
  /** What we sell and make, and what each one is made of (D149). */
  products: Product[];
  bom_components: BomComponent[];

  /* --- inventory: timber ------------------------------------------- */
  /** Logs are bought by the load and used as boards — two quantities with a
   *  saw between them (D153). */
  log_purchases: LogPurchase[];
  log_pieces: LogPiece[];
  sawn_boards: SawnBoard[];

  audit_log: AuditRow[];
  outbox: OutboxRow[];

  /** The `core.doc_numbers` table: prefix + office day -> sequence.
   *  The database mints every identifier (ADR-005), and here the store is the
   *  database. One counter, no collision loop. */
  doc_numbers: Record<string, number>;

  /** `(service:endpoint:key)` -> the first response. A replay returns it
   *  unchanged, marked `duplicate`. */
  idempotency: Record<string, unknown>;
}

export type SessionView = Session;
