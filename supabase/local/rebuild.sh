#!/usr/bin/env bash
# Apply the whole migration ladder to a throwaway Postgres, from nothing.
#
# Not a deployment script — it exists so a change to a migration can be proved
# to apply before anybody points it at Supabase. Everything is dropped first,
# because a migration that only works against yesterday's database is a
# migration that will fail on a fresh one.
#
#   supabase/local/rebuild.sh               # defaults to the scratch cluster
#   PGHOST=/tmp PGPORT=5433 supabase/local/rebuild.sh
set -euo pipefail

HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
HERE="$(cd "$(dirname "$0")" && pwd)"

psql -h "$HOST" -p "$PORT" -U "$USER" -q -c "
  drop schema if exists inv cascade;
  drop schema if exists prod cascade;
  drop schema if exists hr cascade;
  drop schema if exists acct cascade;
  drop schema if exists procure cascade;
  drop schema if exists core cascade;" >/dev/null

psql -h "$HOST" -p "$PORT" -U "$USER" -q -v ON_ERROR_STOP=1 -f "$HERE/00_shim.sql" 2>&1 | grep -v NOTICE || true

# A migration that fails stops the run. An earlier version of this script piped
# psql through grep and reported "ok" over the top of an ERROR — exactly the
# kind of green tick this project exists to distrust.
for f in "$HERE"/../migrations/*.sql; do
  printf '%-44s' "$(basename "$f")"
  if out=$(psql -h "$HOST" -p "$PORT" -U "$USER" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok"
  else
    echo "FAILED"
    echo "$out" | grep -v NOTICE
    exit 1
  fi
done

psql -h "$HOST" -p "$PORT" -U "$USER" -Atc "
  select table_schema || ': ' || count(*)
    from information_schema.tables
   where table_schema in ('core','procure','acct','hr','prod','inv')
   group by table_schema order by 1;"
