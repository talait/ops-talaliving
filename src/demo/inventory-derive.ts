/** Inventory views — computed on read (A3).
 *
 *  All of it is arithmetic over measurements: cubic metres from dimensions,
 *  yield from the two volumes, rupiah per cubic metre from the invoice. None
 *  of it is stored, because every one of those figures changes the moment
 *  another board is reported off the same logs — and a stored yield that
 *  stopped matching its boards is exactly the number somebody would quote from
 *  (D153).
 */
import type { DemoState } from "./state";
import type {
  LogPurchase, LogPurchaseView, LogPieceView, SawnBoardView, LogMeasure,
  TimberVendorSummary,
} from "@/services/inventory/contracts";

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** A log's volume in cubic metres.
 *
 *  `round` is the cylinder: π/4 × d² × L. `square` is the *kubikasi persegi*
 *  the trade quotes in — the biggest square beam the log could give, d² × L —
 *  which is about 78% of the cylinder and is what many sellers price against.
 *  Which one was used is recorded on the purchase, never assumed (Q39).
 */
export function logVolumeM3(diameterCm: number, lengthCm: number, measure: LogMeasure): number {
  const d = diameterCm / 100;
  const l = lengthCm / 100;
  const v = measure === "round" ? (Math.PI / 4) * d * d * l : d * d * l;
  return round4(v);
}

/** A sawn board, in cubic metres. Millimetres in, m³ out. */
export function boardVolumeM3(thicknessMm: number, widthMm: number, lengthMm: number): number {
  return round4((thicknessMm / 1000) * (widthMm / 1000) * (lengthMm / 1000));
}

