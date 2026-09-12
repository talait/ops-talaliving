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
 *  the same answer on every screen and in every report. Changing the list is a
 *  seed edit, not a schema change, which is exactly why it is data.
 *
 *  **Four, down from seven** (D253). The owner's answer to Q35 was
 *  *sederhanakan, karena ada item yang dilempar ke vendor dan kita tinggal
 *  finishing dan packing* — and the second half of that sentence is what
 *  decided the shape of the first. Seven stages could only describe a
 *  subcontracted piece as *four stages mysteriously skipped*; four stages, with
 *  the making of the piece as **one** of them, describe it as what it is: a
 *  different route through the same workshop, one stage shorter.
 *
 *  The collapsed detail is not thrown away — see `LEGACY_STAGES`.
 */
export interface ProcessStage {
  code: string;
  name: string;
  /** 1-based. A piece cannot be finished before it is built, and the order is
   *  what makes that checkable. */
  seq: number;
  /** What the workshop actually does inside it, for the screen. Not stages:
   *  nobody reports against these, they are here so *Pembuatan* is not a word
   *  somebody has to interpret. */
  covers: string;
}

export const PROCESS_STAGES: ProcessStage[] = [
  { code: "PEMBUATAN", name: "Pembuatan", seq: 1, covers: "potong · serut / bentuk · rakit" },
  { code: "FINISHING", name: "Finishing", seq: 2, covers: "amplas · cat / coating" },
  { code: "QC", name: "QC", seq: 3, covers: "periksa sebelum dibungkus" },
  { code: "PACKING", name: "Packing", seq: 4, covers: "bungkus, siap kirim" },
];

/** Every stage code that counts towards each of the four, old and new.
 *
 *  Progress already recorded **keeps its own stage code** — that was the
 *  condition attached to Q35 from the day it was asked, and it is the ordinary
 *  rule here anyway: nothing that happened is rewritten (A5). So the old codes
 *  stay in the data and are rolled up on read.
 *
 *  Two things about the roll-up, and the second one is the trap.
 *
 *  **It is a minimum, not a sum.** Four chairs cut, four planed and four
 *  assembled is four chairs made, not twelve. A piece has finished *Pembuatan*
 *  when it has finished every step inside it, so the count is the smallest of
 *  the steps that were actually recorded.
 *
 *  **A stage is a source of itself.** `FINISHING` is the name of one of the
 *  four *and* the name of one of the seven that collapsed into it, so an entry
 *  reading `FINISHING` cannot be told apart from a new one — and adding "the
 *  direct entries" to "the rolled-up ones" counted the same pieces twice, as
 *  amplas 4 + finishing 3 = 7 of an order for 4 (F74). Listing every source,
 *  the stage's own code included, removes the distinction rather than trying
 *  to guess it.
 */
export const STAGE_SOURCES: Record<string, { code: string; name: string }[]> = {
  PEMBUATAN: [
    { code: "POTONG", name: "Potong" },
    { code: "SERUT", name: "Serut / bentuk" },
    { code: "RAKIT", name: "Rakit" },
    { code: "PEMBUATAN", name: "Pembuatan" },
  ],
  FINISHING: [
    { code: "AMPLAS", name: "Amplas" },
    { code: "FINISHING", name: "Finishing" },
  ],
  QC: [{ code: "QC", name: "QC" }],
  PACKING: [{ code: "PACKING", name: "Packing" }],
};

const ALL_SOURCES = Object.values(STAGE_SOURCES).flat();

export const STAGE_NAME = (code: string) =>
  PROCESS_STAGES.find((s) => s.code === code)?.name
  ?? ALL_SOURCES.find((s) => s.code === code)?.name
  ?? code;

/** How a piece gets made.
 *
 *  A route is a **list of stages**, not a flag, because the thing that differs
 *  between them is exactly which stages apply. A subcontracted order does not
 *  have *Pembuatan at 0%* — it does not have Pembuatan. Rendering a stage that
 *  is not on the route as an empty bar would say *nobody has started building
 *  this*, which is false about goods a vendor has already built (D254).
 */
export type RouteCode = "IN_HOUSE" | "SUBCON";

export interface ProductionRoute {
  code: RouteCode;
  name: string;
  /** Said in the workshop's own terms, for the picker. */
  description: string;
  stages: string[];
}

export const ROUTES: ProductionRoute[] = [
  {
    code: "IN_HOUSE",
    name: "Dikerjakan sendiri",
    description: "Dibuat dari bahan di bengkel sendiri, sampai dibungkus.",
    stages: ["PEMBUATAN", "FINISHING", "QC", "PACKING"],
  },
  {
    code: "SUBCON",
    name: "Dilempar ke vendor",
    description: "Barangnya dibuat vendor. Kembali ke bengkel untuk finishing dan packing.",
    stages: ["FINISHING", "QC", "PACKING"],
  },
];

