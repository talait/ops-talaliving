/** Production contracts — cut to `docs/plan/02-database.md`, schema `prod`.
 *
 *  A seventh service (D148). It exists because of a question the owner asked
 *  about a piece of paper: the *surat lembur produksi* is one sheet with many
 *  names on it, and against each name is **what they worked on, how far it
 *  got, and how many**. That is not a payroll fact. It is a production fact
 *  that a payroll document happens to carry — and the moment somebody writes
 *  it down twice, the two copies start to disagree.
 *
 *  So production owns the work: what is being made, for whom, by when, and
 *  which stage it has reached. The overtime sheet references it, the same way
 *  a payment references a request line — by public number, validated at the
 *  seam, never by reaching into another service's tables (ADR-004).
 */

/** The stages a piece goes through, in order.
 *
 *  Seeded rather than typed by somebody, so that "which stage is it in" has
 *  the same answer on every screen and in every report. The list itself is our
 *  reading of a furniture workshop and is the one thing here most likely to be
 *  wrong in detail — Q35 asks the owner to correct it. Changing it is a seed
 *  edit, not a schema change, which is exactly why it is data.
 */
export interface ProcessStage {
  code: string;
  name: string;
  /** 1-based. A piece cannot be sanded before it is cut, and the order is what
   *  makes that checkable. */
  seq: number;
}

export const PROCESS_STAGES: ProcessStage[] = [
  { code: "POTONG", name: "Potong", seq: 1 },
  { code: "SERUT", name: "Serut / bentuk", seq: 2 },
  { code: "RAKIT", name: "Rakit", seq: 3 },
  { code: "AMPLAS", name: "Amplas", seq: 4 },
  { code: "FINISHING", name: "Finishing", seq: 5 },
  { code: "QC", name: "QC", seq: 6 },
  { code: "PACKING", name: "Packing", seq: 7 },
];

export const STAGE_NAME = (code: string) =>
  PROCESS_STAGES.find((s) => s.code === code)?.name ?? code;

export type WorkOrderStatus = "OPEN" | "DONE" | "CANCELLED";

/** One thing to make, in a quantity, by a date.
 *
 *  `due_date` is the whole point of the record. A workshop always knows what
 *  it is building; what it loses track of is which of the eleven things on the
 *  floor is the one that is late.
 */
export interface WorkOrder {
  id: string;
  wo_no: string;
  /** What is being made, in the workshop's own words. */
  item_name: string;
  description: string | null;
  qty: number;
  uom: string;
  /** Whose order this is for. A public code, validated at the seam (ADR-004). */
  project_code: string | null;
  /** Deadline. Not a plan — a promise somebody made to a customer. */
  due_date: string;
  status: WorkOrderStatus;
  created_at: string;
  created_by: string;
  cancelled_reason: string | null;
  note: string | null;
}

/** Work done, one entry per report.
 *
 *  Append-only, like every other record of something that happened (A5). A
 *  wrong entry is corrected by a negative one with a reason, never by editing
 *  the number — because "how much was done on Tuesday" is a question somebody
 *  will ask after the argument starts.
 */
export interface ProgressEntry {
  id: string;
  wo_id: string;
  stage: string;
  /** May be negative: a correction is an entry, not an edit. */
  qty: number;
  /** The office day the work happened, not the day it was typed. */
  work_date: string;
  /** Who did it — a name, not an employee link: production does not own
   *  people, and a subcontractor is a legitimate answer here. */
  worked_by: string | null;
  /** Where this came from. `overtime_sheet` entries are posted when a lembur
   *  sheet is approved, carrying the sheet number so the two can be told apart
   *  and so a re-post is a no-op (D147). */
  source: "manual" | "overtime_sheet";
  source_ref: string | null;
  note: string | null;
  recorded_by: string;
  recorded_at: string;
}

export interface StageProgress {
  stage: string;
  name: string;
  seq: number;
  /** Cumulative, from the entries. */
  done: number;
  /** Of the order's quantity. */
  percent: number;
}

export interface WorkOrderView extends WorkOrder {
  stages: StageProgress[];
  /** The furthest stage with anything finished — "sampai mana". */
  current_stage: string | null;
  current_stage_name: string;
  /** Finished all the way through the last stage. */
  completed: number;
  percent: number;
  /** Negative when the due date has passed. */
  days_left: number;
  late: boolean;
  /** Says plainly what is wrong, in words, for anybody reading the board. */
  warnings: string[];
}
