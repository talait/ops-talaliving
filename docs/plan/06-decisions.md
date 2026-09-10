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
| 19 | 2026-09-11 | **PR approval belongs to one authority: the CEO.** Not "any director", no value threshold, no second tier | owner, answering Q2 |
| 20 | 2026-09-11 | **The IT gate is removed.** There is no routing step before the CEO | owner, answering Q4 |
| 21 | 2026-09-11 | **No urgency field.** Every requested line stays in the approval queue until it is approved, rejected or withdrawn | owner, answering Q4. A queue that shows everything outstanding needs no priority column — the CEO is looking at the whole list either way |
| 22 | 2026-09-11 | **Ledger visibility = accounting-module access**, not "everyone signed in" | owner, answering Q3 |
| 23 | 2026-09-11 | **A user holds several module accesses** — procurement + accounting + HRD is normal. Access is per module, per user | owner, answering Q3 |
| 24 | 2026-09-11 | **Module access and authority are separate grants.** Four authorities: `approve_goods` (CEO), `approve_funds`, `post_ledger`, `resolve_inbox` | inferred from 19 + 23. It also fixes a real `john-lau` bug: the screen could not see who was allowed to post, so it offered a button the bridge then refused |
| 25 | 2026-09-11 | **Service lines need no receiving report** — payment proof completes them | owner, answering Q9 |
| 26 | 2026-09-11 | **Auto-complete ships inert.** Fuel and utilities get marked complete by hand for now; the rule is turned on later as a data change | owner, answering Q9: "for now lets leave it manual" |
| 27 | 2026-09-11 | **No custom domain in Phase 1.** The Vercel URL is the review surface | owner, answering Q12 |
| 28 | 2026-09-11 | **Approval is a checkbox.** Approved, or not yet. `HOLD` and `REJECTED` are gone; the ladder drops from nine values to eight | owner, answering Q19. Nothing is lost: an unchecked line stays in the queue exactly as `HELD` did, and an unwanted line is removed rather than rejected. The middle state existed only because the sheet had a checkbox *and* a status column |
| 29 | 2026-09-11 | **A line is removed because it is no longer needed.** No deadline, nothing ages out. Soft, audited, and **refused once money has reached the line** | owner, answering Q17. Past that point the words are return, credit or void — never a quiet disappearance |
| 30 | 2026-09-11 | **No substitute for the CEO.** A co-CEO grant can be added later if wanted; not designed now | owner, answering Q18 |
| 31 | 2026-09-11 | **Approval metadata is timestamp, name and email**, captured from the session. Assume the CEO acts from his own account | owner, answering Q19 |
| 32 | 2026-09-11 | **Attaching a payment proof to a line with no transaction offers to post one**, prefilled, on the same panel | owner, answering Q14 |
| 33 | 2026-09-11 | **Chat approvals cover goods and receiving, not fund decisions.** Approving a round stays on the web | owner, answering Q16 |
| 34 | 2026-09-11 | **The interface is English by default.** Multi-language later, not now | owner. Supersedes the earlier "English structure, Indonesian labels" mix (Q11) |
| 35 | 2026-09-11 | **Domain vocabulary that is *data* stays verbatim** — account codes, transaction types, unit codes, status strings, id formats, vendor and item names | translating a stored value does not translate it, it breaks the match |
| 48 | 2026-09-11 | **A purchase request is a collection of items, and the LINE is the unit.** A document is a submission batch, not a subject; one request may span several suppliers | owner. A request with one line paid and one still waiting has no honest single status, so the primary screen lists lines |
| 49 | 2026-09-11 | **`purpose` moves from the document to the line** | owner. Each item can be for a different job, so a purpose on the container would have to be wrong about most of them. It is also the field that turns a price into a decision |
| 50 | 2026-09-11 | **Carry-forward is not needed and will not be built.** A line stays on the board until settled or removed, so it "reappears at the next meeting" by never having left | the old CARRY/RETRO machinery existed because the surface was a spreadsheet with one tab per submission. Nothing has to be carried when nothing was filed away |
| 51 | 2026-09-11 | **Draft lines are editable; submitted lines are not.** After submission the routes are: reduce the approved amount, or remove and ask again | editing in place would rewrite what the approver saw |
| 52 | 2026-09-11 | **Evidence attaches from the line**, including for a line waiting for payment | ADR-010, now reachable rather than merely designed |
| 45 | 2026-09-11 | **The audit seam is built now; the IT module is not.** Every mutation writes its audit row in the same transaction as the change — already true of all 23 writes. The IT screens, read-access logging and retention wait | the seam is the expensive half to retrofit; tables and screens are not. Building the module now would delay procurement without making the trail any more complete |
| 46 | 2026-09-11 | **Session events are recorded from M2** (`entity: "session"`, action `sign_in`) | a trail that cannot say who was signed in cannot answer the first question asked of it, and it is a handful of call sites in one service |
| 47 | 2026-09-11 | **Read-access logging is deliberately deferred**, with retention as an open question for the owner | it is the only trail that grows without bound and costs something per request; it is middleware, not schema, so it stays cheap to add |
| 43 | 2026-09-11 | **Vendors carry a named contact**: `pic_name`, `pic_phone`, plus the office line, address, a second bank account and declared categories | owner. "Call Toko Amplas" is not an instruction anyone can follow |
| 44 | 2026-09-11 | **Sourcing is derived, not declared.** `purchaseFacts()` answers both "what do we buy here" and "where do we buy this" from one computation; the declared category list is a fallback for vendors with no history | a maintained field goes stale the day a vendor changes what it carries. History cannot |
| 40 | 2026-09-11 | **Brand is `OPS TALALIVING` / `PT TALAHOME`** | owner. Still one file, `src/lib/brand.ts`; the colour scale remains a placeholder |
| 41 | 2026-09-11 | **A merged vendor's row is kept, marked `merged_into`, never deleted or repointed** | with real foreign keys (D4), repointing would rewrite what a past transaction says. Keeping the row means history does not move when somebody corrects a name later |
| 42 | 2026-09-11 | **`<Loaded>` / `<SourceBadge>` moved from M4 to M3** | both M3 screens needed failure handling the day they were written; retrofitting two screens later is worse than building it once |
| 38 | 2026-09-11 | **Routes are English**: `/signin`, `/no-access` — not `/masuk`, `/tanpa-akses` | a URL is interface. An English interface with Indonesian routes reads as a half-finished translation (D34) |
| 39 | 2026-09-11 | **Decision verbs are not in the module catalogue.** `approve`, `post`, `close` were removed from `PERMISSION_CATALOG`; only access verbs remain | D24 in code. Leaving `procurement.approve` in the catalogue would have let a procurement admin approve goods without the authority — the exact fusion the split exists to prevent |
| 37 | 2026-09-11 | **Vercel's Production Branch points at `claude/serene-euler-eq2qef`**, not `main` | owner. Phase 1's whole output lives on one branch; pointing production at it beats merging an unfinished phase into `main` just to see it. `main` keeps the original shell until Phase 2 |
| 36 | 2026-09-11 | **`en-US` number grouping**, set once as `LOCALE` in `src/lib/format.ts` | an English interface showing `Rp 18.900.000` is genuinely ambiguous — an English reader sees eighteen point nine. Mixing an English UI with Indonesian grouping is the one combination misreadable as a number a thousand times smaller. One line to change back |

