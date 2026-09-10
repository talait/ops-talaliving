"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { ROLE_DEFINITIONS, hasPermission, type RoleId } from "@/lib/roles";

/** Sesi dan izin.
 *
 *  KERANGKA: peran diambil dari state lokal, bukan dari server. Saat backend
 *  siap, ganti isi provider ini dengan pemanggilan /auth/me dan penyimpanan
 *  token — seluruh aplikasi memakai `can()` dan tidak perlu ikut berubah.
 *
 *  `can()` di sini hanya menyembunyikan menu dan tombol. Penegakan yang
 *  sebenarnya ada di backend; frontend tidak boleh jadi satu-satunya penjaga,
 *  karena siapa pun bisa memanggil API tanpa lewat halaman ini.
 */
interface SessionValue {
  user: { name: string; email: string; role: RoleId } | null;
  can: (permission?: string) => boolean;
  setRole: (role: RoleId) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<RoleId>("super_admin");

  const value = useMemo<SessionValue>(() => {
    const definition = ROLE_DEFINITIONS[role];
    return {
      user: { name: "Demo User", email: "demo@talaliving.com", role },
      can: (permission?: string) => hasPermission(definition.permissions, permission),
      setRole,
    };
  }, [role]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession harus dipakai di dalam SessionProvider.");
  return ctx;
}
