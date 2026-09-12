/** Production views — computed on read (A3).
 *
 *  Everything a supervisor wants to know about a work order is a sum over the
 *  progress entries: how far each stage got, which stage it is really in, and
 *  whether the date it was promised for is still reachable. None of it is
 *  stored, because a stored "current stage" is a field somebody forgets to
 *  move, and the piece then sits in a column it left three days ago.
 */
import { officeDay } from "@/lib/office";
import type { DemoState } from "./state";
import {
  PROCESS_STAGES, STAGE_SOURCES, ROUTE, goodsOnSite,
  type WorkOrder, type WorkOrderView, type StageProgress,
  type Product, type ProductView, type BomLineView, type ProductDrawing,
  type DesignTask, type DesignTaskView, type DesignKind,
} from "@/services/production/contracts";

/** Today, as an office day. The board is about deadlines, so "what day is it"
 *  has to be the workshop's day rather than UTC's (F17, F39). One definition
 *  for the whole system, in `src/lib/office.ts` (F63). */
export function officeToday(now: Date = new Date()): string {
  return officeDay(now);
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
  const route = ROUTE(wo.route);
  const total = (code: string) =>
    entries.filter((p) => p.stage === code).reduce((a, p) => a + p.qty, 0);

  /* Only the stages this order actually goes through. A subcontracted order
     has no `PEMBUATAN` row at all — not a row reading 0%, which would say
     *nobody has started building this* about goods a vendor has already built
     (D254). */
  const stages: StageProgress[] = PROCESS_STAGES
    .filter((s) => route.stages.includes(s.code))
    .map((s) => {
      /* **A minimum over every source that carried a figure, never a sum.**
         Four chairs cut, four planed and four assembled is four chairs made,
         not twelve; four sanded and three finished is three finished, not
         seven. A piece has passed the stage when it has passed every step
         inside it, so the count is the smallest of the steps actually
         recorded. A step nobody recorded is a step this order never used, and
         it does not drag the whole stage to zero.

         The stage's own code is one of the sources (F74): `FINISHING` names
         one of the four *and* one of the seven, so "direct" and "rolled up"
         cannot be told apart — and must not be added together. */
      const parts = (STAGE_SOURCES[s.code] ?? [{ code: s.code, name: s.name }])
        .map((x) => ({ code: x.code, name: x.name, done: total(x.code) }))
        .filter((p) => p.done !== 0);
      const done = parts.length > 0 ? Math.min(...parts.map((p) => p.done)) : 0;
      return {
        stage: s.code,
        name: s.name,
        seq: s.seq,
        covers: s.covers,
        done,
        percent: wo.qty > 0 ? Math.round((done / wo.qty) * 100) : 0,
        /* Only interesting where more than one source spoke. */
        parts: parts.length > 1 ? parts : [],
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

  /* Where the goods physically are. `at_vendor` is derived from the two dates
     rather than stored, for the reason every status here is derived: a flag is
     a field somebody forgets to move while the lorry is still on the road. */
  const at_vendor = wo.route === "SUBCON"
    && wo.subcon_sent_on !== null
    && wo.subcon_returned_on === null;
  const days_at_vendor = wo.subcon_sent_on === null
    ? null
    : daysBetween(wo.subcon_sent_on, wo.subcon_returned_on ?? today);
  const subcon_overdue = at_vendor
    && wo.subcon_expected_back !== null
    && wo.subcon_expected_back < today;

  /* Steps **inside** one stage that disagree.
   *
   *  The minimum resolves the count, and resolving it silently would be the
   *  worse half of the fix: eleven doors reported finished when four were
   *  sanded is not a rounding difference, it is seven doors somebody has to
   *  explain. The stage counts four; the sentence says why it is not eleven
   *  (F74). */
  for (const s of stages) {
    for (let i = 1; i < s.parts.length; i += 1) {
      const before = s.parts[i - 1];
      const after = s.parts[i];
      /* A later step **lagging** the one before it is not a fault, it is work
         in progress: six cut and two assembled is four waiting on the bench.
         A later step **ahead** of the one before it cannot have happened. */
      if (after.done <= before.done) continue;
      warnings.push(
        `${s.name}: ${after.name} tercatat ${after.done} padahal ${before.name} baru ${before.done} — ${
          after.done - before.done
        } ${wo.uom} melewati satu langkah. Yang dihitung selesai ${s.done}, angka yang lebih kecil, sampai ada yang membetulkan salah satunya.`,
      );
    }
  }

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
  } else if (wo.status === "OPEN" && days_left >= 0 && days_left <= 3 && percent < 70 && !at_vendor) {
    /* Not while the goods are at the vendor. `percent` counts **our** stages,
       and none of them can have happened yet — so *baru 0% selesai* would read
       as the workshop being behind on work it is not allowed to start. The
       vendor-overdue sentence above says the true thing instead. */
    warnings.push(`Tinggal ${days_left} hari dan baru ${percent}% selesai.`);
  }
  if (wo.status === "OPEN" && started.length === 0 && !at_vendor) {
    warnings.push(
      wo.route === "SUBCON" && wo.subcon_sent_on === null
        ? "Belum dikirim ke vendor, dan belum ada tahap yang dikerjakan."
        : "Belum ada satu tahap pun yang dikerjakan.",
    );
  }
  if (subcon_overdue) {
    warnings.push(
      `Vendor menjanjikan kembali ${wo.subcon_expected_back}, sudah lewat ${
        Math.abs(daysBetween(today, wo.subcon_expected_back!))
      } hari dan barangnya belum sampai.`,
    );
  }
  if (wo.route === "SUBCON" && wo.subcon_sent_on === null && days_left <= 3) {
    warnings.push("Tenggatnya dekat dan barangnya belum berangkat ke vendor.");
  }

  return {
    ...wo,
    stages,
    route_name: route.name,
    at_vendor,
    goods_on_site: goodsOnSite(wo),
    days_at_vendor,
    subcon_overdue,
    current_stage: current?.stage ?? null,
    current_stage_name: at_vendor
      ? "Di vendor"
      : current?.name ?? (wo.route === "SUBCON" ? "Belum dikirim" : "Belum mulai"),
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
/** A product's drawing of a given kind, if somebody has filed one.
 *
 *  On the same road as every other document (ADR-010): uploaded once, linked
 *  to the product by code, carrying the name of whoever filed it and when —
 *  which is what makes "is this the current drawing" answerable at all. */
function drawingOf(state: DemoState, productCode: string, kind: string): ProductDrawing | null {
  /* Newest wins. A revised drawing is a new file filed against the same
     product; the older one is not deleted, because a piece built last month
     was built from it (A5). */
  const link = [...state.attachment_links]
    .filter((l) => l.entity === "product" && l.entity_no === productCode && l.kind === kind)
    .sort((a, b) => b.linked_at.localeCompare(a.linked_at))[0];
  if (!link) return null;
  const att = state.attachments.find((a) => a.id === link.attachment_id);
  if (!att) return null;
  return {
    attachment_id: att.id, filename: att.filename, url: att.url,
    linked_by: link.linked_by, linked_at: link.linked_at,
  };
}

/** `2200 × 1000 × 750 mm`, spelled the same way everywhere. */
function dimensionText(p: Product): string | null {
  const axes = [p.length_mm, p.width_mm, p.height_mm].filter((n) => n != null);
  if (axes.length === 0) return p.dimension_note;
  const size = `${axes.join(" × ")} mm`;
  return p.dimension_note ? `${size} · ${p.dimension_note}` : size;
}

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

  const gambar_kerja = drawingOf(state, product.product_code, "Gambar Kerja");
  const gambar_jadi = drawingOf(state, product.product_code, "Gambar Jadi");
  const hasSize = product.length_mm != null || product.width_mm != null || product.height_mm != null;

  /* What master data is missing, named rather than implied. Every one of these
     is something somebody will otherwise have to ask about — and asking is the
     expensive part, not the filling in (D150). */
  const missing: string[] = [];
  if (!hasSize) missing.push("ukuran");
  if (!gambar_kerja) missing.push("gambar kerja");
  if (!gambar_jadi) missing.push("gambar jadi");
  if (components.length === 0) missing.push("BOM");

  if (!hasSize) {
    warnings.push("Belum ada ukuran — produk ini tidak bisa dipotong atau dicek tanpa bertanya.");
  }
  if (!gambar_kerja) {
    warnings.push("Belum ada gambar kerja — yang dipakai bengkel untuk membuat.");
  }
  if (!gambar_jadi) {
    warnings.push("Belum ada gambar jadi — yang dilihat klien dan dipakai QC.");
  }

  return {
    ...product,
    components,
    dimension: dimensionText(product),
    gambar_kerja,
    gambar_jadi,
    missing,
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

/* ── Desain ───────────────────────────────────────────────────────────────── */

/** One drafting task, with everything that decides whether it matters today.
 *
 *  The two computed facts are the whole module (D179):
 *
 *  - **`ahead_of_release`** — a newer revision exists that nobody released, so
 *    the workshop is still cutting from the older one. Nothing about the task
 *    *looks* wrong: it has a drawing, it has a recent upload, somebody has
 *    clearly been working on it. That is exactly why it needs saying.
 *  - **`needed_by`** — the soonest date anything waiting on this drawing is
 *    due, taken from the open work orders and the projects that ordered the
 *    product. A drafter cannot prioritise from a list of products; they can
 *    from a list of dates.
 */
export function designTaskView(state: DemoState, task: DesignTask, today: string): DesignTaskView {
  const product = state.products.find((p) => p.product_code === task.product_code);

  const revisions = state.design_revisions
    .filter((r) => r.task_id === task.id)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
    .map((r) => ({
      ...r,
      uploaded_by_name: state.users.find((u) => u.id === r.uploaded_by)?.full_name ?? "—",
      released_by_name: r.released_by
        ? state.users.find((u) => u.id === r.released_by)?.full_name ?? null
        : null,
    }));

  const questions = state.design_questions
    .filter((q) => q.task_id === task.id)
    .sort((a, b) => b.asked_at.localeCompare(a.asked_at))
    .map((q) => ({
      ...q,
      asked_by_name: state.users.find((u) => u.id === q.asked_by)?.full_name ?? "—",
      answered_by_name: q.answered_by
        ? state.users.find((u) => u.id === q.answered_by)?.full_name ?? null
        : null,
      waiting_days: q.answer ? null : daysApart(q.asked_at.slice(0, 10), today),
    }));

  const released = [...revisions].reverse().find((r) => r.released_at);
  const latest = revisions[revisions.length - 1];

  /* Who is waiting. Work orders name the product directly; a project line names
     it too, and both are by code across the seam (ADR-004). */
  const workOrders = state.work_orders
    .filter((w) => w.product_code === task.product_code && w.status !== "CANCELLED")
    .map((w) => ({ wo_no: w.wo_no, due_date: w.due_date, status: w.status }));

  const orderedBy = state.project_lines
    .filter((l) => l.product_code === task.product_code)
    .map((l) => state.projects.find((p) => p.id === l.project_id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.is_active)
    .map((p) => p.code);

  /* Only jobs that are still live. A finished project's target date is not a
     deadline — counting one made a released drawing read *lewat 74 hari*
     because an office fit-out handed over in June still had a line for the
     same wardrobe (F51). A date that is not a deadline is worse than no date:
     it moves a real one down the queue. */
  const dates = [
    ...workOrders.filter((w) => w.status !== "DONE").map((w) => w.due_date),
    ...state.project_lines
      .filter((l) => l.product_code === task.product_code)
      .map((l) => state.projects.find((p) => p.id === l.project_id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.is_active)
      .map((p) => p.target_date)
      .filter((d): d is string => !!d),
    ...(task.due_date ? [task.due_date] : []),
  ].sort();
  const needed_by = dates[0] ?? null;

  return {
    ...task,
    product_name: product?.name ?? task.product_code,
    category: product?.category ?? "—",
    dimension: product && product.length_mm && product.width_mm && product.height_mm
      ? `${product.length_mm} × ${product.width_mm} × ${product.height_mm} mm`
      : null,
    revisions,
    questions,
    released_rev: released?.rev ?? null,
    latest_rev: latest?.rev ?? null,
    ahead_of_release: !!released && !!latest && latest.rev !== released.rev,
    blocked: questions.some((q) => !q.answer),
    ordered_by: [...new Set(orderedBy)],
    work_orders: workOrders,
    needed_by,
    days_left: needed_by ? daysApart(today, needed_by) : null,
  };
}

function daysApart(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The queue, in the order a drafter should work it.
 *
 *  Blocked first — a question waiting nine days is somebody else's problem that
 *  only the drafter can see. Then by the date something is actually needed,
 *  then the unstarted ones. Released-and-current tasks sink to the bottom,
 *  which is where finished work belongs.
 */
export function designQueue(state: DemoState, today: string): DesignTaskView[] {
  return state.design_tasks
    .map((t) => designTaskView(state, t, today))
    .sort((a, b) => {
      const rank = (t: DesignTaskView) =>
        t.blocked ? 0
          : t.ahead_of_release ? 1
            : t.status === "BELUM" ? 2
              : t.status === "DIGAMBAR" ? 3 : 4;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const ad = a.days_left ?? 9999;
      const bd = b.days_left ?? 9999;
      if (ad !== bd) return ad - bd;
      return a.product_name.localeCompare(b.product_name);
    });
}

/** Products that are ordered or on the floor and have **no task at all** for a
 *  drawing kind. The queue's blind spot, and the reason it is computed rather
 *  than typed: adding a product to an order makes its missing drawings appear
 *  the same day, without anybody remembering to raise a task (D179). */
export function designGaps(state: DemoState): { product_code: string; product_name: string; kind: DesignKind; why: string }[] {
  const out: { product_code: string; product_name: string; kind: DesignKind; why: string }[] = [];
  const wanted = new Map<string, string>();

  for (const w of state.work_orders) {
    if (!w.product_code || w.status === "CANCELLED" || w.status === "DONE") continue;
    wanted.set(w.product_code, `sedang dikerjakan · ${w.wo_no}`);
  }
  for (const l of state.project_lines) {
    if (!l.product_code || wanted.has(l.product_code)) continue;
    const project = state.projects.find((p) => p.id === l.project_id);
    if (project?.is_active) wanted.set(l.product_code, `dipesan · ${project.code}`);
  }

  for (const [code, why] of wanted) {
    const product = state.products.find((p) => p.product_code === code);
    for (const kind of ["gambar_kerja", "gambar_jadi"] as DesignKind[]) {
      if (state.design_tasks.some((t) => t.product_code === code && t.kind === kind)) continue;
      out.push({ product_code: code, product_name: product?.name ?? code, kind, why });
    }
  }
  return out;
}
