"use client";

import { useState } from "react";
import { FileBadge, Plus, AlertTriangle } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Badge, Button } from "@/components/ui/primitives";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { cn } from "@/lib/cn";
import { hr } from "@/demo/api";
import { EMPLOYEE_DOC_LABEL, type EmployeeDocKind, type EmployeeFileView } from "@/services/hr/contracts";
import { useToast } from "@/store/toast";

/** One person's file, slot by slot.
 *
 *  Every slot is shown, including the empty ones — a missing KTP is a row that
 *  says *belum ada*, not an absence somebody has to notice. A document may be
 *  filed as a **number without a scan**, because the number is usually what is
 *  actually needed (a BPJS registration asks for the number, not the card), and
 *  refusing that would push it back onto a spreadsheet (D177).
 */
export function FileDrawer({
  employeeNo, mayEdit, onClose, onChanged,
}: {
  employeeNo: string;
  mayEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [file, reload] = useLoad(() => hr.getEmployeeFile(employeeNo), [employeeNo]);
  const [adding, setAdding] = useState<EmployeeDocKind | null>(null);
  const [form, setForm] = useState({ doc_no: "", issued_on: "", expires_on: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function save(kind: EmployeeDocKind) {
    setBusy(true);
    const res = await hr.saveEmployeeDocument({
      employee_no: employeeNo, kind,
      doc_no: form.doc_no || null,
      issued_on: form.issued_on || null,
      expires_on: form.expires_on || null,
      note: form.note || null,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Tidak tersimpan", res.error.message);
      return;
    }
    toast("success", "Tercatat", EMPLOYEE_DOC_LABEL[kind]);
    setAdding(null);
    setForm({ doc_no: "", issued_on: "", expires_on: "", note: "" });
    reload(); onChanged();
  }

  return (
    <Loaded state={file} onRetry={reload}>
      {(f: EmployeeFileView) => (
        <Drawer
          open onClose={onClose} width="max-w-2xl"
          title={f.full_name}
          subtitle={<span className="font-mono text-[11px]">{f.employee_no} · {f.position} · {f.unit}</span>}
        >
          <div className="space-y-4">
            <div className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px]",
              f.complete ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50/70 text-amber-900",
            )}>
              {f.complete ? (
                <span>Semua dokumen wajib sudah ada.</span>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Belum ada: {f.missing.map((k) => EMPLOYEE_DOC_LABEL[k]).join(", ")}</span>
                </>
              )}
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {f.slots.map((s) => (
                <li key={s.kind} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-[150px] text-[13px] font-medium text-slate-800">
                      {s.label}
                      {s.required && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">wajib</span>}
                    </span>
                    {s.documents.length === 0 ? (
                      <Badge tone={s.required ? "amber" : "slate"}>belum ada</Badge>
                    ) : (
                      <Badge tone="green">{s.documents.length} berkas</Badge>
                    )}
                    {s.expires_in_days != null && (
                      <Badge tone={s.expires_in_days < 0 ? "red" : s.expires_in_days <= 60 ? "amber" : "slate"}>
                        {s.expires_in_days < 0
                          ? `lewat ${Math.abs(s.expires_in_days)} hari`
                          : `${s.expires_in_days} hari lagi`}
                      </Badge>
                    )}
                    {mayEdit && (
                      <Button
                        size="sm" variant="ghost" icon={Plus}
                        onClick={() => setAdding(adding === s.kind ? null : s.kind)}
                      >
                        {adding === s.kind ? "Tutup" : "Tambah"}
                      </Button>
                    )}
                  </div>

                  {s.documents.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {s.documents.map((d) => (
                        <li key={d.id} className="text-[12px] text-slate-600">
                          {d.doc_no && <span className="font-mono text-[11px] text-slate-700">{d.doc_no}</span>}
                          {d.issued_on && <span className="ml-2 text-slate-400">terbit {d.issued_on}</span>}
                          {d.expires_on && <span className="ml-2 text-slate-400">berakhir {d.expires_on}</span>}
                          {!d.attachment_id && <span className="ml-2 text-[11px] text-amber-700">nomor saja, berkas belum dipindai</span>}
                          {d.note && <span className="block text-[11px] text-slate-500">{d.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.documents.length === 0 && s.note && (
                    <p className="mt-0.5 text-[11px] text-slate-400">{s.note}</p>
                  )}

                  {adding === s.kind && (
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          value={form.doc_no} onChange={(e) => setForm({ ...form, doc_no: e.target.value })}
                          placeholder="Nomor dokumen" aria-label="Nomor dokumen"
                          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                        />
                        <label className="text-[11px] text-slate-500">
                          Terbit
                          <input
                            type="date" value={form.issued_on} onChange={(e) => setForm({ ...form, issued_on: e.target.value })}
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                          />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Berakhir (kosongkan kalau tidak ada)
                          <input
                            type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                          placeholder="Catatan — mis. PKWT satu tahun, perpanjangan kedua"
                          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                        />
                        <Button size="sm" disabled={busy || !form.doc_no.trim()} onClick={() => save(s.kind)}>
                          {busy ? "Menyimpan…" : "Simpan"}
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Nomor saja sudah cukup untuk tercatat — pemindaiannya menyusul. Yang tidak
                        boleh kosong keduanya.
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className="flex items-start gap-2 text-[11px] text-slate-500">
              <FileBadge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              Berkas yang dipindai naik lewat jalur dokumen yang sama dengan bukti lain — satu
              lampiran, satu tautan, satu orang yang menautkannya (ADR-010).
            </p>
          </div>
        </Drawer>
      )}
    </Loaded>
  );
}
