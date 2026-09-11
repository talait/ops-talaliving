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
