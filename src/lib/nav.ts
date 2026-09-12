import {
  LayoutDashboard, Users, CalendarCheck, FileBadge, Wallet,
  ShoppingCart, ClipboardList, FileText, PackageCheck, Boxes, TreePine,
  Landmark, BookOpen, TrendingUp, PiggyBank, Receipt,
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
  /** A second permission that also opens the item. Exactly one screen needs
   *  this and it is not an accident: the pay-rule book is **read** by HRD and
   *  **changed** by IT (owner, D193), so gating it on either alone would hide
   *  it from half the people who need it. An IT account with no payroll grant
   *  is a normal account, and it must still be able to reach the rules it is
   *  the only one allowed to change. */
  orPermission?: string;
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
      { label: "Employee Files", href: "/hrd/berkas-201", icon: FileBadge, permission: "hrd.read", badge: "new" },
      { label: "Leave & Permits", href: "/hrd/cuti", icon: CalendarClock, permission: "hrd.read", badge: "new" },
      { label: "Payroll", href: "/hrd/payroll", icon: Wallet, permission: "payroll.read" },
      { label: "Gajian mingguan", href: "/hrd/payroll/minggu", icon: CalendarRange, permission: "payroll.read", badge: "new" },
      /* Under Payroll, not under IT. Its gate has always been `payroll.read`
       * — HRD owns the rule book — and once the IT heading means "IT and
       * leadership only" (owner, Q22), a payroll screen sitting inside it
       * made the heading say something untrue. Nobody gained or lost
       * access; the route is unchanged (D190). */
      { label: "Aturan penggajian", href: "/it/aturan-gaji", icon: Scale, permission: "payroll.read", orPermission: "it.update", badge: "new" },
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
      /* One entry, not two. Logs and boards are the same wood either side of
       * the saw, and the board rack only became stock at all once usage was
       * recorded (D202, D203). */
      { label: "Timber", href: "/inventory/log", icon: TreePine, permission: "inventory.read", badge: "core" },
      { label: "Materials & Hardware", href: "/inventory/material", icon: Boxes, permission: "inventory.read", badge: "new" },
      { label: "Stock Adjustments", href: "/inventory/penyesuaian", icon: Wrench, permission: "inventory.adjust", badge: "new" },
    ],
  },
  {
    title: "Accounting",
    icon: Landmark,
    items: [
      { label: "Rekening koran", href: "/accounting/rekening-koran", icon: Landmark, permission: "accounting.read", badge: "new" },
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
      { label: "Package — pipeline", href: "/marketing/pipeline", icon: Target, permission: "marketing.read", badge: "new" },
      { label: "Representative & komisi", href: "/marketing/agen", icon: HandCoins, permission: "marketing.read", badge: "new" },
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
      { label: "Design", href: "/produksi/desain", icon: PencilRuler, permission: "production.read", badge: "new" },
      { label: "Products & BOM", href: "/produksi/bom", icon: ListTree, permission: "production.read", badge: "core" },
      { label: "Planning & Schedule", href: "/produksi/jadwal", icon: CalendarClock, permission: "production.read", badge: "new" },
    ],
  },
  {
    title: "IT",
    icon: Cpu,
    items: [
      { label: "Audit Log", href: "/it/audit", icon: ScrollText, permission: "it.read", badge: "new" },
      { label: "Activity Log", href: "/it/aktivitas", icon: Activity, permission: "it.read", badge: "new" },
      { label: "Users", href: "/it/pengguna", icon: UserCog, permission: "it.manage_users", badge: "new" },
      { label: "Roles & Permissions", href: "/it/peran", icon: KeyRound, permission: "it.manage_roles", badge: "new" },
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
