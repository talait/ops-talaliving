-- 0003_core_audit.sql — the audit trail, the outbox, and settings.
--
-- Every mutation writes three things in one transaction: the business rows,
-- one audit row, one outbox row. All three or none (03-api.md). The audit row
-- carries **what changed**, field by field — "who touched the ledger this
-- month" is not the question anybody asks; "what happened to *this* row" is,
-- and it is asked while looking at it (D84).

create table core.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references core.users(id),
  service     text not null,
  entity      text not null,
  -- The public code, not the uuid: `pr-26-09-11_03`. A trail nobody can read
  -- is a trail nobody checks (ADR-004).
  entity_no   text,
  action      text not null,
  -- ok · refused · duplicate · noop. A refusal is recorded, not silent (A7).
  outcome     text not null check (outcome in ('ok','refused','duplicate','noop')),
  reason      text,
  before      jsonb,
  after       jsonb,
  detail      jsonb
);

create index audit_entity_idx on core.audit_log (entity, entity_no, at desc);
create index audit_actor_idx  on core.audit_log (actor_id, at desc);

-- The third-party seam (ADR-008). Chat notifications, future webhooks and the
-- reporting feed all read from here; nothing calls an external service inside
-- a business transaction.
create table core.outbox (
  id            bigserial primary key,
  service       text not null,             -- 'procurement'
  event_type    text not null,             -- 'line.approved'
  entity_no     text,
  payload       jsonb not null,
  occurred_at   timestamptz not null default now(),
  delivered_at  timestamptz,
  -- Delivery is a retry loop, and a loop that cannot say why it failed is one
  -- nobody can fix at 7pm on a Friday.
  attempts      int not null default 0,
  last_error    text
);

create index outbox_undelivered_idx on core.outbox (occurred_at) where delivered_at is null;

-- One home for a tolerance, so a number nobody can find is not hard-coded in
-- three services (02-database.md §Settings).
create table core.settings (
  key         text primary key,
  value       jsonb not null,
  note        text not null,
  updated_by  uuid references core.users(id),
  updated_at  timestamptz not null default now()
);

insert into core.settings (key, value, note) values
  ('receipt_tolerance_pct', '2'::jsonb,
   'How far a delivered quantity may differ before the receipt is a variance (F13).'),
  ('late_after_minutes', '480'::jsonb,
   'The office day starts at 08:00; a tap past this is late. What a late minute COSTS is not set here — that is a decision, typed by a person with a reason (D155, Q41).'),
  ('duplicate_window_days', '7'::jsonb,
   'How far back a similar transaction is looked for before the screen warns. Warns, never blocks (A6).');

alter table core.audit_log enable row level security;
alter table core.outbox    enable row level security;
alter table core.settings  enable row level security;

-- Reading the trail is `it.read`; writing it is nobody's — rows arrive through
-- the service functions, which run as definer.
create policy audit_read on core.audit_log
  for select to authenticated using (core.has_permission('it.read'));
create policy outbox_read on core.outbox
  for select to authenticated using (core.has_permission('it.read'));
create policy settings_read on core.settings
  for select to authenticated using (true);
create policy settings_write on core.settings
  for update to authenticated
  using (core.has_permission('settings.update'))
  with check (core.has_permission('settings.update'));

-- The one way a business function writes its trail. Called inside the same
-- transaction as the rows it describes; there is no second road.
create or replace function core.write_audit(
  p_service text, p_entity text, p_entity_no text, p_action text,
  p_outcome text default 'ok', p_reason text default null,
  p_before jsonb default null, p_after jsonb default null, p_detail jsonb default null
) returns bigint
language sql security definer set search_path = core, pg_temp as $$
  insert into core.audit_log (actor_id, service, entity, entity_no, action, outcome, reason, before, after, detail)
  values (auth.uid(), p_service, p_entity, p_entity_no, p_action, p_outcome, p_reason, p_before, p_after, p_detail)
  returning id
$$;

create or replace function core.emit(
  p_service text, p_event_type text, p_entity_no text, p_payload jsonb)
returns bigint
language sql security definer set search_path = core, pg_temp as $$
  insert into core.outbox (service, event_type, entity_no, payload)
  values (p_service, p_event_type, p_entity_no, p_payload)
  returning id
$$;

grant select on core.audit_log, core.outbox, core.settings to authenticated;
