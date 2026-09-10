import type {
  Transaction, TransactionLine, PaymentAllocation, TransactionTypeCode,
  Direction, TrxStatus, EvidenceInboxRow,
} from "@/services/accounting/contracts";

type TrxSeed = [
  string, string, string, Direction, number, TransactionTypeCode,
  string | null, string | null, string, TrxStatus,
];

/* trx_no, date, account, direction, amount, type, vendor, project, description, status
 *
 * Thirty rows across the five accounts and most of the thirteen types. A few
 * things are deliberate rather than decorative:
 *   - trx-26-08-29_004 is VOID: amount zeroed, reason kept, row still there.
 *   - the BANK CHARGES rows are their own ledger lines and never count as
 *     coverage for anything (A14).
 *   - the BCA 064 rows are money entering a leadership account, which never
 *     pays a vendor directly.
 *   - two rows have no PR line behind them at all, which is what
 *     `v_unlinked_transactions` is for: shown, never hidden.
 */
const TRX_SEEDS: TrxSeed[] = [
  ["trx-26-08-20_001", "2026-08-20", "acc_bca271", "IN", 29_100_000, "CASHFLOW", null, null, "Transfer pendanaan ronde pay-26-08-22_01 dari BCA 064", "COMPLETED"],
  ["trx-26-08-20_002", "2026-08-20", "acc_bca064", "OUT", 29_100_000, "CASHFLOW", null, null, "Transfer ke BCA 271 — pendanaan mingguan", "COMPLETED"],
  ["trx-26-08-20_003", "2026-08-20", "acc_bca271", "OUT", 3_825_000, "SUPPLIERS", "vnd_07", "prj_25007", "Amplas 120 grit 500 lembar", "COMPLETED"],
  ["trx-26-08-20_004", "2026-08-20", "acc_bca271", "OUT", 6_500, "BANK CHARGES", null, null, "Biaya admin transfer", "COMPLETED"],
  ["trx-26-08-21_001", "2026-08-21", "acc_bca271", "OUT", 5_550_000, "SUPPLIERS", "vnd_02", "prj_25007", "Engsel sendok Huben 300 pcs", "POSTED"],
  ["trx-26-08-21_002", "2026-08-21", "acc_bca271", "OUT", 19_668_000, "PREPAID VENDOR", "vnd_08", "prj_25007", "DP 30% PO veneer & HPL po-26-08-14_01", "POSTED"],
  ["trx-26-08-21_003", "2026-08-21", "acc_bca271", "OUT", 6_500, "BANK CHARGES", null, null, "Biaya admin transfer", "COMPLETED"],
  ["trx-26-08-22_001", "2026-08-22", "acc_petty", "OUT", 185_000, "PRODUCTION", "vnd_03", "prj_25004", "Paku 5cm dan sekrup — pembelian mendadak", "COMPLETED"],
  ["trx-26-08-24_001", "2026-08-24", "acc_bni325", "OUT", 4_180_000, "RECCURING - UTILITIES", null, null, "Listrik workshop Agustus", "COMPLETED"],
  ["trx-26-08-24_002", "2026-08-24", "acc_petty", "OUT", 320_000, "PRODUCTION", null, null, "Pertalite kendaraan operasional", "COMPLETED"],
  ["trx-26-08-25_001", "2026-08-25", "acc_bni325", "OUT", 1_250_000, "OTHERS", "vnd_05", null, "Servis mesin planer", "COMPLETED"],
  ["trx-26-08-26_001", "2026-08-26", "acc_bca271", "OUT", 2_480_000, "PACKING" as TransactionTypeCode, "vnd_09", "prj_25007", "Bubble wrap dan lakban", "POSTED"],
  ["trx-26-08-27_001", "2026-08-27", "acc_bni325", "IN", 60_000_000, "CASHFLOW", null, null, "Top-up BNI 325 untuk payroll — dari BCA 064", "COMPLETED"],
  ["trx-26-08-27_002", "2026-08-27", "acc_bca064", "OUT", 60_000_000, "CASHFLOW", null, null, "Transfer ke BNI 325 — top-up payroll", "COMPLETED"],
  ["trx-26-08-28_001", "2026-08-28", "acc_bni325", "OUT", 28_400_000, "RECCURING - PAYROLL", null, null, "Payroll mingguan W35", "COMPLETED"],
  ["trx-26-08-29_001", "2026-08-29", "acc_bca271", "IN", 12_100_000, "CASHFLOW", null, null, "Transfer pendanaan ronde pay-26-08-31_01 dari BCA 064", "COMPLETED"],
  ["trx-26-08-29_005", "2026-08-29", "acc_bca064", "OUT", 12_100_000, "CASHFLOW", null, null, "Transfer ke BCA 271 — pendanaan ronde", "COMPLETED"],
  ["trx-26-08-29_002", "2026-08-29", "acc_bca271", "OUT", 11_680_000, "SUPPLIERS", "vnd_03", "prj_25004", "Plywood 18mm 40 lembar", "POSTED"],
  ["trx-26-08-29_003", "2026-08-29", "acc_petty", "OUT", 350_000, "OTHERS", "vnd_10", "prj_25004", "Jasa potong rumput halaman workshop", "COMPLETED"],
  ["trx-26-08-29_004", "2026-08-29", "acc_bca271", "OUT", 0, "SUPPLIERS", "vnd_03", null, "Plywood 18mm — input ganda", "VOID"],
  ["trx-26-08-31_001", "2026-08-31", "acc_bni325", "OUT", 890_000, "OFFICE", "vnd_03", null, "ATK dan kertas HVS", "COMPLETED"],
  ["trx-26-09-01_001", "2026-09-01", "acc_bca064", "IN", 185_000_000, "CASHFLOW", null, null, "Termin 2 pembayaran klien HOTEL UBUD", "COMPLETED"],
  ["trx-26-09-02_001", "2026-09-02", "acc_bca271", "OUT", 4_820_000, "SUPPLIERS", "vnd_04", "prj_25011", "Sanding sealer dan dempul kayu", "POSTED"],
  ["trx-26-09-02_002", "2026-09-02", "acc_petty", "OUT", 275_000, "PRODUCTION", null, null, "Pertamax kendaraan operasional", "COMPLETED"],
  ["trx-26-09-03_001", "2026-09-03", "acc_bni325", "OUT", 1_450_000, "ONLINE", "vnd_11", null, "Oli kompresor dan sparepart — Tokopedia", "POSTED"],
  ["trx-26-09-03_002", "2026-09-03", "acc_bni325", "IN", 70_000_000, "CASHFLOW", null, null, "Top-up BNI 325 untuk payroll — dari BCA 064", "COMPLETED"],
  ["trx-26-09-03_003", "2026-09-03", "acc_bca064", "OUT", 70_000_000, "CASHFLOW", null, null, "Transfer ke BNI 325 — top-up payroll", "COMPLETED"],
  ["trx-26-09-04_001", "2026-09-04", "acc_bni325", "OUT", 29_800_000, "RECCURING - PAYROLL", null, null, "Payroll mingguan W36", "COMPLETED"],
  ["trx-26-09-05_001", "2026-09-05", "acc_bca271", "OUT", 8_400_000, "CHINA", null, "prj_25009", "Hardware import — pembayaran supplier Guangzhou", "POSTED"],
  ["trx-26-09-05_002", "2026-09-05", "acc_bca271", "OUT", 15_000, "BANK CHARGES", null, null, "Biaya transfer luar negeri", "COMPLETED"],
  ["trx-26-09-07_001", "2026-09-07", "acc_petty", "OUT", 420_000, "WAREHOUSE", "vnd_03", null, "Rak besi gudang consumable", "POSTED"],
  ["trx-26-09-08_001", "2026-09-08", "acc_bni325", "OUT", 2_150_000, "CREDIT CARD", null, null, "Tagihan kartu kredit Mandiri Agustus", "COMPLETED"],
  ["trx-26-09-08_002", "2026-09-08", "acc_bca271", "OUT", 3_680_000, "SUPPLIERS", "vnd_12", "prj_25009", "Kayu sungkai papan 2cm 20 lembar", "POSTED"],
  ["trx-26-09-09_001", "2026-09-09", "acc_bni325", "OUT", 31_200_000, "RECCURING - PAYROLL", null, null, "Payroll mingguan W37", "COMPLETED"],
  ["trx-26-09-09_002", "2026-09-09", "acc_petty", "OUT", 96_000, "OFFICE", null, null, "Konsumsi rapat produksi", "COMPLETED"],
];

