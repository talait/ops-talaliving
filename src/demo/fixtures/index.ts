import type { DemoState } from "../state";
import {
  USERS, ACCOUNTS, TRANSACTION_TYPES, UOM, UOM_CONVERSIONS,
  ITEM_CATEGORIES, ITEMS, PROJECTS, VENDORS,
} from "./reference";
import {
  PR_DOCUMENTS, PR_LINES, PR_APPROVALS, PAYMENT_ROUNDS, PAYMENT_ROUND_LINES,
  RECEIPTS, PURCHASE_ORDERS, PO_LINES, PO_SCHEDULE,
} from "./pr";
import {
  TRANSACTIONS, TRANSACTION_LINES, PAYMENT_ALLOCATIONS, EVIDENCE_INBOX,
} from "./ledger";
import { ATTACHMENTS, ATTACHMENT_LINKS } from "./documents";

export * from "./reference";

/** A fresh sandbox. `Reset demo data` rebuilds from here, so this function
 *  must never return shared references — every caller gets its own copy. */
export function initialState(): DemoState {
  return structuredClone({
    session_user_id: "usr_putri",

    users: USERS,
    vendors: VENDORS,
    uom: UOM,
    uom_conversions: UOM_CONVERSIONS,
    item_categories: ITEM_CATEGORIES,
    items: ITEMS,
    projects: PROJECTS,

    pr_documents: PR_DOCUMENTS,
    pr_lines: PR_LINES,
    pr_approvals: PR_APPROVALS,
    payment_rounds: PAYMENT_ROUNDS,
    payment_round_lines: PAYMENT_ROUND_LINES,
    receipts: RECEIPTS,
    line_settlements: [],

    purchase_orders: PURCHASE_ORDERS,
    po_lines: PO_LINES,
    po_schedule: PO_SCHEDULE,

    accounts: ACCOUNTS,
    transaction_types: TRANSACTION_TYPES,
    transactions: TRANSACTIONS,
    transaction_lines: TRANSACTION_LINES,
    payment_allocations: PAYMENT_ALLOCATIONS,
    evidence_inbox: EVIDENCE_INBOX,

    attachments: ATTACHMENTS,
    attachment_links: ATTACHMENT_LINKS,

    audit_log: [],
    outbox: [],

    /* Seeded past the fixtures so a newly minted number never collides with
     * one already in the data. */
    doc_numbers: {
      "pr:2026-09-10": 2,
      "trx:2026-09-09": 2,
      "pay:2026-09-09": 1,
      "po:2026-09-09": 1,
    },
    idempotency: {},
  } satisfies DemoState);
}
