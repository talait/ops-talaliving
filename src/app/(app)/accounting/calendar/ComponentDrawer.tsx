"use client";

import { useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/primitives";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { useLoad } from "@/components/ui/loaded";
import { formatIDR } from "@/lib/format";
import { accounting } from "@/demo/api";
import type { CashComponent, Direction, TransactionTypeCode } from "@/services/accounting/contracts";
import { useToast } from "@/store/toast";

/** One line on the calendar: what it is, how much, and the day it is due.
 *
 *  The category is not decoration — it is how the plan finds what actually
 *  happened, so a line with no category can only ever be a projection. Two
 *  lines may not claim the same category (D110); the refusal names the one
 *  that already has it.
 */
export function ComponentDrawer({
  component, onClose, onSaved,
}: {
  component: CashComponent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [types] = useLoad(() => accounting.listTypeRows(), []);
  const [accounts] = useLoad(() => accounting.listAccountRows(), []);
  const [name, setName] = useState(component?.name ?? "");
  const [direction, setDirection] = useState<Direction>(component?.direction ?? "OUT");
  const [amount, setAmount] = useState(component?.amount ?? 0);
  const [dueDay, setDueDay] = useState(component?.due_day ?? 25);
  const [typeCode, setTypeCode] = useState<string>(component?.type_code ?? "");
  const [accountId, setAccountId] = useState<string>(component?.account_id ?? "");
  const [note, setNote] = useState(component?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = component
      ? await accounting.updateComponent(component.id, {
        name, amount, due_day: dueDay, note: note || null,
      })
      : await accounting.addComponent({
        name, direction, amount, due_day: dueDay,
        type_code: (typeCode || null) as TransactionTypeCode | null,
        account_id: accountId || null,
        note: note || null,
      });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not saved", res.error.message);
      return;
    }
    toast("success", component ? "Updated" : "Added to the calendar",
      `${name} · ${formatIDR(amount)} on day ${dueDay} of each month`);
    onSaved();
  }

  async function stop() {
    if (!component) return;
    setBusy(true);
    const res = await accounting.updateComponent(component.id, { active: false });
    setBusy(false);
    if (res.error) { toast("warning", "Not changed", res.error.message); return; }
    toast("success", "Off the calendar", `${component.name} will not be planned for from now on.`);
    onSaved();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-lg"
      title={component ? component.name : "New calendar line"}
      subtitle={component ? "Change the estimate, the day, or take it off the calendar." : "Something that repeats every month."}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {component && (
            <Button variant="ghost" size="sm" onClick={stop} disabled={busy}>
              Take it off the calendar
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button icon={Save} onClick={save} disabled={busy || !name.trim() || amount <= 0}>
              {busy ? "Saving…" : component ? "Save" : "Add it"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="cc-name" className="block text-xs text-slate-500">What it is</label>
          <input
            id="cc-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Workshop electricity"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>

        {!component && (
          <div>
            <span className="block text-xs text-slate-500">Which way the money goes</span>
            <div className="mt-1 flex gap-2">
              {(["OUT", "IN"] as Direction[]).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={direction === d ? "primary" : "outline"}
                  onClick={() => setDirection(d)}
                >
                  {d === "OUT" ? "We pay it" : "Money comes in"}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cc-amount" className="block text-xs text-slate-500">Estimate, every month</label>
            <MoneyInput id="cc-amount" value={amount} onChange={setAmount} className="mt-1" />
            <p className="mt-1 text-[11px] text-slate-500">
              Roughly is fine. Actual is shown beside it, so next month&apos;s estimate is better.
            </p>
          </div>
          <div>
            <label htmlFor="cc-day" className="block text-xs text-slate-500">Day of the month it is due</label>
            <NumberInput id="cc-day" value={dueDay} min={1} max={31} onChange={setDueDay} className="mt-1" />
            <p className="mt-1 text-[11px] text-slate-500">
              31 in a 30-day month becomes the 30th — a reminder needs a date that exists.
            </p>
          </div>
        </div>

        {!component && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cc-type" className="block text-xs text-slate-500">Category in the ledger</label>
              <select
                id="cc-type" value={typeCode} onChange={(e) => setTypeCode(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                <option value="">none — projection only</option>
                {types.status === "ready" && types.data.map((t) => (
                  <option key={t.code} value={t.code}>{t.code}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                How the plan finds what actually happened. Without one, this line
                can never be compared to the ledger.
              </p>
            </div>
            <div>
              <label htmlFor="cc-account" className="block text-xs text-slate-500">Usually paid from</label>
              <select
                id="cc-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                <option value="">not fixed</option>
                {accounts.status === "ready" && accounts.data.map((a) => (
                  <option key={a.id} value={a.id}>{a.code}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="cc-note" className="block text-xs text-slate-500">Note (optional)</label>
          <input
            id="cc-note" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. four weekly runs; the date is the last one"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>

        {component && (
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            Changing the estimate changes every month ahead. A single month that
            differs — a bigger December payroll, a month a bill does not arrive —
            is an exception with a reason, not a new estimate.
          </p>
        )}
      </div>
    </Drawer>
  );
}
