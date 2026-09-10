"use client";

import { useState } from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import {
  VARIANCE_REASONS, VARIANCE_REASON_LABEL,
  type PrLineView, type VarianceReason,
} from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";

/** Approved against paid, and the sentence somebody wrote about the gap.
 *
 *  Two gaps live in these numbers and only one of them is a variance.
 *  requested → approved is a DECISION — the CEO cut the amount, that is the
 *  system working. approved → paid is the gap leadership asked about, because
 *  money moved that nobody authorised in that size.
 *
 *  What the application will not do is decide whether a gap was an input error
 *  or a staff error. It cannot know, and a field that guesses would be used as
 *  though it knew. What it does instead is refuse to let the gap close
 *  silently, and offer a closed list of reasons so the KINDS can be counted.
 */
export function VariancePanel({
  line, onChanged,
}: {
  line: PrLineView;
  onChanged: (l: PrLineView) => void;
}) {
  const { can } = useSession();
  const { toast } = useToast();
  const v = line.variance;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<VarianceReason>("price_changed");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const mayExplain = can("procurement.update");

  const cutByCeo = v.approved !== v.requested;

  async function submit() {
    setSaving(true);
    const res = await procurement.explainVariance({
      line_no: line.line_no_full, reason, note: note.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      toast(res.error.status === 409 ? "warning" : "critical", "Not recorded", res.error.message);
      return;
    }
    toast("success", "Explanation recorded", VARIANCE_REASON_LABEL[reason]);
    setOpen(false);
    setNote("");
    onChanged(res.data);
  }

  /* Nothing paid yet, or the payment matches: there is no story to tell.
     Reporting arithmetic as an exception is how people learn to ignore
     exceptions. */
  if (!v.material) {
    if (!cutByCeo) return null;
    return (
      <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] text-slate-600">
        Asked for {formatIDR(v.requested)}, approved at {formatIDR(v.approved)} —{" "}
        a decision, not a difference. Everything from here is measured against
        the approved figure.
      </div>
    );
  }

  const over = v.kind === "over";

  return (
    <section
      className={cn(
        "rounded-xl border px-4 py-3.5",
        over ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60",
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Scale className="h-3.5 w-3.5" />
        Approved against paid
      </p>

      <dl className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Requested</dt>
          <dd className="tabular-nums text-slate-700">{formatIDR(v.requested)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            Approved{cutByCeo && <span className="ml-1 text-[11px] text-slate-400">(cut at approval)</span>}
          </dt>
          <dd className="tabular-nums text-slate-700">{formatIDR(v.approved)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Actually paid</dt>
          <dd className="tabular-nums text-slate-700">{formatIDR(v.paid)}</dd>
        </div>
        <div className={cn(
          "flex justify-between gap-4 border-t pt-1.5 font-semibold",
          over ? "border-rose-200 text-rose-700" : "border-amber-200 text-amber-800",
        )}>
          <dt>{over ? "Paid beyond the approval" : "Short of the approval"}</dt>
          <dd className="tabular-nums">{over ? "+" : "−"}{formatIDR(Math.abs(v.delta))}</dd>
        </div>
      </dl>

      <p className={cn("mt-2 text-[12px]", over ? "text-rose-800" : "text-amber-800")}>
        {over
          ? `Money left the company beyond what was authorised. Until somebody says why, ${formatIDR(Math.abs(v.delta))} is a balance the vendor owes back or the next invoice has to carry.`
          : line.coverage.settled
            ? `Closed cheaper than approved. The ${formatIDR(Math.abs(v.delta))} was never spent.`
            : `${formatIDR(Math.abs(v.delta))} of the approved amount has not been paid — either it is still owed, or the line finished cheaper and somebody has to say so.`}
      </p>

      {v.explanation ? (
        <div className="mt-3 rounded-lg border border-white bg-white/80 px-3 py-2.5">
          <p className="text-[13px] font-medium text-slate-800">
            {VARIANCE_REASON_LABEL[v.explanation.reason]}
          </p>
          {v.explanation.note && (
            <p className="mt-0.5 text-[13px] text-slate-600">{v.explanation.note}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            {v.explanation.recorded_by_email} ·{" "}
            {new Date(v.explanation.recorded_at).toLocaleString()} · on a gap of{" "}
            {formatIDR(Math.abs(v.explanation.amount_at_time))}
          </p>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-slate-700">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          Nobody has explained this yet.
        </p>
      )}

      {mayExplain && !open && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          {v.explanation ? "Record a different explanation" : "Explain the difference"}
        </Button>
      )}

      {mayExplain && open && (
        <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div>
            <label htmlFor="var-reason" className="block text-xs text-slate-500">What happened</label>
            <select
              id="var-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as VarianceReason)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
            >
              {VARIANCE_REASONS.map((r) => (
                <option key={r} value={r}>{VARIANCE_REASON_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="var-note" className="block text-xs text-slate-500">
              Detail {reason === "other" ? "(required)" : "(optional)"}
            </label>
            <input
              id="var-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Vendor raised the price after the quote expired"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          {v.kind === "under" && reason !== "partial_payment" && (
            <p className="text-[11px] text-slate-500">
              This closes the line at {formatIDR(v.paid)}. Choose <em>paid in parts</em>{" "}
              instead if the rest is still coming.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? "Recording…" : "Record explanation"}
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            Kept, never overwritten — a later correction is a new statement beside
            this one, so the first answer stays readable.
          </p>
        </div>
      )}
    </section>
  );
}
