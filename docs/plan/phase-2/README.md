# Phase 2 — the backend, built in a session of its own

**Status: ready to start, with two things named below that are not ready and
do not block the start.** Phase 1 is a complete frontend on browser-held demo
data: 52 screens, 8 services, 154 service functions, ~45 tables' worth of
shape, and a written reason for every rule (`06-decisions.md`, 158 decisions).
The backend does not need designing from scratch — it needs **transcribing**,
and the transcription is mostly mechanical because the demo was written as a
service layer rather than as component state (ADR-009).

This folder is the brief for the session that does it. The design session keeps
running in parallel; how the two stay out of each other's way is the last
section here.

---

## The one-paragraph version

Postgres is the application (ADR-002). Every rule that Phase 1 enforces in
TypeScript becomes either a **constraint**, a **row-level security policy**, a
**view** (for anything derived — A3) or a **`security definer` function** (for
anything that writes money, D84–D86). The Next.js app keeps its screens
untouched: `src/demo/api/*` is replaced by a client of the same shape, so a
screen that reads `procurement.listPr()` today reads `procurement.listPr()`
afterwards and never learns where the rows came from.

---

## What is already done, here, in this repository

| | |
|---|---|
| `supabase/migrations/0001…0006` | applied, from nothing, against a real Postgres 16 — schemas, every enum, identity + `has_permission()`, audit + outbox + settings, document numbering, evidence, and procurement's reference data as the worked pattern for a domain schema |
| `supabase/migrations/0007` | **B5 — Supabase Auth.** Provisioning on sign-up, the sign-in trail, `set_modules()` / `set_authorities()` with their two refusals, the access directory, and a bootstrap that closes behind itself |
| `supabase/local/00_shim.sql` | the `auth` schema, `auth.uid()` and the three Supabase roles, so the real migrations run unchanged on a bare Postgres. **Never applied to Supabase** |
| `supabase/local/rebuild.sh` | drops everything and re-applies the ladder. A migration that only works against yesterday's database is one that will fail on a fresh one |
| `supabase/local/smoke/` | one file per schema, each proving a **refusal** and a **derivation**, run by `smoke.sh` |
| `src/lib/supabase/` | the browser client, the per-request server client, and the guard that stops a `service_role` key ever carrying a `NEXT_PUBLIC_` prefix |
| `src/lib/api/_kit.ts`, `identity.ts` | the envelope, carried across from the database; `identity` with the same signatures as the demo's, minus `actAs` |

Run it:

```bash
# one throwaway cluster, any port
initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp" start
PGHOST=/tmp PGPORT=5433 supabase/local/rebuild.sh
PGHOST=/tmp PGPORT=5433 supabase/local/smoke.sh
```

`01-schema.md` carries the rest of the ladder — every remaining table, in
order, with the constraint that earns it. `02-api.md` maps all 154 service
functions onto endpoints. `03-estimate.md` is the work, measured against what
Phase 1 actually took.

---

## Where this ladder is supposed to land — **open, and it blocks a deployment**

Nothing in `supabase/migrations/` has been applied to Supabase, and as things
stand **none of it can be.** This was found by looking rather than by assuming,
and it is the largest open question in Phase 2 after the data migration.

There is one project on the account: **`john-lau-v01`**. It is not an empty
project waiting for this schema — it is the running legacy system, with 3.126
transactions, 285 vendors, 957 items, 1.301 audit rows and 116 migrations of
its own. And it already uses two of our six schema names:

| | `john-lau-v01` today | what our ladder would create |
|---|---|---|
| `core` | 11 tables — `users`, `roles`, `user_roles`, `audit_log`, `companies`, `policy_registry`, … | `users`, `user_modules`, `user_authorities`, `audit_log`, … |
| `hr` | 43 tables — `employees`, `punch_events`, `payslips`, `payroll_periods`, … | `employees`, `attendance_scans`, `day_marks`, … |
| `procure` `acct` `prod` `inv` | absent | ours |

`0002` creates `core.users`; the live project has a `core.users` with six rows
and a different shape. `0003` creates `core.audit_log`; the live one has 1.301
rows in it. **The ladder fails on its second file**, and the failure is the good
outcome — the bad one is a migration written defensively enough to half succeed
and leave two identity models in one schema.

Three ways out. None is a decision to make while deploying:

1. **A second Supabase project.** The new system gets its own database, the old
   one keeps running, and cutover (B9) is a parallel run between two projects
   rather than two schemas. Cleanest, and it makes B8's import an
   import — across a network, which it would be anyway from Sheets.
2. **New schema names in the same project** — `core2`, or a prefix. Cheap to
   type and expensive to live with: every policy, every function signature and
   every generated type carries the name, and "which `core` is this" becomes a
   question asked for years.
3. **Migrate the legacy `core` and `hr` into the new shape first.** The most
   honest end state and the most dangerous path: it is destructive DDL against
   live payroll and ledger data, and it puts the riskiest work first rather
   than last.

The recommendation is **(1)**, and the reason is in this folder's own rules:
Supabase is production. Option 3 asks the owner to accept destructive DDL on
the running business before a single screen has been proved against the new
schema. Option 1 asks them to accept a second project's monthly cost.

