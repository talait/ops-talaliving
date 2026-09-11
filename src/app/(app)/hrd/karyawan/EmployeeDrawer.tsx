"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/primitives";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { formatIDR } from "@/lib/format";
import { hr } from "@/demo/api";
import type { Employee, PayBasis } from "@/services/hr/contracts";
import { useToast } from "@/store/toast";

/** Somebody's name, and what their time costs.
 *
 *  Changing a rate is the most consequential edit in the system after posting
 *  to the ledger, so the audit row carries the figure before and after: *when
 *  did his rate go up, and who said so* is the question a payroll dispute
 *  turns on, and it is never asked on the day it happens.
 */
export function EmployeeDrawer({
  employee, onClose, onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [no, setNo] = useState(employee?.employee_no ?? "");
  const [name, setName] = useState(employee?.full_name ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [unit, setUnit] = useState(employee?.unit ?? "Workshop");
  const [basis, setBasis] = useState<PayBasis>(employee?.pay_basis ?? "daily");
  const [rate, setRate] = useState(employee?.base_rate ?? 0);
  const [hours, setHours] = useState(employee?.daily_hours ?? 8);
  const [busy, setBusy] = useState(false);

  const changed = employee && rate !== employee.base_rate;

  async function save() {
    setBusy(true);
    const res = await hr.saveEmployee({
      employee_no: no, full_name: name, position, unit,
      pay_basis: basis, base_rate: rate, daily_hours: hours,
    });
    setBusy(false);
    if (res.error) {
      toast(res.error.status === 403 ? "critical" : "warning", "Not saved", res.error.message);
      return;
    }
    toast("success", employee ? "Updated" : "Added", `${name} · ${formatIDR(rate)} ${basis === "monthly" ? "per month" : basis === "daily" ? "per day" : "per hour"}`);
    onSaved();
  }

  return (
    <Drawer
      open onClose={onClose} width="max-w-lg"
      title={employee ? employee.full_name : "New employee"}
      subtitle={employee ? `${employee.employee_no} · joined ${employee.joined_on}` : "The number has to match the fingerprint machine."}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button icon={Save} onClick={save} disabled={busy || !name.trim() || !no.trim() || rate <= 0}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="e-no" className="block text-xs text-slate-500">Number on the machine</label>
            <input
              id="e-no" value={no} onChange={(e) => setNo(e.target.value)}
              disabled={!!employee}
              placeholder="T-034"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {employee && <p className="mt-1 text-[11px] text-slate-500">Fixed — attendance is filed against it.</p>}
          </div>
          <div>
            <label htmlFor="e-name" className="block text-xs text-slate-500">Full name</label>
            <input
              id="e-name" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="e-pos" className="block text-xs text-slate-500">Position</label>
            <input
              id="e-pos" value={position} onChange={(e) => setPosition(e.target.value)}
              placeholder="Tukang Kayu"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="e-unit" className="block text-xs text-slate-500">Unit</label>
            <input
              id="e-unit" value={unit} onChange={(e) => setUnit(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <span className="block text-xs text-slate-500">How they are paid</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {([["monthly", "Monthly salary"], ["daily", "Per day"], ["hourly", "Per hour"]] as [PayBasis, string][]).map(([b, label]) => (
              <Button key={b} size="sm" variant={basis === b ? "primary" : "outline"} onClick={() => setBasis(b)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="e-rate" className="block text-xs text-slate-500">
              {basis === "monthly" ? "Salary, per month" : basis === "daily" ? "Rate, per day" : "Rate, per hour"}
            </label>
            <MoneyInput id="e-rate" value={rate} onChange={setRate} className="mt-1" />
            {changed && (
              <p className="mt-1 text-[11px] text-amber-700">
                {formatIDR(employee!.base_rate)} → {formatIDR(rate)} · both figures go on the audit row.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="e-hours" className="block text-xs text-slate-500">Hours in a standard day</label>
            <NumberInput id="e-hours" value={hours} min={1} max={24} onChange={setHours} className="mt-1" />
            <p className="mt-1 text-[11px] text-slate-500">Anything past this is overtime — claimed, then approved.</p>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
