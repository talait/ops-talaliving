"use client";

import { NumberInput } from "./number-input";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Rupiah in, rupiah out.
 *
 *  Whole rupiah only — there are no sen in this business, and allowing decimals
 *  invites a rounding argument nobody wants to have with a supplier.
 *
 *  `ceiling` is the approval rule at the input: money can only shrink on its
 *  way through approval (A8). The field says so before the service refuses it,
 *  because a refusal you could have been warned about is a worse refusal.
 */
export function MoneyInput({
  value,
  onChange,
  ceiling,
  id,
  disabled,
  placeholder,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  ceiling?: number;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const over = ceiling !== undefined && value > ceiling;
  return (
    <div className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
          Rp
        </span>
        <NumberInput
          id={id}
          value={value}
          onChange={(v) => onChange(Math.max(0, Math.round(v)))}
          min={0}
          step={1000}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "pl-9 text-right tabular-nums",
            over && "border-rose-300 bg-rose-50/40",
          )}
        />
      </div>
      {over && (
        <p className="mt-1 text-xs text-rose-600">
          Above the {formatIDR(ceiling)} requested. Approval can only reduce.
        </p>
      )}
    </div>
  );
}
