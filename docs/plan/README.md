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
| M2 | Demo session: multi-module grants + named authorities | D2 | DONE | 2026-09-11 | grant picker; menu filtering verified in a browser |
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
| M32 | Package: the agent pipeline, and the commission that follows | — | DONE | 2026-09-12 | owner's own tracker, rebuilt as the ninth service (D183). Three agents per property approached in order, with the **seven-day move-on rule derived** rather than maintained — the demo has an agent nine days silent the sheet would still call *MSG SENT*. The funnel counts properties by their furthest agent. An agent who agrees is onboarded with a rate, and a DEAL without one is refused (D185); commission is computed only from contracts that exist and is paid through the ledger, not here (D186). Marketing's three placeholder screens are gone |
| M31 | Rekening koran: how the leadership accounts reach the ledger | — | DONE | 2026-09-11 | owner: the statement is uploaded because 064 and USD 081 are held by leadership and not shared. So importing one **creates** ledger rows rather than ticking them off (D180), a dollar line waits for a typed rate (D181), and the file has to balance against the two figures printed on its header before anything is booked (D182). The demo file catches the two movements nobody in the office could see: a bank charge and a payment made straight to a timber vendor |
| M30 | Desain: the drafters' queue, and the revision the floor is cutting from | — | DONE | 2026-09-11 | owner: the module must make the drafting team's work easier (D179). Blocked first — a question waiting ten days on a client; then the dangerous case, a revision uploaded and never released while the workshop still cuts from the older one; then what is undrawn, computed from the orders themselves. Uploading and releasing are two acts, and a release is **refused** while a question is open. Building it also caught a finished June project making a released drawing read *lewat 74 hari* (F51) |
| M29 | Berkas 201, and cuti asked for before it is marked | — | DONE | 2026-09-11 | owner: *cukup di berkas 201 dan cuti/izin, compliance skip*. The personnel file becomes a checklist that names what is missing and warns what expires — a forklift licence that lapsed in July and two PKWT contracts inside sixty days, none of which anything could see before (D177). Leave gains the half that happens first: asked, decided, and the approval is what writes the timesheet marks, skipping days that already carry one. Over-entitlement is shown before the decision, never refused (D178). Compliance is dropped (D165) |
| M28 | Pay rules: the policy, as dated data | — | DONE | 2026-09-11 | owner: *skema gaji dan aturan harus customizable*. Four situations — upah harian, upah per jam, lembur, undertime — each a number somebody can change under IT rather than a line of code (D173). Overtime follows the national ladder (1,5× / 2×, rest day 2×/3×/4×, monthly ÷ 173), which **answers Q31**; the form's own GAJI still wins where it speaks. Changes write a new dated version, are refused into the past or inside an existing run, and cannot be saved until the preview shows what they do to each person (D175). Undertime ships **off** (D174) |
| M27 | Stock: bahan & hardware, counted from their movements | — | DONE | 2026-09-11 | owner: *bangun inventory/stock, kategorikan tiap item dengan baik*. The catalogue is re-filed two levels deep and **counting is a property of the category** (D169); on-hand is the sum of the moves, never stored (D170); confirming a delivery puts the goods on the rack, which closes the oldest gap in the system. An opname stores the **difference** with a reason and a location (D171), and stock that arrived unpriced is counted but kept out of the valuation and named (D172). Open: what an issue costs — FIFO, average or standard (Q43) |
| M26 | Pagination everywhere, and a payroll week you can slide | — | DONE | 2026-09-11 | owner, twice over. Every table pages at 25 rows with the count printed, and the lists that are not tables — the attendance grid, lembur sheets, timber loads, the verification queue and its history — page the same way (D157). `/hrd/payroll/minggu` walks Senin→Minggu with ‹ ›: a week with no run still has figures, because nothing is stored (D158) |
| M25 | The company's own form lembur, and a payslip worth printing | — | DONE | 2026-09-11 | owner: *kita upload, sistem baca*. The real *FORM LEMBUR PT TALAHOME* is imported against a sheet — names matched, unknowns listed back and never created, **GAJI paid as written** (D154). The payslip becomes a card: as many per A4 as measurably fit, with the owner's own weekly recap (masuk · pulang · jam · lembur) and every hand-typed potongan printed with its sentence (D155, D156). Where the grid and the total disagree — a day nobody has read, overtime nobody approved — the slip says why rather than leaving it to be discovered (F48) |
| M24 | Timber: log → papan → kubikasi → harga per m³, per vendor | — | DONE | 2026-09-11 | the eighth service (D153). Logs measured stick by stick, boards measured and counted, and the number that decides a vendor is **rupiah per cubic metre of board**: Kayu Manis is Rp 15,5 juta per log metre against Sumber Kayu's Rp 18,2 juta, and Rp 34,6 juta against Rp 29,6 juta once sawn. Yield only over the logs actually cut; vendors compared per species. Also: any PR line may name the job it is for (D152) |
| M23 | BOM → PR, and biaya produksi: proyeksi vs aktual | — | DONE | 2026-09-11 | a bill of material becomes a draft purchase request whose lines carry the **SPK number** — which is the one column that makes the end-of-project question answerable: did this cost more or less than we thought. Materials against materials; the ledger's wider project total is shown apart rather than subtracted (D151) |
| M22 | Gambar kerja, gambar jadi, ukuran — and the items on an order | — | DONE | 2026-09-11 | owner: every item must carry a working drawing, a finished picture and a size. Taken literally that means the system has to be able to say which are **missing**, so size is three numbers rather than a sentence and the catalogue names the gaps. Orders gain lines — item and quantity — read beside *dibuat* and *selesai* from the floor (D150) |
| M21 | Master data: projects, products, bills of material | — | DONE | 2026-09-11 | a project gains the fields that make it an order rather than a tag — client, PIC, dates, contract value — with the **code fixed** because every service references it as text. Products are their own table, not `procure.items`: those are bought, these are made (D149). A BOM carries susut apart from quantity and prices itself from the catalogue on read, marking what it cannot price instead of counting it as zero. Open: BOM versioning (Q36), where a quotation lives (Q37), labour cost (Q38) |
| M20 | Two kinds of lembur sheet, and the production board they feed | — | DONE | 2026-09-11 | only **production** overtime needs leadership — one sheet, many names, item · proses · berapa against each (D146). A staff session is one report and HRD's decision, paid by default. Signing a production sheet **posts the work to the production board** (D147), which is a seventh service: work orders with seven stages, deadlines, and late-first ordering (D148). Open: are these the right stages (Q35) |
| M19 | What a marked day is worth, and two signatures on every overtime hour | — | DONE | 2026-09-11 | answering the owner on Q33 and Q34. *Sakit* is paid with the surat dokter attached, *cuti* out of a per-person balance counted from the marks, everything else recorded and unpaid (D144). Overtime needs HRD **and** leadership, and leadership's approval is refused until the surat lembur is linked — a fifth authority, `approve_overtime` (D145) |
| M18 | Timesheet: the reader's own file, the six taps of a day, and what HRD says about it | — | DONE | 2026-09-11 | built against the owner's real export — 981 taps, 35 people, **48 of 227 days the rule cannot read** (F40). Attendance is stored as taps, not days (D141); HRD marks a day for what it was and marking never touches a tap (D142); an import reports an unknown machine number and creates nobody (D143). Open: which marked days are paid (Q33), who may approve overtime (Q34) |
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