export const TRANSACTIONS: Transaction[] = TRX_SEEDS.map(
  ([trx_no, trx_date, account_id, direction, amount_idr, type_code, vendor_id, project_id, description, status], i) => ({
    id: `trx_${String(i + 1).padStart(3, "0")}`,
    trx_no,
    trx_date,
    account_id,
    direction,
    amount_idr,
    type_code,
    vendor_id,
    project_id,
    description,
    remark: null,
    status,
    source_ref: `seed:${trx_no}`,
    posted_by: i % 3 === 0 ? "usr_anggun" : "usr_putri",
    posted_at: `${trx_date}T16:00:00+08:00`,
    void_reason:
      trx_no === "trx-26-08-29_004"
        ? "VOID 2026-08-29 — nota yang sama sudah dibukukan sebagai trx-26-08-29_002."
        : null,
  }),
);

export function trxIdByNo(no: string): string {
  const found = TRANSACTIONS.find((t) => t.trx_no === no);
  if (!found) throw new Error(`fixture transaction ${no} not found`);
  return found.id;
}

export const TRANSACTION_LINES: TransactionLine[] = [
  { id: "trl_01", trx_id: trxIdByNo("trx-26-08-20_003"), line_no: 1, item_id: null, description: "AMPLAS 120 GRIT", qty: 500, uom: "lembar", unit_price: 7_650, amount: 3_825_000 },
  { id: "trl_02", trx_id: trxIdByNo("trx-26-08-21_001"), line_no: 1, item_id: null, description: "ENGSEL SENDOK HUBEN", qty: 300, uom: "pcs", unit_price: 18_500, amount: 5_550_000 },
  { id: "trl_03", trx_id: trxIdByNo("trx-26-08-29_002"), line_no: 1, item_id: null, description: "PLYWOOD 18MM 122X244", qty: 40, uom: "lembar", unit_price: 292_000, amount: 11_680_000 },
  { id: "trl_04", trx_id: trxIdByNo("trx-26-08-22_001"), line_no: 1, item_id: null, description: "PAKU 5CM", qty: 4, uom: "kg", unit_price: 22_500, amount: 90_000 },
  { id: "trl_05", trx_id: trxIdByNo("trx-26-08-22_001"), line_no: 2, item_id: null, description: "SEKRUP GYPSUM 1 INCH", qty: 2, uom: "box", unit_price: 47_500, amount: 95_000 },
];

