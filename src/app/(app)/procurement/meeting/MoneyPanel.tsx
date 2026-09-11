"use client";

import { Landmark, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useLoad } from "@/components/ui/loaded";
import { accounting } from "@/demo/api";
import type { PrLineView } from "@/services/procurement/contracts";
import { useSession } from "@/store/session";

/** The four numbers a leadership meeting is actually there to settle.
 *
 *  Not "how much did we approve" — that is history by the time anyone is in
 *  the room. The question is: **what has to be paid, is the money there, and
 *  if not, how much has to move into BCA 271 before it can be.** The two
 *  halves live in different services, so this asks both and does the
 *  subtraction in front of the reader rather than storing a third number that
 *  can disagree with either (D9).
 *
 *  The second row is the one that changes a decision: what the transfer
 *  becomes if everything still waiting is approved today. Without it, the
 *  shortfall is discovered by the person trying to make the payments, days
 *  after the room agreed to them — and by then the decision is somebody
 *  else's problem to unwind.
 *
 *  **An approval is a claim on the account, never a reservation against it**
 *  (D126). Cash is fungible: money transferred in for last week's approvals is
 *  spent by whichever payment is made first, so an older approval can find its
 *  funding gone and need it asked for again. That is why there is no status
 *  meaning "the money is waiting for this line" — the system cannot keep that
 *  promise, so it does not make it.
 */
export function MoneyPanel({ lines }: { lines: PrLineView[] }) {
  const { can } = useSession();
  const [accounts] = useLoad(() => accounting.listAccounts(), []);

  /* Approved and not settled — the remaining side of each line. A line half
     paid needs the other half, not both halves again. */
  const toPay = lines
    .filter((l) => l.approval?.approved && !l.coverage.settled && !l.removed_at)
    .reduce((s, l) => s + l.coverage.remaining, 0);

  /* Not decided yet, so not owed yet — but it is the other half of "what will
     this week cost", and leaving it out makes the transfer look smaller than
     it is about to be. */
  const undecided = lines
    .filter((l) => !l.approval?.approved && !l.removed_at)
    .reduce((s, l) => s + l.item_total, 0);

  const mayReadMoney = can("accounting.read");
  const bca = accounts.status === "ready"
    ? accounts.data.find((a) => a.code === "BCA 271")
    : undefined;
  const balance = mayReadMoney ? bca?.balance : undefined;
  const transfer = balance === undefined ? null : Math.max(toPay - balance, 0);
  const transferIfAll = balance === undefined ? null : Math.max(toPay + undecided - balance, 0);

  const cells: { label: string; value: string; tone?: string; note?: string }[] = [
    {
      label: "Approved, not paid yet",
      value: formatIDR(toPay),
      note: "a claim on the account, not a reservation",
    },
    {
      label: "Waiting for a decision",
      value: formatIDR(undecided),
      note: "not owed until somebody says yes",
    },
    {
      label: "BCA 271 balance",
      value: balance === undefined ? "—" : formatIDR(balance),
      note: mayReadMoney ? "the account that pays suppliers" : "needs accounting access",
    },
    {
      label: "Transfer into BCA 271",
      value: transfer === null ? "—" : transfer > 0 ? formatIDR(transfer) : "nothing needed",
      tone: transfer === null ? "text-slate-400" : transfer > 0 ? "text-amber-700" : "text-emerald-700",
      note: transfer === null
        ? undefined
        : transfer > 0
          ? "what is approved cannot be paid without it"
          : `${formatIDR((balance ?? 0) - toPay)} left after paying it all`,
    },
  ];

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
      <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {cells.map((c) => (
          <div key={c.label} className="px-4 py-3.5">
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
              {c.label === "BCA 271 balance" && <Landmark className="h-3 w-3" />}
              {c.label === "Transfer into BCA 271" && <ArrowRightLeft className="h-3 w-3" />}
              {c.label}
            </dt>
            <dd className={cn("mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-800", c.tone)}>
              {c.value}
            </dd>
            {c.note && <p className="mt-0.5 text-[11px] text-slate-500">{c.note}</p>}
          </div>
        ))}
      </dl>

      {transferIfAll !== null && transfer !== null && transferIfAll > transfer && (
        <p className="flex items-start gap-2 border-t border-slate-100 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-900">
          <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Approve everything still waiting and{" "}
            <strong className="tabular-nums">{formatIDR(transferIfAll)}</strong> has to be moved
            into the paying account, not{" "}
            <strong className="tabular-nums">{formatIDR(transfer)}</strong> — better seen now
            than by whoever tries to make the payments.
          </span>
        </p>
      )}

      {transfer !== null && transfer > 0 && (
        /* The correction that removed the second status (D126). Money moved in
           for last week's approvals is spent by whichever payment is made
           first — so an approval is a claim on the account, never a reservation
           against it, and an older one can find its funding gone. */
        <p className="flex items-start gap-2 border-t border-slate-100 bg-rose-50/60 px-4 py-2.5 text-[13px] text-rose-900">
          <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="tabular-nums">{formatIDR(transfer)}</strong> of what is already
            approved has no money behind it. Nothing here is reserved: whatever is transferred in
            is spent by whichever payment is made first, so an approval from last week can lose its
            funding to one made today and has to be asked for again.
          </span>
        </p>
      )}

      {transfer === 0 && (
        <p className="flex items-center gap-2 border-t border-slate-100 bg-emerald-50/60 px-4 py-2.5 text-[13px] text-emerald-900">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Everything approved can be paid out of what is already in the account.
        </p>
      )}
    </div>
  );
}
