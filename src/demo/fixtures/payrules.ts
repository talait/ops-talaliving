import type { PayRuleSet } from "@/services/hr/contracts";

/** The rule book, dated (D173).
 *
 *  Two versions on purpose, because the point of dating them is only visible
 *  when there are two: the January book paid overtime at a flat ordinary rate,
 *  which is what this system did before anybody asked (Q31); from July it
 *  follows the national ladder, which is what the owner says the business
 *  actually does. A payslip from March is still recomputable under March's
 *  rule, and that is the whole reason a change writes a new version instead of
 *  editing the old one.
 *
 *  Undertime ships **off**. The owner named it as a scheme that exists, but
 *  what a short hour costs here has not been stated — and a deduction invented
 *  by software reaches somebody's pocket (D174). The screen shows exactly what
 *  turning it on would cost, per person, before it is turned on.
 */
export const PAY_RULE_SETS: PayRuleSet[] = [
  {
    id: "prs_01", version: 1,
    effective_from: "2026-01-01",
    note: "Awal tahun: lembur dibayar tarif jam biasa, belum ada aturan bertingkat.",
    rules: {
      overtime_mode: "flat",
      workday_tiers: [{ after_hours: 0, multiplier: 1 }],
      restday_tiers: [{ after_hours: 0, multiplier: 1 }],
      flat_multiplier: 1,
      monthly_divisor: 173,
      hourly_basis: "statutory",
      effective_days_per_year: 288,
      hourly_includes_allowance: false,
      week_pattern: "6day",
      overtime_rounding_minutes: 0,
      undertime_mode: "off",
      undertime_grace_minutes: 15,
      day_starts_minutes: 8 * 60,
      late_grace_minutes: 0,
      late_mode: "manual",
      late_forfeits_allowance: false,
    },
    created_by: "usr_shared",
    created_at: "2026-01-01T08:00:00+08:00",
  },
  {
    id: "prs_02", version: 2,
    effective_from: "2026-07-01",
    note: "Ikut ketentuan lembur nasional: jam pertama 1,5×, seterusnya 2×; hari libur 2× sampai jam ke-7, lalu 3× dan 4×.",
    rules: {
      overtime_mode: "statutory",
      /* Kepmenaker 102/2004 pasal 11: hari kerja biasa. */
      workday_tiers: [
        { after_hours: 0, multiplier: 1.5 },
        { after_hours: 1, multiplier: 2 },
      ],
      /* Istirahat mingguan / tanggal merah, pola enam hari kerja. */
      restday_tiers: [
        { after_hours: 0, multiplier: 2 },
        { after_hours: 7, multiplier: 3 },
        { after_hours: 8, multiplier: 4 },
      ],
      flat_multiplier: 1,
      monthly_divisor: 173,
      hourly_basis: "statutory",
      effective_days_per_year: 288,
      hourly_includes_allowance: false,
      week_pattern: "6day",
      overtime_rounding_minutes: 0,
      undertime_mode: "off",
      undertime_grace_minutes: 15,
      day_starts_minutes: 8 * 60,
      late_grace_minutes: 0,
      late_mode: "manual",
      late_forfeits_allowance: false,
    },
    created_by: "usr_shared",
    created_at: "2026-06-28T16:30:00+08:00",
  },
  {
    id: "prs_03", version: 3,
    effective_from: "2026-09-01",
    note: "Jawaban pemilik atas Q41 dan pembagi per jam: upah dibaca sebagai pokok + tunjangan, satu jam dihitung dari setahun gaji ÷ hari kerja efektif ÷ jam sehari, dan terlambat punya toleransi 15 menit.",
    rules: {
      overtime_mode: "statutory",
      workday_tiers: [
        { after_hours: 0, multiplier: 1.5 },
        { after_hours: 1, multiplier: 2 },
      ],
      restday_tiers: [
        { after_hours: 0, multiplier: 2 },
        { after_hours: 7, multiplier: 3 },
        { after_hours: 8, multiplier: 4 },
      ],
      flat_multiplier: 1,
      /* Tetap ada, tetap 173, dan tetap dipakai tangga lembur nasional sebagai
         pembanding — bukan lagi jawaban atas *satu jam di sini berapa* (D249). */
      monthly_divisor: 173,
      hourly_basis: "company",
      /* Enam hari kerja: 52 × 6 = 312, dikurangi tanggal merah dan cuti
         bersama. 288 adalah 24 hari sebulan — konvensi enam-hari yang lazim
         dipakai di sini, bukan hitungan yang dikarang layar ini. Pemilik yang
         menetapkan angkanya; layar aturan menampilkan aritmatikanya. */
      effective_days_per_year: 288,
      /* Pemilik: *pakai pokok+allowance untuk perhitungan semua* (D250). */
      hourly_includes_allowance: true,
      week_pattern: "6day",
      overtime_rounding_minutes: 0,
      undertime_mode: "off",
      undertime_grace_minutes: 15,
      day_starts_minutes: 8 * 60,
      /* Pemilik: *terlambat baru dipotong setelah 15 menit* (D251). */
      late_grace_minutes: 15,
      /* Masih manual: aturannya sudah ada, keputusan menyalakannya belum
         (D174). Layar aturan menghitung dampaknya per orang lebih dulu. */
      late_mode: "manual",
      /* Pemilik, mengoreksi jawabannya sendiri: *potongannya jam saja,
         allowance masih diberikan jika hadir* (D250). */
      late_forfeits_allowance: false,
    },
    created_by: "usr_shared",
    created_at: "2026-09-12T10:00:00+08:00",
  },
];
