-- 0006_procure_reference.sql — the reference data every other schema points at.
--
-- This is the worked pattern for a domain schema: uncurated rows are allowed
-- in, curation is a flag rather than a gate, a merge is a pointer and never a
-- delete, and **nothing is referenced by uuid across a service seam** — the
-- code is the reference (ADR-004).

create table procure.vendors (
  id                     uuid primary key default gen_random_uuid(),
  -- What every other service quotes. Stable for the life of the vendor.
  code                   text not null unique,
  name                   text not null,
  -- The spellings this vendor arrives under in the wild. Searching has to find
  -- "CV. Sumber Kayu" when somebody typed "sumberkayu" (D31).
  aka                    text[] not null default '{}',
  -- A merge is a pointer. The old row stays, so a PO raised against it in
  -- March still resolves (A5, D33).
  merged_into            uuid references procure.vendors(id),
  -- Curated means somebody checked the name, the bank account and the PIC.
  -- Uncurated rows are still usable: refusing them is how a workshop ends up
  -- buying off-system (D30).
  is_curated             boolean not null default false,
  phone                  text,
  address                text,
  pic_name               text,
  pic_phone              text,
  bank_account           text,
  bank_account_secondary text,
  npwp                   text,
  supplied_categories    text[] not null default '{}',
  created_by             uuid references core.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint merge_not_self check (merged_into is null or merged_into <> id)
);

create table procure.uom (
  code       text primary key,
  name       text not null,
  dimension  text not null
);

-- Two units are related by a factor, and sometimes by a **yield** as well —
-- a cubic metre of log is not a cubic metre of board (D153, F46). Keeping the
-- two apart is what stops a conversion quietly pricing waste as product.
create table procure.uom_conversions (
  id          uuid primary key default gen_random_uuid(),
  from_uom    text not null references procure.uom(code),
  to_uom      text not null references procure.uom(code),
  factor      numeric not null check (factor > 0),
  yield_ratio numeric check (yield_ratio > 0 and yield_ratio <= 1),
  note        text,
  unique (from_uom, to_uom)
);

create table procure.item_categories (
  code        text primary key,
  parent_code text references procure.item_categories(code),
  name        text not null
);

create table procure.items (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  aka               text[] not null default '{}',
  merged_into       uuid references procure.items(id),
  category_code     text not null references procure.item_categories(code),
  base_uom          text not null references procure.uom(code),
  kind              procure.item_kind_t not null default 'material',
  is_curated        boolean not null default false,
  -- The catalogue price, and what was actually paid last. Both nullable: a
  -- price nobody has set is missing, not zero (D149).
  standard_price    numeric,
  last_price        numeric,
  last_vendor_id    uuid references procure.vendors(id),
  last_purchased_at timestamptz,
  created_by        uuid references core.users(id),
  created_at        timestamptz not null default now(),
  constraint item_merge_not_self check (merged_into is null or merged_into <> id)
);

-- Searching has to find the item under the name somebody actually typed. The
-- config is cast to `regconfig` so the expression is immutable — with the
-- bare literal Postgres treats it as stable and refuses to index it, which is
-- correct of it: a search config that can change would silently rot the index.
create index items_search_idx on procure.items
  using gin (to_tsvector('simple'::regconfig, name));
-- The alternate spellings are searched as an array containment or an ILIKE on
-- the unnested values; indexing them into the same vector needs a stored
-- column, which is work for the day the catalogue is big enough to need it.
create index items_aka_idx on procure.items using gin (aka);

-- The dimension every service hangs on: procurement buys for it, production
-- makes for it, the ledger spends on it. The **code** is the part that must
-- never move (D149).
create table procure.projects (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  is_active      boolean not null default true,
  client_name    text,
  location       text,
  pic            text,
  started_on     date,
  target_date    date,
  contract_value numeric,
  note           text,
  created_by     uuid references core.users(id),
  created_at     timestamptz not null default now()
);

-- What the customer actually ordered. This is what turns a project from a
-- label spending gets tagged with into an order (D150).
create table procure.project_lines (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references procure.projects(id) on delete restrict,
  line_no      int not null,
  -- Points at `prod.products.product_code` by code, across the seam (ADR-004).
  product_code text,
  description  text not null,
  qty          numeric not null check (qty > 0),
  uom          text not null references procure.uom(code),
  unit_price   numeric,
  note         text,
  created_at   timestamptz not null default now(),
  unique (project_id, line_no)
);

alter table procure.vendors          enable row level security;
alter table procure.uom              enable row level security;
alter table procure.uom_conversions  enable row level security;
alter table procure.item_categories  enable row level security;
alter table procure.items            enable row level security;
alter table procure.projects         enable row level security;
alter table procure.project_lines    enable row level security;

-- The pattern, repeated for every domain table: read on the module's read
-- permission, insert and update on its create/update permission, **no delete
-- policy and no delete grant** (A2).
create policy vendors_read   on procure.vendors        for select to authenticated using (core.has_permission('procurement.read'));
create policy uom_read       on procure.uom            for select to authenticated using (true);
create policy uomconv_read   on procure.uom_conversions for select to authenticated using (true);
create policy cats_read      on procure.item_categories for select to authenticated using (true);
create policy items_read     on procure.items          for select to authenticated using (core.has_permission('procurement.read'));
-- Projects are read by everybody who can open any module that spends against
-- them; hiding the list would make every "which job is this for?" unanswerable.
create policy projects_read  on procure.projects       for select to authenticated using (true);
create policy plines_read    on procure.project_lines  for select to authenticated using (true);

create policy vendors_new    on procure.vendors        for insert to authenticated with check (core.has_permission('procurement.create'));
create policy vendors_edit   on procure.vendors        for update to authenticated using (core.has_permission('procurement.update')) with check (core.has_permission('procurement.update'));
create policy items_new      on procure.items          for insert to authenticated with check (core.has_permission('procurement.create'));
create policy items_edit     on procure.items          for update to authenticated using (core.has_permission('procurement.update')) with check (core.has_permission('procurement.update'));
create policy projects_new   on procure.projects       for insert to authenticated with check (core.has_permission('project.create'));
create policy projects_edit  on procure.projects       for update to authenticated using (core.has_permission('project.update')) with check (core.has_permission('project.update'));
create policy plines_write   on procure.project_lines  for all    to authenticated using (core.has_permission('project.update')) with check (core.has_permission('project.update'));

grant usage on schema procure to authenticated;
grant select on all tables in schema procure to authenticated;
grant insert, update on procure.vendors, procure.items, procure.projects, procure.project_lines to authenticated;
