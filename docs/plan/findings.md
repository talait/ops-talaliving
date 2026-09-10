# Findings — what building the workflow taught us

**This file is the deliverable of Phase 1, as much as the app is.**

The premise of the whole plan is that the business rules were never specified
up front, and that you find them by walking a working screen rather than by
designing a schema. This is where what we find gets written down. On D14 it
is consolidated, and `02-database.md` is rewritten against it.

Append one entry per session. Never edit an old entry — if a finding turns out
to be wrong, add a new entry saying so.

## Entry format

```
## D4 · 2026-09-13 · M4 PR list and create

**What the screen could not answer.**
…a question a real user asked that the data does not hold.

**What we assumed.**
…the default taken, and from where (06-decisions Qn, or new).

**What this implies for the schema.**
…the field, table, state or rule that turns out to be needed.

**What surprised us.**
…anything that contradicts a document or an assumption.
```

Keep entries short. Four lines each is fine. What matters is that they exist
and that nothing gets remembered only in a chat log.

---

<!-- entries below, newest last -->

## F1 · 2026-09-10 · before any code — the direction of evidence

**What the owner said.** Today: upload to Google Chat, then review on the
web. "That's really hard to trace between the existing data because it's
unordered." Instead: accounting attaches documents **directly from the PR, or
from the ledger**. A context-free upload is only for the case where there is
no PR — bought first, approved later. Google Chat becomes notification,
confirmation, and the interface for people outside web access. A reader bot
already exists; integration is later.

**Why "unordered" is the right word.** In the current model every document is
an orphan looking for a parent. The extraction guesses a vendor and an amount,
and a person reconstructs the linkage afterwards from name similarity and
amount proximity. Nothing records *who decided* that this receipt belongs to
that line — only that someone once picked it off a list. That is what makes
it untraceable, and it is not fixed by improving the guess.

**What this implies for the schema.**

- `core.attachment_links` moves from a convenience to **the main road**, and
  many-to-many stops being a workaround for unnameable files.
- Every link row must carry **who declared it and when**. That single column
  is the answer to the tracing problem.
- The review queue shrinks to `acct.evidence_inbox` and loses everything that
  existed to support the guess: slot naming, the capped candidate picker, the
  always-offer-the-selected-line rule, `duplicate_of_event`.
- It gains `origin` (`chat` | `web`) and a health view, because the size of
  the exception road is now a signal about the health of the normal one.
- A new resolution appears that the old model had no name for: **a retroactive
  PR line**. Purchase-first-approval-later has a legitimate shape, and giving
  it one keeps it out of the off-PR bucket.

**Two of the four questions dissolve; two are real.** "Which PR?" and "is this
supporting an existing transaction?" are answered by construction once the
person attaches from the parent. "One document, many transactions" and "one PR
line, many transactions" survive — the first becomes an explicit *also
covers…* action, the second was already the allocation model.

**What surprised us.** The AI's job gets smaller and safer. On the main road
the vendor, the expected amount and the parent are already known, so
extraction stops classifying and starts **verifying** — and a disagreement
becomes an advisory warning rather than something a human has to adjudicate
before anything can be recorded.

**Assumptions taken** (see `06-decisions.md`): the exception upload arrives
from Chat *and* the web and lands in the same inbox (Q-none, inferred — the
buyer without web access is precisely the exception case); Chat approvals
cover goods and receiving but not fund decisions (Q16); attaching a payment
proof to a line with no transaction offers to post one in the same panel
(Q14).


## F2 · 2026-09-11 · before any code — five answers, and what they moved

**Answered.** PR approval is the CEO's alone (Q2). The ledger is visible to
whoever has accounting-module access, and a user holds several accesses at
once (Q3). The IT gate is gone and there is no urgency field — every requested
line stays in the queue until it is approved, rejected or withdrawn (Q4).
Service lines complete on payment proof, and auto-complete stays manual for
now (Q9). The Vercel URL is enough (Q12).

**What moved beyond the questions asked.**

