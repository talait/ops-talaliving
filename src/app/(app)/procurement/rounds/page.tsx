"use client";

import { useState } from "react";
import {
  Wallet, RefreshCw, Check, Lock, ArrowRightLeft, AlertTriangle, History,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { StatusPill } from "@/components/ui/status-pill";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement } from "@/demo/api";
import type { PrLineView, RoundStatus } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { TransferForm } from "./TransferForm";

/** The payment round: one queue of what is owed, funded in one transfer.
 *
 *  Four states and each one is a different fact, which is why they are not
 *  collapsed into "in progress":
 *
 *    OPEN         everything approved and still owed rolls in by itself
 *    APPROVED     the numbers freeze — they stop being a calculation and
 *                 become the record of a decision
 *    TRANSFERRED  money reached BCA 271. **No item is paid by this** (A10)
 *    CLOSED       the round is finished; whatever is still owed goes back to
 *                 the queue rather than quietly disappearing
 *
 *  The third one is the point of the screen. In the old system "transferred"
 *  and "paid" were the same tick, so a round that had been funded looked like
 *  a set of settled invoices — and the vendors who had not been paid out of it
 *  were invisible until they called.
 */

const STEPS: { key: RoundStatus; label: string; note: string }[] = [
  { key: "OPEN", label: "Open", note: "collecting what is owed" },
  { key: "APPROVED", label: "Approved", note: "numbers frozen" },
  { key: "TRANSFERRED", label: "Transferred", note: "money in BCA 271" },
  { key: "CLOSED", label: "Closed", note: "what is left goes back" },
];

