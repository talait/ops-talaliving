# `supabase/` — the database, in migrations

The brief this folder is built from is **`docs/plan/phase-2/`**: the readiness
verdict, the full migration ladder, the API inventory and the estimate. Read
`docs/plan/phase-2/README.md` first — it also carries the rules the build
session inherits and does not relitigate (nothing is deleted, derived state is
never stored, every mutation writes its audit row, Supabase is production).

```
migrations/   applied in filename order, forward only
local/        NEVER applied to Supabase
  00_shim.sql   the auth schema, auth.uid() and the three roles, so the real
                migrations run unchanged on a bare Postgres
  rebuild.sh    drop everything, apply the ladder from nothing
  smoke.sh      run every smoke file, report per file
  smoke/        one per schema: each proves a refusal and a derivation
```

## Running it locally

```bash
initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp" start
PGHOST=/tmp PGPORT=5433 supabase/local/rebuild.sh
PGHOST=/tmp PGPORT=5433 supabase/local/smoke.sh
PGHOST=/tmp PGPORT=5433 supabase/local/smoke.sh procure   # just one
```

`rebuild.sh` drops and re-applies everything on purpose: a migration that only
works against yesterday's database is one that will fail on a fresh one. The
shim drops and recreates its own `auth` schema for the same reason — while it
used `create if not exists`, an edit to it did nothing on a cluster that had
already run once, which made the shim the one part of the ladder that only
worked against yesterday's database.

Each file in `smoke/` wraps itself in `begin`/`rollback`, so it leaves nothing
behind, the order cannot matter, and any one of them runs on its own with plain
`psql -f` — which is what you want when only one of them is failing.

## Before anything reaches the real project

Additive migrations may be applied after a clean run of `rebuild.sh`.
**Destructive DDL asks the owner first** — never wipe, never bulk-delete. The
production database holds the business's own records, and a correction there
is a VOID with a reason, not a deletion.

**Nothing in this folder has been applied to Supabase, and none of it can be
yet.** The only project on the account is `john-lau-v01`, which is the running
legacy system — 3.126 transactions, 285 vendors, 957 items — and it already has
a `core` schema with a different `core.users`, a different `core.audit_log`, and
an `hr` schema of 43 tables belonging to a different design. `0002` and `0003`
would collide with live tables on their first statement. The options, and what
each one costs, are set out in `docs/plan/phase-2/README.md` under *Where this
ladder is supposed to land*; it is the owner's decision and it is not one to
make by discovering it during a deployment.
