import type { WorkOrder, ProgressEntry } from "@/services/production/contracts";

/** The workshop floor, as it would look on a Friday.
 *
 *  Six orders, deliberately not all healthy: one finished, one comfortable,
 *  one that is going to be late and can be seen to be late, one that has not
 *  started with four days to go, and one where finishing has been reported on
 *  more pieces than were sanded — which is either a mis-keyed number or work
 *  that skipped a stage, and either way is something a supervisor should be
 *  told about rather than something the screen should hide.
 */
export const WORK_ORDERS: WorkOrder[] = [
  {
    id: "wo_01", wo_no: "spk-26-08-24_01",
    item_name: "Meja makan jati 220×100",
    description: "BABY ISLAND — 4 set, finishing natural matt.",
    qty: 4, uom: "set", project_code: "BABY ISLAND",
    due_date: "2026-09-05", status: "OPEN",
    created_at: "2026-08-24T08:00:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: null,
  },
  {
    id: "wo_02", wo_no: "spk-26-08-24_02",
    item_name: "Kursi makan jati",
    description: "BABY ISLAND — 24 pcs, mengikuti meja wo_01.",
    qty: 24, uom: "pcs", project_code: "BABY ISLAND",
    due_date: "2026-09-12", status: "OPEN",
    created_at: "2026-08-24T08:05:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: null,
  },
  {
    id: "wo_03", wo_no: "spk-26-08-28_01",
    item_name: "Lemari pakaian 3 pintu",
    description: "VILLA SANUR — HPL putih, handle hitam.",
    qty: 6, uom: "unit", project_code: "VILLA SANUR",
    due_date: "2026-09-09", status: "OPEN",
    created_at: "2026-08-28T09:10:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: null,
  },
  {
    id: "wo_04", wo_no: "spk-26-09-01_01",
    item_name: "Rak display besi–kayu",
    description: "SHOWROOM — belum mulai, menunggu besi dari vendor.",
    qty: 10, uom: "unit", project_code: "SHOWROOM",
    due_date: "2026-09-15", status: "OPEN",
    created_at: "2026-09-01T08:30:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: "Menunggu rangka besi dari Makmur Sentosa.",
  },
  {
    id: "wo_05", wo_no: "spk-26-08-10_01",
    item_name: "Nakas jati kecil",
    description: "VILLA SANUR — selesai dan sudah dikirim.",
    qty: 8, uom: "unit", project_code: "VILLA SANUR",
    due_date: "2026-08-29", status: "DONE",
    created_at: "2026-08-10T08:00:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: null,
  },
  {
    id: "wo_06", wo_no: "spk-26-08-30_01",
    item_name: "Pintu panel jati 90×210",
    description: "VILLA SANUR — 12 daun pintu.",
    qty: 12, uom: "daun", project_code: "VILLA SANUR",
    due_date: "2026-09-08", status: "OPEN",
    created_at: "2026-08-30T08:00:00+08:00", created_by: "usr_made",
    cancelled_reason: null, note: null,
  },
];

const e = (
  id: string, wo_id: string, stage: string, qty: number, work_date: string,
  worked_by: string | null, note: string | null = null,
): ProgressEntry => ({
  id, wo_id, stage, qty, work_date, worked_by,
  source: "manual", source_ref: null, note,
  recorded_by: "usr_made", recorded_at: `${work_date}T17:00:00+08:00`,
});

export const PRODUCTION_PROGRESS: ProgressEntry[] = [
  /* wo_01 — meja BABY ISLAND. Past its date with one set left in finishing. */
  e("prg_01", "wo_01", "POTONG", 4, "2026-08-25", "Tim potong"),
  e("prg_02", "wo_01", "SERUT", 4, "2026-08-26", "Karjo"),
  e("prg_03", "wo_01", "RAKIT", 4, "2026-08-28", "Trisno"),
  e("prg_04", "wo_01", "AMPLAS", 4, "2026-08-29", "Sumiati"),
  e("prg_05", "wo_01", "FINISHING", 3, "2026-09-02", "Sakirin"),
  e("prg_06", "wo_01", "QC", 3, "2026-09-03", "Made Suparta"),
  e("prg_07", "wo_01", "PACKING", 3, "2026-09-03", "Tim packing"),

  /* wo_02 — kursi. Early stages, plenty of time. */
  e("prg_08", "wo_02", "POTONG", 24, "2026-08-27", "Tim potong"),
  e("prg_09", "wo_02", "SERUT", 18, "2026-08-31", "Karjo"),
  e("prg_10", "wo_02", "RAKIT", 10, "2026-09-03", "Trisno"),

  /* wo_03 — lemari. Behind, and the date is close. */
  e("prg_11", "wo_03", "POTONG", 6, "2026-08-31", "Tim potong"),
  e("prg_12", "wo_03", "SERUT", 6, "2026-09-01", "Pranowo"),
  e("prg_13", "wo_03", "RAKIT", 2, "2026-09-04", "Trisno"),

  /* wo_05 — nakas, finished all the way through. */
  e("prg_14", "wo_05", "POTONG", 8, "2026-08-12", "Tim potong"),
  e("prg_15", "wo_05", "SERUT", 8, "2026-08-13", "Karjo"),
  e("prg_16", "wo_05", "RAKIT", 8, "2026-08-17", "Trisno"),
  e("prg_17", "wo_05", "AMPLAS", 8, "2026-08-19", "Sumiati"),
  e("prg_18", "wo_05", "FINISHING", 8, "2026-08-24", "Sakirin"),
  e("prg_19", "wo_05", "QC", 8, "2026-08-26", "Made Suparta"),
  e("prg_20", "wo_05", "PACKING", 8, "2026-08-27", "Tim packing"),

  /* wo_06 — pintu. Finishing reported on more pieces than were sanded: either
     a mis-keyed number or work that skipped a stage. The board says so rather
     than quietly averaging it away. */
  e("prg_21", "wo_06", "POTONG", 12, "2026-09-01", "Tim potong"),
  e("prg_22", "wo_06", "SERUT", 12, "2026-09-02", "Pranowo"),
  e("prg_23", "wo_06", "RAKIT", 9, "2026-09-03", "Trisno"),
  e("prg_24", "wo_06", "AMPLAS", 4, "2026-09-04", "Sumiati"),
  e("prg_25", "wo_06", "FINISHING", 7, "2026-09-04", "Sakirin", "Dilaporkan sore, angka menyusul dari mandor."),
];
