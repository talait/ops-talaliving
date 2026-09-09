/** Identitas aplikasi — SATU tempat.
 *
 *  Nama di sini muncul di sidebar, judul tab, dan halaman masuk. Warnanya
 *  ada di tailwind.config.ts (skala `brand`). Keduanya sengaja dipisah dari
 *  komponen supaya penggantian merek tidak berarti menyisir puluhan berkas.
 *
 *  NILAI DI BAWAH INI MASIH SEMENTARA — ganti sebelum ditunjukkan ke siapa pun.
 */
export const BRAND = {
  name: "MANUFAKTUR OS",
  tagline: "Sistem Operasi Pabrik",
  /** Dipakai di <title>. */
  documentTitle: "Manufaktur OS",
} as const;