---

## Open questions — with the default we take until told otherwise

These are the owner's own unanswered questions from §10.2 of the rekap, plus
the ones this plan raised. **Phase 1 is the cheapest possible place to answer
them**: the demo can show two versions of a screen and let the owner point.

| # | Question | Default we take | Cost of changing later |
|---|---|---|---|
| Q5 | BOM: per product or per order? Layered or flat? Are PRs made *from* a BOM? | **Not modelled at all.** The standing instruction is "do not invent it" | n/a — deliberately absent |
| Q6 | May `shared@` post to the ledger? | **Yes** — the owner has stated `it@` is an alias of `shared@` and both are executors | low |
| Q7 | How is `PAID_UNAPPROVED` handled — recover or write off? | **Neither automatically.** It is terminal, flagged to leadership, never deleted. The policy is the owner's | low |
| Q8 | Which of `WAITING APPROVAL` / `WAITING FOR APPROVAL` is canonical? | **`WAITING FOR APPROVAL`**, the view's spelling. The other is a legacy sheet string | trivial now, annoying later |
| Q22 | **How long is the access log kept, and who may read it?** Logging who looked at a salary or the ledger is requested but not built (D47). | **Not decided, and not defaulted** — this one is policy, not a technical choice, and picking a default quietly is how a surveillance decision gets made by accident. Needed before read logging is switched on, not before Phase 2 starts | low now, high once it is collecting |
| Q21 | **When multi-language arrives, which languages and who chooses?** | **Not designed now.** `LOCALE` is a single constant that becomes a session value; UI strings are not yet extracted into a message catalogue, and doing that before there is a second language is work with no reader | low now, moderate once screens multiply |
| Q20 | **Can the CEO still approve part of a line?** D28 makes the decision a checkbox, but the approved *amount* is a separate field. | **Yes — the amount starts at what was requested and may be reduced before checking.** That is how "approve two of the five you asked for" survives, and it keeps A8 (money can only shrink). Removing it entirely would be a real business change: accept in full, or remove | low to keep, higher to remove later |
| Q15 | Who may resolve something in the exception inbox — anyone in `finance`, or a named few? | **`finance` and `it_admin`**, matching who may post today. The resolution is recorded with their name either way | low |
| Q10 | What is transaction type `EJO` — 77 transactions, Rp529 M, unclassified? | **Carried as-is, unclassified, and shown**. Never quietly folded into `OTHERS` | low |
| Q13 | What is the app actually called, and what is the brand colour? | **Placeholders stay** (`MANUFAKTUR OS`, `#2f6b52`), isolated in `src/lib/brand.ts` and the `brand` scale. Changing the colour means deriving the whole 50–950 scale, plus `BRAND` in `charts.tsx` and `themeColor` in `layout.tsx` | trivial while it stays in one place |

## Answering one from a phone

Reply with the number and the answer. For example: *"Q18: grant
`approve_goods` to the operations director as well, so lines do not wait when
the CEO travels."* The next session moves the row into Decisions, notes the
date, and changes the code.

## Facts to record here as they appear

| Fact | Value |
|---|---|
| Vercel project URL | *(record on D1)* |
| Vercel preview URL pattern | *(record on D1)* |
| Custom domain | *(not configured — Q12)* |
| Supabase project ref | *(Phase 2)* |
