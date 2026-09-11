"use client";

import { Layers } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR, formatNumber } from "@/lib/format";
import { inventory } from "@/demo/api";

/** Boards, by size.
 *
 *  The workshop does not think in cubic metres when it goes to the rack — it
 *  thinks *3 × 20 × 300, how many are there*. So the stock reads by size, and
 *  the cubic metres sit beside it for the people who buy.
 *
 *  The value column uses **each delivery's own cost per cubic metre of board**
 *  (D153), so a size sawn out of expensive logs is worth more than the same
 *  size out of cheap ones — which is true, and is invisible if boards are
 *  valued at one average price.
 */
export default function BoardsPage() {
  const [purchases, reload] = useLoad(() => inventory.listLogPurchases(), []);

  return (
    <div>
      <PageHeader
        breadcrumb="Inventory"
        title="Papan hasil gergajian"
        description="Dikelompokkan menurut ukuran. Nilainya memakai harga per m³ papan dari kiriman asalnya, bukan satu harga rata-rata."
      />

      <Loaded state={purchases} onRetry={reload}>
        {(all) => {
          /* Grouped by size across deliveries, because that is how a stack is
             stored and how somebody asks for wood. */
          const bySize = new Map<string, {
            size: string; thickness: number; qty: number; m3: number; value: number;
            priced: number; species: Set<string>;
          }>();

          for (const p of all) {
            for (const b of p.boards) {
              const row = bySize.get(b.size) ?? {
                size: b.size, thickness: b.thickness_mm, qty: 0, m3: 0, value: 0, priced: 0,
                species: new Set<string>(),
              };
              row.qty += b.qty;
              row.m3 = Math.round((row.m3 + b.m3) * 10_000) / 10_000;
              if (p.cost_per_sawn_m3 != null) {
                row.value += p.cost_per_sawn_m3 * b.m3;
                row.priced = Math.round((row.priced + b.m3) * 10_000) / 10_000;
              }
              row.species.add(p.species);
              bySize.set(b.size, row);
            }
          }

          const rows = [...bySize.values()].sort(
            (a, b) => a.thickness - b.thickness || b.m3 - a.m3,
          );
          const totalM3 = Math.round(rows.reduce((a, r) => a + r.m3, 0) * 10_000) / 10_000;
          const totalValue = rows.reduce((a, r) => a + r.value, 0);
          const totalSheets = rows.reduce((a, r) => a + r.qty, 0);

          return (
            <Card>
              <CardHeader
                title={`${rows.length} ukuran · ${totalSheets} lembar · ${formatNumber(totalM3)} m³`}
                subtitle={`Nilai kayu papan ${formatIDR(Math.round(totalValue))} dengan harga masing-masing kiriman.`}
                icon={Layers}
                action={<SourceBadge state={purchases} />}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2 text-left">Ukuran (t × l × p)</th>
                      <th className="px-4 py-2 text-left">Jenis</th>
                      <th className="px-4 py-2 text-right">Lembar</th>
                      <th className="px-4 py-2 text-right">m³</th>
                      <th className="px-4 py-2 text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.size} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{r.size}</td>
                        <td className="px-4 py-2 text-slate-600">{[...r.species].join(", ")}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.qty}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatNumber(r.m3)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className="tabular-nums text-slate-800">{formatIDR(Math.round(r.value))}</span>
                          {r.priced < r.m3 && (
                            <span className="block text-[10px] text-amber-700">
                              {formatNumber(Math.round((r.m3 - r.priced) * 10_000) / 10_000)} m³ belum ada harganya
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        Belum ada papan yang dilaporkan.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
                Ini adalah papan yang <strong>keluar dari gergaji</strong>, bukan sisa stok: apa yang
                sudah terpakai di produksi belum dikurangi di sini (Q40). Papan dicatat dari layar{" "}
                <strong>Kayu log &amp; kubikasi</strong>, dari kiriman log asalnya.
              </p>
            </Card>
          );
        }}
      </Loaded>
    </div>
  );
}
