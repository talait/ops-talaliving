"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import { useSession } from "@/store/session";
import { ProjectDrawer } from "./ProjectDrawer";

/** Master data: the customer's order.
 *
 *  A project is the dimension everything else hangs on — procurement buys
 *  **for** it, production makes **for** it, the ledger spends **on** it — and
 *  until now it was four fields: a code, a name and a flag. That is enough to
 *  tag a transaction with and not enough to answer *whose order is this, who
 *  answers for it, and when did we promise it* (D149).
 *
 *  The code is the part that must never move: it is written on request lines,
 *  work orders and ledger rows, all of which reference it as text at the seam.
 *  So it is set once and shown as fixed thereafter.
 */
export default function ProjectsPage() {
  const { can } = useSession();
  const [projects, reload] = useLoad(() => procurement.listProjects(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const mayEdit = can("procurement.update");

  return (
    <div>
      <PageHeader
        breadcrumb="Projects"
        title="Proyek"
        description="Pesanan pelanggan: siapa kliennya, siapa penanggung jawabnya, kapan dijanjikan. Kodenya dipakai di PR, SPK dan ledger — sekali dibuat, tidak diubah."
        actions={mayEdit ? (
          <Button icon={Plus} onClick={() => { setCreating(true); setOpen(null); }}>Proyek baru</Button>
        ) : undefined}
      />

      <Loaded state={projects} onRetry={reload}>
        {(all) => {
          const active = all.filter((p) => p.is_active);
          const valued = all.filter((p) => p.contract_value != null);
          const total = valued.reduce((a, p) => a + (p.contract_value ?? 0), 0);
          const noValue = active.filter((p) => p.contract_value == null).length;

          return (
            <>
              <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-card">
                <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                  {([
                    ["Proyek berjalan", String(active.length), `dari ${all.length} seluruhnya`],
                    ["Nilai kontrak", formatIDR(total), `dari ${valued.length} proyek yang punya nilai`],
                    ["Belum ada nilai", String(noValue), noValue > 0 ? "belum disepakati atau belum dicatat" : "semua sudah tercatat"],
                    ["Selesai / nonaktif", String(all.length - active.length), "catatannya tetap ada"],
                  ] as [string, string, string][]).map(([k, v, note]) => (
                    <div key={k} className="px-4 py-3.5">
                      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                      <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-slate-800">{v}</dd>
                      <p className="text-[11px] text-slate-500">{note}</p>
                    </div>
                  ))}
                </dl>
              </div>

              <Card>
                <CardHeader
                  title={`${all.length} proyek`}
                  subtitle="Klik untuk mengubah datanya dan melihat pesanan kerja yang berjalan di bawahnya."
                  icon={FolderKanban}
                  action={<SourceBadge state={projects} />}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 text-left">Proyek</th>
                        <th className="px-4 py-2 text-left">Klien</th>
                        <th className="px-4 py-2 text-left">PIC</th>
                        <th className="px-4 py-2 text-left">Target</th>
                        <th className="px-4 py-2 text-right">Nilai kontrak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {all.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => { setOpen(p.code); setCreating(false); }}
                          className={cn(
                            "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
                            !p.is_active && "opacity-60",
                          )}
                        >
                          <td className="px-4 py-2">
                            <span className="block font-medium text-slate-800">{p.name}</span>
                            <span className="block font-mono text-[10px] text-slate-400">
                              {p.code}
                              {p.location && ` · ${p.location}`}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {p.client_name ?? <span className="text-slate-400">internal</span>}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{p.pic ?? "—"}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {p.target_date ?? "—"}
                            {!p.is_active && <Badge tone="slate" className="ml-2">selesai</Badge>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-800">
                            {p.contract_value == null
                              ? <span className="text-slate-300">—</span>
                              : formatIDR(p.contract_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
                  Nilai kontrak adalah nilai pesanan yang disepakati — bukan faktur dan bukan
                  penawaran. Belanja terhadap proyek dibaca dari ledger, di halaman likuidasi.
                </p>
              </Card>
            </>
          );
        }}
      </Loaded>

      {(open || creating) && (
        <ProjectDrawer
          code={open}
          onClose={() => { setOpen(null); setCreating(false); }}
          onChanged={reload}
        />
      )}
    </div>
  );
}
