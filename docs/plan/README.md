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
| M5 | PR: approval on the board itself, approval trail | D5 | DONE | 2026-09-11 | merged into `/procurement/pr` (D67). Checkbox + reducible qty and amount + instructions/remark + trail + un-approve |
| M5b | Approval asked for and answered in Google Chat | D5 | DONE | 2026-09-11 | D69. The identity on the record is the approver's, not the meeting laptop's. `/demo/chat` stands in for the signed webhook |
| M6 | Payment rounds: sync, approve, transfer, close | D6 | TODO | — | |
| M7 | **Checkpoint: walk Flow B on a phone, with the team** | D7 | TODO | — | week-1 review |
| M8 | Ledger: list, drawer, attach from a row, void, complete | D8 | TODO | — | |
| M9 | Evidence attached from the record — the main road | D9 | TODO | — | ADR-010 |
| M10 | The exception inbox: bought first, approved later | D10 | TODO | — | should stay small |
| M11 | PO: two axes, exposure; receiving with photo | D11 | TODO | — | |
| M12 | Cashflow + **liquidation report** + dashboard on demo data | D12 | TODO | — | meeting board landed early, in M4. Liquidation: money in vs where it went (owner, 2026-09-11) |
| M13 | Polish: phone, empty states, refusals, demo reset | D13 | TODO | — | |
| M14 | **Walkthrough + findings → the schema we actually need** | D14 | TODO | — | the payoff |

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

### Phase 2 — the backend (not scheduled yet)

| # | Milestone | Status | Note |
|---|---|---|---|
| P1 | Supabase project + `core` schema + RLS | TODO | starts only after M14 is signed off |
| P2 | Identity service, real session | TODO | |
| P3 | Procurement service | TODO | |
| P4 | Accounting service | TODO | |
| P5 | Documents service on Storage | TODO | |
| P6 | Import from `john-lau`, one way | TODO | |
| P7 | Serve at `dev-ops.talaliving.com` | TODO | Vercel custom domain, or the office PC |

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
