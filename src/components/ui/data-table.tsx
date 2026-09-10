import React from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  rowKey,
  empty,
  dense,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T, index: number) => string;
  empty?: React.ReactNode;
  dense?: boolean;
  footer?: React.ReactNode;
}) {
  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500",
                  alignClass(col.align),
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                {empty ?? "No data."}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-slate-100 transition-colors last:border-0",
                  onRowClick && "cursor-pointer hover:bg-brand-50/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      dense ? "px-4 py-2" : "px-4 py-3",
                      "whitespace-nowrap text-slate-700",
                      alignClass(col.align),
                      col.className,
                    )}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && <tfoot className="border-t-2 border-slate-200 bg-slate-50/70 font-medium">{footer}</tfoot>}
      </table>
    </div>
  );
}
