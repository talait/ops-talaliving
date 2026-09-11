-- 0005_core_files.sql — evidence: a file **or a link**, attached from the
-- record it belongs to.
--
-- The main road (ADR-010, D91): somebody opens the PR line or the ledger row
-- and attaches the file *there*, so the link is declared rather than inferred
-- from a filename. Many-to-many from the start — one nota covering four lines
-- is the normal case, not the exception — and every link records **who** said
-- so, which is the column that answers "why is this file on this row".
--
-- A link is first-class evidence (D125): a marketplace page is not a file, and
-- photographing the screen loses the address somebody else can open.

create table core.attachments (
  id                uuid primary key default gen_random_uuid(),
  -- One of these two is set, never both: `storage_path` for an uploaded file,
  -- `url` for a link.
  storage_path      text,
  url               text,
  filename          text not null,
  -- Advisory duplicate detection only. Identical bytes are a warning on the
  -- screen, never a refusal (A6).
  sha256            text,
  mime              text,
  bytes             bigint,
  source            text not null default 'web' check (source in ('web','chat','api','import')),
  uploaded_by       uuid not null references core.users(id),
  uploaded_at       timestamptz not null default now(),
  constraint file_or_link check (
    (storage_path is not null and url is null) or
    (storage_path is null and url is not null))
);

create index attachments_sha_idx on core.attachments (sha256) where sha256 is not null;

create table core.attachment_links (
  id             uuid primary key default gen_random_uuid(),
  attachment_id  uuid not null references core.attachments(id) on delete restrict,
  entity         core.link_entity_t not null,
  -- The public code again, never a uuid (ADR-004): `pr-26-09-11_03`,
  -- `trx-26-09-10_014`. It survives a service being split out.
  entity_no      text not null,
  kind           core.doc_kind_t not null,
  note           text,
  linked_by      uuid not null references core.users(id),
  linked_at      timestamptz not null default now(),
  -- Unlinking is this, never a DELETE (A2, A5): the file stopped belonging to
  -- the row at a moment, and somebody decided that.
  unlinked_at    timestamptz,
  unlinked_by    uuid references core.users(id),
  constraint unlink_has_who check (unlinked_at is null or unlinked_by is not null)
);

-- The same file on the same record twice is a no-op, not a second piece of
-- evidence — but a file unlinked in error may be attached again.
create unique index links_live_idx on core.attachment_links (attachment_id, entity, entity_no, kind)
  where unlinked_at is null;

create index links_entity_idx on core.attachment_links (entity, entity_no);

-- The label a screen prints, kept beside the code it stores. The demo carries
-- these as display strings ("Receipt / Invoice / Nota"); the database stores a
-- code, and this table is what keeps the two from drifting into two
-- vocabularies (see docs/plan/phase-2/01-schema.md).
create table core.doc_kind_labels (
  kind  core.doc_kind_t primary key,
  label text not null
);

insert into core.doc_kind_labels (kind, label) values
  ('nota','Receipt / Invoice / Nota'),
  ('transfer_proof','Payment Proof'),
  ('goods_photo','Receiving Item'),
  ('delivery_note','Delivery Note'),
  ('purchase_order','Purchase Order'),
  ('quotation','Reference Link'),
  ('invoice','Invoice'),
  ('surat_jalan','Surat Jalan'),
  ('surat_dokter','Surat Dokter'),
  ('surat_lembur','Surat Lembur'),
  ('gambar_kerja','Gambar Kerja'),
  ('gambar_jadi','Gambar Jadi'),
  ('other','Others');

alter table core.attachments       enable row level security;
alter table core.attachment_links  enable row level security;
alter table core.doc_kind_labels   enable row level security;

-- Anybody signed in may see that evidence exists and open it; the records it
-- hangs on are what carry the real access rules. Hiding the strip would make
-- every "is this paid for?" question unanswerable without a second screen.
create policy attachments_read on core.attachments for select to authenticated using (true);
create policy links_read       on core.attachment_links for select to authenticated using (true);
create policy kinds_read       on core.doc_kind_labels for select to authenticated using (true);

create policy attachments_write on core.attachments
  for insert to authenticated with check (uploaded_by = auth.uid());

-- A link is declared by the person looking at the record. Unlinking is an
-- update that stamps `unlinked_at`; there is no delete policy and DELETE is
-- not granted (A2, A5).
create policy links_write on core.attachment_links
  for insert to authenticated with check (linked_by = auth.uid());
create policy links_unlink on core.attachment_links
  for update to authenticated
  using (true) with check (unlinked_by = auth.uid());

grant select on core.attachments, core.attachment_links, core.doc_kind_labels to authenticated;
grant insert on core.attachments, core.attachment_links to authenticated;
grant update (unlinked_at, unlinked_by) on core.attachment_links to authenticated;
