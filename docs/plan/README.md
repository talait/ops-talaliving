# Development Plan — ops v2

**The living document.** Every session reads this file first and updates it
last. If a milestone moved and this file did not, the work is not finished.

Started 2026-09-10. Direction changed the same day — see "How we build" below.

Language: English, because this is the document the owner and Claude work
from. **Domain vocabulary stays verbatim** — status strings, id formats,
account spellings and Indonesian terms are copied exactly from
`00-context.md`. They are data, not prose; translating them breaks things.

---

## How we build: frontend first, demo data, deployed

**Phase 1 (now, D1–D14): the whole workflow as a working frontend, on demo
data, live on Vercel.**

No database. No Supabase project. No backend. Every screen is real, every
button works, every state transition happens — against demo data that lives
in the browser. The URL is shareable on day one and updates on every push.

**Why this order.** The stated problem is that the business rules and
requirements were never specified up front. You cannot specify them in the
abstract, and you cannot discover them from a schema. You discover them by
walking the workflow and finding the place where the screen cannot answer a
question. So: build the workflow, walk it, write down what it teaches, and
only then commit to a schema.

The consequence that matters: **the schema stays free.** Nothing is migrated,
nothing is seeded, nothing has to be backfilled when we learn on day nine
that an approval needs a threshold. Changing the demo data is editing a
TypeScript file.

**Phase 2 (after Phase 1 is walked and signed off): the real backend.**
The database design in `02-database.md` and the API design in `03-api.md` are
already written, and Phase 1 is built **against those contracts**. The demo
data layer implements the same function signatures, the same response
envelope, and the same refusal codes the real API will return. Swapping it is
changing one module — not rewriting screens.

---

## Milestone board

Status: `TODO` · `WIP` · `DONE` · `BLOCKED` · `PARKED`
Update the row, the date, and the note **in the same commit** as the work.

### Phase 1 — the workflow, on demo data, on Vercel

