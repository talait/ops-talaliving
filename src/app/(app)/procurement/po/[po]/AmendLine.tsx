"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/primitives";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { procurement } from "@/demo/api";
import type { PoLineJourney } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";

/** Changing a line on an order that has already been sent.
 *
 *  Never an edit in place. The old line stays and points at the new one, so
 *  *what did we agree, and when did it change* has an answer months later
 *  with a vendor on the phone (D129). The reason is required for the same
 *  cause: the numbers say what changed, only a person can say why.
 */
export function AmendLine({
  poNo, line, onClose, onSaved,
}: {
  poNo: string;
  line: PoLineJourney;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [qty, setQty] = useState(line.qty);
  const [price, setPrice] = useState(line.unit_price);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const total = Math.round(qty * price);
  const delta = total - line.line_total;

  async function save() {
    setBusy(true);
    const res = await procurement.amendPoLine({
      po_no: poNo, line_no: line.line_no, qty, unit_price: price, reason,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not amended", res.error.message);
      return;
    }
    toast("success", `${poNo} line ${line.line_no} amended`, `${formatIDR(line.line_total)} → ${formatIDR(total)}`);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Amend line ${line.line_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button icon={PenLine} onClick={save} disabled={busy || !reason.trim() || qty <= 0 || price <= 0}>
            {busy ? "Amending…" : "Amend it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-slate-600">
          {line.description} — agreed at{" "}
          <strong className="tabular-nums">{formatNumber(line.qty)} {line.uom} × {formatIDR(line.unit_price)}</strong>.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="am-qty" className="block text-xs text-slate-500">Quantity</label>
            <NumberInput id="am-qty" value={qty} min={0} onChange={setQty} className="mt-1" />
          </div>
          <div>
            <label htmlFor="am-price" className="block text-xs text-slate-500">Unit price</label>
            <MoneyInput id="am-price" value={price} onChange={setPrice} className="mt-1" />
          </div>
        </div>

        <p className="text-[13px] text-slate-700">
          Contract on this line: <strong className="tabular-nums">{formatIDR(total)}</strong>
          {delta !== 0 && (
            <span className={delta > 0 ? "text-amber-700" : "text-brand-700"}>
              {" "}({delta > 0 ? "+" : "−"}{formatIDR(Math.abs(delta))})
            </span>
          )}
        </p>

        {line.received > qty && (
          /* Allowed, and stated. Refusing it would leave the order disagreeing
             with the warehouse, which helps nobody (D98). */
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {formatNumber(line.received)} {line.uom} have already arrived — more than this
            amendment leaves ordered. The difference becomes a credit with the vendor rather
            than something we owe for.
          </p>
        )}

        <div>
          <label htmlFor="am-reason" className="block text-xs text-slate-500">Why it changed</label>
          <input
            id="am-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. vendor raised the price after the quote expired"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Required. The numbers say what changed; only this says why.
          </p>
        </div>
      </div>
    </Modal>
  );
}
