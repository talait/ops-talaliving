"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { getState, subscribe, hydrate, resetDemo } from "./store";
import type { DemoState } from "./state";

/** Reading the sandbox from a component.
 *
 *  `useDemo()` re-renders when anything in the store changes, so a screen that
 *  calls an api function does not need to refetch by hand. In Phase 2 this is
 *  replaced by SWR against the real endpoints, and the screens keep the same
 *  shape: read a value, call a service, handle the envelope.
 */
const DemoContext = createContext<{ reset: () => void } | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrate();
  }, []);
  return <DemoContext.Provider value={{ reset: resetDemo }}>{children}</DemoContext.Provider>;
}

/** The server render always sees the fixtures; the client swaps in whatever
 *  this browser has done since. That is correct — there is no per-visitor
 *  state on the server, and pretending otherwise would mismatch the markup. */
export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useDemoReset(): () => void {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoReset harus dipakai di dalam DemoProvider.");
  return ctx.reset;
}

/** Who is acting right now. Phase 2 reads this from Supabase Auth; the shape
 *  the callers see does not change. */
export function useActingUser() {
  const state = useDemo();
  return state.users.find((u) => u.id === state.session_user_id) ?? state.users[0];
}