export const ROUTE = (code: RouteCode) =>
  ROUTES.find((r) => r.code === code) ?? ROUTES[0];

/** Are the goods physically in the workshop?
 *
 *  **One predicate, read by both the API and the screen.** The first version
 *  had the rule twice — the API refused on *sent and not back* and on *never
 *  sent*, and the drawer hid its reporting form on `at_vendor`, which is only
 *  the first of those. So an order the vendor had not even been given yet
 *  offered a form that the API would refuse on submit (F75). Offering
 *  something that will be refused is a trap, not a choice, and two conditions
 *  written separately will always drift into being two different conditions.
 *
 *  An in-house order is always on site: there is nowhere else for it to be.
 */
export function goodsOnSite(
  wo: Pick<WorkOrder, "route" | "subcon_sent_on" | "subcon_returned_on">,
): boolean {
  if (wo.route !== "SUBCON") return true;
  return wo.subcon_sent_on !== null && wo.subcon_returned_on !== null;
}

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
  /** The catalogue product this order is for, where there is one — which is
   *  what lets a customer's order line and the floor be compared (D150). Null
   *  for a one-off nobody has catalogued. */
  product_code: string | null;
  /** What is being made, in the workshop's own words. Kept even when a product
   *  is named: a work order says what it said on the day it was written. */
  item_name: string;
  description: string | null;
  qty: number;
  uom: string;
  /** Whose order this is for. A public code, validated at the seam (ADR-004). */
  project_code: string | null;
  /** Deadline. Not a plan — a promise somebody made to a customer. */
  due_date: string;
  /** Which stages this order actually goes through (D254). */
  route: RouteCode;
  /** The BOM revision this order was written against, pinned when it was
   *  created (D256). **Null is not "the current one"** — it means the order
   *  predates versioning, or its product has no released BOM, and the screen
   *  says so rather than showing today's list as though it were the one used.
   *  A figure may be missing; it may not be quietly wrong. */
  bom_rev: number | null;
  /** The vendor building it, on a `SUBCON` order. A public id validated at the
   *  seam, like every other cross-service reference (ADR-004). */
  subcon_vendor_id: string | null;
  /** When it left, when it was promised back, when it actually came back.
   *
   *  Three dates and not one status, for the reason every status ladder in
   *  this system is derived: *at the vendor* is `sent && !returned`, and a
   *  stored flag is a field somebody forgets to move while the goods sit in a
   *  lorry. `subcon_expected_back` is the vendor's promise — the same shape as
   *  a PO's expected delivery (D234), and marked as a promise wherever it is
   *  printed. */
  subcon_sent_on: string | null;
  subcon_expected_back: string | null;
  subcon_returned_on: string | null;
  subcon_note: string | null;
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
  covers: string;
  /** Cumulative, from the entries. Where old seven-stage entries rolled up
   *  into this one it is the **smallest** of them, never their sum (F74). */
  done: number;
  /** Of the order's quantity. */
  percent: number;
  /** Every source that carried a figure, with its own total, so the minimum
   *  above can be checked instead of believed. Only worth printing when there
   *  is more than one — a stage with a single source **is** that source. */
  parts: { code: string; name: string; done: number }[];
}

