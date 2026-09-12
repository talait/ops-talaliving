-- 0001_core_types.sql — the schemas, and every enum used across them.
--
-- Enums, not text with a CHECK, for one reason: a value that does not exist
-- must fail at the point somebody writes it, in the database, not in whichever
-- service happened to validate it. The status ladders in this system are the
-- part `john-lau` got wrong most expensively (D6), and a ladder that lives in
-- three places has three versions.
--
-- The names here are the names in `src/services/*/contracts.ts`, verbatim.
-- Phase 2 regenerates those files from this schema (`supabase gen types`), so
-- a rename here is a compile error in the frontend — which is the intent.

-- Case-insensitive email: two people signing in as `Budi@` and `budi@` are one
-- person, and finding that out through a duplicate payslip is expensive.
create extension if not exists citext;

-- ── The names, and why they all start `ops_` ──────────────────────────────
--
-- These were `core`, `procure`, `acct`, `hr`, `prod`, `inv` until 2026-09-13.
-- The Supabase project this ladder is going into **already runs the old
-- system**, and the old system already has a `core` schema. `create schema if
-- not exists core` would then quietly succeed by doing nothing, and every
-- `create table core.…` after it would put this system's tables **inside the
-- live one** — inheriting its grants, its policies and its RLS settings, and
-- mixing two systems in one namespace with no error anywhere (D265).
--
-- The `search_path` on the security-definer functions was the sharper edge of
-- the same problem: `set search_path = core` would have resolved to the old
-- system's schema, so `has_permission()` would have been reading somebody
-- else's tables while looking entirely correct.
--
-- The owner's instruction is to leave the old schema alone, so nothing here
-- touches it — and the rename is what makes that true by construction rather
-- than by care. A prefix cannot collide by accident, and a guard is cheaper
-- than remembering.

-- Refuse rather than merge. If one of these names is somehow taken and has
-- tables in it, this migration stops here: a schema that already holds
-- somebody else's tables is not ours to create into (D265).
do $$
declare
  occupied text;
begin
  select string_agg(distinct n.nspname, ', ')
    into occupied
  from pg_namespace n
  join pg_class c on c.relnamespace = n.oid and c.relkind in ('r', 'v', 'm')
  where n.nspname in ('ops_core','ops_procure','ops_acct','ops_hr','ops_prod','ops_inv');

  if occupied is not null then
    raise exception
      'Schema(s) % already contain tables. This ladder creates its own schemas and never writes into an existing one — check what is there before going further.',
      occupied;
  end if;
end $$;

create schema if not exists ops_core;     -- identity, audit, numbering, files
create schema if not exists ops_procure;  -- reference data, PR chain, PO
create schema if not exists ops_acct;     -- accounts, ledger, allocations, calendar
create schema if not exists ops_hr;       -- people, taps, marks, overtime, payroll
create schema if not exists ops_prod;     -- products, BOM, work orders, progress
create schema if not exists ops_inv;      -- timber: logs and boards

-- ── access ────────────────────────────────────────────────────────────────
-- Two separate things, never fused (D24): a module grant says which screens
-- open, an authority says which decisions you may take.
create type ops_core.module_t as enum (
  'dashboard','hrd','payroll','procurement','inventory','accounting',
  'marketing','project','production','it','settings');

create type ops_core.module_level_t as enum ('read','write','admin');

create type ops_core.authority_t as enum (
  'approve_goods','approve_funds','approve_overtime','post_ledger','resolve_inbox');

-- ── documents and evidence ────────────────────────────────────────────────
create type ops_core.doc_kind_t as enum (
  'nota','transfer_proof','goods_photo','delivery_note','purchase_order',
  'quotation','invoice','surat_jalan','surat_dokter','surat_lembur',
  'gambar_kerja','gambar_jadi','other');

create type ops_core.link_entity_t as enum (
  'pr_line','transaction','receipt','purchase_order','payment_round',
  'overtime_sheet','day_mark','work_order','product','log_purchase','project');

-- ── procurement ───────────────────────────────────────────────────────────
create type ops_procure.line_status_t as enum (
  'REQUESTED','APPROVED','APPROVED_UNPAID','PAID','PAID_UNAPPROVED',
  'PARTIAL','COMPLETE','REJECTED','HOLD','REMOVED');

create type ops_procure.approval_step_t as enum ('GOODS','FUNDS');
create type ops_procure.channel_t as enum ('app','chat','meeting');
create type ops_procure.round_status_t as enum ('OPEN','APPROVED','TRANSFERRED','CLOSED');
create type ops_procure.po_status_t as enum ('DRAFT','ISSUED','PARTIAL','CLOSED','CANCELLED');
create type ops_procure.receipt_condition_t as enum ('GOOD','DAMAGED','SHORT','WRONG_ITEM');
create type ops_procure.receipt_status_t as enum ('REPORTED','CONFIRMED','DISPUTED');
create type ops_procure.item_kind_t as enum ('material','consumable','service','asset');
create type ops_procure.due_rule_t as enum ('on_issue','on_delivery','days_after_delivery','fixed_date');

-- ── accounting ────────────────────────────────────────────────────────────
create type ops_acct.direction_t as enum ('in','out');
create type ops_acct.trx_status_t as enum ('DRAFT','POSTED','VOID','INCOMPLETE');
create type ops_acct.alloc_method_t as enum ('line','order','round','manual');
create type ops_acct.inbox_origin_t as enum ('upload','chat','email','bank');
create type ops_acct.inbox_status_t as enum ('PENDING','CONFIRMED','ATTACHED','REJECTED','NOTED');
create type ops_acct.cash_frequency_t as enum ('weekly','monthly','one_off');

-- ── HR ────────────────────────────────────────────────────────────────────
create type ops_hr.pay_basis_t as enum ('monthly','daily','hourly');
create type ops_hr.scan_source_t as enum ('import','manual');
create type ops_hr.day_mark_t as enum ('holiday','half_day','absent','sick','leave','permit');
create type ops_hr.overtime_kind_t as enum ('production','staff');
create type ops_hr.payroll_status_t as enum ('DRAFT','APPROVED','PAID');
-- What a person adds to or takes off a payslip by hand (D155). The system
-- computes none of these: it does not know what a minute of lateness costs
-- here (Q41), and a plausible invented number is a wage dispute.
create type ops_hr.adjustment_kind_t as enum (
  'late','sp','carry_over','advance','bonus','other');

-- ── production and inventory ──────────────────────────────────────────────
create type ops_prod.work_order_status_t as enum ('OPEN','IN_PROGRESS','DONE','CANCELLED');
create type ops_inv.log_measure_t as enum ('round','square');
