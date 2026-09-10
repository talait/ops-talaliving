import type { Attachment, AttachmentLink } from "@/services/documents/contracts";
import { trxIdByNo } from "./ledger";

/* Evidence, and where it hangs.
 *
 * The one to look at is att_04: a single supplier invoice covering three
 * ledger rows. Today that file would be one of the 674 sitting parked because
 * it "cannot be honestly named after one of them". Here it is three links,
 * each recording who declared it — which is the whole point of attaching from
 * the record instead of matching to it afterwards (ADR-010).
 */
export const ATTACHMENTS: Attachment[] = [
  { id: "att_01", storage_path: "demo/2026-08/nota-amplas-sejahtera.jpg", filename: "nota-amplas-sejahtera.jpg", sha256: "9f2a1c77b0e4", mime: "image/jpeg", bytes: 842_113, uploaded_by: "usr_putri", uploaded_at: "2026-08-20T16:05:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_02", storage_path: "demo/2026-08/bukti-transfer-amplas.jpg", filename: "bukti-transfer-amplas.jpg", sha256: "3b71ee90aa12", mime: "image/jpeg", bytes: 415_882, uploaded_by: "usr_putri", uploaded_at: "2026-08-20T16:08:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_03", storage_path: "demo/2026-08/foto-terima-amplas.jpg", filename: "foto-terima-amplas.jpg", sha256: "cc4410ab7731", mime: "image/jpeg", bytes: 1_204_776, uploaded_by: "usr_made", uploaded_at: "2026-08-25T13:35:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_04", storage_path: "demo/2026-08/invoice-makmur-sentosa-gabungan.pdf", filename: "invoice-makmur-sentosa-gabungan.pdf", sha256: "77de0192bb45", mime: "application/pdf", bytes: 288_401, uploaded_by: "usr_anggun", uploaded_at: "2026-08-31T10:00:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_05", storage_path: "demo/2026-08/bukti-transfer-plywood.jpg", filename: "bukti-transfer-plywood.jpg", sha256: "1a09fe33cd80", mime: "image/jpeg", bytes: 392_004, uploaded_by: "usr_anggun", uploaded_at: "2026-08-29T16:25:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_06", storage_path: "demo/2026-08/kwitansi-potong-rumput.jpg", filename: "kwitansi-potong-rumput.jpg", sha256: "5502ab11ff73", mime: "image/jpeg", bytes: 221_559, uploaded_by: "usr_anggun", uploaded_at: "2026-08-29T16:30:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_07", storage_path: "demo/2026-08/bukti-dp-indoveneer.jpg", filename: "bukti-dp-indoveneer.jpg", sha256: "8811cc02de44", mime: "image/jpeg", bytes: 508_220, uploaded_by: "usr_putri", uploaded_at: "2026-08-21T16:15:00+08:00", source: "web", duplicate_suspect: false },
  { id: "att_08", storage_path: "demo/2026-09/foto-terima-hpl.jpg", filename: "foto-terima-hpl.jpg", sha256: "aa19bb7700cd", mime: "image/jpeg", bytes: 1_882_330, uploaded_by: "usr_made", uploaded_at: "2026-09-02T09:45:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_09", storage_path: "demo/2026-09/foto-terima-veneer-tahap1.jpg", filename: "foto-terima-veneer-tahap1.jpg", sha256: "0d3311fa9b62", mime: "image/jpeg", bytes: 1_650_119, uploaded_by: "usr_made", uploaded_at: "2026-09-06T11:20:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_10", storage_path: "demo/2026-09/nota-makmur-090926.jpg", filename: "nota-makmur-090926.jpg", sha256: "6612ffab0091", mime: "image/jpeg", bytes: 733_902, uploaded_by: "usr_made", uploaded_at: "2026-09-09T17:22:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_11", storage_path: "demo/2026-09/nota-sinar-abadi.jpg", filename: "nota-sinar-abadi.jpg", sha256: "b0027fc31184", mime: "image/jpeg", bytes: 611_447, uploaded_by: "usr_andi", uploaded_at: "2026-09-10T08:05:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_12", storage_path: "demo/2026-09/struk-konsumsi.jpg", filename: "struk-konsumsi.jpg", sha256: "df9911aa0034", mime: "image/jpeg", bytes: 180_223, uploaded_by: "usr_anggun", uploaded_at: "2026-09-10T09:40:00+08:00", source: "web", duplicate_suspect: true },
  { id: "att_13", storage_path: "demo/2026-09/dokumen-pribadi.jpg", filename: "dokumen-pribadi.jpg", sha256: "4471bb2200fe", mime: "image/jpeg", bytes: 402_881, uploaded_by: "usr_shared", uploaded_at: "2026-09-07T20:10:00+08:00", source: "chat", duplicate_suspect: false },
  { id: "att_14", storage_path: "demo/2026-09/nota-rak-besi.jpg", filename: "nota-rak-besi.jpg", sha256: "2290ffcc7710", mime: "image/jpeg", bytes: 555_310, uploaded_by: "usr_made", uploaded_at: "2026-09-02T18:30:00+08:00", source: "chat", duplicate_suspect: false },
];

