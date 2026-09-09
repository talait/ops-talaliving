/** Peran dan izin.
 *
 *  Katalog izin dan definisi peran hidup DI KODE, bukan sebagai data yang
 *  diketik manusia. Alasannya: database produksi baru bisa di-bootstrap ulang
 *  dari nol tanpa ada yang menebak peran apa saja yang seharusnya ada, dan
 *  penambahan modul otomatis terlihat di sini sebagai perubahan yang bisa
 *  di-review — bukan sebagai baris yang diam-diam disisipkan ke tabel.
 *
 *  Backend memegang salinan yang sama di `backend/app/core/permissions.py`.
 *  Keduanya HARUS sejalan; backend yang berhak menolak, frontend hanya
 *  menyembunyikan menu.
 */

export const PERMISSION_CATALOG = {
  dashboard: ["read"],
  hrd: ["read", "create", "update", "approve"],
  payroll: ["read", "run", "approve"],
  procurement: ["read", "create", "update", "approve"],
  inventory: ["read", "create", "update", "adjust"],
  accounting: ["read", "create", "update", "post", "close"],
  marketing: ["read", "create", "update"],
  project: ["read", "create", "update", "handover"],
  production: ["read", "create", "update", "schedule"],
  it: ["read", "update", "manage_users", "manage_roles"],
  settings: ["read", "update"],
} as const;

export type PermissionModule = keyof typeof PERMISSION_CATALOG;

/** Semua kode izin, mis. "procurement.approve". */
export const ALL_PERMISSIONS: string[] = Object.entries(PERMISSION_CATALOG).flatMap(
  ([mod, actions]) => (actions as readonly string[]).map((a) => `${mod}.${a}`),
);

export interface RoleDefinition {
  name: string;
  description: string;
  /** "*" berarti seluruh izin. */
  permissions: string[] | "*";
}

/** Peran awal. Sengaja sedikit — peran yang terlalu rinci sejak awal selalu
 *  berakhir jadi peran yang tidak dipakai siapa pun. Tambah saat ada orang
 *  nyata yang tidak muat di salah satunya. */
export const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  super_admin: {
    name: "Super Admin",
    description: "Akses penuh, termasuk manajemen pengguna dan peran.",
    permissions: "*",
  },
  direksi: {
    name: "Direksi",
    description: "Melihat seluruh modul dan menyetujui pengeluaran besar.",
    permissions: [
      ...ALL_PERMISSIONS.filter((p) => p.endsWith(".read")),
      "procurement.approve", "payroll.approve", "accounting.post", "project.handover",
    ],
  },
  hrd: {
    name: "HRD",
    description: "Data karyawan, absensi, cuti, dan penggajian.",
    permissions: ["dashboard.read", "hrd.read", "hrd.create", "hrd.update", "hrd.approve", "payroll.read", "payroll.run"],
  },
  procurement: {
    name: "Procurement",
    description: "Permintaan dan pesanan pembelian, penerimaan barang.",
    permissions: ["dashboard.read", "procurement.read", "procurement.create", "procurement.update", "inventory.read", "inventory.create"],
  },
  accounting: {
    name: "Accounting",
    description: "Buku besar, arus kas, anggaran, dan verifikasi pembelian.",
    permissions: ["dashboard.read", "accounting.read", "accounting.create", "accounting.update", "accounting.post", "procurement.read", "payroll.read"],
  },
  marketing: {
    name: "Marketing",
    description: "CRM, kampanye, dan penjualan.",
    permissions: ["dashboard.read", "marketing.read", "marketing.create", "marketing.update", "project.read"],
  },
  produksi: {
    name: "Produksi",
    description: "Desain, bill of materials, rencana dan jadwal produksi.",
    permissions: ["dashboard.read", "production.read", "production.create", "production.update", "production.schedule", "inventory.read", "project.read"],
  },
  gudang: {
    name: "Gudang",
    description: "Stok bahan, penerimaan, dan penyesuaian.",
    permissions: ["dashboard.read", "inventory.read", "inventory.create", "inventory.update", "inventory.adjust", "procurement.read"],
  },
};

export type RoleId = keyof typeof ROLE_DEFINITIONS;

export function hasPermission(rolePermissions: string[] | "*", code?: string): boolean {
  if (!code) return true;
  if (rolePermissions === "*") return true;
  return rolePermissions.includes(code);
}
