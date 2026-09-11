/** Identity contracts — cut to `docs/plan/02-database.md`, schema `core`.
 *
 *  Field names are snake_case on purpose: in Phase 2 these types are replaced
 *  by `supabase gen types typescript`, and the names have to match already or
 *  the swap stops being a swap.
 *
 *  Ids are `string` here and `uuid` in Phase 2. The demo uses readable ids so
 *  fixtures can be read by a human.
 */

/** Access is two separate things (D22–D24). Modules say which screens open.
 *
 *  This union is the definition; `src/lib/roles.ts` types its catalogue against
 *  it, so the two cannot drift without a compile error. In Phase 2 it becomes a
 *  Postgres enum and this file is generated from it. */
export type ModuleName =
  | "dashboard"
  | "hrd"
  | "payroll"
  | "procurement"
  | "inventory"
  | "accounting"
  | "marketing"
  | "project"
  | "production"
  | "it"
  | "settings";

export type ModuleLevel = "read" | "write" | "admin";

/** Authorities say which decisions you may take. Granted on their own, never
 *  implied by a module level — fusing the two is how `john-lau` ended up
 *  showing a confirm button the bridge then refused. */
export type Authority =
  | "approve_goods"
  | "approve_funds"
  /** Leadership's yes to overtime, after HRD has checked the hours and the
   *  surat lembur is attached (D145). Its own authority rather than a reuse of
   *  `approve_goods`: approving that a table arrived and approving that a man
   *  is paid for four extra hours are different decisions, and the people who
   *  should hold them will not always be the same. */
  | "approve_overtime"
  | "post_ledger"
  | "resolve_inbox";

export const MODULES: ModuleName[] = [
  "dashboard", "hrd", "payroll", "procurement", "inventory", "accounting",
  "marketing", "project", "production", "it", "settings",
];

export const MODULE_LABEL: Record<ModuleName, string> = {
  dashboard: "Dashboard",
  hrd: "HR",
  payroll: "Payroll",
  procurement: "Procurement",
  inventory: "Inventory",
  accounting: "Accounting",
  marketing: "Marketing",
  project: "Projects",
  production: "Production",
  it: "IT",
  settings: "Settings",
};

export const AUTHORITIES: Authority[] = [
  "approve_goods",
  "approve_funds",
  "approve_overtime",
  "post_ledger",
  "resolve_inbox",
];

export const AUTHORITY_LABEL: Record<Authority, string> = {
  approve_goods: "Approve goods (CEO)",
  approve_funds: "Approve funds",
  approve_overtime: "Approve overtime (leadership)",
  post_ledger: "Post to the ledger",
  resolve_inbox: "Resolve unparented documents",
};

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface ModuleGrant {
  module: ModuleName;
  level: ModuleLevel;
}

export interface UserAccess {
  user: User;
  modules: ModuleGrant[];
  authorities: Authority[];
}

/** What `GET /identity/me` returns. `permissions` is the flattened union the
 *  frontend `can()` reads — derived, never stored. */
export interface Session extends UserAccess {
  permissions: string[];
}

/* Permission expansion lives in `src/lib/roles.ts`, which owns the catalogue
 * of what each module actually offers. Keeping it there means the list a human
 * reviews and the list the code expands are the same list. */
