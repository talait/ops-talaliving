"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Hammer, Plus } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Badge, Button } from "@/components/ui/primitives";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { NumberInput } from "@/components/ui/number-input";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { production } from "@/demo/api";
import { PROCESS_STAGES, STAGE_NAME } from "@/services/production/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** One work order: every stage, every entry behind it, and the deadline.
 *
 *  Reporting work is append-only — a wrong number is corrected with a
 *  **negative entry and a reason**, never by editing the first one, because
 *  "how many were finished on Thursday" is a question somebody asks after the
 *  argument has already started (A5).
 *
 *  Entries that came from a signed overtime sheet are marked as such. That is
 *  the same night appearing in both places on purpose: typed once on the
 *  lembur sheet, posted here when leadership signs it (D147).
 */
export function WorkOrderDrawer({
  woNo, onClose, onChanged,
}: {
  woNo: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const { toast } = useToast();
  const [wo, reload] = useLoad(() => production.getWorkOrder(woNo), [woNo]);
  const [entries, reloadEntries] = useLoad(() => production.listProgress(woNo), [woNo]);
  const [stage, setStage] = useState("");
  const [qty, setQty] = useState(1);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const mayEdit = can("production.update");

  async function report() {
    setBusy(true);
    const res = await production.recordProgress({
      wo_no: woNo, stage, qty, work_date: date,
      worked_by: who || null, note: note || null,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Tidak tercatat", res.error.message);
      return;
    }
    toast("success", "Tercatat", `${formatNumber(qty)} unit · ${STAGE_NAME(stage)}`);
    setQty(1); setNote("");
    reload(); reloadEntries(); onChanged();
  }

  async function close() {
    setBusy(true);
    const res = await production.closeWorkOrder({ wo_no: woNo, reason: closeReason || null });
    setBusy(false);
    if (res.error) { toast("warning", "Belum ditutup", res.error.message); return; }
    toast("success", "Pesanan ditutup", woNo);
    setClosing(false);
    reload(); onChanged();
  }

  return (
    <Drawer
      open onClose={onClose} width="max-w-2xl"
      title={wo.status === "ready" ? wo.data.item_name : woNo}
      subtitle={wo.status === "ready"
        ? `${woNo}${wo.data.project_code ? ` · ${wo.data.project_code}` : ""} · jatuh tempo ${wo.data.due_date}`
        : undefined}
    >
      <Loaded state={wo} onRetry={reload}>
        {(w) => (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {w.status === "DONE"
                ? <Badge tone="slate" dot>selesai</Badge>
                : w.late
                  ? <Badge tone="red" dot>terlambat {Math.abs(w.days_left)} hari</Badge>
                  : <Badge tone={w.days_left <= 3 ? "amber" : "green"} dot>{w.days_left} hari lagi</Badge>}
              <span className="text-[12px] text-slate-600">
                {formatNumber(w.completed)}/{formatNumber(w.qty)} {w.uom} selesai · {w.percent}% keseluruhan · sekarang di {w.current_stage_name}
              </span>
            </div>
            {w.description && <p className="text-[13px] text-slate-600">{w.description}</p>}

            {w.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4" /> Perlu diperiksa
                </p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-amber-900">
                  {w.warnings.map((x) => <li key={x}>· {x}</li>)}
                </ul>
              </div>
            )}

            {/* Every stage, with how far it got. */}
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {w.stages.map((s) => (
                <li key={s.stage} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 text-[11px] tabular-nums text-slate-400">{s.seq}</span>
                  <span className="flex-1 text-[13px] text-slate-700">{s.name}</span>
                  <span className="w-32">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={cn("block h-full rounded-full", s.done >= w.qty ? "bg-emerald-500" : "bg-amber-400")}
                        style={{ width: `${Math.min(Math.max(s.percent, 0), 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="w-20 text-right text-[12px] tabular-nums text-slate-700">
                    {formatNumber(s.done)}/{formatNumber(w.qty)}
                  </span>
                </li>
              ))}
            </ul>

            {mayEdit && w.status === "OPEN" && (
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                  <Hammer className="h-4 w-4 text-slate-400" /> Catat hasil kerja
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_140px]">
                  <select
                    value={stage} onChange={(e) => setStage(e.target.value)}
                    aria-label="Tahap"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  >
                    <option value="">Tahap…</option>
                    {PROCESS_STAGES.map((s) => (
                      <option key={s.code} value={s.code}>{s.seq}. {s.name}</option>
                    ))}
                  </select>
                  <NumberInput value={qty} min={-999} max={9999} onChange={setQty} />
                  <input
                    type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    aria-label="Tanggal"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={who} onChange={(e) => setWho(e.target.value)}
                    placeholder="Siapa yang mengerjakan"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                  <input
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Catatan — wajib kalau jumlahnya negatif (koreksi)"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  {w.completed >= w.qty || closing ? null : (
                    <Button size="sm" variant="ghost" onClick={() => setClosing(true)}>Tutup pesanan</Button>
                  )}
                  <Button size="sm" icon={Plus} onClick={report} disabled={busy || !stage || qty === 0}>
                    Catat
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Koreksi ditulis sebagai angka negatif dengan alasan — catatan lama tidak pernah diubah.
                </p>
              </div>
            )}

            {mayEdit && w.status === "OPEN" && (closing || w.completed >= w.qty) && (
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                  <CheckCircle2 className="h-4 w-4 text-slate-400" /> Tutup pesanan
                </p>
                {w.completed < w.qty && (
                  <input
                    value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
                    placeholder={`Baru ${formatNumber(w.completed)} dari ${formatNumber(w.qty)} — kenapa ditutup?`}
                    className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setClosing(false)} disabled={busy}>Batal</Button>
                  <Button size="sm" onClick={close} disabled={busy}>Tutup</Button>
                </div>
              </div>
            )}

            {/* The entries themselves — including the ones a signed lembur
                sheet posted. */}
            <Loaded state={entries} onRetry={reloadEntries} skeletonRows={3}>
              {(rows) => (
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                    Riwayat ({rows.length})
                  </p>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {rows.length === 0 && (
                      <li className="px-3 py-3 text-[13px] text-slate-500">Belum ada yang dicatat.</li>
                    )}
                    {rows.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[12px]">
                        <span className="w-20 tabular-nums text-slate-500">{p.work_date}</span>
                        <span className="w-24 text-slate-700">{STAGE_NAME(p.stage)}</span>
                        <span className={cn("w-12 text-right tabular-nums", p.qty < 0 ? "text-rose-700" : "text-slate-800")}>
                          {p.qty > 0 ? "+" : ""}{formatNumber(p.qty)}
                        </span>
                        <span className="flex-1 text-slate-500">
                          {p.worked_by ?? "—"}
                          {p.note && <span className="text-slate-400"> · {p.note}</span>}
                        </span>
                        {p.source === "overtime_sheet" && (
                          <Badge tone="brand">lembur {p.source_ref}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Loaded>
          </div>
        )}
      </Loaded>
    </Drawer>
  );
}
