"use client";

import { useState } from "react";
import { Scale, History, Play, AlertTriangle, Clock } from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Loaded, SourceBadge, useLoad } from "@/components/ui/loaded";
import { NumberInput } from "@/components/ui/number-input";
import { Paged } from "@/components/ui/pager";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { hr } from "@/demo/api";
import type { PayRules, UndertimeMode, OvertimeMode } from "@/services/hr/contracts";
import { useSession } from "@/store/session";
import { useToast } from "@/store/toast";

/** The pay rule book — the policy, visible and editable (D168).
 *
 *  Four situations exist in this workshop and every one of them is a policy
 *  that changes without the software changing: a day's wage, an hour's wage,
 *  what an overtime hour multiplies by, and what a short day costs. This screen
 *  is the list of them, with the number beside each one and a worked example
 *  underneath, because a rule nobody can read is a rule nobody can check.
 *
 *  Three things it refuses to do:
 *
 *  - **Edit a version.** A change writes the next one, from a date forward. A
 *    payslip already handed to somebody must stay recomputable under the rule
 *    it was computed under (D173).
 *  - **Backdate.** Into an approved run, especially: that would change a figure
 *    somebody signed.
 *  - **Save blind.** Every change is previewed against a real period first —
 *    a multiplier is an abstraction until you see it move one person's wage
 *    (D175).
 */
const OVERTIME_MODE_LABEL: Record<OvertimeMode, string> = {
  statutory: "Bertingkat sesuai ketentuan nasional",
  flat: "Tarif rata",
  form_only: "Hanya yang tertulis di form",
};

const UNDERTIME_MODE_LABEL: Record<UndertimeMode, string> = {
  off: "Tidak dipotong",
  pro_rata: "Dipotong per jam kurang",
  half_day_step: "Kurang lebih dari setengah hari → potong ½ hari",
};

