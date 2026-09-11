import type {
  Employee, Attendance, OvertimeClaim, PayrollRun,
} from "@/services/hr/contracts";

/** Fourteen people, and the two ways this business pays them.
 *
 *  Staff are on a monthly salary; the workshop is paid for the days actually
 *  worked (owner: *gaji atau rate*). Both run through the same payroll — what
 *  differs is only how a day turns into money.
 */
export const EMPLOYEES: Employee[] = [
  { id: "emp_01", employee_no: "K-001", full_name: "Evin Jonathan", position: "Direktur", unit: "Leadership", pay_basis: "monthly", base_rate: 25_000_000, daily_hours: 8, joined_on: "2019-02-01", active: true, left_on: null, note: null },
  { id: "emp_02", employee_no: "K-004", full_name: "Putri Handayani", position: "Accounting", unit: "Office", pay_basis: "monthly", base_rate: 7_500_000, daily_hours: 8, joined_on: "2021-06-14", active: true, left_on: null, note: null },
  { id: "emp_03", employee_no: "K-007", full_name: "Anggun Lestari", position: "Finance", unit: "Office", pay_basis: "monthly", base_rate: 7_000_000, daily_hours: 8, joined_on: "2022-01-10", active: true, left_on: null, note: null },
  { id: "emp_04", employee_no: "K-011", full_name: "Andi Prasetyo", position: "Procurement", unit: "Office", pay_basis: "monthly", base_rate: 6_500_000, daily_hours: 8, joined_on: "2022-08-01", active: true, left_on: null, note: null },
  { id: "emp_05", employee_no: "K-014", full_name: "Made Suparta", position: "Kepala Gudang", unit: "Warehouse", pay_basis: "monthly", base_rate: 6_000_000, daily_hours: 8, joined_on: "2020-03-16", active: true, left_on: null, note: null },

  /* The workshop. Paid for the days they are here, which is why a missing
     check-out is not a formatting problem — it is somebody's wages. */
  { id: "emp_06", employee_no: "T-021", full_name: "Wayan Sudarma", position: "Tukang Kayu Senior", unit: "Workshop", pay_basis: "daily", base_rate: 185_000, daily_hours: 8, joined_on: "2019-09-02", active: true, left_on: null, note: null },
  { id: "emp_07", employee_no: "T-022", full_name: "Ketut Warsa", position: "Tukang Kayu", unit: "Workshop", pay_basis: "daily", base_rate: 165_000, daily_hours: 8, joined_on: "2021-02-15", active: true, left_on: null, note: null },
  { id: "emp_08", employee_no: "T-025", full_name: "Nyoman Restu", position: "Tukang Finishing", unit: "Workshop", pay_basis: "daily", base_rate: 170_000, daily_hours: 8, joined_on: "2021-11-08", active: true, left_on: null, note: null },
  { id: "emp_09", employee_no: "T-028", full_name: "Gede Artana", position: "Tukang Amplas", unit: "Workshop", pay_basis: "daily", base_rate: 150_000, daily_hours: 8, joined_on: "2023-04-03", active: true, left_on: null, note: null },
  { id: "emp_10", employee_no: "T-031", full_name: "Komang Alit", position: "Helper", unit: "Workshop", pay_basis: "daily", base_rate: 135_000, daily_hours: 8, joined_on: "2024-01-15", active: true, left_on: null, note: null },
  { id: "emp_11", employee_no: "T-033", full_name: "Putu Eka", position: "Tukang Las", unit: "Workshop", pay_basis: "daily", base_rate: 175_000, daily_hours: 8, joined_on: "2023-07-11", active: true, left_on: null, note: null },
  { id: "emp_12", employee_no: "D-002", full_name: "Kadek Surya", position: "Driver", unit: "Logistics", pay_basis: "daily", base_rate: 145_000, daily_hours: 8, joined_on: "2022-05-09", active: true, left_on: null, note: null },
  { id: "emp_13", employee_no: "S-001", full_name: "Nengah Budi", position: "Security", unit: "Logistics", pay_basis: "daily", base_rate: 140_000, daily_hours: 12, joined_on: "2020-10-01", active: true, left_on: null, note: "Shift 12 jam." },
  /* Left in July. The records stay: a payslip from March is still a fact. */
  { id: "emp_14", employee_no: "T-019", full_name: "Wayan Suastika", position: "Tukang Kayu", unit: "Workshop", pay_basis: "daily", base_rate: 165_000, daily_hours: 8, joined_on: "2018-05-20", active: false, left_on: "2026-07-31", note: "Pindah ke Denpasar." },
];

