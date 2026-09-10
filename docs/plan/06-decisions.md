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
| 60 | 2026-09-11 | ~~**Navigation filters on authority as well as module access.**~~ **Superseded by D67** the same day: with approvals merged into the board there is no screen whose whole subject is one decision, and `NavItem.authority` was removed rather than left as scaffolding for nothing. `NavItem.authority` hides a screen whose whole subject is one decision | D24 in the menu. Procurement access should not put the CEO's queue in somebody's sidebar; the page itself stays readable, without controls, for anyone with `procurement.read` |
| 61 | 2026-09-11 | **The approval screen carries a "decided recently" list with un-approve**, not only the queue | a decision that can be made and not unmade is a trap: the only fix for a mis-tick would otherwise be database access (F9) |
| 62 | 2026-09-11 | **Un-approving a line money has already reached is allowed, and says what it will do** | the honest result is a line reading "paid, not approved" — a corner the board keeps in view. Refusing the un-tick would only mean the record disagrees with the CEO (A6) |
| 63 | 2026-09-11 | **No bulk "approve everything in this submission".** Each item is one tap | the purpose field is the reason approval is a decision rather than a rubber stamp, and a bulk button skips reading it. Revisit if a real queue is long enough to make this cruel |
| 78 | 2026-09-11 | **Approving a round is `approve_funds`; recording its transfer is `post_ledger`.** Closing is `approve_funds` again | the funds decision is the approval. The transfer is the bookkeeping that follows it, and it is the same act as writing the two ledger legs — one person should not need two authorities to record one fact |
| 79 | 2026-09-11 | **A transfer is written as two ledger legs by the screen**, out of the leadership account and into BCA 271, then handed to `transferRound` | a transfer between our own accounts is two rows. Recording it once, on whichever side somebody was looking at, is how the two accounts came to disagree by exactly the amount that moved. The screen composes both services rather than either reaching into the other (ADR-004) |
| 75 | 2026-09-11 | **A line's amount is quantity × price when it has both, and an editable figure when it does not.** The edit form carries all three; typing the amount leaves quantity and price alone and says so | owner — the price could not be changed on a service line at all, and saving one recomputed its amount from a missing quantity and zeroed it. Plenty of real lines have no quantity: a service, a delivery charge, a lump sum |
| 76 | 2026-09-11 | **Approval is no longer capped at what was requested.** Quantity and amount may be raised as well as cut | owner. **Supersedes A8's application to approval.** The old rule assumed the request was always the higher number, but a vendor raises a price between the request and the meeting, and a leader approving above it is deciding, not erring. The gap between requested and approved is already carried and reported (D54) |
| 77 | 2026-09-11 | **Ticking on the meeting board picks, it does not decide.** Nothing is written until one confirm above the lists, which carries the count and the total | owner. A meeting goes down the list, changes its mind twice, and wants to see what it just committed to before committing it. The confirm is *Approve* for the authority holder and *Send to the approver on Chat* for everybody else |
| 73 | 2026-09-11 | **An item can be added from the meeting itself**, in one act: a real purchase request with its own number, submitted straight away | owner. Somebody says "we also need thinner" and it has to be on the list before the conversation moves on. A note on paper never comes back |
| 74 | 2026-09-11 | **The meeting has its own board** (`/procurement/meeting`): waiting for a decision, approved and unpaid, the BCA 271 balance, and the transfer needed to cover it. The requests board goes back to being the working surface — asking, correcting, documenting, paying | owner. Same lines, two readings. Approval controls in the middle of somebody's working day are noise; a working board in the middle of a meeting is noise the other way |
| 70 | 2026-09-11 | **Approval is asked for as a batch, not a card per line.** One send carries the list and three totals: asked for, approved so far, and what has to be paid — with the BCA 271 balance beside them. "Approve the rest as asked" covers what is left | owner. Fifteen separate cards ask the approver to add fifteen numbers in their head to know what they just committed to, which is how people stop reading the fifteenth |
| 71 | 2026-09-11 | **The board is grouped into three piles: waiting for approval, approved and waiting for payment, finished.** Each states its own subtotal | owner. Not-approved and approved are different kinds of work — one needs a decision, the other needs cash — and one mixed table could show neither total. A line paid without a yes sits with the undecided, because the money is gone but the decision is still owed |
| 72 | 2026-09-11 | **Chat tokens are random and unique, never derived from a document number** | a token is a capability: the card carries it back and it is what identifies the request. A predictable one lets anybody who can guess a number answer somebody else's list, and two sends deriving the same token answer each other's |
| 64 | 2026-09-11 | **`instructions` and `remark` are leadership's two optional fields**, kept in `line_notes` rather than as columns on the approval | owner. They are different acts: instructions is something to DO, remark is for the record. And the useful moment for "get another quote" is on a line nobody has decided yet, which a column on the approval row could not hold |
| 65 | 2026-09-11 | **Approval can cut the quantity, not only the amount.** Changing the quantity recomputes the amount at the unit price | owner. "Approve 40 of the 60 litres" is the decision actually taken; making somebody do that multiplication by hand is how an approval ends up disagreeing with itself |
| 66 | 2026-09-11 | **A line is editable until it is approved**, not merely while it is a draft. Three doors close it: approval, payment, removal. The old values go into the audit row | owner. **Supersedes D51.** Spotting a wrong quantity an hour after submitting should not cost the line its number and its place in the queue |
| 67 | 2026-09-11 | ~~**One board, not two.**~~ **Narrowed by D74**: the separate *approval queue* stays deleted, but the leadership meeting got its own screen, because it asks a different question of the same lines. What is not coming back is a second list of what is outstanding. Approving happens on the requests board, inline per row; the separate approval queue is deleted | owner. Approving is not a second subject — it is a column on the same list. Two screens meant two lists that could disagree about what is outstanding |
| 68 | 2026-09-11 | **The board shows the BCA 271 balance against what is approved and unpaid**, and names the top-up needed | owner. At the moment of approving, the useful number is not "how much did we approve" but "how much has to be in the account before any of it can move" |
| 69 | 2026-09-11 | **Approval is asked for in Google Chat and answered there.** The identity on the record comes from the chat platform's authentication, never from the browser session; anyone in procurement may ask, only the addressee may answer | owner. The meeting runs on one laptop, usually not the approver's. An approval trail naming the wrong person is worse than none, because it looks authoritative |
| 59 | 2026-09-11 | **A liquidation report belongs to accounting (M12), not procurement.** Money in against where it went: by type, project, vendor, and — the split nothing today can show — spending with a PR line behind it against spending without one | owner. It is a read over the ledger, so it costs nothing to defer and would cost a screen to build twice |
| 53 | 2026-09-11 | **A payment posted from a line IS the ledger entry.** One act writes the transaction, the allocation to the line and the document link; the ledger row carries the PR line number in its description | owner. Two people typing the same amount into two systems is how they disagree. The `source_ref` (`pr-line:<line>:<date>:<amount>`) makes a retry a no-op rather than a second payment |
| 54 | 2026-09-11 | **Requested → approved is a decision; approved → paid is a variance.** Only the second is reported as a difference | the CEO cutting an amount is the system working. Reporting it as an exception would bury the real one |
| 55 | 2026-09-11 | **The application never records whose fault a difference was.** It records what kind of difference it was, from a closed list, and who said so | it cannot know, and a field that guesses gets believed. One gap is unknowable; twelve tagged the same way against one vendor is a fact |
| 56 | 2026-09-11 | **An underpayment explained by anything except "paid in parts" closes the line**, writing the `line_settlements` row with the explanation as its reason | A12 wanted a shortfall closed by a named human reason. That is the same statement, so it is one act, not two |
| 57 | 2026-09-11 | **A line with an unexplained material difference stays on the board even when COMPLETED**, and is badged `needs an explanation` | a line dropping off because the goods arrived is exactly how an overpayment stops being anyone's problem |
| 58 | 2026-09-11 | **Paying is offered only on an approved line.** Money moving before a yes is recorded when it happens, but never offered as an ordinary button | the paid-unapproved corner should be reachable by accident in the world, not by a button in the app |
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
| Q23 | **An overpayment leaves a balance with the vendor. Do we chase it, or let the next invoice carry it?** The app states the balance and refuses to net it away silently; who acts on it is policy | **Stated, never netted.** The gap stays visible on the line with its explanation until somebody decides. No automatic vendor-credit account until the owner asks for one | low — a credit account is additive |
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
