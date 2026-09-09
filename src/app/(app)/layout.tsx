"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/** Shell aplikasi.
 *
 *  Sidebar dan topbar tidak ikut bergulir; hanya <main> yang punya
 *  `overflow-y-auto`. Itu yang membuat aplikasi ini terasa seperti perangkat
 *  lunak desktop, bukan halaman web panjang — menu selalu di tempatnya.
 *
 *  KERANGKA: belum ada penjaga sesi di sini. Saat autentikasi siap, tambahkan
 *  pemeriksaan seperti di aplikasi rujukan: kalau belum masuk, redirect ke
 *  /masuk; selama memeriksa, tampilkan spinner — jangan render isi halaman
 *  lalu menariknya kembali.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