| # | Milestone | Day | Status | Updated | Note |
|---|---|---|---|---|---|
| M0 | Plan and design documents | D1 | DONE | 2026-09-10 | this document set |
| M1 | Demo data layer + contracts | D1 | DONE | 2026-09-11 | deployed. Preview builds on every push to this branch |
| M2 | Demo session: multi-module grants + four authorities | D2 | DONE | 2026-09-11 | grant picker; menu filtering verified in a browser |
| M3 | Reference data: vendors, items, projects | D3 | DONE | 2026-09-11 | curation, merge, two-price model; verified in a browser |
| M4 | Requests board: line-first, four meeting states, evidence | D4 | DONE | 2026-09-11 | redefined per owner — line is the unit (D48) |
| M4b | Approved-against-paid: variance, explanation, pay-from-line | D4 | DONE | 2026-09-11 | D53–D57. Posting a payment from a line writes the ledger row (D32 delivered early) |
| M5 | PR: approval — decided on the meeting board, trail on the line | D5 | DONE | 2026-09-11 | D74. Checkbox + reducible qty and amount + instructions/remark + trail + un-approve |
| M5b | Approval asked for and answered in Google Chat | D5 | DONE | 2026-09-11 | D69–D72. Sent as a batch with its totals; the identity on the record is the approver's, not the meeting laptop's. `/demo/chat` stands in for the signed webhook |
| M5c | Meeting board: decide, fund, add on the spot | D5 | DONE | 2026-09-11 | `/procurement/meeting` (D73, D74). The transfer into BCA 271 is the number it exists for |
| M6 | Payment rounds: sync, approve, transfer, close | D6 | DONE · PARKED | 2026-09-11 | `/procurement/rounds`. Funding needs proof (D80) and comes two ways (D81). A funded round still pays nobody — proved on screen (A10). **Parked (D105)** — kept and working, no further work; the meeting board and the tracker already answer what it was for |
| M7 | **Checkpoint: walk Flow B on a phone, with the team** | D7 | DONE | 2026-09-11 | walked with the owner across this session; the corrections it produced are D64–D83 and F15–F22 |
| M8 | Ledger: list, drawer, attach from a row, void, complete | D8 | DONE | 2026-09-11 | `/accounting/ledger` + cash position, pagination, posting with evidence and detail (D84–D89) |
| M9 | Evidence attached from the record — the main road | D9 | DONE | 2026-09-11 | one `<EvidenceStrip>` in both drawers, *also covers*, the money-to-document path, camera capture. The documents browser is parked (D93, restated by the owner in D105) |
| M10 | The exception inbox: bought first, approved later | D10 | DONE | 2026-09-11 | `/accounting/verifikasi`, five roads, nothing discarded. Reject is the road that never reaches the ledger (D94) |
| M11 | Purchase tracker: obligations across every vendor, two axes per supplier, receiving with both documents | D11 | DONE | 2026-09-11 | `/procurement/tracker` — total obligations at the top, settled vendors split off (D102), a full-width page per supplier (D103) with orders, payments, deliveries and *billable now* (D97–D99). Orders placed from here (D100); a delivery needs photo **and** tanda terima, receiver and QC (D101) |
| M12a | Liquidation: one transfer in, and where it went | D12 | DONE | 2026-09-11 | `/accounting/liquidation` — per transfer, not per month (D106). Cashflow dropped: the ledger already is it (D108) |
| M12b | Payment calendar: 12 months, projected against actual, with due dates | D12 | DONE | 2026-09-11 | `/accounting/calendar` — one estimate per line with the day it is due (D109), *not in the plan* reconciles it to the ledger (D111), and the verdict names the month the money runs out |
| M12c | Calendar: weekly / monthly / one-off, and a month opened day by day | D12 | DONE | 2026-09-11 | three shapes per line, `amount` per occurrence (D113); a month expands into its dated movements with the first day it goes under and the lowest point (D115). Counting paydays moved the failure from December to **November** |
| M13 | Polish: phone, empty states, refusals, demo reset, guided tour | D13 | DONE | 2026-09-11 | every screen checked at 390px (no horizontal scroll anywhere, drawers full-screen with a pinned action bar); every table carries an empty state that says what to do; the guided walk is `?tour=flow-b` (D117); the dashboard now reads the demo store instead of the shell's sample data (D118) |
| M17 | HRD: employees, biometric attendance, overtime, payroll and payslips | — | DONE | 2026-09-11 | `hr` is a sixth service (D136). A day with one stamp is worth nothing (D137), overtime is claimed and approved rather than inferred (D138), a run cannot be approved over open days (D139), and payroll computes **gross** and says so — deductions are Q30–Q32 |
| M16 | Receiving as report + confirmation; PO confirmation, PDF to the vendor, expected delivery | — | DONE | 2026-09-11 | goods arrive at night, so a report needs only a photo and only a confirmation counts (D131). An order is confirmed by leadership before it is sent (D132), leaves as the app's own print view over WhatsApp (D133), and carries the date the vendor promised (D134) |
| M15 | Purchase orders: the module, with terms, amendment and closing | — | DONE | 2026-09-11 | `/procurement/po` was still a placeholder. Now the order-first half of the tracker's question, with the payment schedule and its guard (D128), amendment by supersession (D129) and a close that refuses politely (D130) |
| M14 | **Walkthrough + findings → the schema we actually need** | D14 | DONE | 2026-09-11 | `checkpoints/2026-09-23.md` is the walk; `02-database.md` gains **What the walk changed** — fourteen schema changes a working screen forced, none of them visible on D1. Phase 2 proposed below with dates |

**Deployment.** Vercel builds from GitHub directly, not from a developer's
machine, so nothing in this repo has to hold a Vercel credential.

**Vercel's Production Branch is `claude/serene-euler-eq2qef`** (owner, 2026-09-11).
Phase 1's whole output lives on one branch, so pointing production at it beats
merging a half-finished phase into `main` to see it. Every push here now
deploys to production, and the stable project URL always shows the latest work.

Consequences, so nothing is a surprise later:

- `main` deploys nowhere until this is changed back. It still holds the
  original shell, and Phase 1 never merges into it — Phase 2 decides what
  `main` should become.
- Production deployments are public; Deployment Protection only gates previews
  by default. The link can be shared with the team as-is.
- Reversible in one setting, whenever `main` should take over again.

### Phase 2 — the backend (proposed on D14, awaiting the owner's go)

