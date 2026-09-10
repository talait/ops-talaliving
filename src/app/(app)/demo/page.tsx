"use client";

import { useEffect, useState } from "react";
import {
  Database, ShieldAlert, Wallet, ListChecks, FileStack, GitBranch, RotateCcw,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, PageHeader, StatCard, type Tone,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatIDR } from "@/lib/format";
import { useDemo, useDemoReset, useActingUser } from "@/demo/provider";
import { accountBalances, prLineView, poStatus, inboxHealth } from "@/demo/derive";
import { procurement, accounting, identity, isOk } from "@/demo/api";
import type { LineStatus } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";

/** M1 diagnostic surface.
 *
 *  Not a product screen — the real ones arrive from M2 onward. This exists so
 *  that day one has something to review: it shows what the demo store holds,
 *  what `derive.ts` computes from it, and — the part worth the most — that the
 *  refusals are real. A demo that only ever succeeds teaches every screen to
 *  be optimistic, and the real API then breaks all of them at once.
 *
 *  Delete this page when the screens it stands in for exist.
 */

const STATUS_TONE: Record<LineStatus, Tone> = {
  DRAFT: "slate",
  "WAITING FOR APPROVAL": "amber",
  APPROVED: "brand",
  "WAITING FOR PAYMENT": "violet",
  PAID: "green",
  PARTIAL: "amber",
  COMPLETED: "green",
  REMOVED: "red",
};

interface Probe {
  name: string;
  expect: string;
  got?: string;
  pass?: boolean;
}