export interface WorkOrderView extends WorkOrder {
  /** **Only the stages on this order's route.** A stage the route does not
   *  contain is absent, not zero (D254). */
  stages: StageProgress[];
  route_name: string;
  /** Sent to the vendor and not back yet. Derived, never stored. */
  at_vendor: boolean;
  /** Whether any stage may be reported at all — the goods are in the building.
   *  The same predicate the API refuses on, so the screen cannot offer what
   *  the API will reject (F75). */
  goods_on_site: boolean;
  /** The product's newest released revision **now**, against this order's
   *  pinned one. When they differ the BOM has moved on since this order was
   *  written, which is a thing to see: the projection this order is measured
   *  against is the old list, deliberately. */
  product_current_rev: number | null;
  bom_drifted: boolean;
  /** Whether moving this order onto the newer revision is allowed at all — the
   *  same predicate the API refuses on, so the screen cannot offer a button
   *  that will be rejected (F75). False once anything has been built: the old
   *  list is what was actually consumed. */
  bom_repinnable: boolean;
  /** Days since it left. Null when it has not been sent. */
  days_at_vendor: number | null;
  /** Past the date the vendor promised, and still not back. The workshop is
   *  not late here; the vendor is, and the board must not say otherwise. */
  subcon_overdue: boolean;
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
  /** Size in **millimetres**, one number per axis (D150).
   *
   *  Structured rather than free text, because "ukuran" is a thing the system
   *  has to be able to check for — a product without it cannot be quoted,
   *  cut or checked — and a sentence cannot be checked. Anything that does not
   *  fit three axes (a diameter, a thickness, a radius) goes in
   *  `dimension_note`, which is where the free text went rather than being
   *  lost. */
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  dimension_note: string | null;
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
/** One dated version of a product's bill of material (D256).
 *
 *  The owner reversed the default on Q36: a BOM **is** versioned. The default
 *  had been current-state with every change audited, which preserves the
 *  history and loses the **pinning** — a wardrobe built in June reads today as
 *  though it had always used today's components, and the projection against
 *  what was actually bought becomes a comparison with the wrong list.
 *
 *  Two states and no more. A **draft** is being edited; a **released** one is
 *  frozen for ever. There is at most one draft per product, because a second
 *  one would raise the question of which the next work order pins to, and
 *  there is no answer to that question worth having.
 */
export interface BomRevision {
  id: string;
  product_id: string;
  /** 1, 2, 3 — per product, and printed everywhere as `rev 2`. */
  rev: number;
  /** Null while it is a draft. Set once, never cleared: releasing is what
   *  makes the revision a fact rather than a working copy (A5). */
  released_at: string | null;
  released_by: string | null;
  /** Why this version exists. Required to release — *rev 3* with no sentence
   *  is a number somebody will have to reverse-engineer from a diff. */
  note: string | null;
  created_at: string;
  created_by: string;
}

export interface BomRevisionView extends BomRevision {
  released_by_name: string | null;
  /** The revision a new work order would pin to: the newest released one. */
  is_current: boolean;
  is_draft: boolean;
  component_count: number;
  /** Work orders pinned to this revision. A released revision with orders
   *  behind it is the reason none of this can be edited. */
  used_by: number;
}

/** What changed between two revisions, line by line.
 *
 *  Computed from the two component lists rather than from an edit log: a diff
 *  derived from the things themselves cannot disagree with them, and an edit
 *  log can (A3). */
export interface BomDiffLine {
  ref_code: string;
  ref_name: string | null;
  change: "added" | "removed" | "changed";
  before: { qty: number; uom: string; waste_percent: number } | null;
  after: { qty: number; uom: string; waste_percent: number } | null;
}

export interface BomDiff {
  product_code: string;
  from_rev: number | null;
  to_rev: number;
  lines: BomDiffLine[];
  /** True when the two lists are identical — which is why releasing an
   *  unchanged draft is refused: a revision number for nothing is noise in a
   *  history somebody will later have to read. */
  identical: boolean;
}

export interface BomComponent {
  id: string;
  product_id: string;
  /** The revision this line belongs to. A line is never moved between
   *  revisions: opening a new draft **copies** the released one, so the
   *  released lines stay exactly as they were released (A5). */
  rev: number;
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

/** A drawing, as the product screen needs it. */
export interface ProductDrawing {
  attachment_id: string;
  filename: string;
  /** Set for a link; null for an uploaded file, which Phase 2 serves through a
   *  signed URL. */
  url: string | null;
  linked_by: string;
  linked_at: string;
}

export interface ProductView extends Product {
  /** The components **of the revision being viewed** — the draft where one is
   *  open, otherwise the newest released one. */
  components: BomLineView[];
  /** Which revision `components` came from, and what else exists. */
  viewing_rev: number | null;
  current_rev: number | null;
  draft_rev: number | null;
  revisions: BomRevisionView[];
  /** What the open draft changes against the newest released revision — **derived
   *  here, from the same component list this view already carries**, so it
   *  cannot describe a state the screen is not showing. Fetching it separately
   *  made it one edit stale, which is a diff that is confidently wrong (F77).
   *  Null when no draft is open. */
  draft_diff: BomDiff | null;
  /** `2200 × 1000 × 750 mm`, built from the three numbers so every screen
   *  spells it the same way. Null when nothing has been recorded. */
  dimension: string | null;
  /** What the workshop builds from, and what the client was shown (D150). */
  gambar_kerja: ProductDrawing | null;
  gambar_jadi: ProductDrawing | null;
  /** Master data is only useful when it is complete, so the gaps are counted
   *  rather than left to be discovered: ukuran, gambar kerja, gambar jadi,
   *  BOM. */
  missing: string[];
  /** Material cost for one unit, from the components that have a price. */
  material_cost: number | null;
  /** How many components could not be priced — the figure above is only worth
   *  what this number says it is. */
  unpriced: number;
  /** Components whose code no longer resolves. */
  broken_refs: number;
  warnings: string[];
}

/* ── Desain: the drafters' queue ───────────────────────────────────────────
 *
 *  The drawings themselves already exist as documents on a product (D150). What
 *  the drafting team has never had is the **queue** (D167): which items are
 *  ordered or already on the floor with no drawing behind them, whose turn each
 *  one is, which revision the workshop is actually cutting from, and what is
 *  stuck waiting for an answer nobody has given.
 *
 *  Three things this deliberately is not:
 *
 *  - **Not a file browser.** The files are on the product, on the same evidence
 *    road as everything else. This is the work, not the folder.
 *  - **Not a CAD integration.** A revision is a file somebody uploads with a
 *    number on it; what makes it useful is that the system knows which one was
 *    released and which one came after.
 *  - **Not an approval chain.** A drawing is released by the drafter who made
 *    it. What needs somebody else is a *question*, and that is its own row.
 */
export type DesignKind = "gambar_kerja" | "gambar_jadi";

export const DESIGN_KIND_LABEL: Record<DesignKind, string> = {
  gambar_kerja: "Gambar kerja",
  gambar_jadi: "Gambar jadi",
};

/** Where a drawing has got to. Deliberately four, because a fifth would be a
 *  state nobody could tell apart from its neighbour at a glance. */
export type DesignStatus =
  /** Nobody has started. */
  | "BELUM"
  /** Somebody is drawing it. */
  | "DIGAMBAR"
  /** Drawn, and waiting on an answer before it can be released. */
  | "TANYA"
  /** Released — the workshop may cut from it. */
  | "RILIS";

export const DESIGN_STATUS_LABEL: Record<DesignStatus, string> = {
  BELUM: "Belum digambar",
  DIGAMBAR: "Sedang digambar",
  TANYA: "Menunggu jawaban",
  RILIS: "Sudah rilis",
};

export interface DesignTask {
  id: string;
  task_no: string;
  /** `prod.products.product_code`. A task belongs to a product, not to an
   *  order: the same table is drawn once and used by every order after. */
  product_code: string;
  kind: DesignKind;
  status: DesignStatus;
  /** Who is drawing it. Null is honest — an unassigned task is the queue's
   *  most useful row. */
  assignee: string | null;
  /** When it is needed by. Set by hand, or left null and taken from the job. */
  due_date: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

/** One upload. Append-only: revision B does not replace revision A, it follows
 *  it — which is the only way to answer "what was the workshop cutting from in
 *  August" (A5, D179). */
export interface DesignRevision {
  id: string;
  task_id: string;
  /** `A`, `B`, `C`. The drafter's own numbering, carried verbatim. */
  rev: string;
  attachment_id: string | null;
  filename: string | null;
  note: string | null;
  /** Set when this revision is the one the workshop may build from. A revision
   *  uploaded and not released is a draft, and the floor must not see it. */
  released_at: string | null;
  released_by: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

/** Something the drafter cannot answer alone — a dimension the client has not
 *  confirmed, a joint the workshop has to agree to. It blocks the task, by
 *  design: a drawing released over an unanswered question is a drawing the
 *  workshop will build wrong. */
export interface DesignQuestion {
  id: string;
  task_id: string;
  /** Who is being asked: `klien`, `pimpinan`, `produksi`. Free text, because
   *  the real answer is a person and the list would go stale. */
  asked_of: string;
  question: string;
  answer: string | null;
  asked_by: string;
  asked_at: string;
  answered_by: string | null;
  answered_at: string | null;
}

export interface DesignRevisionView extends DesignRevision {
  uploaded_by_name: string;
  released_by_name: string | null;
}

export interface DesignQuestionView extends DesignQuestion {
  asked_by_name: string;
  answered_by_name: string | null;
  /** Days it has been waiting. The number that turns a polite question into a
   *  visible blockage. */
  waiting_days: number | null;
}

export interface DesignTaskView extends DesignTask {
  product_name: string;
  category: string;
  /** Millimetres, or null — a drawing for a product with no size is the
   *  drafter's first question, not their last (D150). */
  dimension: string | null;
  revisions: DesignRevisionView[];
  questions: DesignQuestionView[];
  /** The revision the workshop may cut from, and the newest one that exists. */
  released_rev: string | null;
  latest_rev: string | null;
  /** **The dangerous case**: a newer revision exists and has not been released,
   *  so the floor is still building from the older one (D179). */
  ahead_of_release: boolean;
  /** Open questions block, whatever the status says. */
  blocked: boolean;
  /** Which orders and work orders are waiting on this drawing, by public code
   *  (ADR-004). */
  ordered_by: string[];
  work_orders: { wo_no: string; due_date: string; status: WorkOrderStatus }[];
  /** The soonest date anything needing this drawing is due. Null when nothing
   *  is waiting — which is a fine reason not to draw it yet. */
  needed_by: string | null;
  /** Days until `needed_by`, negative when it is already late. */
  days_left: number | null;
}
