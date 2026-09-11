/** Production views — computed on read (A3).
 *
 *  Everything a supervisor wants to know about a work order is a sum over the
 *  progress entries: how far each stage got, which stage it is really in, and
 *  whether the date it was promised for is still reachable. None of it is
 *  stored, because a stored "current stage" is a field somebody forgets to
 *  move, and the piece then sits in a column it left three days ago.
 */
import type { DemoState } from "./state";
import {
  PROCESS_STAGES, type WorkOrder, type WorkOrderView, type StageProgress,
  type Product, type ProductView, type BomLineView,
} from "@/services/production/contracts";

/** Today, as an office day. The board is about deadlines, so "what day is it"
 *  has to be the workshop's day rather than UTC's (F17, F39). */
export function officeToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function workOrderView(
  state: DemoState,
  wo: WorkOrder,
  today = officeToday(),
): WorkOrderView {
  const entries = state.production_progress.filter((p) => p.wo_id === wo.id);

  const stages: StageProgress[] = PROCESS_STAGES.map((s) => {
    const done = entries.filter((p) => p.stage === s.code).reduce((a, p) => a + p.qty, 0);
    return {
      stage: s.code,
      name: s.name,
      seq: s.seq,
      done,
      percent: wo.qty > 0 ? Math.round((done / wo.qty) * 100) : 0,
    };
  });

  const started = stages.filter((s) => s.done > 0);
  const current = started.length > 0 ? started[started.length - 1] : null;
  const last = stages[stages.length - 1];
  const completed = last.done;

  /* Progress across the whole order, counted as stages finished rather than
     as the furthest stage reached: eleven doors cut and one packed is not
     "packing", it is a tenth of the way through. */
  const totalSteps = stages.length * wo.qty;
  const doneSteps = stages.reduce((a, s) => a + Math.min(Math.max(s.done, 0), wo.qty), 0);
  const percent = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const days_left = daysBetween(today, wo.due_date);
  const warnings: string[] = [];

  /* A stage ahead of the one before it. Physically impossible, so it is either
     a mis-keyed number or work that skipped a step — both worth a sentence,
     neither worth blocking the report that revealed it (A6). */
  for (let i = 1; i < stages.length; i += 1) {
    if (stages[i].done > stages[i - 1].done) {
      warnings.push(
        `${stages[i].name} (${stages[i].done}) melebihi ${stages[i - 1].name} (${stages[i - 1].done}) — salah ketik, atau ada tahap yang dilewati.`,
      );
    }
  }
  for (const s of stages) {
    if (s.done > wo.qty) {
      warnings.push(`${s.name} tercatat ${s.done} dari ${wo.qty} yang dipesan.`);
    }
  }
  if (wo.status === "OPEN" && completed >= wo.qty) {
    warnings.push("Semua unit sudah melewati tahap terakhir — pesanan ini bisa ditutup.");
  }
  if (wo.status === "OPEN" && days_left < 0 && completed < wo.qty) {
    warnings.push(`Lewat tenggat ${Math.abs(days_left)} hari, sisa ${wo.qty - completed} ${wo.uom}.`);
  } else if (wo.status === "OPEN" && days_left >= 0 && days_left <= 3 && percent < 70) {
    warnings.push(`Tinggal ${days_left} hari dan baru ${percent}% selesai.`);
  }
  if (wo.status === "OPEN" && started.length === 0) {
    warnings.push("Belum ada satu tahap pun yang dikerjakan.");
  }

  return {
    ...wo,
    stages,
    current_stage: current?.stage ?? null,
    current_stage_name: current?.name ?? "Belum mulai",
    completed,
    percent,
    days_left,
    late: wo.status === "OPEN" && days_left < 0 && completed < wo.qty,
    warnings,
  };
}

export function workOrderViews(state: DemoState, today = officeToday()): WorkOrderView[] {
  return state.work_orders
    .map((w) => workOrderView(state, w, today))
    /* Late first, then by how soon it is due: the board's job is to put the
       thing somebody has to deal with at the top. */
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.due_date.localeCompare(b.due_date);
    });
}


