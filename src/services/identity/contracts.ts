/** Identity contracts — cut to `docs/plan/02-database.md`, schema `core`.
 *
 *  Field names are snake_case on purpose: in Phase 2 these types are replaced
 *  by `supabase gen types typescript`, and the names have to match already or
 *  the swap stops being a swap.
 *
 *  Ids are `string` here and `uuid` in Phase 2. The demo uses readable ids so
 *  fixtures can be read by a human.
 */

/** Access is two separate things (D22–D24). Modules say which screens open. */
export type ModuleName =
  | "procurement"
  | "accounting"
  | "hrd"
  | "inventory"
  | "production"
  | "it";

export type ModuleLevel = "read" | "write" | "admin";

/** Authorities say which decisions you may take. Granted on their own, never
 *  implied by a module level — fusing the two is how `john-lau` ended up
 *  showing a confirm button the bridge then refused. */
export type Authority =
  | "approve_goods"
  | "approve_funds"
  | "post_ledger"
  | "resolve_inbox";

export const MODULES: ModuleName[] = [
  "procurement",
  "accounting",
  "hrd",
  "inventory",
  "production",
  "it",
];

export const AUTHORITIES: Authority[] = [
  "approve_goods",
  "approve_funds",
  "post_ledger",
  "resolve_inbox",
];

export const AUTHORITY_LABEL: Record<Authority, string> = {
  approve_goods: "Approve goods (CEO)",
  approve_funds: "Approve funds",
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

export function grantsPermission(
  modules: ModuleGrant[],
  code: string | undefined,
): boolean {
  if (!code) return true;
  const [mod, action] = code.split(".");
  const grant = modules.find((m) => m.module === mod);
  if (!grant) return false;
  if (grant.level === "admin") return true;
  if (grant.level === "write") return action !== "manage_users" && action !== "manage_roles";
  return action === "read";
}

export function expandPermissions(modules: ModuleGrant[]): string[] {
  const out: string[] = [];
  for (const g of modules) {
    out.push(`${g.module}.read`);
    if (g.level === "write" || g.level === "admin") {
      out.push(`${g.module}.create`, `${g.module}.update`);
    }
    if (g.level === "admin") out.push(`${g.module}.manage_users`, `${g.module}.manage_roles`);
  }
  return out;
}
