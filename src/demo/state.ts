import type { Session, User, ModuleGrant, Authority } from "@/services/identity/contracts";
import type {
  Vendor, Uom, UomConversion, ItemCategory, Item, Project,
  PrDocument, PrLine, PrApproval, PaymentRound, PaymentRoundLine,
  Receipt, LineSettlement, PurchaseOrder, PoLine, PoScheduleTerm,
} from "@/services/procurement/contracts";
import type {
  Account, TransactionType, Transaction, TransactionLine,
  PaymentAllocation, EvidenceInboxRow,
} from "@/services/accounting/contracts";
import type { Attachment, AttachmentLink } from "@/services/documents/contracts";

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

  pr_documents: PrDocument[];
  pr_lines: PrLine[];
  pr_approvals: PrApproval[];
  payment_rounds: PaymentRound[];
  payment_round_lines: PaymentRoundLine[];
  receipts: Receipt[];
  line_settlements: LineSettlement[];

  purchase_orders: PurchaseOrder[];
  po_lines: PoLine[];
  po_schedule: PoScheduleTerm[];

  accounts: Account[];
  transaction_types: TransactionType[];
  transactions: Transaction[];
  transaction_lines: TransactionLine[];
  payment_allocations: PaymentAllocation[];
  evidence_inbox: EvidenceInboxRow[];

  attachments: Attachment[];
  attachment_links: AttachmentLink[];

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