export default function RoundsPage() {
  const { hasAuthority } = useSession();
  const { toast } = useToast();
  const [rounds, reload] = useLoad(() => procurement.listRounds(), []);
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState<{ round_no: string; lines: PrLineView[] } | null>(null);

  const mayDecideFunds = hasAuthority("approve_funds");
  const mayPost = hasAuthority("post_ledger");

  async function sync() {
    setBusy(true);
    const res = await procurement.syncRound();
    setBusy(false);
    if (res.error) { toast("warning", "Not synced", res.error.message); return; }
    toast(
      res.meta.outcome === "noop" ? "info" : "success",
      res.meta.outcome === "noop" ? "Nothing to roll in" : `Round ${res.data.round_no} updated`,
      res.meta.outcome === "noop"
        ? "Every approved item that is still owed is already in the round."
        : `${res.data.line_count} item(s) · ${formatIDR(res.data.requested_total)}`,
    );
    reload();
  }

  async function approve(roundNo: string) {
    setBusy(true);
    const res = await procurement.approveRound(roundNo);
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not approved", res.error.message);
      return;
    }
    toast("success", `Round ${roundNo} approved`, `${formatIDR(res.data.requested_total)} frozen`);
    reload();
  }

  async function close(roundNo: string) {
    setBusy(true);
    const res = await procurement.closeRound(roundNo);
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not closed", res.error.message);
      return;
    }
    /* The step everyone forgets, so closing says exactly what it let go of. */
    setReleased({ round_no: roundNo, lines: res.data.still_owed });
    toast(
      res.data.still_owed.length > 0 ? "warning" : "success",
      `Round ${roundNo} closed`,
      res.data.still_owed.length > 0
        ? `${res.data.still_owed.length} item(s) still owed — back in the queue`
        : "Everything in it was settled.",
    );
    reload();
  }

  const lineColumns: Column<PrLineView>[] = [
    {
      key: "item",
      header: "Item",
      className: "whitespace-normal",
      render: (l) => {
        const meta = [l.line_no_full, l.requested_by_name, l.vendor_name].filter(Boolean).join(" · ");
        return (
          <div className="max-w-[420px] whitespace-normal break-words">
            <p className="font-medium leading-snug text-slate-800">{l.description}</p>
            {l.purpose && <p className="text-[12px] leading-snug text-slate-500">{l.purpose}</p>}
            <p className="truncate font-mono text-[10px] text-slate-400" title={meta}>{meta}</p>
          </div>
        );
      },
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (l) => (
        <span className="whitespace-nowrap text-[12px] text-slate-600">
          {l.qty != null ? `${formatNumber(l.qty)} ${l.uom ?? ""}` : "—"}
        </span>
      ),
    },
    {
      key: "owed",
      header: "In this round",
      align: "right",
      render: (l) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums font-medium text-slate-800">{formatIDR(l.coverage.remaining)}</p>
          {l.coverage.covered > 0 && (
            <p className="text-[11px] text-slate-500">{formatIDR(l.coverage.covered)} paid so far</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Item status",
      render: (l) => <StatusPill kind="line" status={l.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Procurement"
        title="Payment rounds"
        description="Everything approved and still owed, collected into one queue and funded in one transfer. Funding the round is not paying anyone — that happens item by item, against a document."
      />

      <Loaded state={rounds} onRetry={reload}>
        {(all) => {
          /* Usually one, sometimes two: a round being funded and the next one
             already collecting behind it. Showing only the first would hide a
             round somebody is waiting on. */
          const liveRounds = all
            .filter((r) => r.status !== "CLOSED")
            .sort((a, b) => a.round_no.localeCompare(b.round_no));
          const past = all.filter((r) => r.status === "CLOSED");

          return (
            <>
              {liveRounds.length > 0 ? liveRounds.map((live) => (
                <Card key={live.round_id} className="mb-5">
                  <CardHeader
                    title={live.round_no}
                    subtitle={`${live.line_count} item(s) · ${formatIDR(live.requested_total)} requested`}
                    icon={Wallet}
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <SourceBadge state={rounds} />
                        <StatusPill kind="round" status={live.status} />
                      </div>
                    }
                  />

                  {/* Where the round is, and what each state actually means —
                      the vocabulary is the whole point of the screen. */}
                  <ol className="grid gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
                    {STEPS.map((step) => {
                      const idx = STEPS.findIndex((x) => x.key === live.status);
                      const here = STEPS.findIndex((x) => x.key === step.key);
                      const done = here < idx;
                      const now = here === idx;
                      return (
                        <li
                          key={step.key}
                          className={cn(
                            "bg-white px-4 py-2.5",
                            now && "bg-brand-50",
                            done && "bg-slate-50",
                          )}
                        >
                          <p className={cn(
                            "text-[13px] font-semibold",
                            now ? "text-brand-800" : done ? "text-slate-500" : "text-slate-400",
                          )}>
                            {step.label}
                          </p>
                          <p className="text-[11px] text-slate-500">{step.note}</p>
                        </li>
                      );
                    })}
                  </ol>

                  <dl className="grid gap-x-6 gap-y-3 border-b border-slate-100 px-4 py-3.5 sm:grid-cols-4">
                    {([
                      ["Requested", formatIDR(live.requested_total), live.status === "OPEN" ? "recalculated as things change" : "frozen at approval"],
                      ["BCA 271", formatIDR(live.paying_balance), "the account that pays suppliers"],
                      ["To transfer", live.to_transfer > 0 ? formatIDR(live.to_transfer) : "nothing needed", "before this round can be paid"],
                      ["After paying it all", formatIDR(live.remaining_after_payment), live.remaining_after_payment < 0 ? "short by this much" : "left in the account"],
                    ] as [string, string, string][]).map(([k, v, note]) => (
                      <div key={k}>
                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                        <dd className={cn(
                          "mt-0.5 text-lg font-bold tabular-nums tracking-tight",
                          k === "After paying it all" && live.remaining_after_payment < 0
                            ? "text-amber-700" : "text-slate-800",
                        )}>
                          {v}
                        </dd>
                        <p className="text-[11px] text-slate-500">{note}</p>
                      </div>
                    ))}
                  </dl>

                  {live.status === "TRANSFERRED" && (
                    <p className="flex items-start gap-2 border-b border-slate-100 bg-violet-50 px-4 py-2.5 text-[13px] text-violet-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <strong>The money is in BCA 271, and nothing is paid yet.</strong>{" "}
                        Every item below is still owed to a supplier — a line becomes paid
                        when a payment is recorded against it, with a document, not when a
                        round is funded.
                      </span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                    {live.status === "OPEN" && (
                      <Button variant="outline" size="sm" icon={RefreshCw} disabled={busy} onClick={sync}>
                        Roll in what is owed
                      </Button>
                    )}
                    {live.status === "OPEN" && mayDecideFunds && (
                      <Button size="sm" icon={Check} disabled={busy || live.line_count === 0} onClick={() => approve(live.round_no)}>
                        Approve the round
                      </Button>
                    )}
                    {live.status !== "OPEN" && mayDecideFunds && (
                      <Button variant="outline" size="sm" icon={Lock} disabled={busy} onClick={() => close(live.round_no)}>
                        Close the round
                      </Button>
                    )}
                    {!mayDecideFunds && (
                      <p className="text-[12px] text-slate-500">
                        Approving and closing a round belong to whoever holds{" "}
                        <span className="font-mono text-[11px]">approve_funds</span> — you can
                        read it either way.
                      </p>
                    )}
                  </div>

                  {live.status === "APPROVED" && (
                    <div className="px-4 py-3">
                      {mayPost ? (
                        <TransferForm round={live} onDone={reload} />
                      ) : (
                        <p className="text-[13px] text-slate-500">
                          Approved and waiting for the transfer, which is recorded by
                          whoever writes the ledger.
                        </p>
                      )}
                    </div>
                  )}

                  {live.transferred_amount != null && (
                    <p className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-slate-600">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                      {formatIDR(live.transferred_amount)} transferred ·{" "}
                      <span className="font-mono text-[12px]">{live.transferred_trx_no}</span>
                    </p>
                  )}

                  <DataTable
                    dense
                    columns={lineColumns}
                    rows={live.lines}
                    rowKey={(l) => l.id}
                    empty="Nothing in this round yet — roll in what is owed."
                  />
                </Card>
              )) : (
                <Card className="mb-5">
                  <div className="p-5">
                    <EmptyState
                      icon={Wallet}
                      title="No round is open"
                      description="Rolling in what is owed opens one and fills it with every approved item that has not been paid."
                      action={<Button icon={RefreshCw} disabled={busy} onClick={sync}>Roll in what is owed</Button>}
                    />
                  </div>
                </Card>
              )}

              {released && (
                <Card className="mb-5">
                  <CardHeader
                    title={`${released.round_no} closed`}
                    subtitle={released.lines.length > 0
                      ? "These were in the round and are still owed. They are back in the queue — closing a round never settles anything."
                      : "Everything in it was settled."}
                    icon={Lock}
                    action={<Button variant="ghost" size="sm" onClick={() => setReleased(null)}>Dismiss</Button>}
                  />
                  {released.lines.length > 0 && (
                    <DataTable
                      dense
                      columns={lineColumns}
                      rows={released.lines}
                      rowKey={(l) => l.id}
                    />
                  )}
                </Card>
              )}

              <Card>
                <CardHeader title="Past rounds" subtitle="Closed, with what was actually transferred." icon={History} />
                <DataTable
                  dense
                  columns={[
                    { key: "no", header: "Round", render: (r) => <span className="font-mono text-[12px] text-slate-700">{r.round_no}</span> },
                    { key: "lines", header: "Items", align: "right", render: (r) => <span className="tabular-nums text-[12px] text-slate-600">{r.line_count}</span> },
                    { key: "req", header: "Requested", align: "right", render: (r) => <span className="tabular-nums text-slate-700">{formatIDR(r.requested_total)}</span> },
                    {
                      key: "trf",
                      header: "Transferred",
                      align: "right",
                      render: (r) => r.transferred_amount != null
                        ? (
                          <div className="whitespace-nowrap">
                            <p className="tabular-nums text-slate-700">{formatIDR(r.transferred_amount)}</p>
                            <p className="font-mono text-[10px] text-slate-400">{r.transferred_trx_no}</p>
                          </div>
                        )
                        : <span className="text-slate-300">never funded</span>,
                    },
                    { key: "status", header: "Status", render: (r) => <StatusPill kind="round" status={r.status} /> },
                  ]}
                  rows={past}
                  rowKey={(r) => r.round_id}
                  empty="No closed rounds yet."
                />
              </Card>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
