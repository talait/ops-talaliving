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
  smoke.sql     proves the access model refuses
```

## Running it locally

```bash
initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp" start
PGHOST=/tmp PGPORT=5433 supabase/local/rebuild.sh
psql -h /tmp -p 5433 -U postgres -f supabase/local/smoke.sql
```

`rebuild.sh` drops and re-applies everything on purpose: a migration that only
works against yesterday's database is one that will fail on a fresh one.

## Before anything reaches the real project

Additive migrations may be applied after a clean run of `rebuild.sh`.
**Destructive DDL asks the owner first** — never wipe, never bulk-delete. The
production database holds the business's own records, and a correction there
is a VOID with a reason, not a deletion.
