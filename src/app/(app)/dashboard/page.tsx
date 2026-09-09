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
  { label: "Mei", nilai: 395_000_000 },
  { label: "Jun", nilai: 521_000_000 },
  { label: "Jul", nilai: 604_000_000 },
  { label: "Agu", nilai: 588_000_000 },
  { label: "Sep", nilai: 655_000_000 },
];

const RENDEMEN = [
  { label: "Jati", nilai: 58 },
  { label: "Mahoni", nilai: 52 },
  { label: "Sungkai", nilai: 47 },
  { label: "Mindi", nilai: 44 },
];

type StatusOrder = "Desain" | "Produksi" | "Pengiriman" | "Instalasi" | "Selesai";

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
  Desain: "slate",
  Produksi: "brand",
  Pengiriman: "violet",
  Instalasi: "amber",
  Selesai: "green",
};

const ORDERS: Order[] = [
  { id: "1", nomor: "SO/2609/0041", pelanggan: "Hotel Padma Bandung", produk: "Meja samping tempat tidur", qty: 120, nilai: 384_000_000, status: "Produksi", tenggat: "24 Sep 2026" },
  { id: "2", nomor: "SO/2609/0040", pelanggan: "Grha Wisata Nusantara", produk: "Set kursi lobi jati", qty: 24, nilai: 216_000_000, status: "Instalasi", tenggat: "18 Sep 2026" },
  { id: "3", nomor: "SO/2609/0038", pelanggan: "Kantor Notaris Wijaya", produk: "Lemari arsip 4 pintu", qty: 8, nilai: 62_400_000, status: "Pengiriman", tenggat: "15 Sep 2026" },
  { id: "4", nomor: "SO/2609/0036", pelanggan: "Restoran Bumi Sangkuriang", produk: "Meja makan 8 dudukan", qty: 15, nilai: 172_500_000, status: "Desain", tenggat: "02 Okt 2026" },
  { id: "5", nomor: "SO/2608/0031", pelanggan: "Apartemen Skyline", produk: "Kitchen set custom", qty: 6, nilai: 294_000_000, status: "Selesai", tenggat: "05 Sep 2026" },
];

export default function DashboardPage() {
  const [selected, setSelected] = useState<Order | null>(null);

  const columns: Column<Order>[] = [
    {
      key: "nomor",
      header: "No. Order",
      render: (r) => <span className="font-mono text-sm font-semibold text-brand-700">{r.nomor}</span>,
    },
    {
      key: "pelanggan",
      header: "Pelanggan",
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
      header: "Nilai",
      align: "right",
      render: (r) => <span className="font-medium tabular-nums text-slate-700">{formatIDR(r.nilai)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>,
    },
    { key: "tenggat", header: "Tenggat", align: "right", render: (r) => <span className="text-slate-500">{r.tenggat}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Dashboard"
        title="Ringkasan Operasional"
        description="Angka di halaman ini masih data contoh — dipakai untuk menilai tampilan sebelum backend tersambung."
        actions={<Button icon={ClipboardList}>Order Baru</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Order berjalan" value="18" icon={FolderKanban} delta="+3 bulan ini" hint="4 di antaranya lewat tenggat" />
        <StatCard label="Nilai produksi bulan ini" value={formatIDR(655_000_000)} icon={Hammer} delta="+11,4%" tone="green" />
        <StatCard label="Stok log siap olah" value={formatM3(184.376)} icon={TreePine} delta="-12,1%" deltaTone="red" tone="amber" hint="Di bawah rencana potong minggu ini" />
        <StatCard label="Menunggu verifikasi" value="7" icon={Receipt} delta="dari Google Chat" deltaTone="slate" tone="violet" hint="Nota belum dicocokkan akunting" />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Nilai produksi" subtitle="Tujuh bulan terakhir" icon={Wallet} />
          <div className="px-3 py-4">
            <AreaTrend data={TREN_PRODUKSI} dataKey="nilai" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Rendemen log" subtitle="Persen papan jadi dari volume log" icon={Boxes} />
          <div className="px-3 py-4">
            <BarSeries data={RENDEMEN} dataKey="nilai" currency={false} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Order berjalan"
          subtitle="Klik baris untuk melihat detail"
          icon={FolderKanban}
          action={<Button variant="outline" size="sm">Lihat semua</Button>}
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
            <Button variant="outline" onClick={() => setSelected(null)}>Tutup</Button>
            <Button>Buka Order</Button>
          </div>
        }
      >
        {selected && (
          <dl className="space-y-4 text-sm">
            {[
              ["Produk", selected.produk],
              ["Jumlah", `${selected.qty} unit`],
              ["Nilai kontrak", formatIDR(selected.nilai)],
              ["Tenggat", selected.tenggat],
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