/** A product with its bill of materials priced.
 *
 *  Two things this deliberately does not do.
 *
 *  It does not **store** a material cost. Prices move, a BOM gets a line added,
 *  and a stored figure is one that silently stops matching the components under
 *  it — the same reason payroll is computed on read (A3).
 *
 *  It does not **hide** what it cannot price. A component whose code names
 *  nothing in the catalogue, or an item nobody has ever bought, leaves the
 *  subtotal null and is counted in `unpriced`. A cost that quietly treats the
 *  missing ones as zero is worse than no cost at all: it reads as complete
 *  (D149).
 */
export function productView(state: DemoState, product: Product): ProductView {
  const rows = state.bom_components.filter((b) => b.product_id === product.id);

  const components: BomLineView[] = rows.map((b) => {
    const qty_with_waste = Math.round(b.qty * (1 + b.waste_percent / 100) * 10_000) / 10_000;

    let ref_name: string | null = null;
    let unit_price: number | null = null;
    let price_source: BomLineView["price_source"] = "none";

    if (b.kind === "material") {
      /* Read at the seam, by public code — never joined (ADR-004). */
      const item = state.items.find((i) => i.code === b.ref_code);
      ref_name = item?.name ?? null;
      if (item?.standard_price != null) {
        unit_price = item.standard_price;
        price_source = "standard";
      } else if (item?.last_price != null) {
        /* A hint, not a price list — and the screen says which it used. */
        unit_price = item.last_price;
        price_source = "last";
      }
    } else {
      const sub = state.products.find((p) => p.product_code === b.ref_code);
      ref_name = sub?.name ?? null;
      if (sub) {
        /* One level deep on purpose: a sub-assembly of a sub-assembly is a
           thing this business does not have, and guarding against a cycle we
           cannot observe would cost more than it protects. */
        const subView = subAssemblyCost(state, sub);
        if (subView != null) { unit_price = subView; price_source = "standard"; }
      }
    }

    return {
      ...b,
      ref_name,
      qty_with_waste,
      unit_price,
      price_source,
      subtotal: unit_price == null ? null : Math.round(unit_price * qty_with_waste),
    };
  });

  const priced = components.filter((c) => c.subtotal != null);
  const unpriced = components.length - priced.length;
  const broken_refs = components.filter((c) => c.ref_name === null).length;

  const warnings: string[] = [];
  if (components.length === 0) {
    warnings.push("Belum ada bill of material — kebutuhan bahan dan biayanya belum bisa dihitung.");
  }
  if (broken_refs > 0) {
    warnings.push(`${broken_refs} komponen menunjuk kode yang tidak ada di katalog.`);
  }
  if (unpriced > broken_refs) {
    warnings.push(`${unpriced - broken_refs} komponen belum punya harga — biaya di bawah belum lengkap.`);
  }
  if (components.some((c) => c.price_source === "last")) {
    warnings.push("Sebagian harga memakai harga pembelian terakhir, bukan harga standar.");
  }

  return {
    ...product,
    components,
    material_cost: priced.length > 0 ? priced.reduce((a, c) => a + (c.subtotal ?? 0), 0) : null,
    unpriced,
    broken_refs,
    warnings,
  };
}

/** The material cost of a sub-assembly, one level down. Null when any part of
 *  it cannot be priced — half a number is not a number. */
function subAssemblyCost(state: DemoState, product: Product): number | null {
  const rows = state.bom_components.filter((b) => b.product_id === product.id);
  if (rows.length === 0) return null;
  let total = 0;
  for (const b of rows) {
    if (b.kind !== "material") return null;
    const item = state.items.find((i) => i.code === b.ref_code);
    const price = item?.standard_price ?? item?.last_price ?? null;
    if (price == null) return null;
    total += price * b.qty * (1 + b.waste_percent / 100);
  }
  return Math.round(total);
}

export function productViews(state: DemoState): ProductView[] {
  return state.products
    .map((p) => productView(state, p))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