export function logPurchaseView(state: DemoState, p: LogPurchase): LogPurchaseView {
  const vendor = state.vendors.find((v) => v.id === p.vendor_id);

  const logs: LogPieceView[] = state.log_pieces
    .filter((l) => l.purchase_id === p.id)
    .map((l) => ({ ...l, m3: logVolumeM3(l.diameter_cm, l.length_cm, p.measure) }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  const boards: SawnBoardView[] = state.sawn_boards
    .filter((b) => b.purchase_id === p.id)
    .map((b) => {
      const each = boardVolumeM3(b.thickness_mm, b.width_mm, b.length_mm);
      return {
        ...b,
        m3_each: each,
        m3: round4(each * b.qty),
        size: `${b.thickness_mm / 10} × ${b.width_mm / 10} × ${b.length_mm / 10} cm`,
      };
    })
    .sort((a, b) => a.sawn_on.localeCompare(b.sawn_on) || a.size.localeCompare(b.size));

  const log_m3 = round4(logs.reduce((a, l) => a + l.m3, 0));
  const sawn_m3 = round4(boards.reduce((a, b) => a + b.m3, 0));

  /* Yield and price per board metre must be measured against the logs that
     have actually been through the saw — not the whole load.
     `kyu-26-08-26_01` has three of five logs done; dividing its boards by all
     five would read as 39% when the sawyer is getting 61%, and dividing the
     whole invoice by those boards would say the wood costs half again what it
     does. Both errors flatter or damn a vendor for wood still lying in the
     yard (D153). */
  const sawnLogM3 = round4(logs.filter((l) => l.sawn_on).reduce((a, l) => a + l.m3, 0));
  /* A pile reported without anybody marking the logs is the common case, and
     is taken to mean the load was sawn. */
  const basis = sawnLogM3 > 0 ? sawnLogM3 : (sawn_m3 > 0 ? log_m3 : 0);
  const unsawn_m3 = round4(Math.max(log_m3 - basis, 0));

  const yield_percent = sawn_m3 > 0 && basis > 0
    ? Math.round((sawn_m3 / basis) * 1000) / 10
    : null;

  /* The invoice covers every log. Only the share belonging to the logs that
     were sawn may be divided by the boards that came out of them. */
  const sawnCost = basis > 0 && log_m3 > 0 ? p.total_cost * (basis / log_m3) : 0;

  const warnings: string[] = [];
  if (logs.length === 0) {
    warnings.push("Belum ada batang yang diukur — kubikasi dan harga per m³ belum bisa dihitung.");
  }
  if (log_m3 > 0 && sawn_m3 === 0) {
    warnings.push("Belum ada papan yang dilaporkan — angka rendemen dan harga per m³ papan belum ada.");
  }
  if (unsawn_m3 > 0 && sawn_m3 > 0) {
    warnings.push(`${unsawn_m3} m³ belum digergaji — rendemen dan harga per m³ papan dihitung hanya dari batang yang sudah.`);
  }
  if (yield_percent != null && yield_percent > 100) {
    warnings.push(`Papan ${sawn_m3} m³ melebihi log ${log_m3} m³ — salah ukur, atau ada papan dari log lain masuk ke sini.`);
  } else if (yield_percent != null && yield_percent < 45) {
    warnings.push(`Rendemen ${yield_percent}% — di bawah yang biasa. Layak ditanyakan ke pemilik sawmill.`);
  }

  /* Ours against the seller's. Kept as a fact, not a correction: the number to
     argue with is the difference, and overwriting one with the other loses
     it. */
  const measure_gap_m3 = p.claimed_m3 != null && log_m3 > 0
    ? round4(log_m3 - p.claimed_m3)
    : null;
  if (measure_gap_m3 != null && Math.abs(measure_gap_m3) >= 0.05) {
    warnings.push(
      measure_gap_m3 < 0
        ? `Ukuran kita ${Math.abs(measure_gap_m3)} m³ LEBIH KECIL dari yang ditagih (${p.claimed_m3} m³).`
        : `Ukuran kita ${measure_gap_m3} m³ lebih besar dari yang ditagih (${p.claimed_m3} m³).`,
    );
  }

  return {
    ...p,
    vendor_name: vendor?.name ?? "—",
    logs,
    boards,
    log_m3,
    sawn_m3,
    yield_percent,
    cost_per_log_m3: log_m3 > 0 ? Math.round(p.total_cost / log_m3) : null,
    cost_per_sawn_m3: sawn_m3 > 0 ? Math.round(sawnCost / sawn_m3) : null,
    unsawn_m3,
    measure_gap_m3,
    warnings,
  };
}

export function logPurchaseViews(state: DemoState): LogPurchaseView[] {
  return state.log_purchases
    .map((p) => logPurchaseView(state, p))
    .sort((a, b) => b.received_on.localeCompare(a.received_on));
}

/** Every vendor's timber, summed.
 *
 *  The figure that matters is `cost_per_sawn_m3`: two vendors quoting the same
 *  rupiah per log cubic metre are not the same price if one of them sells logs
 *  that saw out at 62% and the other at 48%. That difference is invisible on
 *  an invoice and is the whole reason this module exists (D153).
 */
export function timberVendorSummaries(state: DemoState): TimberVendorSummary[] {
  const views = logPurchaseViews(state);
  /* Keyed by vendor AND species: comparing one vendor's mahoni with another's
     jati is two different woods, and a single average per vendor hides which
     is which (D153). */
  const byVendor = new Map<string, LogPurchaseView[]>();
  for (const v of views) {
    const key = `${v.vendor_id}|${v.species}`;
    byVendor.set(key, [...(byVendor.get(key) ?? []), v]);
  }

  return [...byVendor.entries()]
    .map(([key, rows]) => {
      const vendor_id = key.split("|")[0];
      const log_m3 = round4(rows.reduce((a, r) => a + r.log_m3, 0));
      const sawn_m3 = round4(rows.reduce((a, r) => a + r.sawn_m3, 0));
      const total_cost = rows.reduce((a, r) => a + r.total_cost, 0);
      /* Built from what each purchase already worked out, so a partly-sawn
         load contributes only the share of its invoice that belongs to the
         logs actually cut (D153). Summing raw invoices here would undo that
         care one level up. */
      const sawnBasis = round4(rows.reduce((a, r) => a + (r.log_m3 - r.unsawn_m3), 0));
      const allocatedCost = rows.reduce(
        (a, r) => a + (r.cost_per_sawn_m3 != null ? r.cost_per_sawn_m3 * r.sawn_m3 : 0), 0,
      );

      return {
        vendor_id,
        vendor_name: rows[0].vendor_name,
        species: rows[0].species,
        purchases: rows.length,
        log_m3,
        sawn_m3,
        total_cost,
        yield_percent: sawnBasis > 0 && sawn_m3 > 0
          ? Math.round((sawn_m3 / sawnBasis) * 1000) / 10
          : null,
        cost_per_log_m3: log_m3 > 0 ? Math.round(total_cost / log_m3) : null,
        cost_per_sawn_m3: sawn_m3 > 0 ? Math.round(allocatedCost / sawn_m3) : null,
        unsawn_m3: round4(rows.reduce((a, r) => a + r.unsawn_m3, 0)),
      };
    })
    /* Grouped by species, dearest usable wood first inside each — the row a
       buyer should look at before ringing anybody. */
    .sort((a, b) => a.species.localeCompare(b.species)
      || (b.cost_per_sawn_m3 ?? 0) - (a.cost_per_sawn_m3 ?? 0));
}
