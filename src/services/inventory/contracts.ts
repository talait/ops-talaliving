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
