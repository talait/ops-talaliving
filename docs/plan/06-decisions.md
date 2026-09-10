# 06 — Decision log and open questions

Two lists. **Decisions** are settled; reopening one needs a reason written
here. **Open questions** each carry a default, so nothing ever blocks — take
the default, note that you took it, and carry on. The owner can flip any of
them with a one-line answer from a phone.

Append, never rewrite. A silently dropped decision is how the same argument
gets had twice.

---

## Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-09-10 | **Phase 1 is a frontend on demo data, deployed to Vercel.** No database until it is walked and signed off | ADR-009. The rules were never specified; you find them by walking a workflow, not by designing a schema |
| 2 | 2026-09-10 | Keep this repo's design system unchanged — shell, tokens, components, two keyframes, menu-as-data, details-in-a-drawer | it is finished and it is good; restyling would spend the fortnight on nothing |
| 3 | 2026-09-10 | Procurement and accounting only. Everything else keeps its honest placeholder | leanest path; those two are where the money is |
| 4 | 2026-09-10 | The demo layer implements `03-api.md` exactly — envelope, outcomes, 403/409/422, idempotency, latency | so Phase 2 replaces a module instead of rewriting screens |
| 5 | 2026-09-10 | Five services, separated by folder, schema, role and contract; one process at first | ADR-001 — "separate API per service so we can re-attach a third service later" |
| 6 | 2026-09-10 | One language, TypeScript | ADR-003 — `john-lau` pays a two-language tax on every reference list |
| 7 | 2026-09-10 | Enforcement in the database (RLS) once there is a database | ADR-002 — an API is about to exist, so screen-level gating stops being enough |
| 8 | 2026-09-10 | Postgres mints every identifier | ADR-005 — settles "who owns the `trx-` number" by having only one candidate |
| 9 | 2026-09-10 | No spreadsheet concept in the schema. Sheets become a one-way export | D1 — eleven schema places currently mirror sheet geometry |
| 10 | 2026-09-10 | The database owns every number, balances included | D9, and the owner's own 2026-08-28 direction, now with no legacy to reverse |
| 11 | 2026-09-10 | Keep the topbar role switcher in Phase 1, as a labelled demo control; delete it in Phase 2 | in a demo, switching role is how you show permissions work |
| 12 | 2026-09-10 | `john-lau` and `ops.talaliving.com` keep running, untouched. No data migration in Phase 1 | v2 can be wrong without costing anyone a day's accounting |
| 13 | 2026-09-10 | `02-database.md` gets rewritten on D14 against `findings.md` | it was written before we walked anything |
| 14 | 2026-09-10 | **Evidence is attached from the record it belongs to** — from a PR line or a ledger row — never matched to it afterwards | ADR-010. Today every document is an orphan looking for a parent, and a human reconstructs the linkage from name and amount proximity. That is why tracing is hard |
| 15 | 2026-09-10 | A context-free upload is the **exception road** only: bought first, approved later. It keeps its own inbox and its size is watched | the guess is unavoidable there, and only there |
| 16 | 2026-09-10 | **Google Chat is notification, confirmation, and the interface for people without web access** — not the intake door for evidence | owner, 2026-09-10. Chat is good at reaching someone who will never open the web app; it is bad at recording what a document belongs to |
| 17 | 2026-09-10 | A Chat action is a real action: the bot calls the same API as the browser, as the identified person. **Channel membership is never authorization** | the rekap's rule survives and sharpens — a *person* in Chat may act within their role; the *bot* may not act at all |
| 18 | 2026-09-10 | One document covering several parents is a **first-class action** (*juga mencakup…*), not a repair | it is why 674 files sit parked today as unnameable |

---

## Open questions — with the default we take until told otherwise

These are the owner's own unanswered questions from §10.2 of the rekap, plus
the ones this plan raised. **Phase 1 is the cheapest possible place to answer
them**: the demo can show two versions of a screen and let the owner point.

