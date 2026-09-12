import type { AppSetting } from "@/services/identity/contracts";

/** Every number and name in this system that somebody might reasonably think
 *  is theirs to change — with a straight answer about each one (D214).
 *
 *  The list is deliberately complete rather than short. A setting that exists
 *  in the code and not on this page is a number nobody knows they are living
 *  with; a setting on this page that cannot be changed here is a question
 *  already answered, which is worth more than a box.
 */
export const APP_SETTINGS: AppSetting[] = [
  /* ── Identity ─────────────────────────────────────────────────────── */
  {
    key: "brand.name", group: "identity", label: "Nama aplikasi",
    help: "Muncul di sidebar, tab browser, dan halaman masuk.",
    kind: "text", value: "OPS TALALIVING", default_value: "OPS TALALIVING",
    unit: null, choices: null, reach: "display",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },
  {
    key: "brand.tagline", group: "identity", label: "Nama badan usaha",
    help: "Baris kecil di bawah nama aplikasi.",
    kind: "text", value: "PT TALAHOME", default_value: "PT TALAHOME",
    unit: null, choices: null, reach: "display",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },

  /* ── Format ───────────────────────────────────────────────────────── */
  {
    key: "format.locale", group: "format", label: "Format angka",
    help: "Menentukan pemisah ribuan dan desimal. Antarmuka berbahasa Inggris dengan angka bergaya Indonesia adalah satu-satunya kombinasi yang bisa salah dibaca seribu kali lipat (D36).",
    kind: "choice", value: "en-US", default_value: "en-US",
    unit: null, choices: ["en-US", "id-ID"], reach: "display",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },

  {
    key: "format.language", group: "format", label: "Bahasa",
    help: "Menerjemahkan menu, kata-kata umum, dan seluruh John Lau — termasuk panduan dan alasan penolakannya. Isi tiap layar tetap seperti sekarang, dan kosakata perusahaan (MSG SENT, SP NORTH, PKWT, kode akun, status) tidak pernah diterjemahkan: itu nama, bukan kata (D224).",
    kind: "choice", value: "en", default_value: "en",
    unit: null, choices: ["en", "id"], reach: "display",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },

  /* ── Operational thresholds: safe to move, and they only look forward ── */
  {
    key: "ops.doc_expiry_warning_days", group: "operations",
    label: "Peringatan dokumen kedaluwarsa",
    help: "Berapa hari sebelum masa berlaku habis sebuah kontrak atau sertifikat mulai ditandai di Berkas 201.",
    kind: "number", value: "60", default_value: "60",
    unit: "hari", choices: null, reach: "forward",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },
  {
    key: "ops.agent_move_on_days", group: "operations",
    label: "Pindah ke agen berikutnya setelah",
    help: "Agen yang dihubungi dan diam selama ini ditandai untuk ditinggalkan. Dihitung, tidak pernah disimpan — mengubah angkanya langsung mengubah daftar tindak lanjut hari ini (D184).",
    kind: "number", value: "7", default_value: "7",
    unit: "hari", choices: null, reach: "forward",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },
  {
    key: "ops.low_yield_percent", group: "operations",
    label: "Rendemen kayu dianggap rendah di bawah",
    help: "Di bawah angka ini sebuah kiriman log ditandai untuk ditanyakan. Tidak memblokir apa pun.",
    kind: "number", value: "45", default_value: "45",
    unit: "%", choices: null, reach: "forward",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },
  {
    key: "ops.max_upload_mb", group: "operations", label: "Ukuran berkas maksimum",
    help: "Foto dari ponsel jarang lewat 8 MB; batas ini untuk pindaian dan PDF.",
    kind: "number", value: "15", default_value: "15",
    unit: "MB", choices: null, reach: "forward",
    locked_reason: null, managed_at: null, affects: [],
    updated_by: null, updated_at: null,
  },

  /* ── The ones that reach backwards ────────────────────────────────── */
  {
    key: "time.office_tz", group: "retention", label: "Zona waktu kantor",
    help: "Menentukan hari kerja sebuah absensi, lembur, dan rekap harian termasuk hari yang mana.",
    kind: "choice", value: "WITA (UTC+8)", default_value: "WITA (UTC+8)",
    unit: null, choices: null, reach: "retroactive",
    locked_reason: "Mengubahnya tidak mengubah apa yang terjadi berikutnya — ia mengubah hari kerja mana yang dimiliki setiap scan, setiap slip gaji, dan setiap rekap harian yang sudah ada. Perusahaan yang benar-benar pindah zona waktu butuh migrasi, bukan dropdown.",
    managed_at: null,
    affects: ["Absensi", "Lembur", "Slip gaji", "Rekap aktivitas harian", "Aturan pindah agen"],
    updated_by: null, updated_at: null,
  },
  {
    key: "money.payment_tolerance_idr", group: "retention",
    label: "Toleransi selisih pembayaran",
    help: "Selisih di bawah nilai ini membuat sebuah baris terbaca lunas.",
    kind: "number", value: "1000", default_value: "1000",
    unit: "Rp", choices: null, reach: "retroactive",
    locked_reason: "Menaikkannya membuat baris-baris lama yang kurang bayar mendadak terbaca lunas, tanpa satu pun rupiah berpindah. Angka ini menutup pembulatan bank, bukan kekurangan bayar.",
    managed_at: null,
    affects: ["Status lunas baris permintaan", "Termin PO", "Kalender pembayaran"],
    updated_by: null, updated_at: null,
  },
  {
    key: "hr.pay_rules", group: "retention", label: "Skema gaji, lembur, dan undertime",
    help: "Pengali lembur, pembagi gaji bulanan ke tarif per jam, mode undertime.",
    kind: "text", value: "versi berlaku lihat Aturan penggajian", default_value: "—",
    unit: null, choices: null, reach: "retroactive",
    locked_reason: "Diubah sebagai versi baru bertanggal, supaya slip gaji Maret tetap bisa dihitung ulang dengan aturan yang dipakai bulan Maret (D173). IT yang mengubahnya, HRD membacanya (D193).",
    managed_at: "/it/aturan-gaji",
    affects: ["Semua slip gaji", "Perhitungan lembur", "Potongan kurang jam"],
    updated_by: null, updated_at: null,
  },
  {
    key: "it.activity_retention", group: "retention", label: "Retensi log aktivitas",
    help: "Detail disimpan 30 hari, rekap harian per orang 6 bulan.",
    kind: "text", value: "30 hari detail · 6 bulan rekap", default_value: "30 hari detail · 6 bulan rekap",
    unit: null, choices: null, reach: "retroactive",
    locked_reason: "Memendekkannya tidak menyembunyikan data, ia menghapusnya pada sapuan berikutnya — dan penghapusan itu satu-satunya penghapusan di sistem ini (D189). Angkanya jawaban pemilik atas Q22, bukan preferensi.",
    managed_at: "/it/aktivitas",
    affects: ["Detail aktivitas lewat 30 hari", "Rekap harian lewat 6 bulan"],
    updated_by: null, updated_at: null,
  },
  {
    key: "hr.late_after", group: "retention", label: "Terlambat dihitung setelah",
    help: "Jam berapa sebuah scan masuk mulai dihitung terlambat.",
    kind: "text", value: "08:00", default_value: "08:00",
    unit: null, choices: null, reach: "retroactive",
    locked_reason: "Menggesernya mengubah berapa hari terlambat yang tercatat di absensi bulan-bulan lalu. Lagipula berapa nilai satu menit keterlambatan belum pernah dinyatakan siapa pun (Q41), jadi angkanya menghitung menit dan tidak pernah menjadi rupiah.",
    managed_at: null,
    affects: ["Absensi", "Catatan keterlambatan di slip gaji"],
    updated_by: null, updated_at: null,
  },
];
