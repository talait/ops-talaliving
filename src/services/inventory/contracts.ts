/** Inventory contracts — cut to `docs/plan/02-database.md`, schema `inv`.
 *
 *  An eighth service, and it exists for one thing the business cannot do any
 *  other way: **timber is bought as logs and used as boards**, and those are
 *  two different quantities of two different materials with a saw in between
 *  (D153).
 *
 *  A log is priced per cubic metre of round wood. What the workshop can
 *  actually put in a table is the sawn volume, which is always less — the
 *  sawdust, the slabs off the sides, the split that ran down the middle. So
 *  the cost of a cubic metre of *usable* board is never the price on the
 *  vendor's invoice, and a business that compares vendors on the invoice price
 *  is comparing the wrong number.
 *
 *  Everything here exists to make that one comparison honest: cubic metres in,
 *  cubic metres out, rupiah per usable cubic metre, per purchase and per
 *  vendor.
 */

/** How a log's volume was arrived at.
 *
 *  Two methods are in use in this trade and they do not agree, so the record
 *  says which one produced the number rather than leaving it to be inferred
 *  (Q39):
 *
 *  - `round` — the geometric volume of a cylinder, π/4 × d² × L. What the log
 *    actually contains.
 *  - `square` — the *kubikasi persegi* the trade quotes in: the largest square
 *    beam the log could yield, d² × L, which is smaller and is what many
 *    sellers price against.
 */
export type LogMeasure = "round" | "square";

export const LOG_MEASURE_LABEL: Record<LogMeasure, string> = {
  round: "Kubikasi bulat (π/4 × d² × p)",
  square: "Kubikasi persegi (d² × p)",
};

/** One delivery of logs from one vendor: the thing that has a price on it. */
export interface LogPurchase {
  id: string;
  purchase_no: string;
  /** Public vendor code, at the seam — inventory does not own vendors. */
  vendor_id: string;
  /** The ledger row that paid for it, and the request line it came from, both
   *  by public id, both optional: a load of logs can arrive before either
   *  exists (A6). */
  trx_no: string | null;
  pr_line_no: string | null;
  received_on: string;
  /** Jati, mahoni, sungkai — the workshop's own word. */
  species: string;
  /** What was invoiced, whole rupiah. This is the number every "per cubic
   *  metre" figure on this record divides. */
  total_cost: number;
  /** What the seller said the load measured, in m³. Kept beside our own
   *  measurement rather than replaced by it: the difference between the two is
   *  a conversation with the vendor, and erasing it loses the argument
   *  (D153). */
  claimed_m3: number | null;
  measure: LogMeasure;
  note: string | null;
  created_at: string;
  created_by: string;
}

/** One log in a delivery, measured as it came off the truck. */
export interface LogPiece {
  id: string;
  purchase_id: string;
  /** The paint mark on the end of the log. */
  tag: string;
  /** Average diameter in centimetres — the two ends measured and halved, as
   *  the yard does it. */
  diameter_cm: number;
  length_cm: number;
  /** Set when this log has been through the saw. */
  sawn_on: string | null;
  note: string | null;
}

/** What came out of the saw: boards of one size, counted.
 *
 *  A row is *n boards of exactly this thickness, width and length*, because
 *  that is how a sawyer reports and how a stack is stored. Anything else gets
 *  its own row.
 */
export interface SawnBoard {
  id: string;
  purchase_id: string;
  /** Which log, when the sawyer kept them apart. Null when a day's sawing was
   *  reported as one pile — which is the common case and not a failure. */
  log_id: string | null;
  thickness_mm: number;
  width_mm: number;
  length_mm: number;
  qty: number;
  sawn_on: string;
  /** `A`, `B`, `reject` — the workshop's own grading, free text. */
  grade: string | null;
  note: string | null;
}

export interface LogPieceView extends LogPiece {
  /** Cubic metres, by the purchase's own method. */
  m3: number;
}

export interface SawnBoardView extends SawnBoard {
  /** One board. */
  m3_each: number;
  /** All `qty` of them. */
  m3: number;
  /** t × w × l as the workshop writes it: `3 × 20 × 200 cm`. */
  size: string;
}

export interface LogPurchaseView extends LogPurchase {
  vendor_name: string;
  logs: LogPieceView[];
  boards: SawnBoardView[];
  /** What we measured the logs at. */
  log_m3: number;
  /** What the boards came to. */
  sawn_m3: number;
  /** `sawn_m3 / log_m3` as a percentage — *rendemen*. Null until something has
   *  been sawn. Below about 45% is worth asking about; the screen says so
   *  rather than hiding it. */
  yield_percent: number | null;
  /** Invoice ÷ our own log measurement. */
  cost_per_log_m3: number | null;
  /** Invoice ÷ what actually came out. **The real price of usable wood**, and
   *  the only figure here that belongs in a quotation (D153). */
  cost_per_sawn_m3: number | null;
  /** Logs still in the yard. Their share of the invoice is kept out of
   *  `cost_per_sawn_m3`, because dividing the whole bill by a fraction of the
   *  wood prices it half again too high (D153). */
  unsawn_m3: number;
  /** Our measurement against the seller's, in m³. */
  measure_gap_m3: number | null;
  warnings: string[];
}

