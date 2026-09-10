"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Pencil, Save, Upload, FileText } from "lucide-react";
import { Badge, Button, Progress } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";
import { StatusPill } from "@/components/ui/status-pill";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { procurement, documents } from "@/demo/api";
import {
  MEETING_STATE_LABEL, UNITS, PR_CATEGORIES,
  type PrLineView, type UomCode, type PrCategory,
} from "@/services/procurement/contracts";
import { DOC_KINDS, type DocKind, type AttachmentView } from "@/services/documents/contracts";
import { useToast } from "@/store/toast";
import { useSession } from "@/store/session";
import { VariancePanel } from "./VariancePanel";
import { PayFromLine } from "./PayFromLine";

/** One item, everything about it.
 *
 *  Evidence is attached from HERE, standing on the line, rather than uploaded
 *  somewhere central and matched to a line afterwards (ADR-010). The parent is
 *  known because you navigated from it, so the form asks only what kind of
 *  document this is.
 */
export function LineDrawer({
  line, onClose, onChanged, onRemove,
}: {
  line: PrLineView | null;
  onClose: () => void;
  onChanged: (l: PrLineView) => void;
  onRemove: (l: PrLineView) => void;
}) {
  const { can } = useSession();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<PrLineView>>({});
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<DocKind>("Payment Proof");
  const [evidence, setEvidence] = useState<AttachmentView[]>([]);
  /* A payment proof just attached here, held so the ledger form can reuse the
     same file instead of asking for it a second time. */
  const [proof, setProof] = useState<{ id: string; filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mayEdit = can("procurement.update");

  const isDraft = line?.status === "DRAFT";

  useEffect(() => {
    setEditing(false);
    setProof(null);
    if (!line) { setEvidence([]); return; }
    void documents.byEntity("pr_line", line.line_no_full).then((r) => {
      if (r.data) setEvidence(r.data);
    });
  }, [line?.id, line?.evidence_count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!line) return null;

  function startEdit() {
    setDraft({
      description: line!.description, qty: line!.qty, uom: line!.uom,
      unit_price: line!.unit_price, category: line!.category,
      purpose: line!.purpose, need_by: line!.need_by,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const res = await procurement.updateDraftLine(line!.line_no_full, {
      description: draft.description ?? "",
      qty: draft.qty ?? null,
      uom: draft.uom ?? null,
      unit_price: draft.unit_price ?? null,
      category: draft.category ?? null,
      purpose: (draft.purpose ?? "").toString().trim() || null,
      need_by: draft.need_by ?? null,
    });
    setSaving(false);
    if (res.error) { toast(res.error.status === 409 ? "warning" : "critical", "Not saved", res.error.message); return; }
    toast("success", "Line updated", line!.line_no_full);
    setEditing(false);
    onChanged(res.data);
  }

  async function attach(file: File) {
    const up = await documents.upload({ filename: file.name, mime: file.type || "application/octet-stream", bytes: file.size });
    if (up.error) { toast("critical", "Upload failed", up.error.message); return; }
    const link = await documents.link({
      attachment_id: up.data.id, entity: "pr_line", entity_no: line!.line_no_full, kind,
    });
    if (link.error) { toast("warning", "Not attached", link.error.message); return; }
    if (kind === "Payment Proof") setProof({ id: up.data.id, filename: file.name });
    if (up.data.duplicate_suspect) {
      /* Advisory, never a block: the same receipt really can be photographed
         twice, and refusing the second one hides the first (A6). */
      toast("warning", "Attached — identical bytes seen before", "Worth a look in case this is a duplicate.");
    } else {
      toast("success", "Attached", `${file.name} → ${kind}`);
    }
    const refreshed = await documents.byEntity("pr_line", line!.line_no_full);
    if (refreshed.data) setEvidence(refreshed.data);
    const relist = await procurement.listOpenLines();
    const updated = relist.data?.find((l) => l.id === line!.id);
    if (updated) onChanged(updated);
  }

  const cov = line.coverage;
  const pct = cov.approved > 0 ? (cov.covered / cov.approved) * 100 : 0;

  return (
    <Drawer
      open={!!line}
      onClose={onClose}
      title={line.description}
      subtitle={`${line.line_no_full} · ${line.requested_by_name}`}
      width="max-w-xl"
      footer={
        mayEdit ? (
          editing ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" icon={Save} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save line"}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {!line.removed_at && (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onRemove(line)}>
                  No longer needed
                </Button>
              )}
              {isDraft && (
                <Button variant="outline" size="sm" icon={Pencil} onClick={startEdit}>Edit line</Button>
              )}
            </div>
          )
        ) : null
      }
    >
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind="line" status={line.status} />
          <Badge tone={
            line.meeting_state === "settled" ? "green"
              : line.meeting_state === "paid_unapproved" ? "red"
                : line.meeting_state === "approved_unpaid" ? "brand" : "amber"
          }>
            {MEETING_STATE_LABEL[line.meeting_state]}
          </Badge>
          {line.has_payment_proof && <Badge tone="violet">payment proof on file</Badge>}
          {/* A line can be COMPLETED and still owe an answer. Without this the
              header would read "Approved and paid" over a Rp 225.000 overpayment. */}
          {line.variance.material && !line.variance.explanation && (
            <Badge tone="red">difference not explained</Badge>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="ed-desc" className="block text-xs text-slate-500">Item</label>
              <input id="ed-desc" value={draft.description ?? ""}
                     onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                     className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="ed-purpose" className="block text-xs text-slate-500">What is it for</label>
              <input id="ed-purpose" value={(draft.purpose ?? "") as string}
                     onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                     placeholder="e.g. Table tops, VILLA SEMINYAK"
                     className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="ed-qty" className="block text-xs text-slate-500">Qty</label>
                <NumberInput id="ed-qty" value={draft.qty ?? 0} onChange={(v) => setDraft({ ...draft, qty: v })} min={0} className="mt-1" />
              </div>
              <div>
                <label htmlFor="ed-uom" className="block text-xs text-slate-500">Unit</label>
                <select id="ed-uom" value={draft.uom ?? "pcs"}
                        onChange={(e) => setDraft({ ...draft, uom: e.target.value as UomCode })}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="ed-price" className="block text-xs text-slate-500">Unit price</label>
                <MoneyInput id="ed-price" value={draft.unit_price ?? 0} onChange={(v) => setDraft({ ...draft, unit_price: v })} className="mt-1" />
              </div>
            </div>
            <div>
              <label htmlFor="ed-cat" className="block text-xs text-slate-500">Category</label>
              <select id="ed-cat" value={draft.category ?? "OTHER"}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value as PrCategory })}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none">
                {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <>
            {line.purpose ? (
              <div className="rounded-lg bg-brand-50/60 px-3 py-2.5 text-[13px] text-brand-900">
                {line.purpose}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-[13px] text-slate-500">
                No note on what this is for. Approving a price without knowing the job
                is guesswork.
              </p>
            )}

            <dl className="space-y-2.5">
              {([
                ["Quantity", line.qty != null ? `${formatNumber(line.qty)} ${line.uom ?? ""}` : "—"],
                ["Unit price", line.unit_price != null ? formatIDR(line.unit_price) : "—"],
                ["Requested", formatIDR(line.item_total)],
                ["Approved", line.approval?.approved ? formatIDR(line.approval.approved_amount ?? line.item_total) : "not yet"],
                ["Vendor", line.vendor_name ?? "not decided"],
                ["Category", line.category ?? "—"],
                ["Needed by", line.need_by ?? "—"],
                ["From", `${line.doc_no}${line.submitted_at ? ` · ${line.submitted_at.slice(0, 10)}` : ""}`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {line.approval && (
              <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-[13px]">
                <p className="text-slate-700">
                  {line.approval.approved ? "Approved" : "Un-approved"} by{" "}
                  <span className="font-medium">{line.approval.recorded_by_email}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {new Date(line.approval.recorded_at).toLocaleString()} · via {line.approval.channel}
                </p>
              </div>
            )}

            {cov.covered > 0 && (
              <div>
                <Progress value={pct} tone={cov.settled ? "green" : "amber"} />
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatIDR(cov.covered)} of {formatIDR(cov.approved)} covered
                  {/* Owed and short are not the same thing: once somebody has
                      explained the gap, the rest was never spent. */}
                  {cov.remaining > 0 && (cov.settled
                    ? ` · closed ${formatIDR(cov.remaining)} short`
                    : ` · ${formatIDR(cov.remaining)} still owed`)}
                </p>
              </div>
            )}

            <VariancePanel line={line} onChanged={onChanged} />

            {line.trx_nos.length > 0 && (
              <p className="text-[12px] text-slate-500">
                Paid by{" "}
                <span className="font-mono text-slate-600">{line.trx_nos.join(", ")}</span>
                {" "}— the same money, read from the ledger rather than repeated here.
              </p>
            )}

            {/* Only on an approved line. Money moving before a yes is a real
                event and the ledger records it when it happens — but the
                application will not offer it as an ordinary button (D21). */}
            {line.approval?.approved && !cov.settled && !line.removed_at && (
              <PayFromLine
                line={line}
                proof={proof}
                onPosted={async () => {
                  setProof(null);
                  const relist = await procurement.listAllLines();
                  const updated = relist.data?.find((l) => l.id === line!.id);
                  if (updated) onChanged(updated);
                  const refreshed = await documents.byEntity("pr_line", line!.line_no_full);
                  if (refreshed.data) setEvidence(refreshed.data);
                }}
              />
            )}

            {/* Evidence, attached from the line itself. */}
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

              {mayEdit && (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3">
                  <label htmlFor="ev-kind" className="block text-xs text-slate-500">Document type</label>
                  <select
                    id="ev-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as DocKind)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-brand-400 focus:outline-none"
                  >
                    {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input
                    ref={fileRef}
                    id="ev-file"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void attach(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Upload}
                    className="mt-2 w-full"
                    onClick={() => fileRef.current?.click()}
                  >
                    Attach a file
                  </Button>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Attached here, to this item — the system already knows which line,
                    which vendor and which amount, so it only asks what kind of
                    document this is.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
