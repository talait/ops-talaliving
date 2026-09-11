"use client";

import { useState } from "react";
import { Landmark, AlertTriangle, Upload, Link2, Plus, EyeOff, Coins } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { Paged } from "@/components/ui/pager";
import { MoneyInput } from "@/components/ui/money-input";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accounting } from "@/demo/api";
import type { BankStatementView, StatementLineView } from "@/services/accounting/contracts";
import { ImportStatement } from "./ImportStatement";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** Rekening koran — how the leadership accounts reach the ledger at all.
 *
 *  BCA 064 and BCA USD 081 are held by leadership and not shared openly, so
 *  nothing else can produce their rows (D180, Q42). That makes this screen
 *  different from an ordinary reconciliation in one important way: most lines
 *  are **not** waiting to be ticked off against something, they are waiting to
 *  be **booked**.
 *
 *  Three refusals hold it together:
 *
 *  - A ledger row is never created from a foreign line until somebody types the
 *    rate the bank actually gave that day (D181).
 *  - A match is offered, never applied. Two identical transfers in one week
 *    would otherwise reconcile against each other's rows in silence.
 *  - Opening + movements must equal the closing balance the bank printed. When
 *    it does not, the file is partial and the screen says so **before** anybody
 *    books from it (D182).
 */
export default function StatementsPage() {
  const { can, hasAuthority } = useSession();
  const [statements, reload] = useLoad(() => accounting.listStatements(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const mayPost = hasAuthority("post_ledger");
  const mayEdit = can("accounting.update");

  return (
    <div>
      <PageHeader
        breadcrumb="Accounting"
        title="Rekening koran"
        description="Untuk BCA 064 dan BCA USD 081 ini bukan pencocokan — ini satu-satunya jalan mutasi mereka masuk ledger. Baris dolar tidak bisa dibukukan sebelum kursnya diisi."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge state={statements} />
            {mayEdit && <Button icon={Upload} onClick={() => setImporting(true)}>Upload</Button>}
          </div>
        }
      />

      <Loaded state={statements} onRetry={reload}>
        {(all) => (
          <div className="space-y-4">
            {all.map((s) => (
              <StatementCard
                key={s.id}
                statement={s}
                expanded={open === s.statement_no}
                onToggle={() => setOpen(open === s.statement_no ? null : s.statement_no)}
                mayPost={mayPost}
                mayEdit={mayEdit}
                onChanged={reload}
              />
            ))}
            {importing && (
              <ImportStatement
                onClose={() => setImporting(false)}
                onDone={() => { setImporting(false); reload(); }}
              />
            )}
            {all.length === 0 && (
              <Card>
                <p className="px-5 py-8 text-[13px] text-slate-500">
                  Belum ada rekening koran yang diunggah.
                </p>
              </Card>
            )}
          </div>
        )}
      </Loaded>
    </div>
  );
}

function StatementCard({
  statement: s, expanded, onToggle, mayPost, mayEdit, onChanged,
}: {
  statement: BankStatementView;
  expanded: boolean;
  onToggle: () => void;
  mayPost: boolean;
  mayEdit: boolean;
  onChanged: () => void;
}) {
  const money = (n: number) => s.currency === "IDR" ? formatIDR(n) : `${s.currency} ${formatNumber(n)}`;

  return (
    <Card>
      <CardHeader
        title={`${s.account_code} · ${s.period_start} → ${s.period_end}`}
        subtitle={`${s.filename} — diunggah ${s.uploaded_by_name}, ${s.uploaded_at.slice(0, 10)}${s.note ? ` · ${s.note}` : ""}`}
        icon={Landmark}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {s.unmatched > 0 && <Badge tone="amber">{s.unmatched} belum diputuskan</Badge>}
            {s.awaiting_rate > 0 && <Badge tone="red">{s.awaiting_rate} menunggu kurs</Badge>}
            {s.booked > 0 && <Badge tone="green">{s.booked} masuk ledger</Badge>}
            <Button size="sm" variant="outline" onClick={onToggle}>
              {expanded ? "Tutup" : "Buka"}
            </Button>
          </div>
        }
      />

      <dl className="grid divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {([
          ["Saldo awal", money(s.opening_balance), `menurut ${s.account_code}`],
          ["Mutasi", `${s.movement >= 0 ? "+" : "−"}${money(Math.abs(s.movement))}`, `${s.lines.length} baris`],
          ["Saldo akhir (bank)", money(s.closing_balance), "tertulis di rekening koran"],
          ["Saldo akhir (hitung)", money(s.computed_closing),
            s.balance_ok ? "cocok" : `selisih ${money(Math.abs(s.computed_closing - s.closing_balance))}`],
        ] as [string, string, string][]).map(([k, v, note]) => (
          <div key={k} className="px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className={cn(
              "mt-0.5 text-[17px] font-bold tabular-nums tracking-tight",
              k === "Saldo akhir (hitung)" && !s.balance_ok ? "text-rose-700" : "text-slate-800",
            )}>
              {v}
            </dd>
            <p className="text-[11px] text-slate-500">{note}</p>
          </div>
        ))}
      </dl>

      {!s.balance_ok && (
        <p className="flex items-start gap-2 border-t border-slate-100 bg-rose-50/70 px-5 py-2.5 text-[12px] text-rose-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Filenya belum utuh.</strong> Saldo awal ditambah mutasi tidak sama dengan saldo
            akhir yang dicetak bank. Ada halaman yang belum ikut, atau exportnya tersaring —
            membukukan dari file setengah berarti ledger ikut setengah.
          </span>
        </p>
      )}

      {s.awaiting_rate > 0 && (
        <p className="flex items-start gap-2 border-t border-slate-100 bg-amber-50/70 px-5 py-2.5 text-[12px] text-amber-900">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {s.awaiting_rate} baris dalam {s.currency} belum punya kurs. Sistem tidak menebak kurs:
            yang benar adalah kurs yang bank berikan hari itu, dan itu ada di nota transaksinya.
          </span>
        </p>
      )}

      {expanded && (
        <Paged rows={s.lines} pageSize={15} unit="baris">
          {(page) => (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {page.map((l) => (
                <LineRow
                  key={l.id} line={l} statement={s}
                  mayPost={mayPost} mayEdit={mayEdit} onChanged={onChanged}
                />
              ))}
            </ul>
          )}
        </Paged>
      )}
    </Card>
  );
}