export default function PayRulesPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const [sets, reload] = useLoad(() => hr.listPayRules(), []);
  const [draft, setDraft] = useState<PayRules | null>(null);
  const [effective, setEffective] = useState("2026-10-01");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof hr.previewPayRules>>["data"] | null>(null);
  const [busy, setBusy] = useState(false);
  const mayEdit = can("payroll.run");

  async function runPreview() {
    if (!draft) return;
    setBusy(true);
    const res = await hr.previewPayRules({
      rules: draft, period_start: "2026-08-31", period_end: "2026-09-06",
    });
    setBusy(false);
    if (res.error) { toast("warning", "Tidak bisa dihitung", res.error.message); return; }
    setPreview(res.data);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    const res = await hr.savePayRules({ effective_from: effective, note, rules: draft });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Tidak tersimpan", res.error.message);
      return;
    }
    toast("success", `Versi ${res.data.version} tersimpan`, `Berlaku mulai ${res.data.effective_from}`);
    setDraft(null); setPreview(null); setNote("");
    reload();
  }

  return (
    <div>
      <PageHeader
        breadcrumb="IT"
        title="Aturan penggajian"
        description="Skema upah, lembur dan undertime — angkanya kebijakan, bukan kode. Mengubahnya menulis versi baru mulai tanggal tertentu; versi lama tetap ada supaya slip lama masih bisa dihitung ulang."
        actions={<SourceBadge state={sets} />}
      />

      <Loaded state={sets} onRetry={reload}>
        {(all) => {
          const current = all.find((r) => r.is_current) ?? all[0];
          const rules = draft ?? current.rules;
          const set = (patch: Partial<PayRules>) => { setDraft({ ...rules, ...patch }); setPreview(null); };

          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] shadow-card">
                <Badge tone="brand">v{current.version}</Badge>
                <span className="text-slate-700">
                  Berlaku sejak <span className="font-mono">{current.effective_from}</span> — {current.note}
                </span>
                <span className="ml-auto text-[11px] text-slate-500">
                  ditulis {current.created_by_name}, {current.created_at.slice(0, 10)}
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="space-y-4">
                  <Card>
                    <CardHeader
                      title="Situasi 1 & 2 — upah harian dan upah per jam"
                      subtitle="Tarifnya ada di data karyawan, satu per orang. Yang diatur di sini adalah cara mengubah gaji bulanan menjadi tarif per jam, karena lembur staff dihitung dari sana."
                      icon={Scale}
                    />
                    <div className="space-y-3 px-5 py-3 text-[13px]">
                      <Field
                        label="Pembagi gaji bulanan"
                        hint="Gaji sebulan dibagi angka ini = upah satu jam. 173 adalah angka yang dipakai peraturan (40 jam × 52 minggu ÷ 12)."
                        value={rules.monthly_divisor}
                        onChange={(v) => set({ monthly_divisor: v })}
                        disabled={!mayEdit}
                      />
                      <p className="text-[12px] text-slate-500">
                        Harian: tarif per hari ÷ jam kerja kontrak orang itu. Per jam: tarifnya memang
                        sudah per jam. Keduanya tidak diatur di sini — itu data orang, bukan kebijakan.
                      </p>
                    </div>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Situasi 3 — lembur"
                      subtitle="Berlaku per malam, bukan per periode: “jam pertama” adalah jam pertama malam itu."
                      icon={Clock}
                    />
                    <div className="space-y-3 px-5 py-3 text-[13px]">
                      <label className="block">
                        <span className="block text-[12px] text-slate-500">Cara menghitung</span>
                        <select
                          value={rules.overtime_mode}
                          onChange={(e) => set({ overtime_mode: e.target.value as OvertimeMode })}
                          disabled={!mayEdit}
                          className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                        >
                          {(Object.keys(OVERTIME_MODE_LABEL) as OvertimeMode[]).map((m) => (
                            <option key={m} value={m}>{OVERTIME_MODE_LABEL[m]}</option>
                          ))}
                        </select>
                      </label>

                      {rules.overtime_mode === "statutory" && (
                        <>
                          <Tiers
                            title="Hari kerja biasa"
                            tiers={rules.workday_tiers}
                            onChange={(workday_tiers) => set({ workday_tiers })}
                            disabled={!mayEdit}
                          />
                          <Tiers
                            title="Hari libur & tanggal merah"
                            tiers={rules.restday_tiers}
                            onChange={(restday_tiers) => set({ restday_tiers })}
                            disabled={!mayEdit}
                          />
                          <label className="block">
                            <span className="block text-[12px] text-slate-500">Hari istirahat mingguan</span>
                            <select
                              value={rules.week_pattern}
                              onChange={(e) => set({ week_pattern: e.target.value as "6day" | "5day" })}
                              disabled={!mayEdit}
                              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                            >
                              <option value="6day">Enam hari kerja — Minggu saja</option>
                              <option value="5day">Lima hari kerja — Sabtu & Minggu</option>
                            </select>
                          </label>
                        </>
                      )}

                      {rules.overtime_mode === "flat" && (
                        <Field
                          label="Pengali tetap"
                          hint="Satu angka untuk semua jam lembur, hari apa pun. 1 berarti dibayar sama dengan jam biasa."
                          value={rules.flat_multiplier}
                          onChange={(v) => set({ flat_multiplier: v })}
                          disabled={!mayEdit}
                        />
                      )}

                      <Field
                        label="Pembulatan jam lembur (menit)"
                        hint="0 = apa adanya dari mesin absensi. 15 atau 30 kalau perusahaan membulatkan."
                        value={rules.overtime_rounding_minutes}
                        onChange={(v) => set({ overtime_rounding_minutes: v })}
                        disabled={!mayEdit}
                      />

                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                        <strong className="text-slate-700">Yang selalu menang:</strong> angka GAJI yang
                        tertulis di form lembur. Kalau kertasnya menyebut nominal, itu yang dibayar —
                        tangga pengali tidak dipakai untuk baris itu (D154).
                      </p>
                      <Example rules={rules} />
                    </div>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Situasi 4 — undertime & keterlambatan"
                      subtitle="Keduanya mati secara default: berapa nilainya belum pernah ditetapkan, dan potongan yang dikarang sistem sampai ke kantong orang."
                      icon={AlertTriangle}
                    />
                    <div className="space-y-3 px-5 py-3 text-[13px]">
                      <label className="block">
                        <span className="block text-[12px] text-slate-500">Kurang jam (undertime) — hanya untuk upah harian</span>
                        <select
                          value={rules.undertime_mode}
                          onChange={(e) => set({ undertime_mode: e.target.value as UndertimeMode })}
                          disabled={!mayEdit}
                          className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                        >
                          {(Object.keys(UNDERTIME_MODE_LABEL) as UndertimeMode[]).map((m) => (
                            <option key={m} value={m}>{UNDERTIME_MODE_LABEL[m]}</option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label="Toleransi kurang jam (menit)"
                        hint="Di bawah ini tidak dihitung kurang. Hari yang ditandai — sakit, cuti, tanggal merah — tidak pernah dihitung undertime."
                        value={rules.undertime_grace_minutes}
                        onChange={(v) => set({ undertime_grace_minutes: v })}
                        disabled={!mayEdit}
                      />
                      <Field
                        label="Terlambat setelah (menit dari tengah malam)"
                        hint="480 = jam 08.00. Menitnya ditampilkan di slip sebagai bukti; rupiahnya diketik orang dengan alasan."
                        value={rules.late_after_minutes}
                        onChange={(v) => set({ late_after_minutes: v })}
                        disabled={!mayEdit}
                      />
                      <p className="text-[12px] text-slate-500">
                        Potongan keterlambatan tetap manual (D155). Sistem menunjukkan menitnya, orang
                        yang menentukan nilainya — karena berapa harga satu menit di sini belum pernah
                        dinyatakan siapa pun (Q41).
                      </p>
                    </div>
                  </Card>
                </div>

                <div className="space-y-4">
                  {mayEdit && draft && (
                    <Card>
                      <CardHeader title="Simpan sebagai versi baru" subtitle="Versi lama tidak diubah." icon={Play} />
                      <div className="space-y-2 px-5 py-3">
                        <label className="block">
                          <span className="block text-[12px] text-slate-500">Berlaku mulai</span>
                          <input
                            type="date" value={effective} onChange={(e) => setEffective(e.target.value)}
                            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                          />
                        </label>
                        <input
                          value={note} onChange={(e) => setNote(e.target.value)}
                          placeholder="Alasan perubahan — dibaca saat slip lama ditanyakan"
                          className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" icon={Play} disabled={busy} onClick={runPreview}>
                            Lihat dampaknya
                          </Button>
                          <Button size="sm" disabled={busy || !note.trim() || !preview} onClick={save}>
                            {busy ? "Menyimpan…" : "Simpan versi"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Tombol simpan terbuka setelah dampaknya dihitung. Aturan gaji yang disimpan
                          tanpa dilihat dampaknya adalah aturan yang dampaknya ditemukan karyawan.
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setPreview(null); }}>
                          Batalkan perubahan
                        </Button>
                      </div>
                    </Card>
                  )}

                  {preview && (
                    <Card>
                      <CardHeader
                        title="Dampak pada periode 31 Agu – 6 Sep"
                        subtitle={`Bruto ${formatIDR(preview.before_total)} → ${formatIDR(preview.after_total)}`}
                        icon={Scale}
                      />
                      <ul className="divide-y divide-slate-100">
                        {preview.lines.length === 0 && (
                          <li className="px-5 py-4 text-[13px] text-slate-500">
                            Tidak ada yang berubah di periode itu.
                          </li>
                        )}
                        {preview.lines.map((l) => (
                          <li key={l.employee_no} className="px-5 py-2 text-[12px]">
                            <span className="font-medium text-slate-800">{l.full_name}</span>
                            <span className="ml-2 font-mono text-[10px] text-slate-400">{l.employee_no}</span>
                            <span className="block text-slate-600">
                              {formatIDR(l.before)} → <span className={cn(
                                "font-semibold",
                                l.after > l.before ? "text-emerald-700" : "text-rose-700",
                              )}>{formatIDR(l.after)}</span>
                              <span className="ml-2 text-slate-400">{l.note}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  <Card>
                    <CardHeader title="Riwayat versi" subtitle="Tidak ada yang dihapus." icon={History} />
                    <Paged rows={all} pageSize={8} unit="versi">
                      {(page) => (
                        <ul className="divide-y divide-slate-100">
                          {page.map((r) => (
                            <li key={r.id} className="px-5 py-2.5 text-[12px]">
                              <span className="flex flex-wrap items-center gap-2">
                                <Badge tone={r.is_current ? "green" : "slate"}>v{r.version}</Badge>
                                <span className="font-mono text-[11px] text-slate-500">{r.effective_from}</span>
                                <span className="text-slate-400">{r.created_by_name}</span>
                              </span>
                              <span className="mt-0.5 block text-slate-600">{r.note}</span>
                              <span className="mt-0.5 block text-[11px] text-slate-400">
                                {OVERTIME_MODE_LABEL[r.rules.overtime_mode]} ·{" "}
                                {UNDERTIME_MODE_LABEL[r.rules.undertime_mode].toLowerCase()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Paged>
                  </Card>
                </div>
              </div>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

function Field({
  label, hint, value, onChange, disabled,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] text-slate-500">{label}</span>
      <div className="mt-1 max-w-[180px]">
        <NumberInput value={value} onChange={onChange} disabled={disabled} />
      </div>
      <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>
    </label>
  );
}

/** The ladder, as rows. Adding a step is adding a row — which is what makes
 *  this configuration rather than a shape baked into the code. */
function Tiers({
  title, tiers, onChange, disabled,
}: {
  title: string;
  tiers: { after_hours: number; multiplier: number }[];
  onChange: (t: { after_hours: number; multiplier: number }[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[12px] font-medium text-slate-700">{title}</p>
      <ul className="mt-1 space-y-1">
        {tiers.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
            <span className="w-[92px]">
              {i === 0 ? "Jam ke-1" : `Setelah jam ${formatNumber(t.after_hours)}`}
            </span>
            <div className="w-[92px]">
              <NumberInput
                value={t.multiplier} disabled={disabled}
                onChange={(v) => onChange(tiers.map((x, j) => (j === i ? { ...x, multiplier: v } : x)))}
              />
            </div>
            <span>×</span>
            {!disabled && tiers.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(tiers.filter((_, j) => j !== i))}
                className="text-[11px] text-slate-400 underline hover:text-rose-600"
              >
                hapus
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <button
          type="button"
          onClick={() => onChange([...tiers, {
            after_hours: (tiers[tiers.length - 1]?.after_hours ?? 0) + 1,
            multiplier: (tiers[tiers.length - 1]?.multiplier ?? 1) + 0.5,
          }])}
          className="mt-1 text-[11px] text-brand-700 underline"
        >
          + tingkat
        </button>
      )}
    </div>
  );
}

/** A worked example with real money, because a multiplier is an abstraction
 *  until it is rupiah. */
function Example({ rules }: { rules: PayRules }) {
  const hourly = 17_500; // upah harian Rp 140.000 ÷ 8 jam
  const rows: { label: string; hours: number; mult: number }[] = [];
  if (rules.overtime_mode === "flat") {
    rows.push({ label: "3 jam, tarif rata", hours: 3, mult: rules.flat_multiplier });
  } else if (rules.overtime_mode === "statutory") {
    let left = 3;
    const ladder = [...rules.workday_tiers].sort((a, b) => a.after_hours - b.after_hours);
    ladder.forEach((t, i) => {
      const to = i + 1 < ladder.length ? ladder[i + 1].after_hours : Infinity;
      const take = Math.min(left, to - t.after_hours);
      if (take > 0) { rows.push({ label: `${formatNumber(take)} jam`, hours: take, mult: t.multiplier }); left -= take; }
    });
  }
  const total = rows.reduce((s, r) => s + r.hours * r.mult * hourly, 0);

  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-600">
      <p className="font-medium text-slate-700">Contoh: 3 jam lembur hari kerja, upah harian Rp 140.000 (8 jam)</p>
      {rules.overtime_mode === "form_only" ? (
        <p className="mt-1">Tidak dibayar kecuali form lembur menuliskan nominalnya.</p>
      ) : (
        <>
          <p className="mt-1">
            Satu jam biasa = {formatIDR(hourly)}.{" "}
            {rows.map((r, i) => (
              <span key={i}>
                {i > 0 ? " + " : ""}{r.label} × {formatNumber(r.mult)}
              </span>
            ))}
          </p>
          <p className="mt-0.5 font-semibold text-slate-800">Dibayar {formatIDR(Math.round(total))}</p>
        </>
      )}
    </div>
  );
}