export default function DemoDiagnosticsPage() {
  const state = useDemo();
  const reset = useDemoReset();
  const acting = useActingUser();
  const { toast } = useToast();
  const [probes, setProbes] = useState<Probe[]>([]);
  const [running, setRunning] = useState(false);

  const balances = accountBalances(state);
  const lines = state.pr_lines.map((l) => prLineView(state, l));
  const health = inboxHealth(state);

  const byStatus = lines.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  /* Every one of these is a rule from `00-context.md` §A or a decision from
   * `06-decisions.md`, exercised against the demo API rather than described. */
  async function runProbes() {
    setRunning(true);
    const results: Probe[] = [];
    const original = state.session_user_id;

    await identity.actAs("usr_evin");
    const above = await procurement.approveLine({
      line_no: "pr-26-09-10_01-L01", approved: true, approved_amount: 99_000_000,
    });
    results.push({
      name: "A8 — persetujuan di atas yang diminta",
      expect: "422 approved_above_requested",
      got: above.error ? `${above.error.status} ${above.error.code}` : "diterima",
      pass: above.error?.status === 422 && above.error.code === "approved_above_requested",
    });

    await identity.actAs("usr_andi");
    const noAuth = await procurement.approveLine({ line_no: "pr-26-09-10_01-L01", approved: true });
    results.push({
      name: "D19 — menyetujui tanpa authority approve_goods",
      expect: "403 authority_required",
      got: noAuth.error ? `${noAuth.error.status} ${noAuth.error.code}` : "diterima",
      pass: noAuth.error?.status === 403 && noAuth.error.code === "authority_required",
    });

    const removePaid = await procurement.removeLine({ line_no: "pr-26-08-18_01-L01" });
    results.push({
      name: "D29 — menghapus baris yang sudah menerima uang",
      expect: "409 money_already_allocated",
      got: removePaid.error ? `${removePaid.error.status} ${removePaid.error.code}` : "diterima",
      pass: removePaid.error?.status === 409 && removePaid.error.code === "money_already_allocated",
    });

    await identity.actAs("usr_putri");
    const over = await accounting.allocate({
      trx_no: "trx-26-08-20_003", pr_line_no: "pr-26-08-27_01-L01", amount: 900_000_000,
    });
    results.push({
      name: "A9 — alokasi melebihi yang dipindahkan transaksi",
      expect: "422 over_allocated",
      got: over.error ? `${over.error.status} ${over.error.code}` : "diterima",
      pass: over.error?.status === 422 && over.error.code === "over_allocated",
    });

    const key = `probe-${Date.now()}`;
    const first = await procurement.createVendor({ name: `UD PROBE ${Date.now()}` }, key);
    const second = await procurement.createVendor({ name: `UD PROBE ${Date.now()}` }, key);
    results.push({
      name: "Idempotensi — kunci yang sama dikirim dua kali",
      expect: "duplicate, tidak ada baris kedua",
      got: `${second.meta.outcome}${isOk(first) && isOk(second) && first.data.id === second.data.id ? ", id sama" : ""}`,
      pass: second.meta.outcome === "duplicate",
    });

    const badLine = await accounting.allocate({
      trx_no: "trx-26-08-20_003", pr_line_no: "pr-99-99-99_01-L01", amount: 1_000,
    });
    results.push({
      name: "ADR-004 — alokasi ke baris PR yang tidak ada",
      expect: "422 pr_line_not_found (divalidasi di seam)",
      got: badLine.error ? `${badLine.error.status} ${badLine.error.code}` : "diterima",
      pass: badLine.error?.code === "pr_line_not_found",
    });

    await identity.actAs(original);
    setProbes(results);
    setRunning(false);
    const failed = results.filter((r) => !r.pass).length;
    if (failed === 0) toast("success", "Semua penolakan berperilaku benar", `${results.length} pemeriksaan lolos.`);
    else toast("critical", `${failed} pemeriksaan gagal`, "Lihat tabel di bawah.");
  }

  useEffect(() => {
    void runProbes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineColumns: Column<(typeof lines)[number]>[] = [
    { key: "no", header: "Baris", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.line_no_full}</span> },
    { key: "desc", header: "Deskripsi", render: (r) => <span className="text-slate-700">{r.description}</span> },
    { key: "total", header: "Diminta", align: "right", render: (r) => formatIDR(r.item_total) },
    { key: "cov", header: "Tercakup", align: "right", render: (r) => <span className={r.coverage.covered > 0 ? "text-emerald-700" : "text-slate-400"}>{formatIDR(r.coverage.covered)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge> },
  ];

  const probeColumns: Column<Probe>[] = [
    {
      key: "name",
      header: "Aturan",
      className: "whitespace-normal",
      render: (r) => (
        <div className="max-w-md">
          <p className="text-slate-700">{r.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">diharapkan {r.expect}</p>
        </div>
      ),
    },
    { key: "got", header: "Hasil", render: (r) => <span className="font-mono text-xs text-slate-700">{r.got ?? "—"}</span> },
    { key: "pass", header: "", align: "right", render: (r) => <Badge tone={r.pass ? "green" : "red"}>{r.pass ? "lolos" : "gagal"}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="M1 · Lapisan data contoh"
        title="Diagnostik demo"
        description="Halaman kerja, bukan halaman produk. Isinya: apa yang ada di store, apa yang dihitung derive.ts darinya, dan bukti bahwa penolakannya sungguhan."
        actions={
          <>
            <Button variant="outline" size="sm" icon={RotateCcw} onClick={() => { reset(); toast("info", "Data contoh dikembalikan", "Sandbox kembali ke kondisi awal."); }}>
              Reset data contoh
            </Button>
            <Button size="sm" icon={ShieldAlert} onClick={runProbes} disabled={running}>
              {running ? "Menguji…" : "Uji penolakan"}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Baris PR" value={state.pr_lines.length} icon={ListChecks} hint={`${state.pr_documents.length} dokumen`} />
        <StatCard label="Transaksi ledger" value={state.transactions.length} icon={Wallet} tone="green" hint={`${state.payment_allocations.length} alokasi`} />
        <StatCard label="Berkas bukti" value={state.attachments.length} icon={FileStack} tone="violet" hint={`${state.attachment_links.length} tautan`} />
        <StatCard
          label="Dokumen tanpa induk"
          value={health.unresolved}
          icon={GitBranch}
          tone={health.unresolved > 5 ? "red" : "amber"}
          hint="Jalur pengecualian — harus tetap kecil"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Penolakan yang sungguhan"
            subtitle="Setiap baris adalah satu aturan mengikat, diuji lewat demo API — bukan dijelaskan."
            icon={ShieldAlert}
          />
          <DataTable columns={probeColumns} rows={probes} rowKey={(r) => r.name} dense empty="Menjalankan pemeriksaan…" />
        </Card>

        <Card>
          <CardHeader title="Saldo per rekening" subtitle="Dihitung dari baris, bukan disimpan" icon={Wallet} />
          <div className="divide-y divide-slate-100">
            {balances.map((b) => (
              <div key={b.account_id} className="flex items-baseline justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-700">{b.code}</p>
                  <p className="text-xs text-slate-400">{b.custody === "leadership" ? "kustodi pimpinan" : "kustodi akunting"}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-800">{formatIDR(b.balance)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Tangga status — kedelapan nilainya hadir di data contoh"
          subtitle="Dihitung ulang setiap render oleh derive.ts. Tidak ada kolom status yang bisa berselisih dengannya."
          icon={Database}
          action={
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(byStatus).map(([s, n]) => (
                <Badge key={s} tone={STATUS_TONE[s as LineStatus]}>{s} · {n}</Badge>
              ))}
            </div>
          }
        />
        <DataTable columns={lineColumns} rows={lines} rowKey={(r) => r.id} dense />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="PO — dua sumbu, tidak pernah digabung" subtitle="Uang dan barang dihitung terpisah dan tetap terpisah" icon={GitBranch} />
          <div className="divide-y divide-slate-100">
            {state.purchase_orders.map((po) => {
              const s = poStatus(state, po.id);
              return (
                <div key={po.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-brand-700">{po.po_no}</span>
                    <Badge tone={po.status === "ISSUED" ? "brand" : "slate"}>{po.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Pembayaran</p>
                      <p className="font-semibold text-slate-700">{s.payment_state}</p>
                      <p className="tabular-nums text-slate-500">{formatIDR(s.paid_to_date)} / {formatIDR(s.contract_value)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Pengiriman</p>
                      <p className="font-semibold text-slate-700">{s.delivery_state}</p>
                      <p className="tabular-nums text-slate-500">diterima {formatIDR(s.value_received)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Eksposur {formatIDR(s.exposure)} —{" "}
                    {s.exposure > 0
                      ? "kita menanggung risiko vendor."
                      : s.exposure < 0
                        ? "barang sudah datang melebihi yang dibayar; ini utang usaha."
                        : "seimbang."}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sesi demo" subtitle="Akses modul dan authority terpisah — D22 sampai D24" icon={ShieldAlert} />
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-xs text-slate-400">Bertindak sebagai</p>
              <p className="text-sm font-semibold text-slate-800">{acting.full_name}</p>
              <p className="font-mono text-xs text-slate-500">{acting.email}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-400">Modul</p>
              <div className="flex flex-wrap gap-1.5">
                {acting.modules.map((m) => (
                  <Badge key={m.module} tone="slate">{m.module} · {m.level}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-400">Authority</p>
              <div className="flex flex-wrap gap-1.5">
                {acting.authorities.length === 0
                  ? <span className="text-xs text-slate-400">tidak ada — hanya bisa mengajukan, tidak memutuskan</span>
                  : acting.authorities.map((a) => <Badge key={a} tone="brand">{a}</Badge>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
              {state.users.map((u) => (
                <Button
                  key={u.id}
                  size="sm"
                  variant={u.id === acting.id ? "secondary" : "ghost"}
                  onClick={() => void identity.actAs(u.id)}
                >
                  {u.full_name.split(" ")[0]}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
