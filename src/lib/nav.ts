import {
  LayoutDashboard, Users, CalendarCheck, FileBadge, ShieldCheck, Wallet,
  ShoppingCart, ClipboardList, FileText, PackageCheck, Boxes, TreePine,
  Layers, Landmark, BookOpen, TrendingUp, PiggyBank, Receipt,
  Megaphone, UserRound, Target, HandCoins,
  FolderKanban, Hammer, Truck, Wrench, Stamp,
  PencilRuler, ListTree, CalendarClock,
  Cpu, ScrollText, Activity, UserCog, KeyRound,
  Settings, type LucideIcon,
} from "lucide-react";

/** Menu sebagai DATA, bukan JSX.
 *
 *  Sidebar hanya membaca berkas ini dan menyaringnya dengan `can(permission)`.
 *  Konsekuensi yang disengaja: menu yang tidak diizinkan TIDAK dirender sama
 *  sekali — bukan ditampilkan lalu di-disable, dan bukan disembunyikan CSS.
 *  Menambah halaman berarti menambah satu baris di sini, bukan menyunting
 *  komponen navigasi.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  badge?: "core" | "new";
}

export interface NavSection {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "Ringkasan", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
    ],
  },
  {
    title: "HRD",
    icon: Users,
    items: [
      { label: "Data Karyawan", href: "/hrd/karyawan", icon: Users, permission: "hrd.read", badge: "core" },
      { label: "Absensi", href: "/hrd/absensi", icon: CalendarCheck, permission: "hrd.read" },
      { label: "Berkas 201", href: "/hrd/berkas-201", icon: FileBadge, permission: "hrd.read" },
      { label: "Cuti & Izin", href: "/hrd/cuti", icon: CalendarClock, permission: "hrd.read" },
      { label: "Compliance", href: "/hrd/compliance", icon: ShieldCheck, permission: "hrd.read" },
      { label: "Payroll", href: "/hrd/payroll", icon: Wallet, permission: "payroll.read" },
    ],
  },
  {
    title: "Procurement",
    icon: ShoppingCart,
    items: [
      { label: "Purchase Request", href: "/procurement/pr", icon: ClipboardList, permission: "procurement.read", badge: "core" },
      { label: "Purchase Order", href: "/procurement/po", icon: FileText, permission: "procurement.read" },
      { label: "Receiving Report", href: "/procurement/penerimaan", icon: PackageCheck, permission: "procurement.read" },
      { label: "Supplier", href: "/procurement/supplier", icon: Truck, permission: "procurement.read" },
    ],
  },
  {
    title: "Inventory",
    icon: Boxes,
    items: [
      { label: "Kayu Log", href: "/inventory/log", icon: TreePine, permission: "inventory.read", badge: "core" },
      { label: "Papan & Sawn", href: "/inventory/papan", icon: Layers, permission: "inventory.read" },
      { label: "Material & Hardware", href: "/inventory/material", icon: Boxes, permission: "inventory.read" },
      { label: "Penyesuaian Stok", href: "/inventory/penyesuaian", icon: Wrench, permission: "inventory.adjust" },
    ],
  },
  {
    title: "Accounting",
    icon: Landmark,
    items: [
      { label: "Buku Besar", href: "/accounting/ledger", icon: BookOpen, permission: "accounting.read", badge: "core" },
      { label: "Arus Kas", href: "/accounting/cashflow", icon: TrendingUp, permission: "accounting.read" },
      { label: "Anggaran", href: "/accounting/budget", icon: PiggyBank, permission: "accounting.read" },
      { label: "Verifikasi Pembelian", href: "/accounting/verifikasi", icon: Receipt, permission: "accounting.read", badge: "core" },
      { label: "Slip Gaji", href: "/accounting/payslip", icon: HandCoins, permission: "payroll.read" },
    ],
  },
  {
    title: "Marketing",
    icon: Megaphone,
    items: [
      { label: "CRM", href: "/marketing/crm", icon: UserRound, permission: "marketing.read" },
      { label: "Kampanye", href: "/marketing/kampanye", icon: Target, permission: "marketing.read" },
      { label: "Penjualan", href: "/marketing/penjualan", icon: HandCoins, permission: "marketing.read" },
    ],
  },
  {
    title: "Proyek",
    icon: FolderKanban,
    items: [
      { label: "Order", href: "/proyek/order", icon: ClipboardList, permission: "project.read", badge: "core" },
      { label: "Produksi", href: "/proyek/produksi", icon: Hammer, permission: "project.read" },
      { label: "Pengiriman", href: "/proyek/pengiriman", icon: Truck, permission: "project.read" },
      { label: "Instalasi", href: "/proyek/instalasi", icon: Wrench, permission: "project.read" },
      { label: "Serah Terima", href: "/proyek/serah-terima", icon: Stamp, permission: "project.handover" },
    ],
  },
  {
    title: "Produksi",
    icon: Hammer,
    items: [
      { label: "Desain", href: "/produksi/desain", icon: PencilRuler, permission: "production.read" },
      { label: "Bill of Materials", href: "/produksi/bom", icon: ListTree, permission: "production.read", badge: "core" },
      { label: "Rencana & Jadwal", href: "/produksi/jadwal", icon: CalendarClock, permission: "production.schedule" },
    ],
  },
  {
    title: "IT",
    icon: Cpu,
    items: [
      { label: "Audit Log", href: "/it/audit", icon: ScrollText, permission: "it.read" },
      { label: "Activity Log", href: "/it/aktivitas", icon: Activity, permission: "it.read" },
      { label: "Pengguna", href: "/it/pengguna", icon: UserCog, permission: "it.manage_users" },
      { label: "Peran & Izin", href: "/it/peran", icon: KeyRound, permission: "it.manage_roles" },
    ],
  },
  {
    title: "Pengaturan",
    icon: Settings,
    items: [
      { label: "Umum", href: "/pengaturan", icon: Settings, permission: "settings.read" },
    ],
  },
];
