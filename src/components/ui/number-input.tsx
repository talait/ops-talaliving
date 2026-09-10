"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Numeric field that can actually be typed into.
 *
 * A raw `<input type="number" value={n} onChange={e => set(Number(e.target.value))}>`
 * fights the user: clearing the field yields `Number("") === 0`, so the 0 is
 * immediately written back and you can never get rid of the leading digit —
 * which is why the only reliable way to change the value ends up being the
 * spinner arrows. This keeps the raw text the user typed in local state and
 * only reports parsed numbers upward, so intermediate states ("", "1.", "-")
 * survive long enough to finish typing.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  disabled,
  className,
  id,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** `sm` exists for controls that sit inside a table row, where a 40px field
   *  turns a dense board into a scroll. */
  size?: "sm" | "md";
}) {
  const [text, setText] = useState(() => String(value ?? 0));

  // Re-sync when the value changes from outside (form reset, loading an
  // existing record) — but never while the text already parses to the same
  // number, or every keystroke would be clobbered mid-typing.
  useEffect(() => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed !== value) {
      setText(String(value ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);
    if (raw === "" || raw === "-") {
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(parsed);
  }

  function handleBlur() {
    // Normalize whatever half-typed text is left ("", "1.", "007") into the
    // canonical rendering of the value actually committed upstream.
    const parsed = Number(text);
    const next = Number.isFinite(parsed) && text !== "" && text !== "-" ? parsed : 0;
    const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "w-full rounded-lg border border-slate-200 focus:border-brand-400 focus:outline-none disabled:bg-slate-50",
        size === "sm" ? "h-8 px-2 text-[13px]" : "h-10 px-3 text-sm",
        className,
      )}
    />
  );
}
