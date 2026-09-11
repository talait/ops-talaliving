import {
  LayoutDashboard, Users, CalendarCheck, FileBadge, ShieldCheck, Wallet,
  ShoppingCart, ClipboardList, FileText, PackageCheck, Boxes, TreePine,
  Layers, Landmark, BookOpen, TrendingUp, PiggyBank, Receipt,
  Megaphone, UserRound, Target, HandCoins,
  FolderKanban, Hammer, Truck, Wrench, Stamp,
  PencilRuler, ListTree, CalendarClock, CalendarRange,
  Cpu, ScrollText, Activity, UserCog, KeyRound, Clock, Scale,
  Settings, FlaskConical, MessagesSquare, Route, type LucideIcon,
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
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
    ],
  },
  {
    title: "HR",
    icon: Users,
    items: [
      { label: "Employees", href: "/hrd/karyawan", icon: Users, permission: "hrd.read", badge: "core" },
      { label: "Attendance", href: "/hrd/absensi", icon: CalendarCheck, permission: "hrd.read" },
      { label: "Overtime", href: "/hrd/lembur", icon: Clock, permission: "hrd.read", badge: "new" },
      { label: "Employee Files", href: "/hrd/berkas-201", icon: FileBadge, permission: "hrd.read" },
      { label: "Leave & Permits", href: "/hrd/cuti", icon: CalendarClock, permission: "hrd.read" },
      { label: "Compliance", href: "/hrd/compliance", icon: ShieldCheck, permission: "hrd.read" },
      { label: "Payroll", href: "/hrd/payroll", icon: Wallet, permission: "payroll.read" },
      { label: "Gajian mingguan", href: "/hrd/payroll/minggu", icon: CalendarRange, permission: "payroll.read", badge: "new" },
    ],
  },
  {
    title: "Procurement",
    icon: ShoppingCart,
    items: [
      { label: "Requests", href: "/procurement/pr", icon: ClipboardList, permission: "procurement.read", badge: "core" },
      { label: "Meeting board", href: "/procurement/meeting", icon: Users, permission: "procurement.read" },
      { label: "Payment rounds", href: "/procurement/rounds", icon: HandCoins, permission: "procurement.read" },
      { label: "Purchase Tracker", href: "/procurement/tracker", icon: Route, permission: "procurement.read", badge: "new" },
      { label: "Purchase Order", href: "/procurement/po", icon: FileText, permission: "procurement.read" },
      { label: "Receiving Report", href: "/procurement/penerimaan", icon: PackageCheck, permission: "procurement.read" },
      { label: "Suppliers", href: "/procurement/supplier", icon: Truck, permission: "procurement.read" },
      { label: "Catalogue", href: "/procurement/catalog", icon: Boxes, permission: "procurement.read" },
    ],
  },
  {
    title: "Inventory",
    icon: Boxes,
    items: [
      { label: "Logs", href: "/inventory/log", icon: TreePine, permission: "inventory.read", badge: "core" },
      { label: "Sawn Boards", href: "/inventory/papan", icon: Layers, permission: "inventory.read" },
      { label: "Materials & Hardware", href: "/inventory/material", icon: Boxes, permission: "inventory.read", badge: "new" },
      { label: "Stock Adjustments", href: "/inventory/penyesuaian", icon: Wrench, permission: "inventory.adjust", badge: "new" },
    ],
  },
  {
    title: "Accounting",
    icon: Landmark,
    items: [
      { label: "Ledger", href: "/accounting/ledger", icon: BookOpen, permission: "accounting.read", badge: "core" },
      { label: "Liquidation", href: "/accounting/liquidation", icon: TrendingUp, permission: "accounting.read", badge: "new" },
      { label: "Payment Calendar", href: "/accounting/calendar", icon: PiggyBank, permission: "accounting.read", badge: "new" },
      { label: "Documents", href: "/accounting/documents", icon: FileBadge, permission: "accounting.read" },
      { label: "Purchase Verification", href: "/accounting/verifikasi", icon: Receipt, permission: "accounting.read", badge: "core" },
      { label: "Payslips", href: "/accounting/payslip", icon: HandCoins, permission: "payroll.read" },
    ],
  },
  {
    title: "Marketing",
    icon: Megaphone,
    items: [
      { label: "CRM", href: "/marketing/crm", icon: UserRound, permission: "marketing.read" },
      { label: "Campaigns", href: "/marketing/kampanye", icon: Target, permission: "marketing.read" },
      { label: "Sales", href: "/marketing/penjualan", icon: HandCoins, permission: "marketing.read" },
    ],
  },
  {
    title: "Projects",
    icon: FolderKanban,
    items: [
      { label: "Projects", href: "/proyek/order", icon: FolderKanban, permission: "project.read", badge: "core" },
      { label: "Cost vs projection", href: "/proyek/produksi", icon: Scale, permission: "project.read", badge: "new" },
      { label: "Delivery", href: "/proyek/pengiriman", icon: Truck, permission: "project.read" },
      { label: "Installation", href: "/proyek/instalasi", icon: Wrench, permission: "project.read" },
      { label: "Handover", href: "/proyek/serah-terima", icon: Stamp, permission: "project.handover" },
    ],
  },
  {
    title: "Production",
    icon: Hammer,
    items: [
      { label: "Design", href: "/produksi/desain", icon: PencilRuler, permission: "production.read" },
      { label: "Products & BOM", href: "/produksi/bom", icon: ListTree, permission: "production.read", badge: "core" },
      { label: "Planning & Schedule", href: "/produksi/jadwal", icon: CalendarClock, permission: "production.read", badge: "new" },
    ],
  },
  {
    title: "IT",
    icon: Cpu,
    items: [
      { label: "Audit Log", href: "/it/audit", icon: ScrollText, permission: "it.read" },
      { label: "Activity Log", href: "/it/aktivitas", icon: Activity, permission: "it.read" },
      { label: "Users", href: "/it/pengguna", icon: UserCog, permission: "it.manage_users" },
      { label: "Aturan penggajian", href: "/it/aturan-gaji", icon: Scale, permission: "payroll.read", badge: "new" },
      { label: "Roles & Permissions", href: "/it/peran", icon: KeyRound, permission: "it.manage_roles" },
    ],
  },
  {
    /* M1 only. Goes when the screens it stands in for exist. */
    title: "Demo",
    icon: FlaskConical,
    items: [
      { label: "Diagnostics", href: "/demo", icon: FlaskConical, permission: "dashboard.read", badge: "new" },
      { label: "Google Chat (simulated)", href: "/demo/chat", icon: MessagesSquare, permission: "dashboard.read" },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { label: "General", href: "/pengaturan", icon: Settings, permission: "settings.read" },
    ],
  },
];
