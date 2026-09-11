"use client";

import { useState } from "react";
import { FileBadge, AlertTriangle, CalendarClock, Search } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { Paged } from "@/components/ui/pager";
import { cn } from "@/lib/cn";
import { hr } from "@/demo/api";
import { EMPLOYEE_DOC_LABEL, type EmployeeFileView } from "@/services/hr/contracts";
import { FileDrawer } from "./FileDrawer";
import { useSession } from "@/store/session";

/** Berkas 201 — the personnel file, as a checklist rather than a folder.
 *
 *  A shared drive can hold the same scans. What it cannot do is answer the two
 *  questions anybody actually asks (D177):
 *
 *  - **What is missing?** Before a BPJS registration, before an audit, before
 *    paying somebody whose contract may have run out. A folder answers *what is
 *    in here*; only a checklist answers *what is not*.
 *  - **What expires soon?** A PKWT, a forklift licence, a BPJS card. Nobody
 *    notices a date inside a scan — which is exactly how Made's licence lapsed
 *    in July and nothing said so until this screen existed.
 */
export default function EmployeeFilesPage() {
  const { can } = useSession();
  const [files, reload] = useLoad(() => hr.listEmployeeFiles(), []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const mayEdit = can("hrd.update");

  return (
    <div>
      <PageHeader
        breadcrumb="HRD"
        title="Berkas 201"
        description="Daftar periksa per orang: KTP, kartu keluarga, kontrak, foto — dan apa yang belum ada. Dokumen yang punya masa berlaku diingatkan sebelum lewat, bukan sesudah."
        actions={<SourceBadge state={files} />}
      />

      <Loaded state={files} onRetry={reload}>
        {(all) => {
          const shown = all.filter((f) => !q
            || `${f.full_name} ${f.employee_no} ${f.position} ${f.unit}`.toLowerCase().includes(q.toLowerCase()));
          const incomplete = all.filter((f) => !f.complete);
          const expired = all.flatMap((f) => f.expiring.filter((e) => e.days < 0).map((e) => ({ f, e })));
          const soon = all.flatMap((f) => f.expiring.filter((e) => e.days >= 0).map((e) => ({ f, e })));

          return (
            <>
              <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-card">
                <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                  {([
                    ["Berkas lengkap", `${all.length - incomplete.length} / ${all.length}`, "sesuai daftar periksa"],
                    ["Belum lengkap", String(incomplete.length),
                      incomplete.length > 0 ? "ada dokumen wajib yang belum ada" : "semua orang lengkap"],
                    ["Sudah lewat masa berlaku", String(expired.length), expired.length > 0 ? "harus diperbarui" : "tidak ada"],
                    ["Berakhir ≤ 60 hari", String(soon.length), soon.length > 0 ? "siapkan perpanjangannya" : "tidak ada"],
                  ] as [string, string, string][]).map(([k, v, note]) => (
                    <div key={k} className="px-4 py-3.5">
                      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                      <dd className={cn(
                        "mt-0.5 text-xl font-bold tabular-nums tracking-tight",
                        (k === "Belum lengkap" && incomplete.length > 0)
                          || (k === "Sudah lewat masa berlaku" && expired.length > 0)
                          ? "text-amber-700" : "text-slate-800",
                      )}>
                        {v}
                      </dd>
                      <p className="text-[11px] text-slate-500">{note}</p>
                    </div>
                  ))}
                </dl>
              </div>

              {(expired.length > 0 || soon.length > 0) && (
                <div className="mb-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-900">
                  <p className="flex items-center gap-2 font-semibold">
                    <CalendarClock className="h-4 w-4" /> Masa berlaku
                  </p>
                  {[...expired, ...soon].map(({ f, e }) => (
                    <p key={`${f.employee_no}-${e.kind}`}>
                      <span className="font-medium">{f.full_name}</span> — {e.label} {e.days < 0
                        ? `habis ${e.expires_on}, ${Math.abs(e.days)} hari lalu`
                        : `berakhir ${e.expires_on}, ${e.days} hari lagi`}
                    </p>
                  ))}
                </div>
              )}

              <Card>
                <CardHeader
                  title={`${shown.length} orang`}
                  subtitle="Yang belum lengkap di atas, lalu yang masa berlakunya paling dekat."
                  icon={FileBadge}
                  action={
                    <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2">
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      <input
                        value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="Cari nama…" aria-label="Cari karyawan"
                        className="h-7 w-40 text-sm focus:outline-none"
                      />
                    </label>
                  }
                />
                <Paged rows={shown} pageSize={15} unit="orang">
                  {(page) => (
                    <ul className="divide-y divide-slate-100">
                      {page.map((f) => <Row key={f.employee_no} file={f} onOpen={() => setOpen(f.employee_no)} />)}
                      {shown.length === 0 && (
                        <li className="px-5 py-8 text-[13px] text-slate-500">Tidak ada yang cocok.</li>
                      )}
                    </ul>
                  )}
                </Paged>
              </Card>

              {open && (
                <FileDrawer
                  employeeNo={open}
                  mayEdit={mayEdit}
                  onClose={() => setOpen(null)}
                  onChanged={reload}
                />
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

function Row({ file: f, onOpen }: { file: EmployeeFileView; onOpen: () => void }) {
  const filed = f.slots.filter((s) => s.documents.length > 0).length;
  return (
    <li>
      <button onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left hover:bg-slate-50">
        <span className="min-w-[190px] flex-1">
          <span className="block text-[13px] font-medium text-slate-800">{f.full_name}</span>
          <span className="block font-mono text-[10px] text-slate-400">
            {f.employee_no} · {f.position} · masuk {f.joined_on}
          </span>
        </span>
        <span className="whitespace-nowrap text-[12px] text-slate-600">{filed} dokumen</span>
        {f.complete
          ? <Badge tone="green">lengkap</Badge>
          : <Badge tone="amber">belum ada {f.missing.map((k) => EMPLOYEE_DOC_LABEL[k]).join(", ")}</Badge>}
        {f.expiring.length > 0 && (
          <Badge tone={f.expiring.some((e) => e.days < 0) ? "red" : "slate"}>
            {f.expiring.some((e) => e.days < 0) ? "ada yang lewat" : `${f.expiring[0].days} hari lagi`}
          </Badge>
        )}
      </button>
    </li>
  );
}