/* A fortnight of the fingerprint machine, 31 August – 11 September, weekdays
 * plus the Saturdays the workshop worked.
 *
 * It is not clean, because no attendance export is: two people have no
 * check-out at all, one has a check-in the machine recorded twice, one day is
 * missing for somebody who was certainly there. That mess is the whole reason
 * the screen exists. */
const WORKDAYS = [
  "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  "2026-09-05", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
];

const SHIFT: Record<string, [string, string]> = {
  emp_01: ["09:00", "17:30"], emp_02: ["08:05", "17:05"], emp_03: ["08:00", "17:00"],
  emp_04: ["08:10", "17:15"], emp_05: ["07:45", "16:50"],
  emp_06: ["07:30", "16:30"], emp_07: ["07:35", "16:30"], emp_08: ["07:40", "16:35"],
  emp_09: ["07:30", "16:30"], emp_10: ["07:45", "16:30"], emp_11: ["07:30", "16:30"],
  emp_12: ["07:00", "17:00"], emp_13: ["19:00", "07:00"],
};

/** Rows the machine produced. Gaps are gaps — nothing here invents a time. */
export const ATTENDANCE: Attendance[] = (() => {
  const rows: Attendance[] = [];
  let n = 0;
  const at = (d: string, t: string) => `${d}T${t}:00+08:00`;

  for (const emp of Object.keys(SHIFT)) {
    for (const day of WORKDAYS) {
      const isSat = new Date(`${day}T00:00:00+08:00`).getDay() === 6;
      /* The office does not work Saturdays; the workshop sometimes does. */
      if (isSat && !["emp_06", "emp_07", "emp_08", "emp_11"].includes(emp)) continue;

      const [inAt, outAt] = SHIFT[emp];
      n += 1;
      /* Deliberate holes, in the shapes a real export has them. */
      const noCheckout =
        (emp === "emp_09" && day === "2026-09-08")
        || (emp === "emp_12" && day === "2026-09-10");
      const missingDay = emp === "emp_10" && day === "2026-09-04";
      if (missingDay) continue;

      /* Two people stayed late on the 9th, which the machine saw and nobody
         has yet said was work (D138). */
      const lateOut =
        (emp === "emp_06" && day === "2026-09-09") ? "20:10"
          : (emp === "emp_08" && day === "2026-09-09") ? "19:40"
            : (emp === "emp_07" && day === "2026-09-11") ? "18:45"
              : null;

      rows.push({
        id: `att_${String(n).padStart(4, "0")}`,
        employee_id: emp,
        work_date: day,
        check_in: at(day, inAt),
        check_out: noCheckout ? null : at(day, lateOut ?? outAt),
        source: "biometric",
        device_ref: `FP1/${day.replace(/-/g, "")}/${emp.slice(4)}`,
        reason: null,
        recorded_by: null,
        recorded_at: at(day, "23:55"),
      });
    }
  }
  return rows;
})();

/** Claimed, and waiting. Nobody is paid 1,5× because a door sensor saw them. */
export const OVERTIME_CLAIMS: OvertimeClaim[] = [
  {
    id: "ovt_01", employee_id: "emp_06", work_date: "2026-09-09", hours: 3.5,
    reason: "Menyelesaikan rangka dining set VILLA SEMINYAK, dikejar pengiriman.",
    claimed_by: "usr_made", claimed_at: "2026-09-10T08:10:00+08:00",
    approved_by: "usr_made", approved_at: "2026-09-10T08:30:00+08:00", declined_reason: null,
  },
  {
    id: "ovt_02", employee_id: "emp_08", work_date: "2026-09-09", hours: 3,
    reason: "Finishing lanjut supaya kering sebelum dikirim.",
    claimed_by: "usr_made", claimed_at: "2026-09-10T08:12:00+08:00",
    /* Seen, not yet decided — and so not paid. */
    approved_by: null, approved_at: null, declined_reason: null,
  },
];

export const PAYROLL_RUNS: PayrollRun[] = [
  {
    id: "pay_01", run_no: "pyr-26-09-05_01",
    period_start: "2026-08-31", period_end: "2026-09-05",
    status: "PAID",
    created_at: "2026-09-05T16:00:00+08:00", created_by: "usr_anggun",
    approved_at: "2026-09-05T16:40:00+08:00", approved_by: "usr_evin",
    paid_trx_no: "trx-26-09-04_001",
    note: "Minggu pertama September.",
  },
];