export const ATTACHMENT_LINKS: AttachmentLink[] = [
  { id: "lnk_01", attachment_id: "att_01", entity: "transaction", entity_no: "trx-26-08-20_003", kind: "Receipt / Invoice / Nota", linked_by: "usr_putri", linked_at: "2026-08-20T16:06:00+08:00" },
  { id: "lnk_02", attachment_id: "att_02", entity: "transaction", entity_no: "trx-26-08-20_003", kind: "Payment Proof", linked_by: "usr_putri", linked_at: "2026-08-20T16:09:00+08:00" },
  { id: "lnk_03", attachment_id: "att_03", entity: "pr_line", entity_no: "pr-26-08-18_01-L01", kind: "Receiving Item", linked_by: "usr_made", linked_at: "2026-08-25T13:36:00+08:00" },

  /* One invoice, three ledger rows. Attached from the first, then "juga
   * mencakup" added the other two — a first-class action, not a repair. */
  { id: "lnk_04", attachment_id: "att_04", entity: "transaction", entity_no: "trx-26-08-22_001", kind: "Receipt / Invoice / Nota", linked_by: "usr_anggun", linked_at: "2026-08-31T10:01:00+08:00" },
  { id: "lnk_05", attachment_id: "att_04", entity: "transaction", entity_no: "trx-26-08-31_001", kind: "Receipt / Invoice / Nota", linked_by: "usr_anggun", linked_at: "2026-08-31T10:02:00+08:00" },
  { id: "lnk_06", attachment_id: "att_04", entity: "transaction", entity_no: "trx-26-09-07_001", kind: "Receipt / Invoice / Nota", linked_by: "usr_anggun", linked_at: "2026-09-07T15:12:00+08:00" },

  { id: "lnk_07", attachment_id: "att_05", entity: "transaction", entity_no: "trx-26-08-29_002", kind: "Payment Proof", linked_by: "usr_anggun", linked_at: "2026-08-29T16:26:00+08:00" },
  { id: "lnk_08", attachment_id: "att_06", entity: "transaction", entity_no: "trx-26-08-29_003", kind: "Payment Proof", linked_by: "usr_anggun", linked_at: "2026-08-29T16:31:00+08:00" },
  { id: "lnk_09", attachment_id: "att_07", entity: "transaction", entity_no: "trx-26-08-21_002", kind: "Payment Proof", linked_by: "usr_putri", linked_at: "2026-08-21T16:16:00+08:00" },
  { id: "lnk_10", attachment_id: "att_08", entity: "po", entity_no: "po-26-08-14_01", kind: "Receiving Item", linked_by: "usr_made", linked_at: "2026-09-02T09:46:00+08:00" },
  { id: "lnk_11", attachment_id: "att_09", entity: "po", entity_no: "po-26-08-14_01", kind: "Receiving Item", linked_by: "usr_made", linked_at: "2026-09-06T11:21:00+08:00" },
  { id: "lnk_12", attachment_id: "att_02", entity: "pr_line", entity_no: "pr-26-08-18_01-L01", kind: "Payment Proof", linked_by: "usr_putri", linked_at: "2026-08-20T16:09:30+08:00" },
  { id: "lnk_13", attachment_id: "att_06", entity: "pr_line", entity_no: "pr-26-08-27_01-L02", kind: "Payment Proof", linked_by: "usr_anggun", linked_at: "2026-08-29T16:32:00+08:00" },
];

/** Referenced so the import is used and the ledger fixture stays the source of
 *  truth for transaction ids. */
export const SAMPLE_TRX_ID = trxIdByNo("trx-26-08-20_003");
