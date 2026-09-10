"use client";

import { useState } from "react";
import { MessagesSquare, Check, X, Bot, CheckCheck, Landmark } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement, accounting } from "@/demo/api";
import type { ApprovalBatchView, ApprovalRequestView } from "@/services/procurement/contracts";
import { useDemo } from "@/demo/provider";
import { useToast } from "@/store/toast";

/** Google Chat, standing in for itself.
 *
 *  A leadership meeting runs on one laptop, open on whoever's account. Ticking
 *  the approval box there records that person as the approver, which is false
 *  — and false in the one place the system is meant to be trustworthy. So the
 *  question is sent here and answered by the approver's own account (D69).
 *
 *  It arrives as a LIST, not fifteen separate cards (D70). Somebody answering
 *  card by card has no idea what they have committed to until they add fifteen
 *  numbers up, so the card carries the three totals that matter: asked,
 *  approved so far, and what has to be paid — with the paying account's
 *  balance beside them, because "yes" and "we can afford it" are two
 *  different questions and only one of them is answered by the list.
 *
 *  In Phase 2 the card is posted by a worker subscribed to
 *  `procurement.approval.requested`, and answers arrive as a signed webhook.
 */
export default function ChatSimulatorPage() {
  const state = useDemo();
  const { toast } = useToast();
  const [asEmail, setAsEmail] = useState("evin@talaliving.com");
  const [batches, reload] = useLoad(() => procurement.listApprovalBatches({ pending: true }), []);
  const [accounts] = useLoad(() => accounting.listAccounts(), []);
  const balance = accounts.status === "ready"
    ? accounts.data.find((a) => a.code === "BCA 271")?.balance
    : undefined;

  return (
    <div>
      <PageHeader
        breadcrumb="Demo"
        title="Google Chat"
        description="The approval half that does not happen in this app. A list is sent here, the approver answers from their own account, and the decision is recorded against them — not against whoever's laptop the meeting is running on."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <label htmlFor="as-who" className="text-[13px] text-slate-600">Answering as</label>
        <select
          id="as-who"
          value={asEmail}
          onChange={(e) => setAsEmail(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          {state.users.map((u) => (
            <option key={u.id} value={u.email}>{u.full_name} · {u.email}</option>
          ))}
        </select>
        <p className="text-[12px] text-slate-500">
          Google says who this is; the app does not get a say. Answer somebody
          else&apos;s list and watch it be refused — that refusal is the reason
          this route exists.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Waiting for an answer"
          subtitle="One card per send, with everything that went out in it."
          icon={MessagesSquare}
          action={<SourceBadge state={batches} />}
        />
        <Loaded state={batches} onRetry={reload}>
          {(rows) => rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={MessagesSquare}
                title="No lists waiting"
                description="Send items from the requests board — the button appears when something is waiting for approval."
              />
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {rows.map((b) => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  asEmail={asEmail}
                  balance={balance}
                  onDone={reload}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </Loaded>
      </Card>
    </div>
  );
}

function BatchCard({
  batch, asEmail, balance, onDone, toast,
}: {
  batch: ApprovalBatchView;
  asEmail: string;
  balance: number | undefined;
  onDone: () => void;
  toast: (tone: "success" | "warning" | "critical", title: string, body?: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const mine = asEmail === batch.sent_to_email;
  const pending = batch.items.filter((i) => !i.answered_at);
  const shortfall = balance === undefined ? null : Math.max(batch.to_pay_total - balance, 0);

  async function answerOne(
    item: ApprovalRequestView, approved: boolean, qty: number | null, amount: number, instructions: string | null,
  ) {
    setBusy(item.id);
    const res = await procurement.answerFromChat({
      token: item.token, answered_by_email: asEmail, approved,
      approved_qty: qty, approved_amount: amount, instructions,
    });
    setBusy(null);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not recorded", res.error.message);
      return;
    }
    toast("success", approved ? `Approved ${formatIDR(amount)}` : "Declined", `Recorded as ${asEmail}, via chat`);
    onDone();
  }

  async function approveRest() {
    setBusy("all");
    const res = await procurement.answerBatch({ batch_token: batch.token, answered_by_email: asEmail });
    setBusy(null);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not recorded", res.error.message);
      return;
    }
    toast("success", `Approved ${res.data.answered} item(s)`, `${formatIDR(res.data.to_pay_total)} to pay · recorded as ${asEmail}`);
    onDone();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800">
            OPS TALALIVING · {batch.items.length} item{batch.items.length === 1 ? "" : "s"} for approval
          </p>
          <p className="text-[11px] text-slate-400">
            {batch.batch_no} · to {batch.sent_to_email} · sent by {batch.sent_by_email} ·{" "}
            {new Date(batch.sent_at).toLocaleString()}
          </p>
        </div>
        {batch.answered > 0 && <Badge tone="slate">{batch.answered} answered</Badge>}
      </div>

      {/* The three totals, so a yes is not a number somebody has to add up. */}
      <dl className="grid gap-x-6 gap-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">Asked for</dt>
          <dd className="tabular-nums font-medium text-slate-800">{formatIDR(batch.requested_total)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">Approved so far</dt>
          <dd className="tabular-nums font-medium text-emerald-700">{formatIDR(batch.approved_total)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-400">Has to be paid</dt>
          <dd className="tabular-nums font-medium text-slate-800">{formatIDR(batch.to_pay_total)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            <Landmark className="h-3 w-3" /> BCA 271
          </dt>
          <dd className={cn(
            "tabular-nums font-medium",
            shortfall === null ? "text-slate-400" : shortfall > 0 ? "text-amber-700" : "text-slate-800",
          )}>
            {balance === undefined ? "—" : formatIDR(balance)}
            {shortfall !== null && shortfall > 0 && (
              <span className="block text-[11px] font-normal text-amber-700">
                top up {formatIDR(shortfall)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <ul className="divide-y divide-slate-100">
        {batch.items.map((item) => (
          <ChatItem
            key={item.id}
            item={item}
            busy={busy === item.id}
            onAnswer={answerOne}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
        {!mine && (
          <p className="mr-auto text-[12px] text-amber-700">
            This list belongs to {batch.sent_to_email}.
          </p>
        )}
        {pending.length > 0 && (
          <Button size="sm" icon={CheckCheck} disabled={busy !== null} onClick={approveRest}>
            {busy === "all"
              ? "Recording…"
              : `Approve the remaining ${pending.length} as asked · ${formatIDR(pending.reduce((s, i) => s + i.item_total, 0))}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatItem({
  item, busy, onAnswer,
}: {
  item: ApprovalRequestView;
  busy: boolean;
  onAnswer: (
    item: ApprovalRequestView, approved: boolean, qty: number | null, amount: number, instructions: string | null,
  ) => void;
}) {
  const [qty, setQty] = useState<number>(item.qty ?? 0);
  const [amount, setAmount] = useState<number>(item.item_total);
  const [instructions, setInstructions] = useState("");

  if (item.answered_at) {
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
        <span className="min-w-0 flex-1">
          <span className="font-medium text-slate-700">{item.description}</span>
          <span className="ml-2 font-mono text-[10px] text-slate-400">{item.line_no_full}</span>
        </span>
        <Badge tone={item.outcome === "approved" ? "green" : "slate"}>
          {item.outcome === "approved" ? `approved ${formatIDR(item.approved_amount ?? 0)}` : "not yet"}
        </Badge>
      </li>
    );
  }

  return (
    <li className="space-y-2.5 px-4 py-3">
      <div>
        <p className="text-[14px] font-medium text-slate-800">{item.description}</p>
        {item.purpose && <p className="text-[13px] text-slate-600">{item.purpose}</p>}
        <p className="font-mono text-[10px] text-slate-400">
          {item.line_no_full} · {item.requested_by_name}
          {item.project_code && ` · ${item.project_code}`}
          {item.vendor_name && ` · ${item.vendor_name}`}
          {item.qty != null && ` · ${formatNumber(item.qty)} ${item.uom ?? ""} × ${formatIDR(item.unit_price ?? 0)}`}
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-4">
        {item.qty != null && (
          <div>
            <label htmlFor={`q-${item.id}`} className="block text-[11px] text-slate-500">How many</label>
            <NumberInput
              id={`q-${item.id}`}
              size="sm"
              value={qty}
              min={0}
              max={item.qty ?? undefined}
              onChange={(v) => {
                setQty(v);
                if (item.unit_price != null) setAmount(Math.round(v * item.unit_price));
              }}
              className="mt-1"
            />
          </div>
        )}
        <div>
          <label htmlFor={`a-${item.id}`} className="block text-[11px] text-slate-500">
            For how much <span className="text-slate-400">of {formatIDR(item.item_total)}</span>
          </label>
          <MoneyInput id={`a-${item.id}`} size="sm" value={amount} ceiling={item.item_total} onChange={setAmount} className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`i-${item.id}`} className="block text-[11px] text-slate-500">Instructions (optional)</label>
          <input
            id={`i-${item.id}`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Negotiate first"
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[13px] focus:border-brand-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline" size="sm" icon={X} disabled={busy}
          onClick={() => onAnswer(item, false, null, amount, instructions || null)}
        >
          Not yet
        </Button>
        <Button
          size="sm" icon={Check} disabled={busy}
          onClick={() => onAnswer(item, true, item.qty != null ? qty : null, amount, instructions || null)}
        >
          {busy ? "Sending…" : `Approve ${formatIDR(amount)}`}
        </Button>
      </div>
    </li>
  );
}
