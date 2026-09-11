"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/drawer";
import { Button } from "@/components/ui/primitives";
import { hr } from "@/demo/api";
import type { AttendanceDay } from "@/services/hr/contracts";
import { useToast } from "@/store/toast";

/** Putting in the time the machine did not record.
 *
 *  Always by hand, always with a reason, and never by assuming: the reason is
 *  what separates a correction from a favour three months later, when somebody
 *  asks why this person was paid for a Thursday nobody remembers (D137).
 */
export function CloseDay({
  day, onClose, onSaved,
}: {
  day: AttendanceDay & { employee_no: string; full_name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [checkOut, setCheckOut] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const needsOut = !day.check_out;

  async function save() {
    setBusy(true);
    const res = await hr.closeDay({
      employee_no: day.employee_no,
      work_date: day.work_date,
      check_in: day.check_in ? undefined : checkIn,
      check_out: needsOut ? checkOut : undefined,
      reason,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not recorded", res.error.message);
      return;
    }
    toast("success", `${day.full_name} · ${day.work_date}`, "Day closed — it now counts toward the payroll.");
    onSaved();
  }

  return (
    <Modal
      open onClose={onClose}
      title={`${day.full_name} — ${day.work_date}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={save}
            disabled={busy || !reason.trim() || (needsOut ? !checkOut : !checkIn)}
          >
            {busy ? "Recording…" : "Close the day"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-slate-600">
          The machine recorded{" "}
          {day.check_in ? <>a check-in at <strong>{day.check_in.slice(11, 16)}</strong></> : "no check-in"}
          {" and "}
          {day.check_out ? <>a check-out at <strong>{day.check_out.slice(11, 16)}</strong></> : <strong>no check-out</strong>}.
          Until both exist the day is worth nothing.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {!day.check_in && (
            <div>
              <label htmlFor="cd-in" className="block text-xs text-slate-500">Check-in</label>
              <input
                id="cd-in" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
          )}
          {needsOut && (
            <div>
              <label htmlFor="cd-out" className="block text-xs text-slate-500">Check-out</label>
              <input
                id="cd-out" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="cd-reason" className="block text-xs text-slate-500">Why the machine missed it</label>
          <input
            id="cd-reason" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. pulang lewat pintu gudang, sidik jari tidak terbaca"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Required, and kept with your name. This sentence is what separates a correction
            from a favour when somebody reads it in three months.
          </p>
        </div>
      </div>
    </Modal>
  );
}