Q3 is not really about the ledger. "A user can have multiple access like
procurement + Accounting + HRD" replaces a single-role session with a set of
grants, which changes `src/store/session.tsx`, the topbar control, and how
`can()` resolves. The demo gets better for it: a grant picker demonstrates
permissions far more convincingly than a dropdown.

Q2 and Q3 together forced a split we had not made: **module access and
authority are different things**. Access says which screens open; authority
says which decisions you may take. Keeping them fused is exactly the bug
`john-lau` has — the confirm button showed for three roles and the bridge then
refused it from an environment variable the screen could not read. Four
authorities now: `approve_goods`, `approve_funds`, `post_ledger`,
`resolve_inbox`.

**A tension that resolved itself.** `john-lau` fused accounting and
procurement into one role on purpose, so nobody could approve a purchase
without seeing the cash. Composable grants would have reopened that — except
CEO-only approval takes purchase approval out of the module system entirely.
The safeguard is no longer needed in that shape.

**A word that needed a definition.** Q4 says a line stays until "removed or
approved". *Removed* had no meaning in the model, so it now has one: the
requester withdraws their own line before any decision, softly, with a name
and a timestamp. After a decision the only exit is a rejection (Q17).

**What surprised us.** Dropping urgency makes the queue simpler, not poorer.
A queue that shows every outstanding line at once needs no priority column —
the CEO is reading the whole list either way. The rekap's whole apparatus of
daily digests, 48-hour re-pings and 72-hour escalations existed to work around
a queue nobody could see in full.

**Three new questions**, each with a default so nothing blocks: who may
withdraw and until when (Q17), what happens when the CEO is away (Q18), and
whether `HOLD` survives without a digest to reappear in (Q19). Q18 is the one
worth a real answer before somebody is on a plane.

## F3 · 2026-09-11 · before any code — approval becomes a checkbox

**Answered.** No substitute for the CEO; a co-CEO grant can come later (Q18).
A line is removed because it is no longer needed — no deadline, nothing ages
out (Q17). **Approval is a checkbox: approved or not, no other status** (Q19).
Attaching a payment proof to a line with no transaction offers to post one
(Q14). Chat approvals cover goods and receiving, not money (Q16).

**Q19 is the structural one.** The line status ladder drops from nine values
to eight, and two of the old ones disappear together: `HELD` and `REJECTED`.

What is striking is that **nothing is lost**. `HELD` meant "seen, not decided,
comes back" — an unchecked line does exactly that, because the queue is now a
standing list of everything outstanding (D21). `REJECTED` meant "can never be
paid" — a removed line carries the same guarantee. The middle state existed
because the spreadsheet had *both* a checkbox and a status column, and someone
had to reconcile them. With one surface there is one fact.

**Where the nuance went.** Into the audit trail rather than the vocabulary.
Every toggle writes an append-only row with time, name, email and channel, so
"approved at 14:02, un-approved at 14:09, approved again at 16:30" is fully
legible — which the old three-value column could not express at all. The
screen gets simpler and the record gets richer, which is the right direction.

**A word that needed a guard.** "Removed because we no longer need it" is
open-ended by design, and mostly that is fine. But it cannot stay open-ended
once money has moved: a line with an allocation against it is not something
you stop needing, it is something you return, credit, or void. So removal is
refused past that point (D29) — the one place the owner's "no deadline" needs
a boundary that is not a deadline.

**One fork we defaulted rather than decided** (Q20): the checkbox is the
*status*, but the approved *amount* is a separate field. We kept the ability
to reduce it before checking, because that is how "approve two of the five"
works and it is what A8 exists to protect. Removing it would mean the CEO can
only accept in full or remove — a real business change, and one worth making
deliberately if that is what "no other status" was meant to imply.

**What surprised us.** Three of the five answers this round simplify the model
rather than extend it. The system being replaced accumulated states because
several surfaces each needed their own; with one surface, most of them turn
out to be the same two facts wearing different names.

