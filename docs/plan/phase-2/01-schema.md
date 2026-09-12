# The schema, table by table, in the order it has to be built

`02-database.md` is the reasoning — why a tap is a row, why an approval carries
the identity that answered it, why a variance is a row and not a note. This
file is the **build order**, and it is the only place the ladder is complete
and current as of M26.

Everything here is derived from `src/services/*/contracts.ts` and
`src/demo/state.ts`, which are the running shape — not from an earlier plan.

---

## The names: every schema starts `ops_`

`ops_core`, `ops_procure`, `ops_acct`, `ops_hr`, `ops_prod`, `ops_inv` — and
until 2026-09-13 they were `core`, `procure`, `acct`, `hr`, `prod`, `inv`.

The Supabase project this ladder goes into **already runs the old system**, and
the old system already has a `core` schema. `create schema if not exists core`
succeeds by doing nothing, and every `create table core.…` after it then puts
this system's tables **inside the live one** — inheriting its grants, policies
and RLS settings, with no error anywhere. The `search_path = core` on the
security-definer functions was the sharper edge of the same thing: the function
that decides who may read what would have been resolving against somebody
else's tables while looking entirely correct (D265).

The owner's instruction is to leave the old schema alone. The prefix is what
makes that true **by construction** rather than by care, and `0001` opens with a
guard that refuses rather than merges if one of the six names is somehow taken
and already holds tables.

---

## Conventions, applied to every table without restating them

| Rule | How it looks |
|---|---|
| Primary key | `uuid … default gen_random_uuid()` |
| Public identity | a `*_no` / `code` text column, unique, minted by `ops_core.next_doc_number()` (ADR-005) |
| Time | `timestamptz`, always. Dates that mean an office day are `date` and computed with `ops_core.office_day()` (F17) |
| Money | `numeric`, whole rupiah. Never `float` |
| Deletion | none. No `DELETE` policy and no `DELETE` grant. Supersession, VOID, `left_on`, `merged_into`, `unlinked_at` (A2, A5) |
| Audit | every write seam calls `ops_core.write_audit(…)` and `ops_core.emit(…)` in the same transaction |
| RLS | on for every table. Read on `module.read`, write on `module.create` / `module.update`, decisions on `ops_core.has_authority(…)` |
| Cross-schema references | by public code as `text`, never a foreign key across a service seam (ADR-004) |

The pattern is written out once, in `0006_procure_reference.sql`. Every later
migration repeats it; where one deviates, the deviation carries a comment
saying why.

---

## The ladder

`0001`–`0006` exist and apply. The rest are specified here and not yet written.

| # | File | Tables | Notes that decide the shape |
|---|---|---|---|
| 0001 | `core_types` | — | every enum, all six schemas. **Done** |
| 0002 | `core_identity` | `users`, `user_modules`, `user_authorities`, `permission_catalog`, `v_my_access` | `has_permission()` / `has_authority()` — the only two functions a policy calls. **Done** |
| 0003 | `core_audit` | `audit_log`, `outbox`, `settings` | `write_audit()`, `emit()`. **Done** |
| 0004 | `core_numbers` | `doc_numbers`, `doc_prefixes` | `next_doc_number()`, ten prefixes. **Done** |
| 0005 | `core_files` | `attachments`, `attachment_links`, `doc_kind_labels` | file **or** link (D125); unlink is an update. **Done** |
| 0006 | `procure_reference` | `vendors`, `uom`, `uom_conversions`, `item_categories`, `items`, `projects`, `project_lines` | merge is a pointer; uncurated rows are allowed in (D30–D33). **Done** |
| 0007 | `procure_pr` | `pr_documents`, `pr_lines`, `pr_approvals`, `line_notes`, `line_variances` | an approval carries **who answered and through which door** (F16, D19); a revision supersedes, never edits (A2); a variance is a row (F13, D98) |
| 0008 | `procure_requests` | `approval_requests`, `approval_batches`, `round_transfers` | one question, one answer, one channel — chat answers land here (D75–D79) |
| 0009 | `procure_rounds` | `payment_rounds`, `payment_round_lines`, `line_settlements` | TRANSFERRED ≠ PAID (D6); a round funds in instalments (D107) |
| 0010 | `procure_po` | `purchase_orders`, `po_lines`, `po_schedule`, `po_documents` | terms with a guard, amendment by supersession (D132–D135); deposit earned on issue (F27, D99) |
| 0011 | `procure_receipts` | `receipts` | two documents, a receiver **and** a checker (D101); report and confirmation are separate acts (D131) |
| 0012 | `acct_accounts` | `accounts`, `transaction_types` | the five real accounts seeded; the leadership account is *locked*, not hidden (D87) |
| 0013 | `acct_ledger` | `transactions`, `transaction_lines` | **no document, no row** (D85); a purchase row carries qty, unit price and vendor (D86); VOID never DELETE |
| 0014 | `acct_allocations` | `payment_allocations` | one seam, `allocate_payment()`; a payment may settle an order, not only a request (D106, D107) |
| 0015 | `acct_review` | `evidence_inbox` | five roads, none of them delete (F26, D94) |
| 0016 | `acct_calendar` | `cash_components`, `cash_overrides`, `cash_settlements` | three tables, **no projection stored** — the twelve months are a view (D109–D115) |
| 0017 | `hr_people` | `employees` | `paid_leave_days` per person (D144); nobody is deleted, `left_on` retires |
| 0018 | `hr_attendance` | `attendance_imports`, `attendance_scans`, `day_marks` | one row per **tap** (D141); a mark never overrides a scan (D142); re-upload is a no-op (D143) |
| 0019 | `hr_overtime` | `overtime_sheets`, `overtime_lines` | two kinds of sheet (D146); leadership signs **after** HRD (D145); `form_amount` is the GAJI column of the paper (D154) |
| 0020 | `hr_payroll` | `payroll_runs`, `payroll_adjustments` | payroll lines are **not a table** — they are a view over days and approved overtime (A3); adjustments are typed, signed, reasoned, and frozen once the run leaves DRAFT (D155) |
| 0021 | `prod_master` | `products`, `bom_components` | products are *made*, items are *bought* — different tables (D149); size is three numbers (D150); an unpriced component marks the total incomplete, never zero |
| 0022 | `prod_orders` | `process_stages` (seed), `work_orders` | seven stages as **data** (Q35); late-first ordering is a view, not a column |
| 0023 | `prod_progress` | `progress_entries` | append-only; a correction is a negative entry (A5); signing an overtime sheet posts progress (D147) |
| 0024 | `inv_timber` | `log_purchases`, `log_pieces`, `sawn_boards` | two volumes with a saw between them (D153); the seller's claimed m³ is kept **beside** ours, never replacing it; yield only over logs actually sawn (F46) |
| 0025 | `views` | every `v_*` | see the next section — this is the biggest single migration and the one to write last |
| 0026 | `seams` | the write functions | `post_transaction()`, `allocate_payment()`, `approve_line()`, `decide_overtime_sheet()`, `open_payroll()`, `record_progress()`, `confirm_receipt()`, `issue_po()`, `import_scans()`, `import_overtime_form()`, `resolve_inbox()` |
| 0027 | `idempotency` | `ops_core.idempotency_keys` | `(service, endpoint, key) → response`. Held on 409, released on 422/5xx |