| # | Question | Default we take | Cost of changing later |
|---|---|---|---|
| Q1 | Is the IT gate a mandatory recorded step, or skippable when IT is absent? | **Mandatory and recorded** as a named fact, not just a click. Skippable by an `it_admin` with a reason | low — one step in a chain |
| Q2 | Can every director approve every PR, or is it split by project or value? Is there a value threshold needing higher approval? | **Any director may approve any PR**, no threshold. The approval table is a rules table from day one, so a threshold is data, not code | low if designed as a rules table — which it is |
| Q3 | Who may see the ledger — all of it? Per account? | **Everyone signed in**, as today. `finance` and `it_admin` may post | low in Phase 1, higher once RLS enforces it |
| Q4 | Urgency: a new column, how many levels, who sets it? Deadline: need-by date or vendor due date? | **Three levels** (normal / urgent / critical), set by the requester, changeable by the IT gate. `need_by` = the date the goods are needed | low |
| Q5 | BOM: per product or per order? Layered or flat? Are PRs made *from* a BOM? | **Not modelled at all.** The standing instruction is "do not invent it" | n/a — deliberately absent |
| Q6 | May `shared@` post to the ledger? | **Yes** — the owner has stated `it@` is an alias of `shared@` and both are executors | low |
| Q7 | How is `PAID_UNAPPROVED` handled — recover or write off? | **Neither automatically.** It is terminal, flagged to leadership, never deleted. The policy is the owner's | low |
| Q8 | Which of `WAITING APPROVAL` / `WAITING FOR APPROVAL` is canonical? | **`WAITING FOR APPROVAL`**, the view's spelling. The other is a legacy sheet string | trivial now, annoying later |
| Q9 | Do service lines (mowing, a bill) need a receiving report, or is payment proof enough? | **Payment proof is enough** for `kind='service'`. Today those lines are stuck at PAID forever | medium — it changes a status predicate |
| Q14 | When accounting attaches a payment proof from a PR line, should the ledger transaction be **created in the same step**, or attached to one that already exists? | **Both, offered on the same panel**: if the line has no transaction yet, attaching a payment proof offers to post one, prefilled from the line; if it has one, the document links to it. The person never navigates away to do the other half | low — it is one panel, two states |
| Q15 | Who may resolve something in the exception inbox — anyone in `finance`, or a named few? | **`finance` and `it_admin`**, matching who may post today. The resolution is recorded with their name either way | low |
| Q16 | Should a Chat approval be possible for **money** decisions, or only for goods and receiving? | **Goods and receiving only** in the first cut. Fund approval and closing a round stay on the web, where the balances are visible next to the decision | low now, higher once people are used to it |
| Q10 | What is transaction type `EJO` — 77 transactions, Rp529 M, unclassified? | **Carried as-is, unclassified, and shown**. Never quietly folded into `OTHERS` | low |
| Q11 | Does the demo need an Indonesian UI, or is the current mix fine? | **The current mix**: Indonesian labels and stored vocabulary, basic English structure — the owner's 2026-08-27 direction. Screens where people *decide* get translated first | low |
| Q12 | Custom domain: does `dev-ops.talaliving.com` point at Vercel now? | **Not yet.** The Vercel URL is enough for Phase 1; a DNS record adds it whenever asked | trivial |
| Q13 | What is the app actually called, and what is the brand colour? | **Placeholders stay** (`MANUFAKTUR OS`, `#2f6b52`), isolated in `src/lib/brand.ts` and the `brand` scale. Changing the colour means deriving the whole 50–950 scale, plus `BRAND` in `charts.tsx` and `themeColor` in `layout.tsx` | trivial while it stays in one place |

## Answering one from a phone

Reply with the number and the answer. For example: *"Q4: two levels only,
normal and urgent, and only the IT gate may set it."* The next session moves
the row into Decisions, notes the date, and changes the code.

## Facts to record here as they appear

| Fact | Value |
|---|---|
| Vercel project URL | *(record on D1)* |
| Vercel preview URL pattern | *(record on D1)* |
| Custom domain | *(not configured — Q12)* |
| Supabase project ref | *(Phase 2)* |