/** One vendor's timber **of one species**, summed — the comparison the owner
 *  asked for.
 *
 *  Split by species deliberately: a vendor's mahoni against another vendor's
 *  jati is two different woods at two different prices, and averaging them
 *  into one "rupiah per cubic metre" for each vendor would make whoever sells
 *  the cheaper species look like the better supplier of the dearer one (D153).
 */
export interface TimberVendorSummary {
  vendor_id: string;
  vendor_name: string;
  species: string;
  purchases: number;
  log_m3: number;
  sawn_m3: number;
  total_cost: number;
  yield_percent: number | null;
  cost_per_log_m3: number | null;
  cost_per_sawn_m3: number | null;
  /** How much of the bought volume has not been through the saw yet — a
   *  vendor's real figure is not final until it has. */
  unsawn_m3: number;
}

/* ── Stock: what is on the rack, and how it got there ──────────────────────
 *
 *  Timber above is a special case with a saw in the middle of it. This is the
 *  ordinary one: plywood, engsel, thinner, amplas — bought by the box and used
 *  by the piece, and until now bought into a system that forgot about them the
 *  moment the receipt was confirmed (D170).
 *
 *  The model is a **movement ledger**, not a quantity. Nothing anywhere stores
 *  "how many are on the rack": that number is the sum of the moves, computed on
 *  read like every other figure in this system (A3). A stored quantity is one
 *  that disagrees with its own history, and the disagreement is discovered by
 *  somebody standing in front of an empty rack.
 */

/** Why the quantity moved. Each kind has a different piece of paper behind it,
 *  which is why they are not one `qty +/-` column. */
export type StockMoveKind =
  /** Goods arrived and a receipt was confirmed. The only kind the system
   *  creates by itself (D170). */
  | "receipt"
  /** Taken out to the floor, against a work order where there is one. */
  | "issue"
  /** Came back unused. */
  | "return"
  /** A count said the rack held something different. Always carries a reason;
   *  the difference is the record, not the new number (D171). */
  | "adjust"
  /** Moved between locations. Written as two rows — out of one, into the
   *  other — so every location's own history stays readable. */
  | "transfer";

export const MOVE_LABEL: Record<StockMoveKind, string> = {
  receipt: "Barang masuk",
  issue: "Dikeluarkan",
  return: "Dikembalikan",
  adjust: "Penyesuaian",
  transfer: "Pindah lokasi",
};

/** Where stock physically is. Deliberately few: a location nobody walks to is
 *  a location nobody counts. */
export interface StockLocation {
  code: string;
  name: string;
  is_active: boolean;
}

/** One movement of one item. Append-only: a mistake is corrected by another
 *  move with a reason, never by editing this one (A5). */
export interface StockMove {
  id: string;
  move_no: string;
  /** The catalogue item, **by code** — inventory does not own the catalogue
   *  (ADR-004). */
  item_code: string;
  location: string;
  kind: StockMoveKind;
  /** Signed: negative takes stock off the rack. The kind says what happened;
   *  the sign says which way, because an adjustment can go either way. */
  qty: number;
  uom: string;
  /** What one unit cost, where that is known. Null is honest — a transfer has
   *  no price, and a receipt without a priced line has none either. It is
   *  never written as zero, because zero would quietly value the rack down
   *  (D172). */
  unit_cost: number | null;
  /** The document behind it: `rcv-…`, `spk-…`, an opname reference. */
  ref_no: string | null;
  /** Required on an adjustment; free elsewhere. */
  reason: string | null;
  moved_by: string;
  moved_at: string;
}

export interface StockMoveView extends StockMove {
  item_name: string;
  location_name: string;
  by_name: string;
}

/** What a storeman needs on top of the item itself: how low is too low. */
export interface StockSetting {
  item_code: string;
  /** Below this, the item shows as needing a purchase. Null means nobody has
   *  said, and the screen says *belum ditetapkan* rather than implying zero. */
  min_qty: number | null;
  /** Where this item normally lives, for the default on a form. */
  home_location: string | null;
}

/** One item's stock, computed from its moves. */
export interface StockItemView {
  item_code: string;
  item_name: string;
  category_code: string;
  category_name: string;
  /** The parent category, for grouping a report by something wider. */
  group_code: string;
  group_name: string;
  uom: string;
  /** On the rack now, everywhere. */
  on_hand: number;
  by_location: { location: string; location_name: string; qty: number }[];
  /** Weighted average of what the stock on hand actually cost, and the value
   *  that follows from it. Both null when **nothing** priced it. */
  avg_cost: number | null;
  value: number | null;
  /** How much of what is on hand arrived with no price on it. A value computed
   *  over the rest is **incomplete, not wrong**, and the screen says so
   *  (D172). */
  unpriced_qty: number;
  min_qty: number | null;
  /** Below the minimum somebody set. False when nobody set one — an unstated
   *  minimum is not a satisfied one. */
  below_min: boolean;
  last_move_at: string | null;
  moves_count: number;
}

export interface StockItemDetail extends StockItemView {
  moves: StockMoveView[];
  /** Which products' bills of material call for this item, by product code —
   *  the answer to "can I throw this away" (D170). */
  used_in: { product_code: string; product_name: string; qty_per_unit: number }[];
  /** Requests raised for it that have not been received yet. */
  on_order: { pr_line_no: string; qty: number; need_by: string | null }[];
}
