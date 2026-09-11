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


/* ------------------------------------------------------------------ */
/* Master data: what we make, and what each one is made of             */
/* ------------------------------------------------------------------ */

/** Something the business **sells and makes**.
 *
 *  Deliberately not the same table as `procure.items` (D149). Those are things
 *  we *buy* — plywood, HPL, screws, a litre of coating — and they are half
 *  uncurated by design, because a purchase can name something nobody has
 *  catalogued yet. A product is the opposite: it is quoted to a client, put on
 *  a work order, and made, so it exists before anybody references it and is
 *  always curated.
 *
 *  The two meet in the bill of materials, which is a product pointing at
 *  purchased items by their code, at the seam (ADR-004).
 */
export interface Product {
  id: string;
  /** Stable, human, on the drawing and the work order. */
  product_code: string;
  name: string;
  /** Meja, Kursi, Lemari, Pintu — a word, not a hierarchy. */
  category: string;
  uom: string;
  description: string | null;
  /** Length × width × height in mm, as the workshop writes it. Free text
   *  because a chair has three numbers and a door has two. */
  dimension: string | null;
  /** Working days from start to finished, for promising a date. A hint, never
   *  a schedule: the work order carries the date that was actually promised. */
  lead_time_days: number | null;
  active: boolean;
  note: string | null;
}

/** One line of a bill of materials: what goes into one unit of the product.
 *
 *  A component is either a **purchased material** (a `procure.items` code) or
 *  **another product** — a drawer box that goes into a wardrobe. Both are
 *  carried as a public code and resolved at the screen, never joined across
 *  services (ADR-004).
 */
export interface BomComponent {
  id: string;
  product_id: string;
  kind: "material" | "product";
  /** `procure.items.code`, or another `products.product_code`. */
  ref_code: string;
  /** Per ONE unit of the parent. */
  qty: number;
  uom: string;
  /** Susut — the share that becomes offcuts and dust. 10 means 10%, so a
   *  board of 2 m² at 10% needs 2,2 m² bought. Kept apart from `qty` because
   *  the quantity in the drawing and the quantity to buy are different
   *  numbers, and conflating them is how a workshop runs out (D149). */
  waste_percent: number;
  note: string | null;
}

export interface BomLineView extends BomComponent {
  /** Resolved at the seam by whoever reads it; `null` when the code no longer
   *  names anything, which is a thing to see rather than to hide. */
  ref_name: string | null;
  /** `qty` plus waste — what actually has to be bought for one unit. */
  qty_with_waste: number;
  /** From the material's curated standard price, falling back to what it last
   *  cost. Null when neither exists. */
  unit_price: number | null;
  price_source: "standard" | "last" | "none";
  subtotal: number | null;
}

export interface ProductView extends Product {
  components: BomLineView[];
  /** Material cost for one unit, from the components that have a price. */
  material_cost: number | null;
  /** How many components could not be priced — the figure above is only worth
   *  what this number says it is. */
  unpriced: number;
  /** Components whose code no longer resolves. */
  broken_refs: number;
  warnings: string[];
}
