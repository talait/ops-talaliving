"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paperclip, FileText, Upload, Ban, CheckCircle2, Link2, ArrowUpRight, History,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";
import { StatusPill } from "@/components/ui/status-pill";
import { MoneyInput } from "@/components/ui/money-input";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accounting, documents } from "@/demo/api";
import type { TransactionDetail } from "@/services/accounting/contracts";
import type { AuditRow } from "@/demo/state";
import { DOC_KINDS, type DocKind, type AttachmentView } from "@/services/documents/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";

/** One ledger row, and everything that hangs off it.
 *
 *  Three things live here that the old system kept in three different places:
 *  what the money was for (its lines), what it settled (its allocations, each
 *  naming a request line), and what proves it (documents attached **from
 *  here**, ADR-010 — the row is known because you navigated from it, so the
 *  form asks only what kind of document this is).
 *
 *  Correcting is VOID, never delete (A5): the row stays, the amount goes to
 *  zero, and the reason is mandatory. A deleted row cannot be asked about.
 */
export function TrxDrawer({
  trxNo, onClose, onChanged,
}: {
  trxNo: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { hasAuthority } = useSession();
  const { toast } = useToast();
  const [trx, setTrx] = useState<TransactionDetail | null>(null);
  const [evidence, setEvidence] = useState<AttachmentView[]>([]);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [kind, setKind] = useState<DocKind>("Receipt / Invoice / Nota");
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [allocLine, setAllocLine] = useState("");
  const [allocAmount, setAllocAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mayPost = hasAuthority("post_ledger");

  useEffect(() => {
    setVoidOpen(false);
    setReason("");
    if (!trxNo) { setTrx(null); setEvidence([]); return; }
    void load(trxNo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trxNo]);

  async function load(no: string) {
    const [detail, docs, trail] = await Promise.all([
      accounting.getTransaction(no),
      documents.byEntity("transaction", no),
      accounting.historyFor(no),
    ]);
    if (trail.data) setHistory(trail.data);
    if (detail.data) {
      setTrx(detail.data);
      setAllocAmount(detail.data.unallocated);
    }
    if (docs.data) setEvidence(docs.data);
  }

  if (!trxNo || !trx) return null;

  async function attach(file: File) {
    const up = await documents.upload({
      filename: file.name, mime: file.type || "application/octet-stream", bytes: file.size,
    });
    if (up.error) { toast("critical", "Upload failed", up.error.message); return; }
    const link = await documents.link({
      attachment_id: up.data.id, entity: "transaction", entity_no: trx!.trx_no, kind,
    });
    if (link.error) { toast("warning", "Not attached", link.error.message); return; }
    if (up.data.duplicate_suspect) {
      /* Advisory, never a block: the same receipt really can be photographed
         twice, and refusing the second one hides the first (A6). */
      toast("warning", "Attached — identical bytes seen before", "Worth a look in case this is a duplicate.");
    } else {
      toast("success", "Attached", `${file.name} → ${kind}`);
    }
    await load(trx!.trx_no);
    onChanged();
  }

  async function allocate() {
    setBusy(true);
    const res = await accounting.allocate({
      trx_no: trx!.trx_no, pr_line_no: allocLine.trim(), amount: allocAmount,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not allocated", res.error.message);
      return;
    }
    toast("success", "Allocated", `${formatIDR(allocAmount)} → ${allocLine.trim()}`);
    setAllocLine("");
    await load(trx!.trx_no);
    onChanged();
  }

  async function voidIt() {
    setBusy(true);
    const res = await accounting.voidTransaction(trx!.trx_no, reason);
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not voided", res.error.message);
      return;
    }
    toast("success", `${trx!.trx_no} voided`, "The row stays, the amount is zero, the reason is on it.");
    setVoidOpen(false);
    await load(trx!.trx_no);
    onChanged();
  }

  async function complete() {
    setBusy(true);
    const res = await accounting.markComplete(trx!.trx_no);
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not changed", res.error.message);
      return;
    }
    toast("success", `${trx!.trx_no} completed`, "Everything about it is finished.");
    await load(trx!.trx_no);
    onChanged();
  }

  return (
    <Drawer
      open={!!trxNo}
      onClose={onClose}
      title={trx.description}
      subtitle={`${trx.trx_no} · ${trx.trx_date} · ${trx.account_code}`}
      width="max-w-xl"
      footer={mayPost && trx.status !== "VOID" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Voiding is for a row that should never have existed, and it is one
              click away from a row somebody was only reading. So it sits
              behind a deliberate step rather than beside the ordinary action
              (D89) — the button is there, it just cannot be hit by accident. */}
          <button
            onClick={() => setVoidOpen((v) => !v)}
            className="mr-auto text-[12px] text-slate-400 underline decoration-dotted underline-offset-4 hover:text-rose-700"
          >
            Something wrong with this row?
          </button>
          {trx.status !== "COMPLETED" && (
            <Button variant="outline" size="sm" icon={CheckCircle2} disabled={busy} onClick={complete}>
              Mark completed
            </Button>
          )}
        </div>
      ) : null}
    >
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind="trx" status={trx.status} />
          <Badge tone={trx.direction === "IN" ? "green" : "slate"}>{trx.direction}</Badge>
          <Badge tone="slate">{trx.type_code}</Badge>
          {trx.has_payment_proof && <Badge tone="violet">payment proof</Badge>}
          {/* Not a budget figure: the money is gone. This says only that a
              purchase names no request, which is the row worth asking about
              (D88). */}
          {trx.unallocated > 0 && trx.status !== "VOID" && trx.expects_allocation && (
            <Badge tone="amber">no request behind it</Badge>
          )}
        </div>

        {trx.void_reason && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">
            {trx.void_reason}
          </p>
        )}

        {voidOpen && (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-rose-900">
              <Ban className="h-4 w-4" /> Void this entry
            </p>
            <p className="text-[12px] text-rose-800">
              Only for a row that should never have existed — a double entry, a
              wrong account. If the amount was simply wrong, void it and post the
              right one, so both statements survive.
            </p>
            <label htmlFor="void-reason" className="block text-xs text-rose-900">
              Why is this being voided? Required — a row with no reason cannot be asked about later.
            </label>
            <input
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. entered twice, the first one is trx-26-08-29_002"
              className="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setVoidOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="danger" size="sm" disabled={busy || !reason.trim()} onClick={voidIt}>
                Void this row
              </Button>
            </div>
            <p className="text-[11px] text-rose-800">
              The row stays and the amount goes to zero. Nothing is deleted — a
              correction is a new statement beside the old one, never an erasure.
            </p>
          </div>
        )}

        <dl className="space-y-2.5">
          {([
            ["Amount", formatIDR(trx.amount_idr)],
            ["Type", trx.type_code],
            ["Vendor", trx.vendor_name ?? "—"],
            ["Posted", `${trx.posted_at.slice(0, 10)}`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>

        {trx.lines.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What it bought</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {trx.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 text-slate-700">{l.description}</span>
                  <span className="text-[11px] text-slate-400">
                    {l.qty ?? "—"} {l.uom ?? ""} × {formatIDR(l.unit_price ?? 0)}
                  </span>
                  <span className="tabular-nums text-slate-800">{formatIDR(l.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What this money settled. Every allocation names a request line, so
            the path from a bank row back to who asked for it is one hop. */}
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Link2 className="h-3.5 w-3.5" /> What it paid for
          </p>
          {trx.status === "VOID" && trx.allocations.length > 0 && (
            <p className="mb-2 text-[12px] text-rose-700">
              These no longer count towards anything: the transaction is void, so
              every line it funded is owed again. The rows stay so the history
              still reads.
            </p>
          )}
          {trx.allocations.length > 0 ? (
            <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {trx.allocations.map((a) => (
                <li key={a.id} className={cn("px-3 py-2 text-[13px]", a.superseded_by && "opacity-50")}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-slate-700">{a.line_description ?? a.pr_line_no ?? a.po_no}</span>
                      <span className="block font-mono text-[10px] text-slate-400">
                        {a.pr_line_no ?? a.po_no} · {a.method}
                        {a.superseded_by && " · superseded"}
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-800">{formatIDR(a.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-[13px] text-slate-500">
              No request behind this one yet. Money that left with nothing asking
              for it is exactly the row worth a question, so it is shown rather
              than left to a report nobody runs.
            </p>
          )}

          {mayPost && trx.status !== "VOID" && trx.unallocated > 0 && trx.expects_allocation && (
            <div className="space-y-2 rounded-lg border border-dashed border-slate-300 px-3 py-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="alloc-line" className="block text-xs text-slate-500">Request line</label>
                  <input
                    id="alloc-line"
                    value={allocLine}
                    onChange={(e) => setAllocLine(e.target.value)}
                    placeholder="pr-26-09-04_01-L01"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 font-mono text-[13px] focus:border-brand-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="alloc-amount" className="block text-xs text-slate-500">Amount</label>
                  <MoneyInput id="alloc-amount" value={allocAmount} onChange={setAllocAmount} className="mt-1" />
                </div>
              </div>
              <Button size="sm" className="w-full" disabled={busy || !allocLine.trim() || allocAmount <= 0} onClick={allocate}>
                Point this money at that line
              </Button>
              <p className="text-[11px] text-slate-500">
                The line is checked against procurement before anything is written,
                and what is pointed at a line can never exceed what actually left
                the account.
              </p>
            </div>
          )}
        </section>

        {/* Evidence, attached from the row itself (ADR-010). */}
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Paperclip className="h-3.5 w-3.5" /> Documents
          </p>
          {evidence.length > 0 ? (
            <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {evidence.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-700">{a.filename}</span>
                    <span className="block text-[11px] text-slate-400">
                      {[...new Set(a.links.map((l) => l.kind))].join(", ")} · {(a.bytes / 1024).toFixed(0)} KB
                    </span>
                  </span>
                  {a.covers_count > 1 && <Badge tone="slate">covers {a.covers_count}</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-[13px] text-slate-500">Nothing attached yet.</p>
          )}

          {mayPost && trx.status !== "VOID" && (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3">
              <label htmlFor="trx-kind" className="block text-xs text-slate-500">Document type</label>
              <select
                id="trx-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as DocKind)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input
                ref={fileRef} id="trx-file" type="file" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void attach(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" icon={Upload} className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
                Attach a file
              </Button>
              <p className="mt-2 text-[11px] text-slate-500">
                Attached here, to this row — the system already knows the date, the
                account and the amount, so it only asks what kind of document this is.
              </p>
            </div>
          )}
        </section>

        {/* What has happened to this row. Fraud and anomaly questions are
            never "who touched the ledger this month" — they are "what happened
            to THIS row", asked while looking at it (D84). */}
        <section>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <History className="h-3.5 w-3.5" /> History
          </p>
          {history.length === 0 ? (
            <p className="text-[13px] text-slate-500">Nothing recorded — this row predates the trail.</p>
          ) : (
            <ol className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px]">
                  <p className="text-slate-700">
                    <span className="font-medium">{h.action}</span>
                    {h.outcome !== "ok" && <span className="ml-1 text-rose-700">· {h.outcome}</span>}
                    <span className="text-slate-400"> · {h.actor_email} · {new Date(h.at).toLocaleString()}</span>
                  </p>
                  {h.reason && <p className="mt-0.5 text-slate-600">{h.reason}</p>}
                  {h.detail && (
                    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      {Object.entries(h.detail).map(([k, v]) => (
                        <li key={k}>
                          <span className="text-slate-400">{k}:</span>{" "}
                          {typeof v === "number" ? v.toLocaleString() : String(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {trx.pr_line_nos.length > 0 && (
          <p className="flex items-start gap-2 text-[12px] text-slate-500">
            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Reaches{" "}
              <span className="font-mono text-slate-600">{trx.pr_line_nos.join(", ")}</span>{" "}
              on the requests board — same money, read from the other end.
            </span>
          </p>
        )}
      </div>
    </Drawer>
  );
}
