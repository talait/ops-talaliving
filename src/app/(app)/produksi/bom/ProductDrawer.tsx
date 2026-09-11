"use client";

import { useState } from "react";
import { Calculator, Plus, Save, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Badge, Button } from "@/components/ui/primitives";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement, production } from "@/demo/api";
import type { ProductView } from "@/services/production/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** One product, its components, and what a run of it needs.
 *
 *  The components table is the master data. The panel underneath is why anyone
 *  keeps it: *twelve doors — what do I have to buy, and roughly what does it
 *  cost?* Quantities there carry the **waste** already, because the number in
 *  the drawing and the number to buy are different numbers, and conflating
 *  them is how a workshop runs out on a Saturday (D149).
 *
 *  A component whose code the catalogue does not know is shown, not hidden and
 *  not refused: a workshop knows it needs a steel frame before procurement has
 *  an item code for one (A6).
 */
export function ProductDrawer({
  productCode, onClose, onChanged,
}: {
  productCode: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const { toast } = useToast();
  const [product, reload] = useLoad(
    () => (productCode ? production.getProduct(productCode) : Promise.resolve({ data: null, meta: null } as never)),
    [productCode],
  );
  const [items] = useLoad(() => procurement.listItems(), []);
  const mayEdit = can("production.update");

  /* New-product form, used when no code was passed. */
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Meja");
  const [uom, setUom] = useState("unit");
  const [dimension, setDimension] = useState("");
  const [lead, setLead] = useState(14);
  const [busy, setBusy] = useState(false);

  /* Add-a-component form. */
  const [kind, setKind] = useState<"material" | "product">("material");
  const [ref, setRef] = useState("");
  const [qty, setQty] = useState(1);
  const [cUom, setCUom] = useState("pcs");
  const [waste, setWaste] = useState(0);

  /* How many are we making? */
  const [runQty, setRunQty] = useState(1);

  async function createProduct() {
    setBusy(true);
    const res = await production.saveProduct({
      product_code: code, name, category, uom,
      dimension: dimension || null, lead_time_days: lead,
    });
    setBusy(false);
    if (res.error) { toast(res.error.status === 403 ? "critical" : "warning", "Tidak tersimpan", res.error.message); return; }
    toast("success", "Produk dibuat", `${res.data.product_code} · ${res.data.name}`);
    onChanged();
    onClose();
  }

  async function addComponent(p: ProductView) {
    setBusy(true);
    const res = await production.saveBomComponent({
      product_code: p.product_code, kind, ref_code: ref, qty, uom: cUom, waste_percent: waste,
    });
    setBusy(false);
    if (res.error) { toast(res.error.status === 403 ? "critical" : "warning", "Tidak ditambahkan", res.error.message); return; }
    toast("success", "Komponen ditambahkan", `${ref} · ${formatNumber(qty)} ${cUom}`);
    setRef(""); setQty(1); setWaste(0);
    reload(); onChanged();
  }

  async function remove(p: ProductView, componentId: string, refCode: string) {
    setBusy(true);
    const res = await production.removeBomComponent({ product_code: p.product_code, component_id: componentId });
    setBusy(false);
    if (res.error) { toast("warning", "Tidak dihapus", res.error.message); return; }
    toast("success", "Komponen dihapus", refCode);
    reload(); onChanged();
  }

  if (!productCode) {
    return (
      <Drawer
        open onClose={onClose} width="max-w-lg"
        title="Produk baru"
        subtitle="Kode dipakai di gambar, di SPK dan di setiap BOM yang menunjuknya — dan tidak pernah diubah lagi."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
            <Button icon={Save} onClick={createProduct} disabled={busy || !code.trim() || !name.trim()}>
              Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="p-code" className="block text-xs text-slate-500">Kode produk</label>
              <input
                id="p-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="PRD-MJ-180"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 font-mono text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="p-cat" className="block text-xs text-slate-500">Kategori</label>
              <input
                id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="p-name" className="block text-xs text-slate-500">Nama</label>
            <input
              id="p-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Meja makan jati 180×90"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="p-uom" className="block text-xs text-slate-500">Satuan</label>
              <input
                id="p-uom" value={uom} onChange={(e) => setUom(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="p-dim" className="block text-xs text-slate-500">Ukuran</label>
              <input
                id="p-dim" value={dimension} onChange={(e) => setDimension(e.target.value)}
                placeholder="1800 × 900 × 750 mm"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="p-lead" className="block text-xs text-slate-500">Lead time (hari)</label>
              <NumberInput id="p-lead" value={lead} min={0} max={365} onChange={setLead} className="mt-1" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Komponennya ditambahkan setelah produk tersimpan.
          </p>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open onClose={onClose} width="max-w-3xl"
      title={product.status === "ready" ? product.data.name : productCode}
      subtitle={product.status === "ready"
        ? `${product.data.product_code} · per ${product.data.uom}${product.data.dimension ? ` · ${product.data.dimension}` : ""}`
        : undefined}
    >
      <Loaded state={product} onRetry={reload}>
        {(p) => (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">{p.category}</Badge>
              {p.lead_time_days != null && (
                <span className="text-[12px] text-slate-500">lead time {p.lead_time_days} hari</span>
              )}
              <span className="text-[12px] text-slate-500">
                {p.components.length} komponen
                {p.material_cost != null && ` · bahan ${formatIDR(p.material_cost)} / ${p.uom}`}
              </span>
            </div>
            {p.description && <p className="text-[13px] text-slate-600">{p.description}</p>}

            {p.warnings.length > 0 && (
              <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
                {p.warnings.map((w) => <li key={w}>· {w}</li>)}
              </ul>
            )}

            {/* The bill of materials itself. */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Komponen</th>
                    <th className="px-3 py-2 text-right">Per unit</th>
                    <th className="px-3 py-2 text-right">Susut</th>
                    <th className="px-3 py-2 text-right">Dibeli</th>
                    <th className="px-3 py-2 text-right">Harga</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    {mayEdit && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {p.components.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className={cn("block", c.ref_name ? "text-slate-800" : "text-amber-800")}>
                          {c.ref_name ?? `${c.ref_code} — tidak ada di katalog`}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-400">
                          {c.ref_code}
                          {c.kind === "product" && " · sub-rakitan"}
                          {c.note && ` · ${c.note}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatNumber(c.qty)} {c.uom}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {c.waste_percent > 0 ? `${c.waste_percent}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatNumber(c.qty_with_waste)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.unit_price == null ? (
                          <span className="text-[11px] text-amber-700">belum ada harga</span>
                        ) : (
                          <>
                            <span className="tabular-nums text-slate-700">{formatIDR(c.unit_price)}</span>
                            {c.price_source === "last" && (
                              <span className="block text-[10px] text-slate-400">harga terakhir</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {c.subtotal == null ? "—" : formatIDR(c.subtotal)}
                      </td>
                      {mayEdit && (
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy}
                            onClick={() => remove(p, c.id, c.ref_code)}>
                            <span className="sr-only">Hapus</span>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {p.components.length === 0 && (
                    <tr><td colSpan={mayEdit ? 7 : 6} className="px-3 py-6 text-center text-[13px] text-slate-500">
                      Belum ada komponen.
                    </td></tr>
                  )}
                </tbody>
                {p.material_cost != null && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50/70">
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-slate-700">
                        Bahan per {p.uom}
                        {p.unpriced > 0 && <span className="ml-2 text-[11px] font-normal text-amber-700">belum lengkap</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                        {formatIDR(p.material_cost)}
                      </td>
                      {mayEdit && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {mayEdit && (
              <Loaded state={items} skeletonRows={2}>
                {(catalogue) => (
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                      <Plus className="h-4 w-4 text-slate-400" /> Tambah komponen
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["material", "product"] as const).map((k) => (
                        <Button key={k} size="sm" variant={kind === k ? "primary" : "outline"} onClick={() => setKind(k)}>
                          {k === "material" ? "Bahan dari katalog" : "Sub-rakitan (produk lain)"}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_80px_70px_auto]">
                      <input
                        list="bom-refs" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())}
                        placeholder={kind === "material" ? "Kode bahan, mis. ITM-0007" : "Kode produk, mis. PRD-SUB-LACI"}
                        aria-label="Kode komponen"
                        className="h-9 rounded-lg border border-slate-200 px-2 font-mono text-sm focus:border-brand-400 focus:outline-none"
                      />
                      <datalist id="bom-refs">
                        {kind === "material"
                          ? catalogue.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)
                          : null}
                      </datalist>
                      <NumberInput value={qty} min={0} max={9999} step={0.001} onChange={setQty} />
                      <input
                        value={cUom} onChange={(e) => setCUom(e.target.value)}
                        aria-label="Satuan"
                        className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                      />
                      <NumberInput value={waste} min={0} max={90} onChange={setWaste} />
                      <Button size="sm" onClick={() => addComponent(p)} disabled={busy || !ref.trim() || qty <= 0}>
                        Tambah
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Kolom terakhir adalah susut dalam persen. Kode yang belum ada di katalog tetap
                      diterima — BOM yang menunggu kode adalah BOM yang tidak tertulis.
                    </p>
                  </div>
                )}
              </Loaded>
            )}

            {/* What a run of this actually needs. */}
            {p.components.length > 0 && (
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-slate-800">
                  <Calculator className="h-4 w-4 text-slate-400" />
                  Kebutuhan bahan untuk
                  <span className="w-20">
                    <NumberInput value={runQty} min={1} max={999} onChange={setRunQty} />
                  </span>
                  {p.uom}
                </p>
                <ul className="mt-2 divide-y divide-slate-100 text-[12px]">
                  {p.components.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-1.5">
                      <span className="flex-1 text-slate-700">{c.ref_name ?? c.ref_code}</span>
                      <span className="w-28 text-right tabular-nums text-slate-800">
                        {formatNumber(Math.round(c.qty_with_waste * runQty * 10_000) / 10_000)} {c.uom}
                      </span>
                      <span className="w-28 text-right tabular-nums text-slate-500">
                        {c.subtotal == null ? "—" : formatIDR(c.subtotal * runQty)}
                      </span>
                    </li>
                  ))}
                </ul>
                {p.material_cost != null && (
                  <p className="mt-2 text-right text-[13px] font-semibold text-slate-800">
                    {formatIDR(p.material_cost * runQty)}
                    {p.unpriced > 0 && (
                      <span className="ml-2 text-[11px] font-normal text-amber-700">
                        belum termasuk {p.unpriced} komponen tanpa harga
                      </span>
                    )}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Jumlah sudah termasuk susut. Ongkos kerja belum termasuk.
                </p>
              </div>
            )}
          </div>
        )}
      </Loaded>
    </Drawer>
  );
}