### Phase 2 — the backend (kit written 2026-09-11 · `docs/plan/phase-2/`)

The D14 proposal (P1–P8, dated to late September) is **superseded**: it was
written before HR, production, inventory and master data existed, and its
ordering by layer has been replaced by ordering per schema. The brief the
build session works from is `docs/plan/phase-2/` — readiness, the ladder, the
API inventory and the estimate.

| # | Milestone | Sessions | Status | Note |
|---|---|---|---|---|
| B0 | Foundation: schemas, enums, identity, audit, numbering, evidence | 0,5 | **DONE** | `supabase/migrations/0001–0006`, applied from nothing against Postgres 16. `rebuild.sh` re-applies the ladder; `smoke.sql` proves the access model **refuses** — HRD cannot approve funds, `write` is not `admin`, an authority is never implied by a level |
| B1 | The remaining 21 migrations | 3–5 | TODO | procure PR/rounds/PO/receipts · acct ledger/inbox/calendar · hr · prod · inv |
| B2 | Derivations → views | 4–6 | TODO | 2.583 lines of TypeScript. The demo's figures are the test data: if `v_cash_plan` does not also say *November*, one of the two is wrong |
| B3 | Write seams → RPCs | 3–4 | TODO | ~25 functions, each with audit + outbox + refusal + idempotency |
| B4 | `src/lib/api` and the swap, one service at a time | 2–3 | TODO | same signatures, so no screen changes |
| B5 | Supabase Auth and real sessions | 1 | TODO | `actAs` goes; the persona picker becomes dev-only |
| B6 | Storage: bucket, signed URLs, sha256 | 1 | TODO | the evidence road end to end |
| B7 | Smoke + RLS matrix tests | 2 | TODO | one refusal and one derivation per schema |
| B8 | Data migration from Sheets + `john-lau` | 2–8 | BLOCKED | the only open-ended item: nobody has yet written down what must come across and in what state |
| B9 | Parallel run and cutover | 2–3 | TODO | both systems in use, figures reconciled daily |

**The ordering rule.** Per **schema**, not per layer: finish `procure` from
table to view to swapped screen before starting `acct`. A vertical slice
proves the pattern; four horizontal layers prove nothing until the last one
lands. Identity comes first regardless — every refusal elsewhere is theatre
until the database knows who is asking.

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
| `phase-2/` | The build kit: readiness verdict, the migration ladder, the API inventory, the estimate, and the protocol that lets the design session keep running while the backend is built | 2 |

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
