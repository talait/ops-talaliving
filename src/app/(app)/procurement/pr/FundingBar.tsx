"use client";

import { Landmark, ArrowDownToLine, CheckCircle2 } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useLoad } from "@/components/ui/loaded";
import { accounting } from "@/demo/api";
import type { PrLineView } from "@/services/procurement/contracts";
import { useSession } from "@/store/session";

/** What is approved and unpaid, against what is actually in the account that
 *  pays it.
 *
 *  This is the number leadership needs at the moment of approving: not "how
 *  much did we approve", but **how much has to be put into BCA 271 before any
 *  of it can go out**. The two halves live in different services, so the
 *  screen asks both and does the subtraction in front of the reader rather
 *  than storing a third number that can disagree with either (D9).
 *
 *  Shown only to somebody who may read accounting. Approving goods and seeing
 *  the bank balance are separate grants (Q3), and this component is a screen
 *  reading two services, not a hole in one of them.
 */
export function FundingBar({ lines }: { lines: PrLineView[] }) {
  const { can } = useSession();
  const mayRead = can("accounting.read");
  const [accounts] = useLoad(() => accounting.listAccounts(), []);

  if (!mayRead) return null;

  /* Approved, not settled — the remaining side of each line, not its whole
     amount. A line half paid needs the other half, not both halves again. */
  const owed = lines
    .filter((l) => l.approval?.approved && !l.coverage.settled && !l.removed_at)
    .reduce((s, l) => s + l.coverage.remaining, 0);

  const bca = accounts.status === "ready"
    ? accounts.data.find((a) => a.code === "BCA 271")
    : undefined;
  const balance = bca?.balance;
  const shortfall = balance === undefined ? null : Math.max(owed - balance, 0);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <p className="flex items-center gap-2 text-[13px] text-slate-600">
        <Landmark className="h-4 w-4 text-slate-400" />
        <span className="font-medium text-slate-800">BCA 271</span>
        <span className="tabular-nums">
          {balance === undefined ? "—" : formatIDR(balance)}
        </span>
      </p>

      <p className="text-[13px] text-slate-600">
        Approved and unpaid <span className="tabular-nums font-medium text-slate-800">{formatIDR(owed)}</span>
      </p>

      {shortfall === null ? (
        <p className="text-[13px] text-slate-400">balance unavailable</p>
      ) : shortfall > 0 ? (
        <p className={cn(
          "flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[13px] font-medium text-amber-800",
        )}>
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Top up {formatIDR(shortfall)} to cover it
        </p>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[13px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Covered — {formatIDR((balance ?? 0) - owed)} left after paying it all
        </p>
      )}
    </div>
  );
}
