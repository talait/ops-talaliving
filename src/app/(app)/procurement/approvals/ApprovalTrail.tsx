"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { procurement } from "@/demo/api";
import type { PrApproval } from "@/services/procurement/contracts";

/** Every decision ever taken on one line, oldest first.
 *
 *  The current value is one row of this, not the whole story. "Approved at
 *  10:18, un-approved at 14:07, approved again at 09:02 the next morning" is
 *  a fact about how a decision was reached, and the old system could not
 *  express it at all — a cell holds one value, and the previous one is gone
 *  the moment somebody types over it.
 */
export function ApprovalTrail({ lineNo }: { lineNo: string }) {
  const [rows, setRows] = useState<PrApproval[] | null>(null);

  useEffect(() => {
    let alive = true;
    void procurement.lineHistory(lineNo).then((r) => {
      if (alive && r.data) setRows(r.data);
    });
    return () => { alive = false; };
  }, [lineNo]);

  if (!rows) return <p className="text-[12px] text-slate-400">Loading the trail…</p>;
  if (rows.length === 0) return <p className="text-[12px] text-slate-400">No decision recorded yet.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((a) => (
        <li key={a.id} className="flex gap-2.5 text-[12px]">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <span className="font-medium text-slate-700">
              {a.approved ? `Approved ${formatIDR(a.approved_amount ?? 0)}` : "Un-approved"}
            </span>
            <span className="text-slate-500">
              {" "}by {a.recorded_by_email} · {new Date(a.recorded_at).toLocaleString()} · via {a.channel}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