## F4 · 2026-09-11 · M1 — what building the demo layer taught us

**What the screen could not answer.** Nothing yet; M1 has no product screens.
But writing `derive.ts` forced five rules to become precise that had been
prose, and precision found problems.

**1. A PR line that funds a PO deposit can never be COMPLETED on its own.**
It reaches PAID and stops. Delivery arrives against the purchase order, whose
two axes carry it — and folding that back into the PR line would be exactly
the collapse A1 forbids. The fixture originally pointed such a line at a
`po_line_id`, which made it complete as soon as that one PO row was delivered:
wrong, and only visible once the status was computed rather than described.

**2. Coverage has to exclude voided transactions, or a voided payment leaves
its line looking paid.** "A stamp pointing at nothing is not paid" turns out
to be a join condition, not a slogan.

**3. The coverage fallback is load-bearing.** An unapproved line has no
approved amount, so it must be measured against what was *asked* — otherwise
its approved total is zero, zero is covered, and the line reads as settled.
The old system has the same fallback and the same comment about it.

**4. PARTIAL sits above PAID in the ladder, deliberately.** A line that is
fully paid but only half received reads PARTIAL. Money is the less interesting
fact once goods are in question, and the reader needs the goods answer first.

**5. The fixtures caught a modelling truth by being wrong.** BNI 325 went
negative, because payroll leaves that account and nothing ever funded it. The
fix was not a bigger opening balance but the missing transfers — money has to
reach an account before it can leave. The recap treats a negative balance as a
row in the wrong place; here it was a row that did not exist.

**What surprised us.** The refusals were the easiest part to get right and the
most valuable to have. Six of them are now exercised on page load — approving
above what was requested, approving without the authority, removing a line
money has reached, over-allocating a transaction, replaying an idempotency
key, allocating to a PR line that does not exist — and each one is a rule from
`00-context.md` proved rather than asserted. Building them first means no
screen can be written optimistic.

**One concept with no Phase 2 equivalent:** `identity.actAs()`. It exists only
so permissions can be demonstrated, and it is a clean marker of exactly what
gets deleted when the demo layer goes.

**Still open.** Q20 — whether the CEO may still approve part of a line — is
implemented as "yes, the amount may be reduced before checking", because that
is the default we recorded. If the answer is no, `approveLine` loses its
`approved_amount` argument and the change is small; it gets larger once the
approval screen is built on D5.

## F5 · 2026-09-11 · English by default — and what counts as data

**Decided.** The interface is English. Multi-language is a later question.

**The line that had to be drawn.** Not everything Indonesian in the app is
*language*. Three kinds of string live here and only one of them translates:

| Kind | Example | Translated? |
|---|---|---|
| Interface copy | "Approve", "No data.", "Balance per account" | yes |
| Stored vocabulary | `BCA 271`, `RECCURING - UTILITIES`, `WAITING FOR APPROVAL`, `lembar`, `Receipt / Invoice / Nota` | **never** — translating a stored value does not translate it, it stops it matching |
| Real-world names | `KAYU JATI SORTIMEN A`, `CV SUMBER KAYU JATI`, `BABY ISLAND` | **never** — they are what the things are called |

Unit codes got a small compromise: the code stays `lembar`, and only the
human-facing name gained a gloss — "Lembar (sheet)". The dropdown still writes
`lembar` to the record.

**Number formatting turned out to be a money question, not a style one.** In
`en-US`, `Rp 18.900.000` reads as eighteen point nine — an English interface
with Indonesian digit grouping is the one combination that can be misread as a
number a thousand times smaller. So grouping follows the interface language,
set once as `LOCALE` in `src/lib/format.ts`. If the team would rather read
local grouping, that is one line.

**A related trap the switch exposed.** `formatIDRCompact` used `M` for
*miliar* — Indonesian for billion. In English `M` is million. Left alone, every
compact figure on every chart would have been wrong by a factor of a thousand,
silently, and would have looked plausible. Now it is K / M / B in the English
sense.

