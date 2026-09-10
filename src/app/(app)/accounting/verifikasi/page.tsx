"use client";

import { useEffect, useState } from "react";
import {
  Inbox, FileText, Receipt, Undo2, Link2, StickyNote, XCircle, AlertTriangle, Check,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accounting, documents, procurement } from "@/demo/api";
import type { EvidenceInboxRow, TransactionTypeCode, Direction } from "@/services/accounting/contracts";
import { TRANSACTION_TYPE_CODES } from "@/services/accounting/contracts";
import { UNITS, type UomCode } from "@/services/procurement/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";

/** The narrow road: documents whose parent is genuinely unknown.
 *
 *  Everything else in this system is attached **from** the record it belongs
 *  to (ADR-010). This queue exists for the case that road cannot serve:
 *  somebody bought first, photographed the nota in a chat thread, and there
 *  is nothing yet for the file to be attached to.
 *
 *  Five ways out, and **none of them throws anything away** (A16):
 *
 *    Make a transaction   it becomes a ledger row, with this file as its proof
 *    Retro request line   the request nobody raised, written after the fact,
 *                         then paid — so the board can show it as what it is
 *    Link                 the money is already booked; this is its missing proof
 *    Note                 not a company transaction. Kept, never posted
 *    Reject               not ours, or unreadable. Kept with a reason
 *
 *  The last two are the opposite of a ledger row, and worth saying plainly:
 *  rejecting is how you record that **no money of ours moved here** (D94). The
 *  file stays either way, because the question "what did we decide about that
 *  photo" arrives months later.
 *
 *  If this queue grows, people are routing around the main road — which is why
 *  the weekly arrival count sits at the top rather than in a report.
 */
type Road = "transaction" | "retro_pr_line" | "link" | "note" | "reject";

const ROADS: { key: Road; label: string; icon: typeof Receipt; hint: string }[] = [
  { key: "transaction", label: "Make a transaction", icon: Receipt, hint: "money left, nobody raised a request" },
  { key: "retro_pr_line", label: "Retro request line", icon: Undo2, hint: "write the request that should have existed" },
  { key: "link", label: "Link to a row", icon: Link2, hint: "already booked — this is its proof" },
  { key: "note", label: "Note", icon: StickyNote, hint: "not a transaction" },
  { key: "reject", label: "Reject", icon: XCircle, hint: "not ours" },
];