function LineRow({
  line: l, statement: s, mayPost, mayEdit, onChanged,
}: {
  line: StatementLineView;
  statement: BankStatementView;
  mayPost: boolean;
  mayEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(0);
  const [booking, setBooking] = useState(false);
  const [form, setForm] = useState({ type_code: "CASHFLOW", description: "" });

  async function act(p: Promise<{ error?: { status: number; message: string } | null }>, done: string) {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Tidak jadi", res.error.message);
      return;
    }
    toast("success", done, "");
    setBooking(false);
    onChanged();
  }

  const amount = s.currency === "IDR"
    ? formatIDR(l.amount)
    : `${s.currency} ${formatNumber(l.amount)}`;

  return (
    <li className="px-5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[80px] shrink-0 font-mono text-[11px] text-slate-500">{l.value_date.slice(5)}</span>
        <span className="min-w-[220px] flex-1 text-[13px] text-slate-800">
          {l.raw_description}
          {l.note && <span className="block text-[11px] text-slate-500">{l.note}</span>}
        </span>
        <span className={cn(
          "w-[150px] text-right font-semibold tabular-nums",
          l.direction === "IN" ? "text-emerald-700" : "text-slate-800",
        )}>
          {l.direction === "IN" ? "+" : "−"}{amount}
        </span>
        {l.amount_idr != null && s.currency !== "IDR" && (
          <span className="w-[130px] text-right text-[11px] text-slate-500">
            {formatIDR(l.amount_idr)} @ {formatNumber(l.fx_rate ?? 0)}
          </span>
        )}
        <Badge tone={
          l.status === "booked" ? "green"
            : l.status === "matched" ? "brand"
              : l.status === "ignored" ? "slate" : "amber"
        }>
          {l.status === "booked" ? `masuk ledger ${l.trx_no}`
            : l.status === "matched" ? `cocok ${l.trx_no}`
              : l.status === "ignored" ? "dilewati" : "belum diputuskan"}
        </Badge>
      </div>

      {l.status === "unmatched" && (
        <div className="mt-1.5 space-y-1.5">
          {/* A foreign line cannot go anywhere until the rate is typed. */}
          {l.amount_idr == null && mayEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-slate-600">Kurs hari itu:</span>
              <div className="w-[150px]">
                <MoneyInput value={rate} onChange={setRate} />
              </div>
              <Button
                size="sm" variant="outline" disabled={busy || rate <= 0}
                onClick={() => act(
                  accounting.setStatementRate({ statement_no: s.statement_no, line_id: l.id, fx_rate: rate }),
                  "Kurs tersimpan",
                )}
              >
                Simpan kurs
              </Button>
              <span className="text-[11px] text-slate-500">
                {rate > 0 && `= ${formatIDR(Math.round(l.amount * rate))}`}
              </span>
            </div>
          )}

          {l.suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5">
              <Link2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[12px] text-slate-600">Mirip dengan:</span>
              {l.suggestions.map((m) => (
                <Button
                  key={m.trx_no} size="sm" variant="outline" disabled={busy || !mayEdit}
                  onClick={() => act(
                    accounting.matchStatementLine({ statement_no: s.statement_no, line_id: l.id, trx_no: m.trx_no }),
                    `Ditautkan ke ${m.trx_no}`,
                  )}
                >
                  {m.trx_no} · {m.description.slice(0, 32)}
                  {m.days_apart !== 0 && ` · ${Math.abs(m.days_apart)} hari`}
                </Button>
              ))}
            </div>
          )}

          {mayEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {!booking ? (
                <>
                  <Button
                    size="sm" icon={Plus} disabled={busy || !mayPost || l.amount_idr == null}
                    onClick={() => setBooking(true)}
                  >
                    Bukukan
                  </Button>
                  <Button
                    size="sm" variant="ghost" icon={EyeOff} disabled={busy}
                    onClick={() => {
                      const note = window.prompt("Alasan dilewati — dibaca saat baris ini ditanyakan:");
                      if (note?.trim()) {
                        void act(
                          accounting.ignoreStatementLine({ statement_no: s.statement_no, line_id: l.id, note }),
                          "Dilewati, dengan alasan",
                        );
                      }
                    }}
                  >
                    Lewati
                  </Button>
                  {!mayPost && (
                    <span className="text-[11px] text-slate-500">
                      Membukukan ke ledger butuh wewenang <span className="font-mono">post_ledger</span>.
                    </span>
                  )}
                </>
              ) : (
                <div className="grid w-full gap-2 sm:grid-cols-[150px_1fr_auto_auto]">
                  <select
                    value={form.type_code}
                    onChange={(e) => setForm({ ...form, type_code: e.target.value })}
                    aria-label="Jenis transaksi"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  >
                    {["CASHFLOW", "SUPPLIERS", "BANK CHARGES", "OTHERS", "CHINA", "PREPAID VENDOR"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Keterangan — baris bank apa adanya bukan penjelasan"
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                  <Button
                    size="sm" disabled={busy || !form.description.trim()}
                    onClick={() => act(
                      accounting.bookStatementLine({
                        statement_no: s.statement_no, line_id: l.id,
                        type_code: form.type_code as never, description: form.description,
                      }),
                      "Masuk ledger",
                    )}
                  >
                    Simpan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBooking(false)}>Batal</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
