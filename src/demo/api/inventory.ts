/** Implements `/api/v1/inventory` from `03-api.md` — timber, for now.
 *
 *  The module exists for one comparison: **logs come in by the cubic metre and
 *  wood goes into furniture by the cubic metre, and they are not the same
 *  cubic metre** (D153). Everything here is in service of pricing the second
 *  one honestly.
 */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  LogPurchaseView, LogMeasure, TimberVendorSummary,
} from "@/services/inventory/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit } from "../store";
import { logPurchaseView, logPurchaseViews, timberVendorSummaries } from "../inventory-derive";
import { latency, actingUser, requireModule, conflict, replayed, remember } from "./_kit";

const SERVICE = "inventory" as const;

export async function listLogPurchases(): Promise<Result<LogPurchaseView[]>> {
  await latency();
  return ok(SERVICE, logPurchaseViews(getState()));
}

export async function getLogPurchase(purchaseNo: string): Promise<Result<LogPurchaseView>> {
  await latency();
  const state = getState();
  const p = state.log_purchases.find((x) => x.purchase_no === purchaseNo);
  if (!p) return notFound(SERVICE, "purchase_not_found", `No log purchase ${purchaseNo}.`);
  return ok(SERVICE, logPurchaseView(state, p));
}

/** Every vendor's timber side by side. The column that decides is
 *  `cost_per_sawn_m3`, not the invoice price (D153). */
export async function timberByVendor(): Promise<Result<TimberVendorSummary[]>> {
  await latency();
  return ok(SERVICE, timberVendorSummaries(getState()));
}

/** A load of logs arriving.
 *
 *  What the seller claimed it measured is recorded **beside** our own
 *  measurement, never instead of it: the difference between the two is the
 *  conversation with the vendor, and a system that keeps only one number has
 *  already lost that argument (D153).
 */
