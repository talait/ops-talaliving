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

## Running the whole stack locally — free, and nothing touches production

`supabase start` runs Postgres **plus GoTrue, PostgREST and Storage** in Docker
on your machine. That is what `src/lib/api/*` actually needs: it speaks HTTP to
PostgREST through `supabase-js`, not the Postgres wire protocol, so a bare
Postgres is not enough to run the app against.

```bash
npx supabase start                  # first run pulls ~6 images
PGHOST=127.0.0.1 PGPORT=54322 PGPASSWORD=postgres supabase/local/rebuild.sh
PGHOST=127.0.0.1 PGPORT=54322 PGPASSWORD=postgres supabase/local/smoke.sh

npx supabase status                 # prints the anon key and the API URL
```

Then, in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key from `supabase status`>
NEXT_PUBLIC_USE_SUPABASE=1
```

`config.toml` carries one change from the stock file and it is load-bearing:
**the six schemas are added to `[api] schemas`.** This project keeps nothing in
`public`, and PostgREST cannot see a table it has not been told about — with the
default, every call returns "relation does not exist" for a reason that looks
nothing like the cause. The same setting exists on a hosted project under
Settings → API → Exposed schemas.

> **Not verified in the session that wrote this.** `supabase start` needs to
> pull its images from Docker Hub and ghcr, and this session's egress policy
> answers 403 for both, so the stack has never actually been up here. The
> migrations, the views, the seams and all four smoke files are proved against a
> throwaway Postgres 16; what is *unproved* is the GoTrue half — the
> provisioning trigger firing on a real sign-up, and RLS applying through a real
> JWT rather than a session GUC. Expect to debug that on first run rather than
> trusting this block.
>
> What *was* checked here, with a hand-built GoTrue-shaped `auth` schema: the
> whole ladder applies unchanged when `auth` already exists and is somebody
> else's, and `rebuild.sh` leaves it alone.

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

### The three things `rebuild.sh` refuses

It opens with six `drop schema … cascade`, and the shim adds a seventh on
`auth`. Against the wrong database any of them is unrecoverable, and the wrong
database is one environment variable away. So it refuses:

| | |
|---|---|
| a non-local `PGHOST` | `db.xxx.supabase.co` is not a mistake worth allowing at 7pm. A real project is reached one reviewed migration at a time, never by a script whose first act is to drop six schemas |
| running the shim where Supabase is real | `supabase_auth_admin` existing means GoTrue owns `auth` and it holds the passwords. The shim would drop it and every account with it. It is skipped, and the schema is left untouched |
| wiping a database with accounts in it | `auth.users` non-empty means somebody is using this. `REBUILD_OVER_ACCOUNTS=1` says otherwise, out loud |

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
