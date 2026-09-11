"use client";

/** The browser client.
 *
 *  One instance per tab, not one per call: a second client is a second auth
 *  listener and a second token-refresh timer, and the two of them racing is how
 *  a session appears to end halfway through a form.
 *
 *  Everything this client does is still enforced in the database. That is the
 *  whole of ADR-002 and it is why the anon key is safe here — the key says
 *  *which project*, the JWT says *who*, and the policies say *what*.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicConfig } from "./env";

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const { url, anonKey } = publicConfig();
  client = createBrowserClient(url, anonKey);
  return client;
}
