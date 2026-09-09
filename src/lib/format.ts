/** Pemformatan terpusat. Ditaruh di satu berkas supaya angka rupiah dan
 *  tanggal tidak pernah tampil dengan dua gaya berbeda di dua halaman. */

export function formatIDR(value: number, withSymbol = true): string {
  const n = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(value));
  return withSymbol ? `Rp ${n}` : n;
}

/** Untuk sumbu grafik dan kartu KPI, di mana angka penuh justru mengaburkan
 *  bentuk datanya. */
export function formatIDRCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} jt`;
  if (abs >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} rb`;
  return `Rp ${value}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

/** Volume kayu dalam meter kubik — tiga desimal, karena selisih 0,001 m3
 *  pada log bernilai uang. */
export function formatM3(value: number): string {
  return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} m³`;
}
