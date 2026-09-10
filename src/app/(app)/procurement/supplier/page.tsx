"use client";

import { useState } from "react";
import { Truck, Plus, Check, Merge, Search } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, PageHeader, StatCard,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, Modal } from "@/components/ui/drawer";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { formatIDR, formatNumber } from "@/lib/format";
import { procurement } from "@/demo/api";
import type { VendorView } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";

/** Vendors.
 *
 *  The rule this screen exists to make visible: **a vendor name a person types
 *  is always accepted, and is born uncurated.** Uncurated does not mean
 *  rejected and does not mean hidden — it means recorded, shown, marked, and
 *  kept out of dropdowns until somebody says it is the real name. Auto-curating
 *  would feed every spelling variant into the catalogue as if it were canonical.
 */
export default function SuppliersPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<VendorView | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [merging, setMerging] = useState<VendorView | null>(null);
  const [saving, setSaving] = useState(false);

  const [state, reload] = useLoad(() => procurement.listVendorViews({ q }), [q]);
  const mayEdit = can("procurement.update");

  const refresh = () => { reload(); setSelected(null); };

  async function addVendor() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await procurement.createVendor({ name: newName }, `vendor-${newName}`);
    setSaving(false);
    if (res.error) {
      toast(res.error.status === 409 ? "warning" : "critical", "Not added", res.error.message);
      return;
    }
    toast("success", "Vendor added", `"${res.data.name}" is recorded, and not yet curated — it will not appear in dropdowns until someone curates it.`);
    setNewName("");
    setAdding(false);
    reload();
  }

  async function curate(v: VendorView, curated: boolean) {
    const res = await procurement.curateVendor(v.id, curated);
    if (res.error) { toast("warning", "Nothing changed", res.error.message); return; }
    toast("success", curated ? "Curated" : "Moved back to uncurated",
      curated ? `"${v.name}" will now appear in dropdowns.` : `"${v.name}" is still recorded, just not offered.`);
    refresh();
  }

  async function merge(loser: VendorView, winnerId: string) {
    const res = await procurement.mergeVendor(loser.id, winnerId);
    if (res.error) { toast("warning", "Not merged", res.error.message); return; }
    toast("success", "Merged", `"${loser.name}" is kept as an alternative spelling. Its history stays where it is.`);
    setMerging(null);
    refresh();
  }

  const columns: Column<VendorView>[] = [
    {
      key: "name",
      header: "Vendor",
      className: "max-w-[280px]",
      render: (v) => (
        <div>
          <p className="font-medium text-slate-800">{v.name}</p>
          <p className="font-mono text-[11px] text-slate-400">{v.code}</p>
          {v.aka.length > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-400">also written: {v.aka.join(" · ")}</p>
          )}
        </div>
      ),
    },
    {
      key: "curated",
      header: "Catalogue",
      render: (v) =>
        v.is_curated
          ? <Badge tone="green" dot>Curated</Badge>
          : <Badge tone="amber" dot>Not yet curated</Badge>,
    },
    { key: "trx", header: "Transactions", align: "right", render: (v) => formatNumber(v.transaction_count) },
    { key: "spend", header: "Total spend", align: "right", render: (v) => <span className="tabular-nums">{formatIDR(v.total_spend)}</span> },
    { key: "last", header: "Last purchase", render: (v) => v.last_purchase ?? <span className="text-slate-300">—</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Suppliers"
        description="Everyone we buy from, curated or not. A name somebody types is always accepted — it is recorded first and judged later."
        actions={
          mayEdit && <Button icon={Plus} onClick={() => setAdding(true)}>Add vendor</Button>
        }
      />

      <Loaded state={state} onRetry={reload}>
        {(vendors) => {
          const curated = vendors.filter((v) => v.is_curated);
          const uncurated = vendors.filter((v) => !v.is_curated);
          return (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <StatCard label="Vendors on record" value={vendors.length} icon={Truck} hint={`${curated.length} curated`} />
                <StatCard
                  label="Not yet curated"
                  value={uncurated.length}
                  icon={Search}
                  tone="amber"
                  hint="Recorded and visible — absent from dropdowns"
                />
                <StatCard
                  label="Spend on record"
                  value={formatIDR(vendors.reduce((s, v) => s + v.total_spend, 0))}
                  icon={Truck}
                  tone="green"
                />
              </div>

              <Card>
                <CardHeader
                  title="All vendors"
                  subtitle="Uncurated rows are shown and marked, never hidden — a vendor you cannot see is one nobody can fix."
                  icon={Truck}
                  action={
                    <div className="flex items-center gap-2">
                      <SourceBadge state={state} />
                      <input
                        id="vendor-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search name or spelling…"
                        className="h-9 w-44 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                  }
                />
                <DataTable
                  columns={columns}
                  rows={vendors}
                  rowKey={(v) => v.id}
                  onRowClick={setSelected}
                  empty={q ? `Nothing matches “${q}”.` : "No vendors yet."}
                />
              </Card>
            </>
          );
        }}
      </Loaded>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected?.code}
        footer={
          selected && mayEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" icon={Merge} onClick={() => setMerging(selected)}>
                Merge into another
              </Button>
              <Button
                size="sm"
                icon={Check}
                variant={selected.is_curated ? "outline" : "primary"}
                onClick={() => curate(selected, !selected.is_curated)}
              >
                {selected.is_curated ? "Move back to uncurated" : "Curate"}
              </Button>
            </div>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-5 text-sm">
            {!selected.is_curated && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                <p className="font-medium">Not yet curated</p>
                <p className="mt-1">
                  Recorded, and it will not be offered in a dropdown or treated as a
                  canonical name until someone curates it. That is deliberate:
                  promoting every new spelling automatically is how a vendor ends up
                  in the books under four different names.
                </p>
              </div>
            )}

            <dl className="space-y-3">
              {([
                ["Transactions", formatNumber(selected.transaction_count)],
                ["Total spend", formatIDR(selected.total_spend)],
                ["Last purchase", selected.last_purchase ?? "—"],
                ["Open PR lines", formatNumber(selected.open_pr_lines)],
                ["Phone", selected.phone ?? "—"],
                ["Bank account", selected.bank_account ?? "—"],
                ["NPWP", selected.npwp ?? "—"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {(selected.aka.length > 0 || selected.absorbed.length > 0) && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Other spellings
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.aka.map((a) => <Badge key={a} tone="slate">{a}</Badge>)}
                </div>
                {selected.absorbed.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {selected.absorbed.length} merged record(s) still carry their own
                    history — nothing was rewritten.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add vendor">
        <div className="space-y-3">
          <label htmlFor="new-vendor" className="block text-sm text-slate-600">
            Vendor name
          </label>
          <input
            id="new-vendor"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. UD SUMBER MAKMUR"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <p className="text-xs text-slate-500">
            Whatever you type is accepted. It is saved as <strong>not yet curated</strong>,
            which means it is on record and searchable but will not be offered in
            dropdowns until someone confirms it is the real name.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={addVendor} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Add vendor"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!merging} onClose={() => setMerging(null)} title="Merge into another vendor" width="max-w-lg">
        {merging && state.status === "ready" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Pick the vendor <strong>{merging.name}</strong> is really the same as. Its
              spelling is kept as an alternative, and its existing transactions stay
              pointed where they are — history does not move because a name was
              corrected later.
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {state.data.filter((v) => v.id !== merging.id).map((v) => (
                <button
                  key={v.id}
                  onClick={() => merge(merging, v.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="font-medium text-slate-700">{v.name}</span>
                  {v.is_curated && <Badge tone="green">Curated</Badge>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