---

## The derivations — the real work of Phase 2

Phase 1 computes on read, in TypeScript. **2.583 lines** of it:

| File | Lines | What moves where |
|---|---|---|
| `src/demo/derive.ts` | 1.588 | line status, PR coverage, round summaries, PO journeys, vendor journeys, ledger allocations, the cash plan, inbox health → `v_pr_line_status`, `v_po_line_status`, `v_round_summary`, `v_vendor_journey`, `v_cash_plan`, `v_inbox_health` |
| `src/demo/hr-derive.ts` | 533 | the six slots from taps, day state and `day_value`, the payroll line, the payslip week, lateness → `v_timesheet_day`, `v_payroll_line`, `v_payslip_day` |
| `src/demo/production-derive.ts` | 275 | stage progress, work-order state, BOM material cost → `v_work_order`, `v_bom_cost` |
| `src/demo/inventory-derive.ts` | 187 | log m³ by convention, yield over sawn logs only, Rp/m³ per vendor **per species** → `v_log_purchase`, `v_timber_vendor` |

Two rules for the port, both learned the hard way in Phase 1:

- **A view may return a missing figure. It may not return a wrong one.** Where
  the demo marks a total *belum lengkap* (an unpriced BOM component, a partly
  sawn load), the view returns `null` plus a count — never a silent zero.
- **Port the test with the logic.** Each derivation view gets rows in
  `smoke.sql` that reproduce a number this project already argued about: Kayu
  Manis at Rp 34,6 juta/m³ papan (F46), Karjo's 1,5 paid days out of five days
  with hours on them (F48), a round marked TRANSFERRED that is still not PAID.

---

## Seeds

| Seed | Source of truth | Why it is a seed and not a form |
|---|---|---|
| `ops_core.permission_catalog` | `src/lib/roles.ts` | adding a verb should be a reviewable diff, not a row somebody types (D24) |
| `ops_core.doc_prefixes`, `ops_core.doc_kind_labels` | `src/services/documents/contracts.ts` | the label a screen prints, beside the code the database stores |
| `ops_acct.accounts` | the five real accounts | PETTY CASH · BNI 325 · BCA 271 · JAGO · BCA 064 (D87) |
| `ops_acct.transaction_types` | the running system, `EJO` included | carried verbatim and unclassified, never folded into OTHERS (Q10) |
| `ops_procure.uom` + conversions | `src/demo/fixtures/reference.ts` | including the log→board yield, which is a different kind of number from a factor |
| `ops_prod.process_stages` | seven stages | data, so reordering is a seed diff (Q35) |

---

## Contract changes the schema forces

The build session appends here; the design session applies them to
`src/services/*/contracts.ts` in its own commit (see the protocol in
`README.md`).

| # | Contract today | Schema | Why the schema wins |
|---|---|---|---|
| C1 | `DocKind` is a display string: `"Receipt / Invoice / Nota"` | `ops_core.doc_kind_t` is a code: `nota` | a stored value should not change when somebody rewords a label. `ops_core.doc_kind_labels` holds the wording, and the UI reads it from there |
| C2 | ids are readable strings (`emp_04`, `lbr_03`) | `uuid` | the demo's ids are for humans reading fixtures. The swap is mechanical; nothing outside `src/demo` depends on their shape |
| C3 | `ModuleGrant[]` on the session | `ops_core.user_modules` rows + `v_my_access` | the permission list stays **derived** on read, not stored (A3) |
| C4 | `AttendanceScan.import_id` optional | `ops_hr.attendance_imports.id`, NOT NULL for `source='import'` | a tap that came from a file should always name the file, or a re-upload cannot be proved to be a no-op (D143) |