/* Coverage, not a paid flag. A line becomes PAID because money actually
 * reached it — "a stamp pointing at nothing is not paid" (A10). */
export const PAYMENT_ALLOCATIONS: PaymentAllocation[] = [
  { id: "alc_01", trx_id: trxIdByNo("trx-26-08-20_003"), pr_line_no: "pr-26-08-18_01-L01", po_no: null, amount: 3_825_000, method: "transfer", superseded_by: null, allocated_by: "usr_putri", allocated_at: "2026-08-20T16:10:00+08:00" },
  { id: "alc_02", trx_id: trxIdByNo("trx-26-08-21_001"), pr_line_no: "pr-26-08-18_01-L02", po_no: null, amount: 5_550_000, method: "transfer", superseded_by: null, allocated_by: "usr_putri", allocated_at: "2026-08-21T16:10:00+08:00" },
  { id: "alc_03", trx_id: trxIdByNo("trx-26-08-21_002"), pr_line_no: "pr-26-08-18_01-L03", po_no: "po-26-08-14_01", amount: 19_668_000, method: "transfer", superseded_by: null, allocated_by: "usr_putri", allocated_at: "2026-08-21T16:12:00+08:00" },
  { id: "alc_04", trx_id: trxIdByNo("trx-26-08-29_002"), pr_line_no: "pr-26-08-27_01-L01", po_no: null, amount: 11_680_000, method: "transfer", superseded_by: null, allocated_by: "usr_anggun", allocated_at: "2026-08-29T16:20:00+08:00" },
  { id: "alc_05", trx_id: trxIdByNo("trx-26-08-29_003"), pr_line_no: "pr-26-08-27_01-L02", po_no: null, amount: 350_000, method: "cash", superseded_by: null, allocated_by: "usr_anggun", allocated_at: "2026-08-29T16:22:00+08:00" },
];

