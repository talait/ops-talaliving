"use client";

import { useEffect } from "react";
import { Loaded, useLoad } from "@/components/ui/loaded";
import { formatIDR, formatNumber } from "@/lib/format";
import { hr } from "@/demo/api";
import { BRAND } from "@/lib/brand";

/** One payslip per person, printed in one pass.
 *
 *  The same print-to-PDF road as the purchase order (D133): the payslip is the
 *  app's own page, so there is no second renderer to drift from the figures on
 *  screen. One page break per employee, so a stack comes out of the printer in
 *  the order the run lists them.
 *
 *  It says **gross** and says so out loud. A payslip with a deductions block
 *  full of zeroes would read as *nothing was deducted*; a payslip that states
 *  it computes gross reads as *this part is not done yet*, which is the truth
 *  (Q30–Q32).
 */
export default function PayslipsPage({ params }: { params: { run: string } }) {
  const runNo = decodeURIComponent(params.run);
  const [detail] = useLoad(() => hr.getPayroll(runNo), [runNo]);

  useEffect(() => {
    if (detail.status === "ready") {
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [detail.status]);

  return (
    <div className="mx-auto max-w-[820px] bg-white text-slate-900">
      <style>{`@media print { @page { size: A4; margin: 14mm; } .slip { break-after: page; } .slip:last-child { break-after: auto; } .no-print { display: none !important; } }`}</style>

      <Loaded state={detail} onRetry={() => {}}>
        {(d) => (
          <>
            {d.lines.map((l) => (
              <section key={l.employee_no} className="slip mb-10 p-10 print:p-0">
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
                  <div>
                    <p className="text-base font-bold tracking-tight">{BRAND.tagline}</p>
                    <p className="text-[11px] text-slate-500">{BRAND.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold tracking-tight">SLIP GAJI</p>
                    <p className="font-mono text-[12px]">{d.run_no}</p>
                    <p className="text-[11px] text-slate-500">{d.period_start} → {d.period_end}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-6 text-[13px]">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Karyawan</p>
                    <p className="font-semibold">{l.full_name}</p>
                    <p>{l.position}</p>
                    <p className="font-mono text-[11px] text-slate-500">{l.employee_no}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Dasar upah</p>
                    <p className="font-semibold">
                      {formatIDR(l.base_rate)}{" "}
                      {l.pay_basis === "monthly" ? "/ bulan" : l.pay_basis === "daily" ? "/ hari" : "/ jam"}
                    </p>
                    {l.pay_basis !== "monthly" && (
                      <p className="text-slate-600">{formatNumber(l.days_worked)} hari kerja</p>
                    )}
                  </div>
                </div>

                <table className="mt-5 w-full border-collapse text-[13px]">
                  <tbody>
                    <tr className="border-y border-slate-300">
                      <td className="py-2">
                        {l.pay_basis === "monthly" ? "Gaji pokok" : `Upah ${formatNumber(l.days_worked)} hari`}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatIDR(l.base_pay)}</td>
                    </tr>
                    {l.overtime_hours > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="py-2">Lembur — {formatNumber(l.overtime_hours)} jam (disetujui)</td>
                        <td className="py-2 text-right tabular-nums">{formatIDR(l.overtime_pay)}</td>
                      </tr>
                    )}
                    <tr className="border-b-2 border-slate-900">
                      <td className="py-2 font-semibold">Jumlah bruto</td>
                      <td className="py-2 text-right font-bold tabular-nums">{formatIDR(l.gross)}</td>
                    </tr>
                  </tbody>
                </table>

                <p className="mt-3 text-[11px] leading-snug text-slate-600">
                  Slip ini menghitung <strong>bruto</strong>. Potongan BPJS Kesehatan, BPJS
                  Ketenagakerjaan dan PPh 21 belum termasuk — belum ada ketentuan yang
                  ditetapkan di sistem ini.
                </p>

                {l.overtime_pending_hours > 0 && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    {formatNumber(l.overtime_pending_hours)} jam lembur masih menunggu persetujuan
                    dan belum dihitung di slip ini.
                  </p>
                )}

                <div className="mt-10 grid grid-cols-2 gap-6 text-[12px]">
                  <div>
                    <p className="text-slate-500">Dibuat oleh,</p>
                    <div className="mt-12 border-t border-slate-400 pt-1">{BRAND.tagline}</div>
                  </div>
                  <div>
                    <p className="text-slate-500">Diterima oleh,</p>
                    <div className="mt-12 border-t border-slate-400 pt-1">{l.full_name}</div>
                  </div>
                </div>
              </section>
            ))}

            <p className="no-print px-10 pb-10 text-center text-[12px] text-slate-400">
              {d.lines.length} payslip(s). Printing does not start automatically? Use your
              browser&apos;s print, and choose &ldquo;Save as PDF&rdquo;.
            </p>
          </>
        )}
      </Loaded>
    </div>
  );
}
