import type { DemoState } from "../state";
import {
  USERS, ACCOUNTS, TRANSACTION_TYPES, UOM, UOM_CONVERSIONS,
  ITEM_CATEGORIES, ITEMS, PROJECTS, PROJECT_LINES, VENDORS,
} from "./reference";
import {
  PR_DOCUMENTS, PR_LINES, PR_APPROVALS, PAYMENT_ROUNDS, PAYMENT_ROUND_LINES,
  RECEIPTS, PURCHASE_ORDERS, PO_LINES, PO_SCHEDULE, ROUND_TRANSFERS,
  LINE_VARIANCES, LINE_SETTLEMENTS, LINE_NOTES, APPROVAL_REQUESTS, APPROVAL_BATCHES,
} from "./pr";
import {
  TRANSACTIONS, TRANSACTION_LINES, PAYMENT_ALLOCATIONS, EVIDENCE_INBOX,
} from "./ledger";
import { ATTACHMENTS, ATTACHMENT_LINKS } from "./documents";
import { CASH_COMPONENTS, CASH_OVERRIDES, CASH_SETTLEMENTS } from "./cash";
import {
  EMPLOYEES, ATTENDANCE_SCANS, DAY_MARKS, OVERTIME_SHEETS, OVERTIME_LINES,
  PAYROLL_RUNS, PAYROLL_ADJUSTMENTS,
} from "./hr";
import { WORK_ORDERS, PRODUCTION_PROGRESS } from "./production";
import { PRODUCTS, BOM_COMPONENTS } from "./products";
import { LOG_PURCHASES, LOG_PIECES, SAWN_BOARDS } from "./timber";

export * from "./reference";

/** A fresh sandbox. `Reset demo data` rebuilds from here, so this function
 *  must never return shared references — every caller gets its own copy. */
/** A fingerprint of the shape and the reference data.
 *
 *  The sandbox is kept in `localStorage`, and a saved snapshot from before a
 *  change quietly wins over the fixtures — which is how a newly added account
 *  can be in the code and absent from the screen (F24). Anything that changes
 *  the tables, the accounts or the people invalidates what is stored, so the
 *  demo starts from the fixtures again rather than from a shape that no longer
 *  exists.
 */
/** Bumped by hand whenever the fixtures change in a way a saved sandbox would
 *  hide. Counting rows cannot do this job: a visitor who records one delivery
 *  changes every count, and their own work is exactly what the snapshot is
 *  for. A version somebody types when they edit the fixtures separates "the
 *  demo data moved" from "somebody used the demo". */
export const FIXTURE_VERSION = "2026-09-11.15";

export function stateSignature(state: DemoState): string {
  return [
    FIXTURE_VERSION,
    Object.keys(state).sort().join(","),
    state.accounts.map((a) => a.code).join(","),
    state.users.map((u) => u.email).join(","),
    state.transaction_types.map((t) => t.code).join(","),
  ].join("|");
}

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
    project_lines: PROJECT_LINES,

    pr_documents: PR_DOCUMENTS,
    pr_lines: PR_LINES,
    pr_approvals: PR_APPROVALS,
    payment_rounds: PAYMENT_ROUNDS,
    payment_round_lines: PAYMENT_ROUND_LINES,
    receipts: RECEIPTS,
    line_settlements: LINE_SETTLEMENTS,
    line_notes: LINE_NOTES,
    approval_requests: APPROVAL_REQUESTS,
    approval_batches: APPROVAL_BATCHES,
    round_transfers: ROUND_TRANSFERS,
    line_variances: LINE_VARIANCES,

    purchase_orders: PURCHASE_ORDERS,
    po_lines: PO_LINES,
    po_schedule: PO_SCHEDULE,

    accounts: ACCOUNTS,
    transaction_types: TRANSACTION_TYPES,
    transactions: TRANSACTIONS,
    transaction_lines: TRANSACTION_LINES,
    payment_allocations: PAYMENT_ALLOCATIONS,
    evidence_inbox: EVIDENCE_INBOX,

    cash_components: CASH_COMPONENTS,
    cash_overrides: CASH_OVERRIDES,
    cash_settlements: CASH_SETTLEMENTS,

    employees: EMPLOYEES,
    attendance_scans: ATTENDANCE_SCANS,
    day_marks: DAY_MARKS,
    overtime_sheets: OVERTIME_SHEETS,
    overtime_lines: OVERTIME_LINES,
    payroll_runs: PAYROLL_RUNS,
    payroll_adjustments: PAYROLL_ADJUSTMENTS,

    work_orders: WORK_ORDERS,
    production_progress: PRODUCTION_PROGRESS,
    products: PRODUCTS,
    bom_components: BOM_COMPONENTS,

    log_purchases: LOG_PURCHASES,
    log_pieces: LOG_PIECES,
    sawn_boards: SAWN_BOARDS,

    attachments: ATTACHMENTS,
    attachment_links: ATTACHMENT_LINKS,

    audit_log: [],
    outbox: [],

    /* Seeded past the fixtures so a newly minted number never collides with
     * one already in the data. */
    doc_numbers: {
      "pr:2026-09-10": 2,
      "ask:2026-09-10": 1,
      "trx:2026-09-09": 2,
      "pay:2026-09-09": 1,
      "po:2026-09-09": 1,
    },
    idempotency: {},
  } satisfies DemoState);
}