**Two bugs the screenshots caught that the build did not.** A `\u2019` escape
written into a JSX attribute renders literally, because a JSX attribute is not
a JavaScript string. And English compact labels are wider than the Indonesian
ones they replaced, so chart axis ticks wrapped onto two lines — fixed by
dropping the `Rp` prefix from axis ticks entirely, which is better anyway: the
card title already says what the axis measures.

**What surprised us.** Almost none of the work was in the components. The
design system carried the language change without a single layout change,
because nothing had been sized to a particular string. The work was in the
copy, and in deciding which strings were copy at all.

## F6 · 2026-09-11 · M2 — the access model, and a CSS trap

**What the screen could not answer, and had to.** The old model could not
express the owner's answer to Q3 at all: `src/store/session.tsx` held a single
`RoleId`, and a user holds several module grants. Replacing it was not a
refactor, it was the model changing shape.

**1. The permission catalogue contradicted D24 and nobody had noticed.**
`PERMISSION_CATALOG` carried `procurement.approve`, `accounting.post` and
`accounting.close` — decision verbs sitting inside module levels. Left there,
a procurement *admin* would gain `approve` for free, which is precisely the
fusion the authority split exists to prevent. They are gone from the catalogue
entirely: **module levels grant access verbs; authorities grant decisions.**
That sentence was already written in `02-database.md`; this is what it means
in code.

**2. The nav was already the real module list.** The module union had six
entries; the navigation has ten sections and `PERMISSION_CATALOG` had eleven
keys — and those eleven were exactly right. The screens had known the answer
since before any of this was designed. The union now matches, and TypeScript
keeps them together.

**3. Grant descriptions are derived, not written.** The picker explains what a
level unlocks by running `expandPermissions` and turning the verbs into
English, rather than describing it in prose beside the list. The first draft
did it in prose and immediately said "Create, edit, update" for Procurement —
one hand-written sentence, already disagreeing with itself. Small instance of
the rule that makes the whole plan work.

**4. The shell must wait for the session.** The original skeleton left a note
saying so and it was right: rendering a menu and then taking half of it away
looks broken. `AppLayout` shows a spinner until `ready`, which also removes any
hydration mismatch, since the server has no per-visitor state to render.

**5. A CSS trap worth remembering, because it will recur.** The grant picker
opened as a drawer that rendered its header and nothing else. The cause was not
the drawer: the topbar has `backdrop-blur-md`, and **a `backdrop-filter` makes
an element a containing block for `position: fixed` descendants**. The overlay
was being clipped to the header's 64px box instead of covering the viewport.
The fix is placement — the drawer is a sibling of `<header>`, never a child.
Any future overlay mounted from the topbar hits this.

**What surprised us.** Turning a module off does not merely hide a menu entry;
the section disappears, and there are **zero** `/accounting/*` links left in the
DOM. That was already the design (`nav.ts` filters before rendering), but
seeing it verified — count the links, get nought — is a different kind of
confidence from reading the component.

**Still open.** `no-access` currently offers "grant myself read access", which
no real system should. It is a demo affordance and goes with the demo layer;
in Phase 2 granting access is somebody else's decision and rightly not
self-serve.

## F7 · 2026-09-11 · M3 — curation, and a question merging asked

**1. Merging a vendor asked a schema question the plan had anticipated but not
answered.** `02-database.md` gave vendors a real foreign key (D4) and noted, in
passing, that history sometimes needs a `*_name_at_time` snapshot. Building the
merge is what made that concrete: with a real FK there are only two options,
and both cost something.

- *Repoint* every reference to the winner — and a transaction from August now
  says a name nobody used in August.
- *Keep* the absorbed row and mark it — history stays put, but the row lingers.

We keep the row (D41). It is the option that does not rewrite the past, and the
recap is explicit that vendor text in the ledger is never changed. What it
still cannot answer is **which spelling the document actually showed** — that
needs the snapshot column, and it is now a real question rather than a
footnote.

