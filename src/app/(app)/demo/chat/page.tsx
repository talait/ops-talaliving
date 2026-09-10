"use client";

import { useState } from "react";
import { MessagesSquare, Check, X, Bot } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { procurement } from "@/demo/api";
import type { ApprovalRequestView } from "@/services/procurement/contracts";
import { useDemo } from "@/demo/provider";
import { useToast } from "@/store/toast";

/** Google Chat, standing in for itself.
 *
 *  A leadership meeting runs on one laptop, open on whoever's account. Ticking
 *  the approval box there records that person as the approver, which is false
 *  — and false in the one place the system is meant to be trustworthy.
 *
 *  So the question is sent to the approver's chat and answered there. What
 *  makes that worth the round trip is the identity: the answer is recorded
 *  against **whoever authenticated with Google**, not whoever is signed into
 *  this app. This screen is that half of the loop, faked well enough to prove
 *  the rule — including the part where answering somebody else's card is
 *  refused (D69).
 *
 *  In Phase 2 the card is posted by a worker subscribed to
 *  `procurement.approval.requested`, and the answer arrives as a signed
 *  webhook. Nothing on the procurement side changes: it already writes the
 *  event and already accepts the answer.
 */
export default function ChatSimulatorPage() {
  const state = useDemo();
  const { toast } = useToast();
  const [asEmail, setAsEmail] = useState("evin@talaliving.com");
  const [cards, reload] = useLoad(() => procurement.listApprovalRequests({ pending: true }), []);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        breadcrumb="Demo"
        title="Google Chat"
        description="The approval half that does not happen in this app. A line is sent here, the approver answers from their own account, and the decision is recorded against them — not against whoever's laptop the meeting is running on."
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
          else&apos;s card and watch it be refused — that refusal is the reason
          this route exists.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Waiting for an answer"
          subtitle="One card per item, as it would arrive in chat."
          icon={MessagesSquare}
          action={<SourceBadge state={cards} />}
        />
        <Loaded state={cards} onRetry={reload}>
          {(rows) => rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={MessagesSquare}
                title="No cards waiting"
                description="Send items from the requests board — the button appears when something is waiting for approval."
              />
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {rows.map((c) => (
                <ChatCard
                  key={c.id}
                  card={c}
                  asEmail={asEmail}
                  busy={busy === c.id}
                  onAnswer={async (approved, qty, amount, instructions) => {
                    setBusy(c.id);
                    const res = await procurement.answerFromChat({
                      token: c.token,
                      answered_by_email: asEmail,
                      approved,
                      approved_qty: qty,
                      approved_amount: amount,
                      instructions,
                    });
                    setBusy(null);
                    if (res.error) {
                      toast(res.error.status === 403 ? "critical" : "warning", "Not recorded", res.error.message);
                      return;
                    }
                    toast(
                      "success",
                      approved ? `Approved ${formatIDR(amount ?? c.item_total)}` : "Declined",
                      `Recorded as ${asEmail}, via chat`,
                    );
                    reload();
                  }}
                />
              ))}
            </div>
          )}
        </Loaded>
      </Card>
    </div>
  );
}

function ChatCard({
  card, asEmail, busy, onAnswer,
}: {
  card: ApprovalRequestView;
  asEmail: string;
  busy: boolean;
  onAnswer: (approved: boolean, qty: number | null, amount: number, instructions: string | null) => void;
}) {
  const [qty, setQty] = useState<number>(card.qty ?? 0);
  const [amount, setAmount] = useState<number>(card.item_total);
  const [instructions, setInstructions] = useState("");
  const mine = asEmail === card.sent_to_email;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800">OPS TALALIVING</p>
          <p className="text-[11px] text-slate-400">
            to {card.sent_to_email} · sent by {card.sent_by_email} ·{" "}
            {new Date(card.sent_at).toLocaleString()}
          </p>
        </div>
        {card.line_decided && <Badge tone="slate">already decided in the app</Badge>}
      </div>

      <div className="space-y-2 px-4 py-3">
        <p className="text-[15px] font-medium text-slate-800">{card.description}</p>
        {card.purpose && <p className="text-[13px] text-slate-600">{card.purpose}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
          {([
            ["Quantity", card.qty != null ? `${formatNumber(card.qty)} ${card.uom ?? ""}` : "—"],
            ["Unit price", card.unit_price != null ? formatIDR(card.unit_price) : "—"],
            ["Total", formatIDR(card.item_total)],
            ["Vendor", card.vendor_name ?? "not decided"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="font-mono text-[10px] text-slate-400">
          {card.line_no_full} · {card.requested_by_name}
          {card.project_code && ` · ${card.project_code}`}
        </p>
      </div>

      <div className="space-y-3 border-t border-slate-100 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {card.qty != null && (
            <div>
              <label htmlFor={`q-${card.id}`} className="block text-xs text-slate-500">
                Approve how many
              </label>
              <NumberInput
                id={`q-${card.id}`}
                size="sm"
                value={qty}
                min={0}
                max={card.qty ?? undefined}
                onChange={(v) => {
                  setQty(v);
                  if (card.unit_price != null) setAmount(Math.round(v * card.unit_price));
                }}
                className="mt-1"
              />
            </div>
          )}
          <div>
            <label htmlFor={`a-${card.id}`} className="block text-xs text-slate-500">For how much</label>
            <MoneyInput id={`a-${card.id}`} size="sm" value={amount} ceiling={card.item_total} onChange={setAmount} className="mt-1" />
          </div>
          <div>
            <label htmlFor={`i-${card.id}`} className="block text-xs text-slate-500">Instructions (optional)</label>
            <input
              id={`i-${card.id}`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Negotiate first"
              className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[13px] focus:border-brand-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!mine && (
            <p className="mr-auto text-[12px] text-amber-700">
              This card belongs to {card.sent_to_email}.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={X}
            disabled={busy}
            onClick={() => onAnswer(false, null, amount, instructions || null)}
          >
            Not yet
          </Button>
          <Button
            size="sm"
            icon={Check}
            disabled={busy}
            onClick={() => onAnswer(true, card.qty != null ? qty : null, amount, instructions || null)}
          >
            {busy ? "Sending…" : `Approve ${formatIDR(amount)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
