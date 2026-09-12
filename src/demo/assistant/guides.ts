/** The SOP, as steps somebody can follow while the screen is open beside them.
 *
 *  Written as **the rule and then the click**, not the click alone. A step that
 *  says *press Issue* teaches somebody to press Issue; a step that says *until
 *  it is issued nothing is owed, so a draft is the safe place to stop* teaches
 *  them when not to (D222).
 */
import type { GuideStep } from "@/services/assistant/contracts";

export const GUIDES: Record<string, { title: string; route: string; steps: GuideStep[] }> = {
  "guide.create_po": {
    title: "Membuat purchase order",
    route: "/procurement/po",
    steps: [
      {
        text: "Pastikan barisnya sudah disetujui dulu. PO dibuat dari baris permintaan yang sudah punya persetujuan barang.",
        href: "/procurement/meeting",
        rule: "Persetujuan barang dan persetujuan uang itu dua hal berbeda, dan yang pertama harus ada sebelum kita memesan ke vendor.",
      },
      {
        text: "Buka Purchase Orders, tekan Add new PO, pilih vendornya.",
        href: "/procurement/po",
        rule: null,
      },
      {
        text: "Isi barisnya: barang, jumlah, dan harga satuan. Nilai barisnya dihitung dari jumlah × harga, kecuali baris jasa yang nominalnya diketik langsung.",
        href: null,
        rule: "Baris jasa tidak punya jumlah, jadi kalau nominalnya dihitung ulang dari jumlah × harga hasilnya nol.",
      },
      {
        text: "Kalau ada uang muka, isi di kolom deposit. Kalau tidak, kosongkan.",
        href: null,
        rule: null,
      },
      {
        text: "Tekan Issue untuk mengirimkannya, atau centang draft kalau belum mau dikirim.",
        href: null,
        rule: "Sebelum di-issue tidak ada yang kita hutangi; sesudahnya depositnya sudah jadi kewajiban. Draft adalah tempat berhenti yang aman.",
      },
      {
        text: "PO yang sudah issued dicetak dari halaman PO-nya sendiri, bukan dari screenshot.",
        href: null,
        rule: "Yang dicetak adalah dokumennya, tanpa menu dan tanpa sidebar.",
      },
    ],
  },

  "guide.receive_goods": {
    title: "Mencatat barang datang",
    route: "/procurement/penerimaan",
    steps: [
      {
        text: "Siapa pun yang melihat barangnya datang boleh melaporkannya, termasuk di luar jam kerja. Foto barangnya dulu.",
        href: "/procurement/penerimaan",
        rule: "Barang sering datang malam. Laporan dan konfirmasi sengaja dipisah supaya yang melihat tidak harus orang yang berwenang.",
      },
      {
        text: "Procurement mengonfirmasi dengan tanda terima yang ditandatangani, jumlah, kondisi, dan siapa yang memeriksa.",
        href: null,
        rule: "Foto menjawab apa yang datang; tanda terima menjawab bahwa kita mengakuinya. Tiga minggu lagi yang menyelesaikan perdebatan adalah salah satunya yang ada.",
      },
      {
        text: "Barang yang dikonfirmasi masuk ke stok dengan sendirinya.",
        href: "/inventory/material",
        rule: "Hanya penerimaan yang dikonfirmasi yang dihitung sebagai nilai diterima.",
      },
    ],
  },

  "guide.pay_line": {
    title: "Membayar sebuah baris permintaan",
    route: "/procurement/tracker",
    steps: [
      {
        text: "Buka tracker vendornya dan lihat baris mana yang sudah boleh ditagih.",
        href: "/procurement/tracker",
        rule: "Yang sudah dikontrakkan belum tentu sudah boleh ditagih — yang menentukan adalah barangnya sudah diterima.",
      },
      {
        text: "Bayar dari barisnya, bukan dengan membuat transaksi terpisah.",
        href: null,
        rule: "Membayar satu baris itu satu tindakan: transaksinya, alokasinya ke baris itu, dan dokumennya ditulis bersama-sama. Kalau dipisah, salah satunya akan hilang.",
      },
      {
        text: "Lampirkan bukti transfernya.",
        href: null,
        rule: "Satu bukti transfer boleh menutup beberapa pembelian, dan satu pembelian boleh dibayar dua kali — tunai dan transfer. Keduanya normal dan keduanya terlihat di layar verifikasi.",
      },
    ],
  },
};
