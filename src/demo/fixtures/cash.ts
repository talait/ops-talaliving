import type {
  CashComponent, CashOverride, CashSettlement,
} from "@/services/accounting/contracts";

/** The recurring bill list, with the day each one is due.
 *
 *  This is the part of the business that was never in a system: everybody
 *  knows payroll is weekly and the electricity arrives around the 24th, and
 *  that knowledge lives in one person's head and a WhatsApp reminder. Written
 *  down, it is a budget and a reminder at the same time (D109).
 *
 *  The amounts are estimates and are meant to be wrong — the point of showing
 *  actual beside them is that next month's estimate is better.
 */
export const CASH_COMPONENTS: CashComponent[] = [
  {
    id: "cmp_01", name: "Payroll", direction: "OUT", amount: 120_000_000, due_day: 25,
    type_code: "RECCURING - PAYROLL", vendor_id: null, account_id: "acc_bni325",
    starts_on: "2026-01", ends_on: null,
    note: "Four weekly runs. The date is when the month's last run leaves.",
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:00:00+08:00",
  },
  {
    id: "cmp_02", name: "Workshop electricity", direction: "OUT", amount: 4_300_000, due_day: 24,
    type_code: "RECCURING - UTILITIES", vendor_id: null, account_id: "acc_bni325",
    starts_on: "2026-01", ends_on: null, note: null,
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:02:00+08:00",
  },
  {
    id: "cmp_03", name: "Credit card bill", direction: "OUT", amount: 2_500_000, due_day: 8,
    type_code: "CREDIT CARD", vendor_id: null, account_id: "acc_bni325",
    starts_on: "2026-01", ends_on: null, note: "Mandiri, previous month's spending.",
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:04:00+08:00",
  },
  {
    id: "cmp_04", name: "Materials and hardware", direction: "OUT", amount: 45_000_000, due_day: 15,
    type_code: "SUPPLIERS", vendor_id: null, account_id: "acc_bca271",
    starts_on: "2026-01", ends_on: null,
    note: "What the workshop buys in an ordinary month, across all suppliers.",
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:06:00+08:00",
  },
  {
    id: "cmp_05", name: "Office and warehouse", direction: "OUT", amount: 1_500_000, due_day: 20,
    type_code: "OFFICE", vendor_id: null, account_id: "acc_petty",
    starts_on: "2026-01", ends_on: null, note: null,
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:08:00+08:00",
  },
  {
    id: "cmp_06", name: "Imported hardware — Guangzhou", direction: "OUT", amount: 8_400_000, due_day: 5,
    type_code: "CHINA", vendor_id: null, account_id: "acc_bca271",
    starts_on: "2026-09", ends_on: "2026-12",
    note: "Four instalments to the end of the year, then it stops.",
    active: true, created_by: "usr_anggun", created_at: "2026-09-05T09:00:00+08:00",
  },
  /* The only way money arrives. Everything above is paid out of it. */
  {
    id: "cmp_07", name: "Operating transfer from leadership", direction: "IN", amount: 150_000_000, due_day: 3,
    type_code: "CASHFLOW", vendor_id: null, account_id: "acc_bca271",
    starts_on: "2026-01", ends_on: null,
    note: "What has been going in each month. Change it and the year changes.",
    active: true, created_by: "usr_anggun", created_at: "2026-09-01T09:10:00+08:00",
  },
];

/** A month that is not like the others. Typed once, not re-typed twelve times. */
export const CASH_OVERRIDES: CashOverride[] = [
  {
    id: "cov_01", component_id: "cmp_01", month: "2026-12", amount: 160_000_000, due_day: null,
    reason: "THR — the December run carries the holiday allowance.",
    recorded_by: "usr_anggun", recorded_at: "2026-09-01T09:12:00+08:00",
  },
  {
    id: "cov_02", component_id: "cmp_05", month: "2026-10", amount: null, due_day: null,
    reason: "Nothing planned — the stationery order was pulled forward into September.",
    recorded_by: "usr_anggun", recorded_at: "2026-09-01T09:14:00+08:00",
  },
];

/** Somebody pointing at a ledger row and saying: that one was this bill. */
export const CASH_SETTLEMENTS: CashSettlement[] = [
  {
    id: "cst_01", component_id: "cmp_03", month: "2026-09", trx_no: "trx-26-09-08_001",
    recorded_by: "usr_anggun", recorded_at: "2026-09-08T16:30:00+08:00",
  },
];
