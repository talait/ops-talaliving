/** Implements `/api/v1/identity` from `03-api.md`. */
import { ok, notFound, type Result } from "@/services/_shared/envelope";
import {
  expandPermissions, type Session, type Authority, type ModuleName, type ModuleLevel,
} from "@/services/identity/contracts";
import { getState, apply, writeAudit } from "../store";
import type { DemoUser } from "../state";
import { latency, actingUser } from "./_kit";

const SERVICE = "identity" as const;

function toSession(user: DemoUser): Session {
  return {
    user: { id: user.id, email: user.email, full_name: user.full_name, is_active: user.is_active },
    modules: user.modules,
    authorities: user.authorities,
    permissions: expandPermissions(user.modules),
  };
}

/** `GET /identity/me`. The frontend `can()` is fed from `permissions`, which is
 *  the union of the module grants — derived here, never stored (D23, D24). */
export async function me(): Promise<Result<Session>> {
  await latency();
  return ok(SERVICE, toSession(actingUser()));
}

export async function listUsers(): Promise<Result<Session[]>> {
  await latency();
  return ok(SERVICE, getState().users.map(toSession));
}

/** Demo only: switch which person is acting, so permissions can be shown
 *  working rather than described. Deleted in Phase 2 along with this layer. */
export async function actAs(userId: string): Promise<Result<Session>> {
  await latency();
  const user = getState().users.find((u) => u.id === userId);
  if (!user) return notFound(SERVICE, "user_not_found", "User not found.");
  apply((draft) => {
    draft.session_user_id = userId;
  });
  return ok(SERVICE, toSession(user));
}

/** Demo only: toggle a grant, so a reviewer can watch the ledger leave the
 *  menu when accounting is switched off (D22). */
export async function setModules(
  userId: string,
  modules: { module: ModuleName; level: ModuleLevel }[],
): Promise<Result<Session>> {
  await latency();
  let updated: DemoUser | undefined;
  apply((draft) => {
    const user = draft.users.find((u) => u.id === userId);
    if (!user) return;
    user.modules = modules;
    updated = user;
    writeAudit(draft, {
      service: SERVICE, entity: "user", entity_no: user.email,
      action: "modules.set", outcome: "ok", reason: null,
    });
  });
  if (!updated) return notFound(SERVICE, "user_not_found", "User not found.");
  return ok(SERVICE, toSession(updated));
}

export async function setAuthorities(
  userId: string,
  authorities: Authority[],
): Promise<Result<Session>> {
  await latency();
  let updated: DemoUser | undefined;
  apply((draft) => {
    const user = draft.users.find((u) => u.id === userId);
    if (!user) return;
    user.authorities = authorities;
    updated = user;
    writeAudit(draft, {
      service: SERVICE, entity: "user", entity_no: user.email,
      action: "authorities.set", outcome: "ok", reason: null,
    });
  });
  if (!updated) return notFound(SERVICE, "user_not_found", "User not found.");
  return ok(SERVICE, toSession(updated));
}
