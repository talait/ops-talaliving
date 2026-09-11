"use client";

import { useState } from "react";
import { Hammer, Package, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { Badge, Button } from "@/components/ui/primitives";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
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
  const [lines, reloadLines] = useLoad(
    () => (code ? procurement.listProjectLines(code) : Promise.resolve({ data: [], meta: null } as never)),
    [code],
  );
  const [products] = useLoad(() => production.listProducts(), []);
  const [draft, setDraft] = useState({ product_code: "", description: "", qty: 1, uom: "unit", unit_price: 0 });
  const [lineBusy, setLineBusy] = useState(false);
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

  async function addLine() {
    if (!code) return;
    setLineBusy(true);
    const res = await procurement.saveProjectLine({
      project_code: code,
      product_code: draft.product_code || null,
      description: draft.description,
      qty: draft.qty,
      uom: draft.uom,
      unit_price: draft.unit_price > 0 ? draft.unit_price : null,
    });
    setLineBusy(false);
    if (res.error) { toast(res.error.status === 403 ? "critical" : "warning", "Tidak ditambahkan", res.error.message); return; }
    toast("success", "Baris pesanan ditambahkan", `${draft.description} · ${draft.qty} ${draft.uom}`);
    setDraft({ product_code: "", description: "", qty: 1, uom: "unit", unit_price: 0 });
    reloadLines();
  }

  async function removeLine(lineId: string, label: string) {
    if (!code) return;
    setLineBusy(true);
    const res = await procurement.removeProjectLine({ project_code: code, line_id: lineId });
    setLineBusy(false);
    if (res.error) { toast("warning", "Tidak dihapus", res.error.message); return; }
    toast("success", "Baris dihapus", label);
    reloadLines();
  }

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

        {/* What the client actually ordered, and how much of it exists.
            Ordered comes from this service; made and finished are read from
            production and matched on the **product code**, which is the reason
            a product has one (D150). */}
        {code && (
          <Loaded state={lines} onRetry={reloadLines} skeletonRows={3}>
            {(rows) => (
              <Loaded state={orders} skeletonRows={2}>
                {(wos) => {
                  const mine = wos.filter((w) => w.project_code === code);
                  const total = rows.reduce((a, l) => a + (l.unit_price ?? 0) * l.qty, 0);
                  return (
                    <div className="rounded-xl border border-slate-200 px-4 py-3">
                      <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                        <Package className="h-4 w-4 text-slate-400" />
                        Item dipesan ({rows.length})
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse text-[12px]">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="py-1.5 text-left">Item</th>
                              <th className="py-1.5 text-right">Dipesan</th>
                              <th className="py-1.5 text-right">Dibuat</th>
                              <th className="py-1.5 text-right">Selesai</th>
                              <th className="py-1.5 text-right">Nilai</th>
                              {mayEdit && <th />}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((l) => {
                              const forLine = l.product_code
                                ? mine.filter((w) => w.product_code === l.product_code)
                                : [];
                              const made = forLine.reduce((a, w) => a + w.qty, 0);
                              const done = forLine.reduce((a, w) => a + w.completed, 0);
                              return (
                                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-1.5">
                                    <span className="block text-slate-800">{l.description}</span>
                                    <span className="block font-mono text-[10px] text-slate-400">
                                      {l.product_code ?? "tanpa kode produk"}
                                      {l.note && ` · ${l.note}`}
                                    </span>
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-800">
                                    {formatNumber(l.qty)} {l.uom}
                                  </td>
                                  <td className={cn(
                                    "py-1.5 text-right tabular-nums",
                                    !l.product_code ? "text-slate-300"
                                      : made === 0 ? "text-amber-700"
                                        : made !== l.qty ? "text-amber-700" : "text-slate-700",
                                  )}>
                                    {l.product_code ? formatNumber(made) : "—"}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                                    {l.product_code ? formatNumber(done) : "—"}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                                    {l.unit_price == null ? "—" : formatIDR(l.unit_price * l.qty)}
                                  </td>
                                  {mayEdit && (
                                    <td className="py-1.5 text-right">
                                      <Button size="sm" variant="ghost" icon={Trash2} disabled={lineBusy}
                                        onClick={() => removeLine(l.id, l.description)}>
                                        <span className="sr-only">Hapus</span>
                                      </Button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                            {rows.length === 0 && (
                              <tr><td colSpan={mayEdit ? 6 : 5} className="py-4 text-center text-slate-500">
                                Belum ada item yang dicatat untuk pesanan ini.
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Ordered but not started is the number this table
                          exists to make visible. */}
                      {rows.some((l) => l.product_code && mine.filter((w) => w.product_code === l.product_code).length === 0) && (
                        <p className="mt-2 text-[11px] text-amber-800">
                          Ada item yang belum punya pesanan kerja sama sekali.
                        </p>
                      )}
                      {total > 0 && (
                        <p className="mt-2 text-right text-[12px] text-slate-600">
                          Jumlah baris: <strong className="tabular-nums text-slate-800">{formatIDR(total)}</strong>
                          {p?.contract_value != null && total !== p.contract_value && (
                            <span className="ml-2 text-amber-700">
                              {" "}
                              beda {formatIDR(Math.abs(total - p.contract_value))} dari nilai kontrak
                            </span>
                          )}
                        </p>
                      )}

                      {mayEdit && (
                        <Loaded state={products} skeletonRows={1}>
                          {(prods) => (
                            <div className="mt-3 border-t border-slate-100 pt-3">
                              <div className="grid gap-2 sm:grid-cols-[1fr_70px_70px]">
                                <select
                                  value={draft.product_code}
                                  onChange={(e) => {
                                    const found = prods.find((x) => x.product_code === e.target.value);
                                    setDraft({
                                      ...draft,
                                      product_code: e.target.value,
                                      description: found?.name ?? draft.description,
                                      uom: found?.uom ?? draft.uom,
                                    });
                                  }}
                                  aria-label="Produk"
                                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                                >
                                  <option value="">Item di luar katalog…</option>
                                  {prods.map((x) => (
                                    <option key={x.product_code} value={x.product_code}>
                                      {x.name} · {x.product_code}
                                    </option>
                                  ))}
                                </select>
                                <NumberInput value={draft.qty} min={0} max={9999} onChange={(v) => setDraft({ ...draft, qty: v })} />
                                <input
                                  value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })}
                                  aria-label="Satuan"
                                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                                />
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                                <input
                                  value={draft.description}
                                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                  placeholder="Keterangan seperti tertulis di pesanan klien"
                                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                                />
                                <MoneyInput value={draft.unit_price} onChange={(v) => setDraft({ ...draft, unit_price: v })} />
                                <Button size="sm" icon={Plus} disabled={lineBusy || !draft.description.trim() || draft.qty <= 0}
                                  onClick={addLine}>
                                  Tambah
                                </Button>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Harga satuan boleh kosong kalau pesanannya dihargai borongan.
                              </p>
                            </div>
                          )}
                        </Loaded>
                      )}
                    </div>
                  );
                }}
              </Loaded>
            )}
          </Loaded>
        )}

        {code && (
          <Loaded state={orders} skeletonRows={2}>
            {(all) => {
              const mine = all.filter((w) => w.project_code === code);
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
