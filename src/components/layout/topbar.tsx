"use client";

import { Menu } from "lucide-react";
import { ROLE_DEFINITIONS, type RoleId } from "@/lib/roles";
import { useSession } from "@/store/session";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, setRole } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md md:px-6">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-3">
        {/* KERANGKA — HAPUS SEBELUM PRODUKSI.
            Pemilih peran ini alat bantu pengembangan supaya penyaringan menu
            bisa dicoba tanpa backend. Di produksi peran datang dari sesi, bukan
            dari dropdown yang bisa diubah siapa saja. */}
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline">Peran (dev)</span>
          <select
            value={user?.role}
            onChange={(e) => setRole(e.target.value as RoleId)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
          >
            {Object.entries(ROLE_DEFINITIONS).map(([id, def]) => (
              <option key={id} value={id}>{def.name}</option>
            ))}
          </select>
        </label>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {user?.name.charAt(0) ?? "?"}
        </div>
      </div>
    </header>
  );
}