export default function InboxPage() {
  const { hasAuthority } = useSession();
  const { toast } = useToast();
  const [rows, reload] = useLoad(() => accounting.listInbox(), []);
  const [everything, reloadAll] = useLoad(() => accounting.listInboxAll(), []);
  const [health, reloadHealth] = useLoad(() => accounting.getInboxHealth(), []);
  const [attachments] = useLoad(() => documents.listAttachments(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const mayResolve = hasAuthority("resolve_inbox");

  function refresh() {
    reload();
    reloadHealth();
    reloadAll();
    setSelected(null);
  }

  return (
    <div>
      <PageHeader
        breadcrumb="Accounting"
        title="Purchase verification"
        description="Documents that arrived with nothing to attach them to — somebody bought first and photographed the nota. Everything here leaves by one of five roads, and none of them throws the file away."
      />

      {health.status === "ready" && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
          <p className="text-[13px] text-slate-600">
            <span className="text-xl font-bold tabular-nums text-slate-800">{health.data.arrived}</span>{" "}
            arrived this way since {health.data.week_start}
          </p>
          <p className="text-[13px] text-slate-600">
            <span className="text-xl font-bold tabular-nums text-slate-800">{health.data.unresolved}</span>{" "}
            still waiting
          </p>
          <p className="text-[12px] text-slate-500">
            {health.data.by_origin.chat} from chat · {health.data.by_origin.web} from the app
          </p>
          {/* The number is here rather than in a report because it is a
              measure of the main road, not of this screen: a queue that grows
              means people are going around the front door. */}
          <p className="ml-auto max-w-md text-[12px] text-slate-500">
            This queue should stay small. Every row in it is a purchase that
            happened before anybody asked.
          </p>
        </div>
      )}

      <Loaded state={rows} onRetry={reload}>
        {(all) => all.length === 0 ? (
          <Card>
            <div className="p-5">
              <EmptyState
                icon={Check}
                title="Nothing waiting"
                description="Every document that arrived without a parent has been resolved. The main road is doing its job."
              />
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="h-fit">
              <CardHeader
                title={`${all.length} waiting`}
                subtitle="Oldest first — a queue is not a filing cabinet."
                icon={Inbox}
                action={<SourceBadge state={rows} />}
              />
              <ul className="divide-y divide-slate-100">
                {all.map((r) => {
                  const on = selected === r.ref_id;
                  const file = attachments.status === "ready"
                    ? attachments.data.find((a) => a.id === r.attachment_id)
                    : undefined;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelected(on ? null : r.ref_id)}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors hover:bg-slate-50",
                          on && "bg-brand-50",
                        )}
                      >
                        <p className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="min-w-0 truncate">{file?.filename ?? r.attachment_id}</span>
                        </p>
                        <p className="mt-0.5 text-[12px] text-slate-600">
                          {r.extracted.vendor_name ?? "vendor not read"} ·{" "}
                          {r.extracted.amount_idr != null ? formatIDR(r.extracted.amount_idr) : "amount not read"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {r.reported_at.slice(0, 10)} · {r.origin}
                          {r.extracted.confidence != null && ` · read ${r.extracted.confidence}% sure`}
                        </p>
                        {r.similar_trx_nos.length > 0 && (
                          <p className="mt-1 text-[11px] text-amber-700">
                            looks like {r.similar_trx_nos.join(", ")}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {selected
              ? (
                <ResolvePanel
                  row={all.find((r) => r.ref_id === selected)!}
                  filename={attachments.status === "ready"
                    ? attachments.data.find((a) => a.id === all.find((r) => r.ref_id === selected)!.attachment_id)?.filename ?? ""
                    : ""}
                  mayResolve={mayResolve}
                  onDone={refresh}
                  toast={toast}
                />
              )
              : (
                <Card>
                  <div className="p-5">
                    <EmptyState
                      icon={Inbox}
                      title="Pick one"
                      description="The document on the left, what to do with it on the right."
                    />
                  </div>
                </Card>
              )}
          </div>
        )}
      </Loaded>

      {/* Resolved rows stay readable, including the two roads that never
          touched the ledger. "What did we decide about that photo" is asked
          months later, and a queue that empties into nothing cannot answer it
          (A16). */}
      <Loaded state={everything} onRetry={reloadAll}>
        {(all) => {
          const done = all.filter((r) => r.status !== "PENDING");
          if (done.length === 0) return <></>;
          return (
            <Card className="mt-4">
              <CardHeader
                title="Already decided"
                subtitle="Kept, whichever road they took — including the ones that never reached the ledger."
                icon={StickyNote}
              />
              <ul className="divide-y divide-slate-100">
                {done.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]">
                    <Badge tone={
                      r.status === "CONFIRMED" ? "green"
                        : r.status === "ATTACHED" ? "violet"
                          : r.status === "REJECTED" ? "red" : "slate"
                    }>
                      {r.status}
                    </Badge>
                    <span className="min-w-0 flex-1 text-slate-700">
                      {r.extracted.note ?? r.extracted.vendor_name ?? r.attachment_id}
                    </span>
                    {r.extracted.amount_idr != null && (
                      <span className="tabular-nums text-slate-500">{formatIDR(r.extracted.amount_idr)}</span>
                    )}
                    <span className="font-mono text-[11px] text-slate-400">
                      {r.produced_pr_line_no ?? (r.produced_trx_id ? "posted" : "no ledger row")}
                    </span>
                    <span className="text-[11px] text-slate-400">{r.reported_at.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        }}
      </Loaded>
    </div>
  );
}

function ResolvePanel({
  row, filename, mayResolve, onDone, toast,
}: {
  row: EvidenceInboxRow;
  filename: string;
  mayResolve: boolean;
  onDone: () => void;
  toast: (tone: "success" | "warning" | "critical" | "info", title: string, body?: string) => void;
}) {
  const [accounts] = useLoad(() => accounting.listAccounts(), []);
  const [vendors] = useLoad(() => procurement.listVendors({}), []);
  const [recent] = useLoad(() => accounting.listTransactions({ limit: 40 }), []);

  /* `Others` never reaches the ledger: it branches to notes before anything
     else is looked at (owner, 2026-08-27). */
  const isOthers = row.extracted.doc_type === "Others";
  const [road, setRoad] = useState<Road>(isOthers ? "note" : "transaction");
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(row.extracted.document_date ?? new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<Direction>(row.money_direction ?? "OUT");
  const [typeCode, setTypeCode] = useState<TransactionTypeCode>("SUPPLIERS");
  const [vendorId, setVendorId] = useState("");
  const [description, setDescription] = useState(row.extracted.note ?? "");
  const [amount, setAmount] = useState(row.extracted.amount_idr ?? 0);
  const [qty, setQty] = useState(1);
  const [uom, setUom] = useState<UomCode>("pcs");
  const [purpose, setPurpose] = useState("");
  const [trxNo, setTrxNo] = useState("");
  const [reason, setReason] = useState("");

  const accountRows = accounts.status === "ready" ? accounts.data : [];

  /* The reading proposed a vendor; the form offers it rather than making
     somebody retype a name that is already on the screen. Still a proposal:
     it is selected, not committed, and the posting is the person agreeing
     (A13). Only an exact match — a near-miss silently picking the wrong
     supplier would be worse than an empty field. */
  useEffect(() => {
    if (vendorId || vendors.status !== "ready" || !row.extracted.vendor_name) return;
    const guess = vendors.data.find(
      (v) => v.name.toLowerCase() === row.extracted.vendor_name!.toLowerCase(),
    );
    if (guess) setVendorId(guess.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors.status, row.ref_id]);
  const unitPrice = qty > 0 ? Math.round(amount / qty) : amount;

  async function run() {
    setBusy(true);
    try {
      if (road === "note" || road === "reject") {
        const res = await accounting.resolveInbox({ ref_id: row.ref_id, resolution: road, reason });
        if (res.error) { toast("warning", "Not recorded", res.error.message); return; }
        toast("success", road === "note" ? "Kept as a note" : "Rejected, and kept", "No money was recorded either way.");
        onDone();
        return;
      }

      if (road === "link") {
        const link = await documents.link({
          attachment_id: row.attachment_id, entity: "transaction", entity_no: trxNo,
          kind: "Receipt / Invoice / Nota",
        });
        if (link.error && link.error.status !== 409) {
          toast("warning", "Not linked", link.error.message);
          return;
        }
        const res = await accounting.resolveInbox({ ref_id: row.ref_id, resolution: "link", trx_no: trxNo });
        if (res.error) { toast("warning", "Not recorded", res.error.message); return; }
        toast("success", "Linked", `${filename} now proves ${trxNo}.`);
        onDone();
        return;
      }

      /* Both remaining roads write a ledger row, and the document travels with
         it as its evidence — the rule that applies to every other posting
         (D85) applies here too. */
      let lineNo: string | undefined;
      if (road === "retro_pr_line") {
        const line = await procurement.quickAddLine({
          description: description.trim() || filename,
          qty, uom, unit_price: unitPrice,
          vendor_id: vendorId || null,
          purpose: purpose.trim() || "Bought before anybody asked — written after the fact",
        });
        if (line.error) { toast("warning", "Not created", line.error.message); return; }
        lineNo = line.data.line_no_full;
      }

      const posted = await accounting.postTransaction({
        trx_date: date, account_id: accountId, direction, amount_idr: amount,
        type_code: typeCode, vendor_id: vendorId || null,
        description: description.trim() || filename,
        source_ref: `inbox:${row.ref_id}`,
        lines: [{
          description: description.trim() || filename,
          qty, uom, unit_price: unitPrice, amount,
        }],
        documents: [{ attachment_id: row.attachment_id, kind: "Receipt / Invoice / Nota" }],
      });
      if (posted.error) { toast("warning", "Not posted", posted.error.message); return; }

      if (lineNo) {
        /* Allocating is what makes the board show it for what it is: paid,
           and never approved. */
        const alloc = await accounting.allocate({
          trx_no: posted.data.trx_no, pr_line_no: lineNo, amount, method: "cash",
        });
        if (alloc.error) toast("warning", "Posted, not allocated", alloc.error.message);
      }

      const res = await accounting.resolveInbox({
        ref_id: row.ref_id, resolution: road,
        trx_no: posted.data.trx_no, pr_line_no: lineNo,
      });
      if (res.error) { toast("warning", "Posted, inbox unchanged", res.error.message); return; }
      toast(
        "success",
        `Posted ${posted.data.trx_no}`,
        lineNo ? `${formatIDR(amount)} · request line ${lineNo} written after the fact` : formatIDR(amount),
      );
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const canRun = mayResolve && (
    road === "note" || road === "reject" ? reason.trim().length > 0
      : road === "link" ? !!trxNo
        : !!accountId && amount > 0
  );

  return (
    <Card>
      <CardHeader
        title={filename}
        subtitle={`${row.origin} · ${row.reported_at.slice(0, 16).replace("T", " ")} · read ${row.extracted.confidence ?? "—"}% sure`}
        icon={FileText}
        action={<Badge tone={row.money_direction === "IN" ? "green" : "slate"}>{row.money_direction ?? "OUT"}</Badge>}
      />

      <div className="space-y-4 px-5 py-4 text-sm">
        {/* What the reading proposed. A proposal, never a posting (A13). */}
        <dl className="grid gap-x-6 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 sm:grid-cols-4">
          {([
            ["Vendor", row.extracted.vendor_name ?? "not read"],
            ["Date", row.extracted.document_date ?? "not read"],
            ["Amount", row.extracted.amount_idr != null ? formatIDR(row.extracted.amount_idr) : "not read"],
            ["Type", row.extracted.doc_type ?? "not read"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="text-[13px] text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>
        {row.extracted.note && (
          <p className="text-[13px] text-slate-600">{row.extracted.note}</p>
        )}

        {row.similar_trx_nos.length > 0 && (
          /* Advisory, and it points at the road it suggests rather than
             refusing anything (A6). */
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This looks like <span className="font-mono">{row.similar_trx_nos.join(", ")}</span>,
              already in the ledger. If it is the same money, the road is{" "}
              <button className="font-medium underline" onClick={() => { setRoad("link"); setTrxNo(row.similar_trx_nos[0]); }}>
                link to a row
              </button>{" "}
              — posting it again would invent money.
            </span>
          </p>
        )}

        {isOthers && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
            Read as <strong>Others</strong>, so it starts on the notes road: nothing
            that is not a company transaction should touch the ledger, even for a
            moment.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {ROADS.map((r) => {
            const Icon = r.icon;
            const on = road === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRoad(r.key)}
                title={r.hint}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                  on ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {r.label}
              </button>
            );
          })}
        </div>

        {(road === "transaction" || road === "retro_pr_line") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rv-date" className="block text-xs text-slate-500">Date the money moved</label>
              <input id="rv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="rv-account" className="block text-xs text-slate-500">Account</label>
              <select id="rv-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                <option value="">Choose…</option>
                {accountRows.map((a) => <option key={a.account_id} value={a.account_id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rv-dir" className="block text-xs text-slate-500">In or out</label>
              <select id="rv-dir" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                <option value="OUT">OUT — money left</option>
                <option value="IN">IN — money arrived</option>
              </select>
            </div>
            <div>
              <label htmlFor="rv-type" className="block text-xs text-slate-500">Type</label>
              <select id="rv-type" value={typeCode} onChange={(e) => setTypeCode(e.target.value as TransactionTypeCode)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                {TRANSACTION_TYPE_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="rv-desc" className="block text-xs text-slate-500">What was bought</label>
              <input id="rv-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. PAKU 5CM, 4 kg"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="rv-vendor" className="block text-xs text-slate-500">Vendor</label>
              <select id="rv-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}
                aria-describedby="rv-vendor-hint"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                <option value="">Not a vendor purchase</option>
                {vendors.status === "ready" && vendors.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {row.extracted.vendor_name && (
                <p id="rv-vendor-hint" className="mt-1 text-[11px] text-slate-500">
                  Read as <span className="text-slate-700">{row.extracted.vendor_name}</span>
                  {!vendorId && " — not a vendor we have on record; pick one or add it first"}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="rv-qty" className="block text-xs text-slate-500">Qty</label>
                <NumberInput id="rv-qty" value={qty} min={0} onChange={setQty} className="mt-1" />
              </div>
              <div>
                <label htmlFor="rv-uom" className="block text-xs text-slate-500">Unit</label>
                <select id="rv-uom" value={uom} onChange={(e) => setUom(e.target.value as UomCode)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="rv-amount" className="block text-xs text-slate-500">
                Amount <span className="text-slate-400">— the reading proposed {row.extracted.amount_idr != null ? formatIDR(row.extracted.amount_idr) : "nothing"}</span>
              </label>
              <MoneyInput id="rv-amount" value={amount} onChange={setAmount} className="mt-1" />
              <p className="mt-1 text-[11px] text-slate-500">
                {qty > 0 && `${qty} ${uom} × ${formatIDR(unitPrice)} — `}
                posting is you agreeing with the number, not the extraction being believed.
              </p>
            </div>
            {road === "retro_pr_line" && (
              <div className="sm:col-span-2">
                <label htmlFor="rv-purpose" className="block text-xs text-slate-500">What it was for</label>
                <input id="rv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Bench repair, workshop"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
                <p className="mt-1 text-[11px] text-slate-500">
                  The line is written unapproved on purpose: it will show on the board
                  as <em>paid, not approved</em>, which is what happened.
                </p>
              </div>
            )}
          </div>
        )}

        {road === "link" && (
          <div>
            <label htmlFor="rv-trx" className="block text-xs text-slate-500">Which ledger row is this the proof of?</label>
            <select id="rv-trx" value={trxNo} onChange={(e) => setTrxNo(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
              <option value="">Choose…</option>
              {recent.status === "ready" && recent.data.map((t) => (
                <option key={t.trx_no} value={t.trx_no}>
                  {t.trx_date} · {t.trx_no} · {formatIDR(t.amount_idr)} · {t.description.slice(0, 40)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              No new money: the row already exists and was missing its document.
            </p>
          </div>
        )}

        {(road === "note" || road === "reject") && (
          <div>
            <label htmlFor="rv-reason" className="block text-xs text-slate-500">
              {road === "note" ? "What is this?" : "Why is this not ours?"}
            </label>
            <input id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={road === "note" ? "e.g. personal document, sent to the wrong thread" : "e.g. supplier sent somebody else's invoice"}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            <p className="mt-1 text-[11px] text-slate-500">
              Nothing reaches the ledger by this road, and the file is kept either
              way — the question &quot;what did we decide about that photo&quot; arrives months
              later.
            </p>
          </div>
        )}

        {!mayResolve && (
          <p className="text-[12px] text-slate-500">
            Resolving belongs to whoever holds <span className="font-mono text-[11px]">resolve_inbox</span>.
            You can read the queue either way.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
        <Button size="sm" disabled={busy || !canRun} onClick={run}>
          {busy ? "Recording…" : ROADS.find((r) => r.key === road)!.label}
        </Button>
      </div>
    </Card>
  );
}
