# What it will take, measured against what Phase 1 took

No estimate here is a guess about a team that does not exist. Every figure is
anchored to **what this project actually produced**, in this repository, with
timestamps anybody can check.

---

## What Phase 1 cost

| Measure | Value |
|---|---|
| Elapsed | 2026-09-09 23:16 → 2026-09-11 08:52 ≈ **34 hours** of wall clock |
| Commits | 54 |
| Milestones | 26 (M0–M26) |
| Application code | 35.658 lines TypeScript / TSX |
| Written record | 5.949 lines across `docs/plan/` — 158 decisions, 48 findings |
| Screens | 52 |
| Service functions | 154, across 8 services |
| Fixtures | ~2.900 lines of demo data shaped like the real thing |

Which works out at roughly **one milestone per 1,3 hours**, a milestone being
700–1.500 lines plus its documentation, built and checked in a browser.

That rate is the honest baseline for Phase 2, with one adjustment: **backend
work runs slower per line than screen work.** A policy has to be reasoned
about from the wrong end (what must this refuse?), and there is no browser to
look at — the feedback loop is a smoke test somebody has to write first. The
estimates below assume **0,6× the Phase 1 rate**, and say so.

---

## The work

Sizes are in *sessions*, where a session is the 2–4 focused hours this project
has been running in. The range is not padding: the low end assumes the
transcription stays mechanical, the high end assumes each schema turns up one
argument worth having.

| # | Work | Sessions | Depends on | Notes |
|---|---|---|---|---|
| **B0** | Foundation — done in this session | ✔ 0,5 | — | `0001`–`0006` applied from nothing, rebuild + smoke harness, access model proven to refuse |
| **B1** | Schema: the remaining 21 migrations | **3–5** | B0 | procure PR/rounds/PO/receipts, acct ledger/inbox/calendar, hr, prod, inv. Mechanical where `02-database.md` is already explicit, which is most of it |
| **B2** | Derivations → views | **4–6** | B1 | 2.583 lines of TS logic. The largest item and the one that decides whether the swap is honest |
| **B3** | Write seams → RPCs | **3–4** | B1 | ~25 functions, each with audit + outbox + refusal + idempotency |
| **B4** | `src/lib/api` and the swap | **2–3** | B2, B3 | same signatures; one service at a time behind a flag |
| **B5** | Supabase Auth, sessions, `/masuk` | **1** | B0 | deletes `actAs`; the persona picker becomes a dev-only tool |
| **B6** | Storage: bucket, signed URLs, sha256 | **1** | B0 | the evidence road end to end |
| **B7** | Smoke + RLS matrix tests | **2** | B1–B3 | one refusal and one derivation per schema, as the definition of done demands |
| **B8** | **Data migration from Sheets + `john-lau`** | **2–8** | the owner | see below — the only genuinely open range |
| **B9** | Parallel run and cutover | **2–3** + calendar time | everything | both systems in use, figures reconciled daily |
| | **Total** | **20–33 sessions** | | ≈ **50–85 hours** of build time |

At the pace this project has been running — and with nothing waiting on an
answer — that is **6–10 working days**. Planned against a real week, with the
owner answering questions between sessions and a parallel run that cannot be
compressed, **3–5 weeks** is the number to say out loud.

---

## What actually decides which end of the range

**B8 is the item that moves the total.** Everything else is transcription of a
design that exists; the data migration is the one place where the work depends
on facts nobody has written down yet:

- How many vendors, items and projects are in the sheets, and how many are the
  same thing spelled differently? The system is built to take them uncurated
  (D30) — so the import can be blunt, and curation becomes ordinary work
  afterwards rather than a blocking clean-up.
- How much ledger history comes across? Opening balances plus this financial
  year is a different job from every transaction since 2023.
- Does attendance history come across, or does the biometric machine start
  fresh on cutover day? Payroll needs only the current period; the history is
  a convenience.
- Who decides when a messy row is good enough to import? That person has to
  exist before B8 starts, or the session stalls on somebody else's judgement.

**Two answers gate a go-live, not a build:**

| Open | Blocks | Does not block |
|---|---|---|
| **Q30** — which statutory deductions apply, at what rate, who pays which half | handing a payslip to an employee | the payroll schema, the run, the adjustments, the slip layout — all built and running |
| **Q39/Q40, Q35–Q38, Q41** | nothing | each has a default that is live, visible on screen, and a one-line change |

---

## Suggested order, and why

1. **B0 → B5 → B1(core)**: identity first. Every refusal elsewhere is theatre
   until the database knows who is asking, and the demo's persona picker hides
   exactly the bugs this project cares about.
2. **B1 → B3 → B2 per schema, not per layer.** Finish `procure` end to end —
   tables, seams, views, swapped screen — before starting `acct`. A vertical
   slice proves the pattern; four horizontal layers prove nothing until the
   last one lands.
3. **B6 early.** Evidence is on the main road of half the screens; a swap that
   cannot attach a file cannot be reviewed.
4. **B8 last, B9 alongside it.** Import into a schema that has already refused
   a few things in anger.

## What runs in parallel, and what it costs

The design session keeps going — new screens, the owner's questions, the
backlog. That is free in wall-clock terms and **not free in merges**: every
screen it adds is a screen B4 has to swap. The rule that keeps it cheap is the
one in `README.md` — the design session does not touch `supabase/**` or
`src/lib/api/**`, and the build session does not touch screens. Contract
changes travel in one direction, through a written list.
