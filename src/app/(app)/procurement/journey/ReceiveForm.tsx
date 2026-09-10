"use client";

import { useRef, useState } from "react";
import { Camera, Upload, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { NumberInput } from "@/components/ui/number-input";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { documents, procurement } from "@/demo/api";
import { RECEIPT_CONDITIONS, type ReceiptCondition, type PoLineJourney } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";

/** Recording what actually arrived — with the photograph that proves it.
 *
 *  No photo, no receiving report (A15). The rule is not paperwork for its own
 *  sake: a delivery nobody photographed is a delivery nobody can argue about
 *  three weeks later, when the vendor says they sent forty-seven and the
 *  workshop remembers forty-five.
 *
 *  Quantities are cumulative and append-only. Four shipments against one line
 *  are four receipts, not one number edited four times — and the fourth one
 *  arriving two sheets over is a fact the record keeps rather than trims
 *  (D98).
 */
export function ReceiveForm({
  poLineId, line, onDone,
}: {
  poLineId: string;
  line: PoLineJourney;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const remaining = Math.max(line.qty - line.received, 0);
  const [qty, setQty] = useState(remaining || line.qty);
  const [condition, setCondition] = useState<ReceiptCondition>("GOOD");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function pick(f: File) {
    const up = await documents.upload({
      filename: f.name, mime: f.type || "image/jpeg", bytes: f.size,
    });
    if (up.error) { toast("critical", "Upload failed", up.error.message); return; }
    setFile({ id: up.data.id, name: f.name });
  }

  async function submit() {
    setBusy(true);
    const res = await procurement.createReceipt({
      po_line_id: poLineId,
      qty_received: qty,
      condition,
      attachment_ids: file ? [file.id] : [],
      note: note.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 422 ? "warning" : "critical", "Not recorded", res.error.message);
      return;
    }
    toast(
      res.data.notified ? "warning" : "success",
      `Received ${formatNumber(qty)} ${line.uom}`,
      res.data.notified
        ? "Condition needs attention — the line stays open."
        : `${res.data.receipt.receipt_no} · tanda terima on file`,
    );
    onDone();
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3">
      <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-700">
        <PackageCheck className="h-4 w-4 text-slate-400" />
        {line.description}
        <span className="text-[12px] text-slate-400">
          {formatNumber(line.received)} of {formatNumber(line.qty)} {line.uom} so far
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="rc-qty" className="block text-xs text-slate-500">How many arrived</label>
          <NumberInput id="rc-qty" value={qty} min={0} onChange={setQty} className="mt-1" />
        </div>
        <div>
          <label htmlFor="rc-cond" className="block text-xs text-slate-500">Condition</label>
          <select
            id="rc-cond" value={condition}
            onChange={(e) => setCondition(e.target.value as ReceiptCondition)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
          >
            {RECEIPT_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rc-note" className="block text-xs text-slate-500">Note (optional)</label>
          <input
            id="rc-note" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. two sheets more than ordered"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
      </div>

      <input ref={fileRef} id="rc-file" type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <input ref={cameraRef} id="rc-cam" type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" icon={Camera} onClick={() => cameraRef.current?.click()}>
          Photograph
        </Button>
        <Button variant="outline" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>
          Choose a file
        </Button>
        <span className={cn("text-[12px]", file ? "text-slate-600" : "text-amber-700")}>
          {file ? file.name : "a photo is required — no photo, no receiving report"}
        </span>
        <Button size="sm" className="ml-auto" disabled={busy || qty <= 0 || !file} onClick={submit}>
          {busy ? "Recording…" : "Record what arrived"}
        </Button>
      </div>

      {qty > remaining && remaining > 0 && (
        <p className="mt-2 text-[12px] text-amber-700">
          {formatNumber(qty - remaining)} {line.uom} more than what is still outstanding.
          Recorded as it is — over-delivery is a credit with the vendor, not a
          rounding error.
        </p>
      )}
    </div>
  );
}