| # | Milestone | Proposed | Status | Note |
|---|---|---|---|---|
| P1 | Supabase project + `core` schema + RLS | Thu 24 Sep | TODO | starts only after M14 is signed off. `core.app_user`, audit with `detail jsonb`, `next_doc_number()`, attachments and the one link table. RLS in the same migration that creates each table (ADR-002) |
| P2 | Identity service, real session | Fri 25 Sep | TODO | Supabase Auth behind the same `identity` contract the demo already uses. The eleven module grants and four authorities become rows, not constants |
| P3 | `procure` schema + procurement service | Mon 28 – Tue 29 Sep | TODO | PR chain, PO with `expected_date` (§1 of the D14 schema), receipts with `qc_by`, the approval-request table carrying the answerer's identity (§4), variances as rows (§5) |
| P4 | `acct` schema + accounting service | Wed 30 Sep – Thu 1 Oct | TODO | ledger with the evidenced-row constraint trigger (§8), allocations against a line **or** an order (§11), the exception inbox's five roads (§7), `transfer_group` (§2), the three calendar tables |
| P5 | The views, one by one, against the demo's numbers | Fri 2 Oct | TODO | `derive.ts` is the specification: every function there becomes a view with the same name, and the demo's figures are the test data. If `v_cash_plan` does not also say *November*, one of the two is wrong |
| P6 | Documents service on Storage | Mon 5 Oct | TODO | signed URLs, the same `attachment_link` road, camera capture unchanged |
| P7 | Import from `john-lau`, one way | Tue 6 – Wed 7 Oct | TODO | vendors, items, projects, open PRs and the ledger. One way, never back. Unclassified types (`EJO`, `PACKING`) carried as-is, never folded into `OTHERS` (Q10) |
| P8 | Cut over and serve at `dev-ops.talaliving.com` | Thu 8 Oct | TODO | Vercel custom domain or the office PC — a Phase 2 decision, deliberately not pre-empted here |

**The ordering rule.** P5 comes *after* both schemas and before the import on
purpose: the views are where Phase 1's real output lives, and checking them
against figures somebody has already read on a screen is the cheapest
verification available to this project. Every other order loses that.

---

## The documents

| File | What it settles | Phase |
|---|---|---|
| `00-context.md` | What we carry over from `john-lau` — the rules that bind, and the eleven things we deliberately do differently | both |
| `01-architecture.md` | Service boundaries, ADRs, what runs where | both |
| `02-database.md` | **Target** schema and ERD. Not built in Phase 1 — it is the shape the demo types are cut to | 2 |
| `03-api.md` | **Target** REST surface. The demo layer implements this contract exactly | both |
| `04-frontend.md` | Design system rules, screen inventory, interaction contract | 1 |
| `05-workplan.md` | Day by day D1–D14, with the exact prompt for each day | 1 |
| `06-decisions.md` | Decision log + open questions, each with a default so nothing blocks | both |
| `07-ways-of-working.md` | Phone-driven workflow, session protocol, prompt recipes | both |
| `backlog.md` | What somebody reported while using it, bugs and asks alike — kept out of the milestone board so neither list lies about the other | 1 |
| `findings.md` | **Written as we go.** What each screen taught us about the rules — the input to Phase 2 | 1 |

---

## Ringkasan (ID)

Kita membangun ulang sistem operasi internal Tala Living. **Tahap 1: seluruh
alur kerja dibangun di frontend dulu, memakai data contoh, langsung
di-deploy ke Vercel** — tanpa basis data, tanpa backend. Semua tombol
berfungsi, semua perpindahan status terjadi, tetapi datanya hidup di
peramban.

Alasannya: aturan bisnis memang belum pernah ditulis di awal. Aturan seperti
itu tidak bisa dikarang dari skema — ia ditemukan dengan **menjalani** alur
kerjanya dan melihat di mana layarnya tidak bisa menjawab pertanyaan. Selama
Tahap 1 skema masih bebas berubah; mengubah data contoh cukup menyunting satu
berkas TypeScript.

Tahap 2 (setelah Tahap 1 dijalani dan disetujui): backend sungguhan di
Supabase, memakai rancangan yang sudah ditulis di `02-database.md` dan
`03-api.md`. Tahap 1 dibangun **mengikuti kontrak itu**, jadi menggantinya
berarti mengganti satu modul, bukan menulis ulang layar.

Gaya, komponen, dan interaksi frontend memakai yang sudah ada di repo ini —
tidak didesain ulang. Aturan uang dari `john-lau` dibawa utuh (persetujuan ≠
pembayaran; uang ≠ barang; append-only; peringatan bukan blokir; penolakan
harus terlihat).

---

## House rules for every session

1. Read this file. Do the named milestone. Update the board. Commit.
2. One milestone = one commit or one PR. Reviewable from a phone.
3. **The demo layer implements `03-api.md`.** Same signatures, same envelope,
   same refusal codes. A screen must never reach around it.
4. Never invent a business rule silently. Take the default in
   `06-decisions.md`, write down that you took it, and carry on.
5. **Append what the screen taught you to `findings.md`.** That file is the
   deliverable of Phase 1, as much as the app is.
6. Derived state is derived — computed from the demo store on read, never
   stored as a field that can disagree with it.
7. A refusal is visible: explicit outcome code, a toast the user can read.
   Never a silent success.