/* The exception road, and only that: documents whose parent is genuinely
 * unknown because somebody bought first (ADR-010). Three waiting, one already
 * resolved to a note, one that produced a transaction. If this list grows,
 * people are routing around the normal road. */
export const EVIDENCE_INBOX: EvidenceInboxRow[] = [
  {
    id: "inb_01", ref_id: "upl_26-09-09_01~x0", origin: "chat", status: "PENDING",
    attachment_id: "att_10", reported_by: "usr_made", reported_at: "2026-09-09T17:22:00+08:00",
    extracted: { vendor_name: "TOKO BANGUNAN MAKMUR SENTOSA", document_date: "2026-09-09", amount_idr: 685_000, doc_type: "Receipt / Invoice / Nota", confidence: 88, note: "Beli dulu, belum ada PR — kebutuhan mendadak." },
    produced_trx_id: null, produced_pr_line_no: null, similar_trx_nos: [],
  },
  {
    id: "inb_02", ref_id: "upl_26-09-10_01~x0", origin: "chat", status: "PENDING",
    attachment_id: "att_11", reported_by: "usr_andi", reported_at: "2026-09-10T08:05:00+08:00",
    extracted: { vendor_name: "UD SINAR ABADI", document_date: "2026-09-10", amount_idr: 1_450_000, doc_type: "Receipt / Invoice / Nota", confidence: 64, note: "Tulisan tangan, sebagian tidak terbaca." },
    produced_trx_id: null, produced_pr_line_no: null,
    similar_trx_nos: ["trx-26-09-03_001"],
  },
  {
    id: "inb_03", ref_id: "upl_26-09-10_02~x0", origin: "web", status: "PENDING",
    attachment_id: "att_12", reported_by: "usr_anggun", reported_at: "2026-09-10T09:40:00+08:00",
    extracted: { vendor_name: null, document_date: "2026-09-06", amount_idr: 96_000, doc_type: "Receipt / Invoice / Nota", confidence: 41, note: "Struk pudar." },
    produced_trx_id: null, produced_pr_line_no: null, similar_trx_nos: [],
  },
  {
    id: "inb_04", ref_id: "upl_26-09-07_01~x0", origin: "chat", status: "NOTED",
    attachment_id: "att_13", reported_by: "usr_shared", reported_at: "2026-09-07T20:10:00+08:00",
    extracted: { vendor_name: null, document_date: "2026-09-07", amount_idr: 2_400_000, doc_type: "Others", confidence: 72, note: "Bukan transaksi perusahaan." },
    produced_trx_id: null, produced_pr_line_no: null, similar_trx_nos: [],
  },
  {
    id: "inb_05", ref_id: "upl_26-09-02_01~x0", origin: "chat", status: "CONFIRMED",
    attachment_id: "att_14", reported_by: "usr_made", reported_at: "2026-09-02T18:30:00+08:00",
    extracted: { vendor_name: "TOKO BANGUNAN MAKMUR SENTOSA", document_date: "2026-09-02", amount_idr: 420_000, doc_type: "Receipt / Invoice / Nota", confidence: 91 },
    produced_trx_id: trxIdByNo("trx-26-09-07_001"), produced_pr_line_no: null, similar_trx_nos: [],
  },
];
