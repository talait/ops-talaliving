"use client";

import { useState } from "react";
import { Boxes, ClipboardList, FolderKanban, Hammer, Receipt, TreePine, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader, StatCard, type Tone } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { AreaTrend, BarSeries } from "@/components/charts/charts";
import { formatIDR, formatM3 } from "@/lib/format";

/* CONTOH — bukan data nyata.
 *
 * Ini satu-satunya halaman berisi di kerangka, dan ada untuk satu alasan:
 * memperlihatkan design system-nya bekerja pada data yang berbentuk sungguhan
 * sebelum backend tersambung. Angkanya dikarang tapi bentuknya realistis
 * (volume kayu m3 tiga desimal, rupiah tanpa desimal), supaya keputusan tata
 * letak diambil terhadap sesuatu yang menyerupai kenyataan. Hapus saat data
 * asli masuk. */

const TREN_PRODUKSI = [
  { label: "Mar", nilai: 412_000_000 },
  { label: "Apr", nilai: 468_000_000 },
  { label: "May", nilai: 395_000_000 },
  { label: "Jun", nilai: 521_000_000 },
  { label: "Jul", nilai: 604_000_000 },
  { label: "Aug", nilai: 588_000_000 },
  { label: "Sep", nilai: 655_000_000 },
];

const RENDEMEN = [
  { label: "Jati", nilai: 58 },
  { label: "Mahoni", nilai: 52 },
  { label: "Sungkai", nilai: 47 },
  { label: "Mindi", nilai: 44 },
];

type StatusOrder = "Design" | "Production" | "Delivery" | "Installation" | "Done";

interface Order {
  id: string;
  nomor: string;
  pelanggan: string;
  produk: string;
  qty: number;
  nilai: number;
  status: StatusOrder;
  tenggat: string;
}

const STATUS_TONE: Record<StatusOrder, Tone> = {
  Design: "slate",
  Production: "brand",
  Delivery: "violet",
  Installation: "amber",
  Done: "green",
};

const ORDERS: Order[] = [
  { id: "1", nomor: "SO/2609/0041", pelanggan: "Hotel Padma Bandung", produk: "Bedside table", qty: 120, nilai: 384_000_000, status: "Production", tenggat: "24 Sep 2026" },
  { id: "2", nomor: "SO/2609/0040", pelanggan: "Grha Wisata Nusantara", produk: "Teak lobby chair set", qty: 24, nilai: 216_000_000, status: "Installation", tenggat: "18 Sep 2026" },
  { id: "3", nomor: "SO/2609/0038", pelanggan: "Kantor Notaris Wijaya", produk: "4-door filing cabinet", qty: 8, nilai: 62_400_000, status: "Delivery", tenggat: "15 Sep 2026" },
  { id: "4", nomor: "SO/2609/0036", pelanggan: "Restoran Bumi Sangkuriang", produk: "8-seat dining table", qty: 15, nilai: 172_500_000, status: "Design", tenggat: "02 Oct 2026" },
  { id: "5", nomor: "SO/2608/0031", pelanggan: "Apartemen Skyline", produk: "Custom kitchen set", qty: 6, nilai: 294_000_000, status: "Done", tenggat: "05 Sep 2026" },
];

export default function DashboardPage() {
  const [selected, setSelected] = useState<Order | null>(null);

  const columns: Column<Order>[] = [
    {
      key: "nomor",
      header: "Order No.",
      render: (r) => <span className="font-mono text-sm font-semibold text-brand-700">{r.nomor}</span>,
    },
    {
      key: "pelanggan",
      header: "Customer",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.pelanggan}</p>
          <p className="text-xs text-slate-400">{r.produk}</p>
        </div>
      ),
    },
    { key: "qty", header: "Qty", align: "right", render: (r) => <span className="tabular-nums">{r.qty}</span> },
    {
      key: "nilai",
      header: "Value",
      align: "right",
      render: (r) => <span className="font-medium tabular-nums text-slate-700">{formatIDR(r.nilai)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>,
    },
    { key: "tenggat", header: "Due", align: "right", render: (r) => <span className="text-slate-500">{r.tenggat}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Dashboard"
        title="Operations Overview"
        description="The numbers on this page are still sample data, used to judge the layout before real data is connected."
        actions={<Button icon={ClipboardList}>New order</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active orders" value="18" icon={FolderKanban} delta="+3 this month" hint="4 of them past due" />
        <StatCard label="Production value this month" value={formatIDR(655_000_000)} icon={Hammer} delta="+11.4%" tone="green" />
        <StatCard label="Logs ready to mill" value={formatM3(184.376)} icon={TreePine} delta="-12.1%" deltaTone="red" tone="amber" hint="Below this week’s cutting plan" />
        <StatCard label="Awaiting verification" value="7" icon={Receipt} delta="from Google Chat" deltaTone="slate" tone="violet" hint="Receipts not yet matched by accounting" />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Production value" subtitle="Last seven months" icon={Wallet} />
          <div className="px-3 py-4">
            <AreaTrend data={TREN_PRODUKSI} dataKey="nilai" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Log yield" subtitle="Percent of board recovered from log volume" icon={Boxes} />
          <div className="px-3 py-4">
            <BarSeries data={RENDEMEN} dataKey="nilai" currency={false} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Active orders"
          subtitle="Click a row for detail"
          icon={FolderKanban}
          action={<Button variant="outline" size="sm">View all</Button>}
        />
        <DataTable columns={columns} rows={ORDERS} rowKey={(r) => r.id} onRowClick={setSelected} />
      </Card>

      {/* Detail dibuka di panel kanan, bukan halaman baru — tabel di belakang
          tetap terlihat, dan menutup panel mengembalikan pengguna persis ke
          tempatnya semula. */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.nomor ?? ""}
        subtitle={selected?.pelanggan}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            <Button>Open order</Button>
          </div>
        }
      >
        {selected && (
          <dl className="space-y-4 text-sm">
            {[
              ["Product", selected.produk],
              ["Quantity", `${selected.qty} unit`],
              ["Contract value", formatIDR(selected.nilai)],
              ["Due", selected.tenggat],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd><Badge tone={STATUS_TONE[selected.status]} dot>{selected.status}</Badge></dd>
            </div>
          </dl>
        )}
      </Drawer>
    </div>
  );
}
