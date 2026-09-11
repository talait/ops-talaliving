"use client";

import { useState } from "react";
import { Hammer, Save } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { Badge, Button } from "@/components/ui/primitives";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { procurement, production } from "@/demo/api";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** One project: its master data, and what is being made for it.
 *
 *  The second half is composed at the screen (ADR-004) — production is asked
 *  for its own work orders and they are matched on `project_code`, the public
 *  code that crosses the seam. It is the cheapest possible demonstration of
 *  why the code must never be edited: everything that references this project
 *  references it by that string (D149).
 */
export function ProjectDrawer({
  code, onClose, onChanged,
}: {
  code: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const { toast } = useToast();
  const [existing] = useLoad(
    () => (code ? procurement.getProject(code) : Promise.resolve({ data: null, meta: null } as never)),
    [code],
  );
  const [orders] = useLoad(() => production.listWorkOrders({ include_done: true }), []);
  const mayEdit = can("procurement.update");

  const p = existing.status === "ready" ? existing.data : null;
  const [form, setForm] = useState({
    code: "", name: "", client_name: "", location: "", pic: "",
    started_on: "", target_date: "", contract_value: 0, is_active: true, note: "",
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Fill the form once the record arrives. A controlled form seeded from a
     load has to wait for it, and doing that with a flag rather than an effect
     keeps the "new project" case identical to the "edit" one. */
  if (p && !ready) {
    setForm({
      code: p.code, name: p.name,
      client_name: p.client_name ?? "", location: p.location ?? "", pic: p.pic ?? "",
      started_on: p.started_on ?? "", target_date: p.target_date ?? "",
      contract_value: p.contract_value ?? 0,
      is_active: p.is_active, note: p.note ?? "",
    });
    setReady(true);
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    const res = await procurement.saveProject({
      code: form.code,
      name: form.name,
      client_name: form.client_name || null,
      location: form.location || null,
      pic: form.pic || null,
      started_on: form.started_on || null,
      target_date: form.target_date || null,
      contract_value: form.contract_value > 0 ? form.contract_value : null,
      is_active: form.is_active,
      note: form.note || null,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Tidak tersimpan", res.error.message);
      return;
    }
    toast("success", code ? "Proyek diperbarui" : "Proyek dibuat", `${res.data.code} · ${res.data.name}`);
    onChanged();
    onClose();
  }

  const field = (
    id: string, label: string, value: string,
    onChange: (v: string) => void, placeholder?: string, type = "text",
  ) => (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-500">{label}</label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={!mayEdit}
        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  );

  return (
    <Drawer
      open onClose={onClose} width="max-w-xl"
      title={code ? (p?.name ?? code) : "Proyek baru"}
      subtitle={code ? `${code}${p?.client_name ? ` · ${p.client_name}` : ""}` : "Kodenya dipakai di PR, SPK dan ledger — sekali dibuat, tidak pernah diubah."}
      footer={mayEdit ? (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button icon={Save} onClick={save} disabled={busy || !form.code.trim() || !form.name.trim()}>
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pr-code" className="block text-xs text-slate-500">Kode</label>
            <input
              id="pr-code" value={form.code}
              onChange={(e) => set({ code: e.target.value })}
              disabled={!!code || !mayEdit}
              placeholder="25013"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 font-mono text-sm focus:border-brand-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {code && <p className="mt-1 text-[11px] text-slate-500">Tetap — setiap PR, SPK dan baris ledger menunjuk kode ini.</p>}
          </div>
          {field("pr-name", "Nama proyek", form.name, (v) => set({ name: v }), "HOTEL UBUD")}
          {field("pr-client", "Klien", form.client_name, (v) => set({ client_name: v }), "Ubud Green Hospitality")}
          {field("pr-loc", "Lokasi", form.location, (v) => set({ location: v }), "Ubud")}
          {field("pr-pic", "Penanggung jawab", form.pic, (v) => set({ pic: v }), "Evin Jonathan")}
          <div>
            <label htmlFor="pr-value" className="block text-xs text-slate-500">Nilai kontrak</label>
            <MoneyInput id="pr-value" value={form.contract_value} onChange={(v) => set({ contract_value: v })} className="mt-1" />
            <p className="mt-1 text-[11px] text-slate-500">Nilai pesanan yang disepakati, bukan faktur.</p>
          </div>
          {field("pr-start", "Mulai", form.started_on, (v) => set({ started_on: v }), undefined, "date")}
          {field("pr-target", "Target selesai", form.target_date, (v) => set({ target_date: v }), undefined, "date")}
        </div>

        {field("pr-note", "Catatan", form.note, (v) => set({ note: v }), "Termin 3 kali, DP sudah masuk.")}

        {mayEdit && (
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox" checked={form.is_active}
              onChange={(e) => set({ is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Proyek masih berjalan
            <span className="text-[11px] text-slate-500">
              — menonaktifkan tidak menghapus apa pun, catatannya tetap terbaca.
            </span>
          </label>
        )}

        {/* What is being made for it. Composed from production, matched on the
            public code — the reason the code is fixed. */}
        {code && (
          <Loaded state={orders} skeletonRows={2}>
            {(all) => {
              const mine = all.filter((w) => w.project_code === (p?.name ?? "") || w.project_code === code);
              return (
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                    <Hammer className="h-4 w-4 text-slate-400" />
                    Pesanan kerja ({mine.length})
                  </p>
                  {mine.length === 0 ? (
                    <p className="mt-1 text-[12px] text-slate-500">
                      Belum ada pesanan kerja yang menunjuk proyek ini.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-100 text-[12px]">
                      {mine.map((w) => (
                        <li key={w.id} className="flex flex-wrap items-center gap-2 py-1.5">
                          <span className="flex-1 text-slate-700">
                            {w.item_name}
                            <span className="ml-2 font-mono text-[10px] text-slate-400">{w.wo_no}</span>
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {formatNumber(w.completed)}/{formatNumber(w.qty)} {w.uom}
                          </span>
                          {w.status === "DONE"
                            ? <Badge tone="slate">selesai</Badge>
                            : w.late
                              ? <Badge tone="red" dot>terlambat {Math.abs(w.days_left)} hari</Badge>
                              : <Badge tone="slate">{w.days_left} hari lagi</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/produksi/jadwal">
                    <Button size="sm" variant="outline" className="mt-2">Buka papan produksi</Button>
                  </Link>
                </div>
              );
            }}
          </Loaded>
        )}

        {p?.contract_value != null && (
          <p className="text-[11px] text-slate-500">
            Nilai kontrak {formatIDR(p.contract_value)}. Belanja terhadap proyek ini dibaca dari
            ledger — lihat <Link href="/accounting/liquidation" className="underline">likuidasi</Link>.
          </p>
        )}
      </div>
    </Drawer>
  );
}