**2. Two prices had to be visibly two things.** `standard_price` and
`last_price` were already separate columns, and separate columns are invisible.
Side by side, each with its own caption — "Curated. Never written
automatically" against "CV SUMBER KAYU JATI, 2026-08-24" — the distinction
finally reads. The drawer then says out loud what a form would prefill and
why. That sentence is doing more work than the schema comment ever did.

**3. Half of the curation rule cannot be proved yet.** "Uncurated things are
shown and marked" is demonstrable here and verified: 12 vendors, 3 marked, and
a newly typed vendor arrives uncurated. "…and absent from dropdowns" needs a
dropdown, which arrives with the PR form at M4. Asserted here, proved there —
worth noting so nobody assumes it was checked.

**4. A vendor with no transactions is not missing data.** CV SUMBER KAYU JATI
shows zero spend, because its PR lines are approved and sitting in an open
payment round — nothing has been paid yet. Correct, and it looked like a bug
for a moment. A screen that reports money will keep producing this shape, and
"no money yet" and "no data" need to stay distinguishable.

**5. `<Loaded>` earned its place a milestone early.** Both screens needed to
answer "could not load" on the day they were written, and `useLoad` means
neither invented its own convention. The failure state shows the service's own
message plus its status and code — a refusal nobody can read is one that gets
reported as a mystery.

**What surprised us.** The most useful thing on either screen is a sentence,
not a control: the amber panel explaining *why* something is uncurated. The
rule was already in the code and in three documents; it had never been said to
the person looking at the row.

## F8 · 2026-09-11 · vendor contacts, and the question behind the fields

**What the owner asked for.** PIC name, PIC phone, address, a second bank
account, and a "common purchased item category" on the vendor record — stated
with its reason: *"ini untuk menjawab kalau kita butuh thinner belinya
dimana."*

**The reason did not match the shape of the request, and that mattered.** A
category field on the vendor answers "what does this vendor sell" — the
question you ask once you are already looking at the vendor. "We need thinner,
where do we buy it" starts from the *item* and has no vendor in hand. Answering
it with vendor fields means opening twelve records and reading each one.

So the fields exist, and two other things do:

1. **Search reaches past the vendor's own name** into the categories it
   supplies and the items we have actually bought from it. Typing `thinner` on
   the supplier list returns PT PROPAN RAYA ICC. Verified.
2. **The item drawer answers it directly** — "Where we buy this", listing each
   vendor with the contact, the phone as a tap-to-call link, the last price and
   the date. Thinner shows PROPAN, Bagus Nugroho, 0811-9004-2213, Rp 33,500 per
   ltr, 2026-09-04.

**A declared field and a derived one are not the same thing, so both exist.**
`supplied_categories` is what somebody typed on the record; it can go stale the
day a vendor stops carrying something. `bought_categories` is computed from
purchase history and cannot. The list shows the derived one where there is
history and falls back to the declared one where there is none — which is
exactly where a declaration earns its keep: **a vendor we have not ordered from
yet**. Neither alone would do.

**One derivation, asked from both ends.** `purchaseFacts()` gathers every
"we bought this from them" from requested lines and itemised ledger rows, and
both directions read from it. The vendor page and the catalogue page cannot
disagree about what was bought from whom, because there is nothing for them to
disagree with.

**What this implies for the schema.** `item_purchases` in the old system was
exactly this fact table and was described as best-effort. It is not
best-effort: it is the only thing that answers a sourcing question, and it
should be a first-class write on every posting rather than a backfill.

**A gap the screen now names instead of hiding.** Three vendors have no contact
at all, and one of them has money against it. The empty state says so —
"No contact on record — and we have bought from them 1 time(s)" — rather than
printing a dash. A blank field is a fact nobody acts on; a sentence is a task.

**What surprised us.** The second bank account turned out to need a sentence,
not just a row. Two accounts on a vendor is not extra detail, it is a trap —
so the drawer says which one to check and why. That line came from the request
itself; nobody would have written it from the schema.