Until it is answered, the ladder is developed and proved against the throwaway
Postgres in `supabase/local/`, which is where every figure in this folder comes
from. **Nothing has been applied to `john-lau-v01`, and nothing should be.**

## Is the design ready? — the honest answer

**Ready to build against:** identity, documents, procurement, accounting,
production, inventory, and the whole of HR except its final figure. Those are
designed down to the constraint, exercised on real fixtures, and argued about
in writing where they were not obvious.

**Two things are genuinely not ready**, and neither blocks starting:

1. **Statutory deductions (Q30).** Payroll computes gross and says so on every
   screen. Nobody has told us which of BPJS Kesehatan, BPJS Ketenagakerjaan and
   PPh 21 apply to which of these people, at what rate, or who pays which half.
   The schema does not change when the answer arrives — an adjustment row
   already exists (D155) — but **a payslip cannot be given to an employee
   until it is answered.** This blocks the payroll *cutover*, not the payroll
   *build*.
2. **The data migration inventory.** Nothing has been written down about what
   has to come across from Google Sheets and `john-lau`, in what state, and
   who decides when a messy row is good enough to import. This is the largest
   unknown in the whole of Phase 2 and the only item in `03-estimate.md` with
   an open-ended range.

Everything else that is open (Q35–Q41) carries a default that is already
running, is visible on screen, and is a one-line change when answered.

---

## Rules the build session inherits and does not relitigate

These are not preferences; each one is in `06-decisions.md` with the incident
behind it.

1. **Nothing is deleted.** No `DELETE` policy, no `DELETE` grant. A correction
   is a supersession or a VOID with a reason (A2, A5, D84).
2. **Derived state is never stored.** Status, totals, coverage, payroll
   figures — all computed on read, in views (A3). A stored status is one that
   disagrees with the rows behind it.
3. **Every mutation writes three things in one transaction**: the business
   rows, one `core.audit_log` row, one `core.outbox` row. All three or none.
4. **Refusals are values, not exceptions.** `outcome` ∈ `ok · refused ·
   duplicate · noop` on every response; 403 refused, 409 duplicate, 422
   validation. The idempotency claim is **held** on 409 and released on 422/5xx.
5. **Cross-service references are public codes, never joins** (ADR-004):
   `pr-26-09-11_03`, not a uuid into another schema.
6. **Money has one write seam per concept** (ADR-006): posting a transaction,
   allocating a payment. Not two roads, one guarded.
7. **Warn, do not block** — except where money is at stake (A6).
8. **The office day is `Asia/Makassar`, not UTC and not the browser's** (F17,
   F39). `core.office_day()` exists for this.
9. **Secrets come from the environment, never the repo**, and `service_role`
   never appears in a `NEXT_PUBLIC_*` name.
10. **Supabase is production.** Additive migrations may be applied after a dry
    run on the throwaway cluster; **destructive DDL asks the owner first.**
    Never wipe, never bulk-delete.

---

## How the two sessions run at once

The design session (this one) keeps building screens and answering the owner.
The build session transcribes the backend. They share one repository, so the
split is by **file ownership**, and it is strict.

| Path | Owner | Notes |
|---|---|---|
| `supabase/**` | **build** | migrations, policies, seeds, local harness |
| `src/lib/api/**`, `src/lib/supabase/**` | **build** | the real client, created new |
| `docs/plan/phase-2/**` | **build** | this folder |
| `src/app/**`, `src/components/**` | **design** | screens and UI components |
| `src/demo/**` | **design** | fixtures, derivations, the demo API |
| `docs/plan/*.md` (except this folder) | **design** | the living record |
| `src/services/*/contracts.ts` | **shared — the seam** | see below |

**The contracts file is the only shared surface, and it has a protocol.**
Phase 2 regenerates types from the schema (`supabase gen types typescript`),
so the database's names win over the demo's where they differ. Until the swap:

- The **design** session may add fields and types freely (it is building the
  screens that need them).
- The **build** session does not edit that file directly. It appends to
  *Contract changes the schema forces* in `01-schema.md`, and the design
  session applies them in its own commit.
- Any commit touching a contracts file says so: `contract: …` in the subject.

**Branches.** Design stays on `claude/serene-euler-eq2qef`. The build session
takes its own branch from the same base and **merges design into build**
often — never the other way round — until the swap, which is one deliberate
pull request when `src/lib/api` is ready to replace `src/demo/api`.

**Demo mode survives the swap.** `src/demo` is not deleted: it is the guided
tour, the offline sandbox and the thing that makes a screen reviewable without
a database. One environment flag chooses which client `src/services/*` talks
to; both satisfy the same signatures.

---

## Definition of done, per backend milestone

A milestone is done when **all four** are true:

1. `supabase/local/rebuild.sh` applies the whole ladder from nothing.
2. Its schema has a `smoke.sql` that proves at least one **refusal** and one
   **derivation** — a policy that says no, and a view that computes what the
   demo computed. Refusals are the part that rots silently.
3. The matching screen runs against it with `src/demo` switched off, and shows
   the same figures the fixtures show today.
4. `02-database.md`, `03-api.md` and this folder are updated **in the same
   commit** as the work.
