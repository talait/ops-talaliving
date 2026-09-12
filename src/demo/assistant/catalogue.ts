/** Everything John Lau can be asked to do — and everything it cannot.
 *
 *  The blocked entries are **in this list on purpose** rather than absent from
 *  it. A capability that is missing produces *saya tidak mengerti*, which
 *  teaches the person to rephrase until something works. A capability that is
 *  present and refused produces *tidak bisa lewat prompt, dan ini alasannya* —
 *  which ends the conversation honestly and points at the screen where a human
 *  may look, with the look recorded (D218).
 *
 *  This file is the security boundary. Not a system prompt, not an instruction
 *  to a model: a list the executor reads. In Phase 2 a model chooses **from**
 *  this catalogue and still cannot reach past it, because the refusal is in the
 *  dispatcher rather than in the model's good intentions.
 */
import type { AssistantTool } from "@/services/assistant/contracts";

export const TOOLS: AssistantTool[] = [
  /* ── Reading ──────────────────────────────────────────────────────── */
  {
    name: "procurement.pending_approvals", module: "procurement", level: "read",
    effect: "read", reach: "open",
    label: "Baris permintaan yang menunggu persetujuan",
    blocked_reason: null, instead_at: "/procurement/meeting",
  },
  {
    name: "procurement.vendor_debt", module: "procurement", level: "read",
    effect: "read", reach: "open",
    label: "Berapa yang masih kita hutang ke sebuah vendor",
    blocked_reason: null, instead_at: "/procurement/tracker",
  },
  {
    name: "accounting.balances", module: "accounting", level: "read",
    effect: "read", reach: "open",
    label: "Saldo tiap rekening",
    blocked_reason: null, instead_at: "/accounting/ledger",
  },
  {
    name: "inventory.low_stock", module: "inventory", level: "read",
    effect: "read", reach: "open",
    label: "Barang yang sudah di bawah stok minimum",
    blocked_reason: null, instead_at: "/inventory/material",
  },
  {
    name: "production.late_orders", module: "production", level: "read",
    effect: "read", reach: "open",
    label: "SPK yang lewat tanggal janji",
    blocked_reason: null, instead_at: "/produksi/jadwal",
  },
  {
    name: "delivery.fulfilment", module: "project", level: "read",
    effect: "read", reach: "open",
    label: "Sudah berapa banyak pesanan klien yang sampai dan terpasang",
    blocked_reason: null, instead_at: "/proyek/serah-terima",
  },

  /* ── Guidance ─────────────────────────────────────────────────────── */
  {
    name: "guide.create_po", module: null, level: "read",
    effect: "guide", reach: "open",
    label: "Cara membuat purchase order",
    blocked_reason: null, instead_at: "/procurement/po",
  },
  {
    name: "guide.receive_goods", module: null, level: "read",
    effect: "guide", reach: "open",
    label: "Cara mencatat barang datang",
    blocked_reason: null, instead_at: "/procurement/penerimaan",
  },
  {
    name: "guide.pay_line", module: null, level: "read",
    effect: "guide", reach: "open",
    label: "Cara membayar sebuah baris permintaan",
    blocked_reason: null, instead_at: "/procurement/tracker",
  },

  /* ── Writing, and only ever as a draft ────────────────────────────── */
  {
    name: "procurement.draft_pr_line", module: "procurement", level: "write",
    effect: "write", reach: "open",
    label: "Menyiapkan baris permintaan pembelian baru",
    blocked_reason: null, instead_at: "/procurement/pr/new",
  },
  {
    name: "procurement.draft_po", module: "procurement", level: "write",
    effect: "write", reach: "open",
    label: "Menyiapkan purchase order baru",
    blocked_reason: null, instead_at: "/procurement/po",
  },

  /* ── Never, at any grant ──────────────────────────────────────────── */
  {
    name: "hr.employee_files", module: "hrd", level: "read",
    effect: "read", reach: "blocked",
    label: "Berkas 201 — KTP, kartu keluarga, kontrak, NPWP, BPJS",
    blocked_reason:
      "Berkas 201 tidak bisa dibaca lewat prompt, pada tingkat akses mana pun. Nomor identitas dibuka satu per satu oleh orang, dengan tombol mata, dan setiap pembukaan tercatat atas nama orang itu di audit (D196). Percakapan tidak bisa memberikan jejak itu: ia bisa menyalin, meneruskan, dan menjawab sepuluh nomor sekaligus.",
    instead_at: "/hrd/berkas-201",
  },
  {
    name: "hr.payroll", module: "payroll", level: "read",
    effect: "read", reach: "blocked",
    label: "Gaji, slip gaji, penyesuaian upah",
    blocked_reason:
      "Gaji per orang tidak dibaca lewat prompt. Ini bukan jawaban pemilik — pemilik menyebut berkas 201 dan IT — melainkan default yang saya ambil: nominal gaji satu orang adalah paparan sejenis dengan nomor KTP, dan lebih mudah dimintakan sekaligus untuk semua orang. Kalau memang boleh, satu baris di katalog ini membukanya.",
    instead_at: "/hrd/payroll",
  },
  {
    name: "hr.attendance", module: "hrd", level: "read",
    effect: "read", reach: "blocked",
    label: "Absensi dan keterlambatan per orang",
    blocked_reason:
      "Kehadiran per orang tidak dibaca lewat prompt, alasan yang sama dengan gaji: mudah diminta sekaligus, dan yang keluar adalah catatan tentang orang, bukan tentang perusahaan. Default yang saya ambil, bukan jawaban pemilik.",
    instead_at: "/hrd/absensi",
  },
  {
    name: "it.audit", module: "it", level: "read",
    effect: "read", reach: "blocked",
    label: "Audit log, log aktivitas, pengguna, peran",
    blocked_reason:
      "Modul IT tidak bisa dibaca lewat prompt sama sekali (pemilik). Jejak audit adalah catatan tentang apa yang dilakukan orang; membacanya lewat percakapan menjadikannya alat untuk mengawasi rekan kerja dengan satu kalimat. Yang boleh membukanya hanya IT dan pimpinan, di layarnya sendiri (D190).",
    instead_at: "/it/audit",
  },
  {
    name: "it.settings_write", module: "settings", level: "write",
    effect: "write", reach: "blocked",
    label: "Mengubah pengaturan sistem",
    blocked_reason:
      "Pengaturan tidak diubah lewat prompt. Lima dari dua belas pengaturan mengubah angka yang sudah ada (D214), dan perbedaan antara yang aman dan yang tidak justru hilang dalam kalimat percakapan — di layarnya perbedaan itu yang pertama terbaca.",
    instead_at: "/pengaturan",
  },
];

export function findTool(name: string): AssistantTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