export async function receiveLogs(
  input: {
    vendor_id: string;
    received_on: string;
    species: string;
    total_cost: number;
    claimed_m3?: number | null;
    measure?: LogMeasure;
    trx_no?: string | null;
    pr_line_no?: string | null;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<LogPurchaseView>> {
  await latency();
  const cached = replayed<LogPurchaseView>(SERVICE, "receiveLogs", idempotencyKey);
  if (cached) return cached;

  const denied = requireModule(SERVICE, "inventory");
  if (denied) return denied;

  const state = getState();
  if (!state.vendors.some((v) => v.id === input.vendor_id)) {
    return notFound(SERVICE, "vendor_not_found", "Vendor itu tidak ada.");
  }
  if (!input.species.trim()) {
    return invalid(SERVICE, "species_required", "Kayu apa?", { field: "species" });
  }
  if (!input.total_cost || input.total_cost <= 0) {
    return invalid(
      SERVICE, "cost_required",
      "Tanpa nilai tagihan, tidak ada harga per m³ yang bisa dihitung — dan itu satu-satunya alasan catatan ini ada.",
      { field: "total_cost" },
    );
  }

  const user = actingUser();
  let no = "";
  apply((draft) => {
    no = nextDocNumber(draft, "kyu");
    draft.log_purchases.push({
      id: newId("lgp"), purchase_no: no,
      vendor_id: input.vendor_id,
      trx_no: input.trx_no ?? null,
      pr_line_no: input.pr_line_no ?? null,
      received_on: input.received_on,
      species: input.species.trim(),
      total_cost: Math.round(input.total_cost),
      claimed_m3: input.claimed_m3 ?? null,
      measure: input.measure ?? "round",
      note: input.note?.trim() || null,
      created_at: new Date().toISOString(), created_by: user.id,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "log_purchase", entity_no: no,
      action: "receive", outcome: "ok", reason: null,
      detail: { vendor: input.vendor_id, cost: input.total_cost, claimed_m3: input.claimed_m3 ?? null, by: user.email },
    });
  });
  const view = await getLogPurchase(no);
  if (view.data) remember(SERVICE, "receiveLogs", idempotencyKey, view.data);
  return view;
}

/** One log, measured. Diameter is the average of the two ends, in centimetres,
 *  as the yard measures it. */
export async function addLog(
  input: {
    purchase_no: string;
    tag: string;
    diameter_cm: number;
    length_cm: number;
    note?: string | null;
  },
): Promise<Result<LogPurchaseView>> {
  await latency();
  const denied = requireModule(SERVICE, "inventory");
  if (denied) return denied;

  const state = getState();
  const p = state.log_purchases.find((x) => x.purchase_no === input.purchase_no);
  if (!p) return notFound(SERVICE, "purchase_not_found", `No log purchase ${input.purchase_no}.`);
  if (input.diameter_cm <= 0 || input.length_cm <= 0) {
    return invalid(SERVICE, "dimensions_required", "Diameter dan panjang harus lebih dari nol.", { field: "diameter_cm" });
  }
  if (state.log_pieces.some((l) => l.purchase_id === p.id && l.tag === input.tag.trim())) {
    return conflict(SERVICE, "tag_used", `Nomor ${input.tag} sudah dipakai di kiriman ini.`);
  }

  const user = actingUser();
  apply((draft) => {
    draft.log_pieces.push({
      id: newId("lgc"), purchase_id: p.id,
      tag: input.tag.trim() || `#${draft.log_pieces.filter((l) => l.purchase_id === p.id).length + 1}`,
      diameter_cm: input.diameter_cm, length_cm: input.length_cm,
      sawn_on: null, note: input.note?.trim() || null,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "log_purchase", entity_no: p.purchase_no,
      action: "add_log", outcome: "ok", reason: null,
      detail: { tag: input.tag, d: input.diameter_cm, l: input.length_cm, by: user.email },
    });
  });
  return getLogPurchase(p.purchase_no);
}

/** Boards off the saw: one size, counted.
 *
 *  Naming the log is optional, because a day's sawing is usually reported as
 *  one pile and pretending otherwise would make the sawyer invent a link. What
 *  is **not** optional is the date, since yield is only meaningful against the
 *  logs that had been cut by then (D153).
 */
export async function reportBoards(
  input: {
    purchase_no: string;
    log_tag?: string | null;
    thickness_mm: number;
    width_mm: number;
    length_mm: number;
    qty: number;
    sawn_on: string;
    grade?: string | null;
    note?: string | null;
  },
): Promise<Result<LogPurchaseView>> {
  await latency();
  const denied = requireModule(SERVICE, "inventory");
  if (denied) return denied;

  const state = getState();
  const p = state.log_purchases.find((x) => x.purchase_no === input.purchase_no);
  if (!p) return notFound(SERVICE, "purchase_not_found", `No log purchase ${input.purchase_no}.`);
  if (input.thickness_mm <= 0 || input.width_mm <= 0 || input.length_mm <= 0) {
    return invalid(SERVICE, "dimensions_required", "Tebal, lebar dan panjang harus diisi.", { field: "thickness_mm" });
  }
  if (!input.qty || input.qty <= 0) {
    return invalid(SERVICE, "qty_required", "Berapa lembar?", { field: "qty" });
  }

  const log = input.log_tag
    ? state.log_pieces.find((l) => l.purchase_id === p.id && l.tag === input.log_tag)
    : null;
  if (input.log_tag && !log) {
    return notFound(SERVICE, "log_not_found", `Tidak ada batang ${input.log_tag} di kiriman ini.`);
  }

  const user = actingUser();
  apply((draft) => {
    draft.sawn_boards.push({
      id: newId("swb"), purchase_id: p.id, log_id: log?.id ?? null,
      thickness_mm: input.thickness_mm, width_mm: input.width_mm, length_mm: input.length_mm,
      qty: input.qty, sawn_on: input.sawn_on,
      grade: input.grade?.trim() || null, note: input.note?.trim() || null,
    });
    /* Reporting boards off a log is what marks it sawn — one act, not two,
       because the second one is the one people forget. */
    if (log) {
      const row = draft.log_pieces.find((l) => l.id === log.id);
      if (row && !row.sawn_on) row.sawn_on = input.sawn_on;
    }
    writeAudit(draft, {
      service: SERVICE, entity: "log_purchase", entity_no: p.purchase_no,
      action: "report_boards", outcome: "ok", reason: input.note?.trim() ?? null,
      detail: {
        log: input.log_tag ?? null,
        size: `${input.thickness_mm}×${input.width_mm}×${input.length_mm}`,
        qty: input.qty, by: user.email,
      },
    });
  });
  return getLogPurchase(p.purchase_no);
}

/** Marking a log sawn without reporting boards — for the one that split and
 *  produced nothing. It still counts against the yield, which is the point. */
export async function markLogSawn(
  input: { purchase_no: string; tag: string; sawn_on: string; note?: string | null },
): Promise<Result<LogPurchaseView>> {
  await latency();
  const denied = requireModule(SERVICE, "inventory");
  if (denied) return denied;

  const state = getState();
  const p = state.log_purchases.find((x) => x.purchase_no === input.purchase_no);
  if (!p) return notFound(SERVICE, "purchase_not_found", `No log purchase ${input.purchase_no}.`);
  const log = state.log_pieces.find((l) => l.purchase_id === p.id && l.tag === input.tag);
  if (!log) return notFound(SERVICE, "log_not_found", `Tidak ada batang ${input.tag}.`);

  const user = actingUser();
  apply((draft) => {
    const row = draft.log_pieces.find((l) => l.id === log.id);
    if (!row) return;
    row.sawn_on = input.sawn_on;
    if (input.note?.trim()) row.note = input.note.trim();
    writeAudit(draft, {
      service: SERVICE, entity: "log_purchase", entity_no: p.purchase_no,
      action: "mark_sawn", outcome: "ok", reason: input.note?.trim() ?? null,
      detail: { tag: input.tag, by: user.email },
    });
  });
  return getLogPurchase(p.purchase_no);
}
