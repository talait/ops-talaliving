"use client";

import { useRef, useState } from "react";
import { Check, FileText, Paperclip, X } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { documents, hr } from "@/demo/api";
import { OVERTIME_STAGE_LABEL, type OvertimeView } from "@/services/hr/contracts";
import { useToast } from "@/store/toast";

/** One overtime claim, and the two signatures it needs.
 *
 *  Owner, answering Q34: *lembur harus di approve HRD, dan pimpinan dengan
 *  dokumen surat lembur*. So the row shows both steps in the order they
 *  happen, and what is missing between them. HRD checks the hours against the
 *  taps — was he here, are these the hours the machine shows. Leadership signs
 *  the letter, which is why the letter has to exist before that button does
 *  anything (D145).
 *
 *  The claim is not hidden while it waits: a row stuck at *menunggu surat
 *  lembur* for a week is the thing somebody needs to see.
 */
export function OvertimeRow({
  claim, mayHrd, mayLeader, onChanged,
}: {
  claim: OvertimeView;
  mayHrd: boolean;
  mayLeader: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function decide(step: "hrd" | "leader", approved: boolean) {
    setBusy(true);
    const res = await hr.decideOvertime({
      claim_id: claim.id, step, approved,
      reason: approved ? null : `Tidak disetujui oleh ${step === "hrd" ? "HRD" : "pimpinan"} dari layar absensi.`,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Belum diputuskan", res.error.message);
      return;
    }
    toast(
      "success",
      approved ? (step === "hrd" ? "Diperiksa HRD" : "Disetujui pimpinan") : "Ditolak",
      `${claim.full_name} · ${claim.work_date} · ${formatNumber(claim.hours)} jam`,
    );
    onChanged();
  }

  async function attach(f: File) {
    setBusy(true);
    const up = await documents.upload({ filename: f.name, mime: f.type || "application/pdf", bytes: f.size });
    if (up.error) { setBusy(false); toast("critical", "Upload gagal", up.error.message); return; }
    const res = await hr.attachSuratLembur({ claim_id: claim.id, attachment_id: up.data.id });
    setBusy(false);
    if (res.error) { toast("warning", "Tidak terlampir", res.error.message); return; }
    toast("success", "Surat lembur terlampir", `${f.name} · pimpinan bisa menandatangani sekarang.`);
    onChanged();
  }

  const tone = claim.stage === "waiting_hrd" ? "amber"
    : claim.stage === "waiting_surat" ? "violet"
      : claim.stage === "waiting_leader" ? "brand" : "slate";

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[150px] flex-1 text-[13px] font-medium text-slate-800">
          {claim.full_name}
          <span className="ml-2 font-normal text-slate-500">{claim.work_date}</span>
        </span>
        <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-700">
          {formatNumber(claim.hours)} jam
        </span>
        <span className="min-w-[180px] flex-1 text-[12px] text-slate-500">{claim.reason}</span>
        <Badge tone={tone} dot>{OVERTIME_STAGE_LABEL[claim.stage]}</Badge>
      </div>

      {/* The two steps, in the order they happen. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
          {claim.hrd_approved_at
            ? <Check className="h-3.5 w-3.5 text-emerald-600" />
            : <span className="h-3.5 w-3.5 rounded-full border border-dashed border-slate-300" />}
          <span className={claim.hrd_approved_at ? "text-slate-700" : "text-slate-500"}>
            HRD {claim.hrd_approved_at ? "sudah memeriksa" : "belum memeriksa"}
          </span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
          {claim.surat
            ? <FileText className="h-3.5 w-3.5 text-slate-500" />
            : <span className="h-3.5 w-3.5 rounded-full border border-dashed border-slate-300" />}
          <span className={claim.surat ? "text-slate-700" : "text-slate-500"}>
            {claim.surat ? claim.surat.filename : "surat lembur belum ada"}
          </span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
          {claim.leader_approved_at
            ? <Check className="h-3.5 w-3.5 text-emerald-600" />
            : <span className="h-3.5 w-3.5 rounded-full border border-dashed border-slate-300" />}
          <span className={claim.leader_approved_at ? "text-slate-700" : "text-slate-500"}>
            Pimpinan {claim.leader_approved_at ? "sudah menandatangani" : "belum menandatangani"}
          </span>
        </span>

        <span className="ml-auto flex flex-wrap gap-2">
          {mayHrd && !claim.surat && (
            <>
              <input
                ref={fileRef} type="file" className="hidden"
                accept="application/pdf,image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); }}
              />
              <Button size="sm" variant="outline" icon={Paperclip} disabled={busy}
                onClick={() => fileRef.current?.click()}>
                Lampirkan surat lembur
              </Button>
            </>
          )}
          {mayHrd && !claim.hrd_approved_at && (
            <>
              <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => decide("hrd", false)}>
                Tolak
              </Button>
              <Button size="sm" disabled={busy} onClick={() => decide("hrd", true)}>
                Periksa &amp; teruskan
              </Button>
            </>
          )}
          {claim.hrd_approved_at && !claim.leader_approved_at && (
            mayLeader ? (
              <>
                <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => decide("leader", false)}>
                  Tolak
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !claim.surat}
                  title={claim.surat ? "" : "Surat lembur belum dilampirkan"}
                  onClick={() => decide("leader", true)}
                >
                  Setujui sebagai pimpinan
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-slate-500">
                {claim.surat ? "menunggu tanda tangan pimpinan" : "menunggu surat lembur"}
              </span>
            )
          )}
        </span>
      </div>
    </li>
  );
}
