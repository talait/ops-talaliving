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

create schema if not exists core;     -- identity, audit, numbering, files
create schema if not exists procure;  -- reference data, PR chain, PO
create schema if not exists acct;     -- accounts, ledger, allocations, calendar
create schema if not exists hr;       -- people, taps, marks, overtime, payroll
create schema if not exists prod;     -- products, BOM, work orders, progress
create schema if not exists inv;      -- timber: logs and boards

-- ── access ────────────────────────────────────────────────────────────────
-- Two separate things, never fused (D24): a module grant says which screens
-- open, an authority says which decisions you may take.
create type core.module_t as enum (
  'dashboard','hrd','payroll','procurement','inventory','accounting',
  'marketing','project','production','it','settings');

create type core.module_level_t as enum ('read','write','admin');

create type core.authority_t as enum (
  'approve_goods','approve_funds','approve_overtime','post_ledger','resolve_inbox');

-- ── documents and evidence ────────────────────────────────────────────────
create type core.doc_kind_t as enum (
  'nota','transfer_proof','goods_photo','delivery_note','purchase_order',
  'quotation','invoice','surat_jalan','surat_dokter','surat_lembur',
  'gambar_kerja','gambar_jadi','other');

create type core.link_entity_t as enum (
  'pr_line','transaction','receipt','purchase_order','payment_round',
  'overtime_sheet','day_mark','work_order','product','log_purchase','project');

-- ── procurement ───────────────────────────────────────────────────────────
create type procure.line_status_t as enum (
  'REQUESTED','APPROVED','APPROVED_UNPAID','PAID','PAID_UNAPPROVED',
  'PARTIAL','COMPLETE','REJECTED','HOLD','REMOVED');

create type procure.approval_step_t as enum ('GOODS','FUNDS');
create type procure.channel_t as enum ('app','chat','meeting');
create type procure.round_status_t as enum ('OPEN','APPROVED','TRANSFERRED','CLOSED');
create type procure.po_status_t as enum ('DRAFT','ISSUED','PARTIAL','CLOSED','CANCELLED');
create type procure.receipt_condition_t as enum ('GOOD','DAMAGED','SHORT','WRONG_ITEM');
create type procure.receipt_status_t as enum ('REPORTED','CONFIRMED','DISPUTED');
create type procure.item_kind_t as enum ('material','consumable','service','asset');
create type procure.due_rule_t as enum ('on_issue','on_delivery','days_after_delivery','fixed_date');

-- ── accounting ────────────────────────────────────────────────────────────
create type acct.direction_t as enum ('in','out');
create type acct.trx_status_t as enum ('DRAFT','POSTED','VOID','INCOMPLETE');
create type acct.alloc_method_t as enum ('line','order','round','manual');
create type acct.inbox_origin_t as enum ('upload','chat','email','bank');
create type acct.inbox_status_t as enum ('PENDING','CONFIRMED','ATTACHED','REJECTED','NOTED');
create type acct.cash_frequency_t as enum ('weekly','monthly','one_off');

-- ── HR ────────────────────────────────────────────────────────────────────
create type hr.pay_basis_t as enum ('monthly','daily','hourly');
create type hr.scan_source_t as enum ('import','manual');
create type hr.day_mark_t as enum ('holiday','half_day','absent','sick','leave','permit');
create type hr.overtime_kind_t as enum ('production','staff');
create type hr.payroll_status_t as enum ('DRAFT','APPROVED','PAID');
-- What a person adds to or takes off a payslip by hand (D155). The system
-- computes none of these: it does not know what a minute of lateness costs
-- here (Q41), and a plausible invented number is a wage dispute.
create type hr.adjustment_kind_t as enum (
  'late','sp','carry_over','advance','bonus','other');

-- ── production and inventory ──────────────────────────────────────────────
create type prod.work_order_status_t as enum ('OPEN','IN_PROGRESS','DONE','CANCELLED');
create type inv.log_measure_t as enum ('round','square');
