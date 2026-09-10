"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useSession } from "@/store/session";

/** The application shell.
 *
 *  The sidebar and topbar do not scroll; only `<main>` does. That is what makes
 *  this feel like desktop software rather than a long web page — the menu is
 *  always where you left it.
 *
 *  The shell WAITS for the session before rendering anything. Drawing a menu
 *  and then taking half of it away is worse than a moment of nothing, and it is
 *  the specific failure the original skeleton left a note about.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { ready, hasAnyModule } = useSession();
  const router = useRouter();

  useEffect(() => {
    /* An account with no modules lands somewhere that says so, rather than
     * bouncing between pages it may not open. */
    if (ready && !hasAnyModule) router.replace("/no-access");
  }, [ready, hasAnyModule, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

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
