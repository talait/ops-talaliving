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

## F9 · 2026-09-11 · a field with no way to fill it

**Caught by the owner, and worth recording rather than quietly fixing.** The
previous session added `pic_name`, `pic_phone`, `bank_account_secondary` and
`supplied_categories` to the vendor model, seeded them in the fixtures, and
wrote `updateVendorContact` in the service. There was no edit form. Every one
of those fields was readable and none of them was fillable — the demo looked
complete because the fixtures were already populated.

**Why the fixtures hid it.** Seeded data is the enemy of noticing a missing
write path: nine of twelve vendors already had a contact, so the screen looked
finished from every angle except the one that mattered. The three uncurated
vendors with no contact were the honest signal, and they read as "data we do
not have" rather than "data you cannot enter".

**The rule this suggests for the rest of Phase 1.** A milestone is not done
when the data is visible; it is done when the data is *reachable* — created,
edited and refused. From here, any field added to a model gets its write path
in the same change, or it does not get added.

**What the edit form itself taught us.** Empty has to mean "not on record",
not an empty string. The panel says so out loud — *leave anything blank that is
genuinely unknown* — because the alternative is somebody typing a dash or "n/a"
to fill the gap, and then no screen can ever ask the question again. The save
converts blanks to null deliberately.

**Verified**: UD SINAR ABADI starts with no contact, the form fills PIC, phone,
address and both accounts, the second-account warning appears once there are
two, and it survives a reload.

## F10 · 2026-09-11 · the audit question, answered by counting

**The owner asked** whether change/login/activity logging for the IT module
needs to be in the schema and API from the start, or can be skipped for now.

**Counted rather than guessed.** Of 23 mutating functions across the four
services, 21 already wrote an audit row in the same `apply()` as the change.
The two that did not were `identity.actAs` — the demo's sign-in, so precisely
the login event in question — and `syncRound`, a sweep that creates rows with
no person behind it. Both now do.

**Why that settles it.** The expensive half of auditing was never the table.
A table can be added by a migration on any Tuesday. The expensive half is the
*seam*: the guarantee that a business row cannot be written without its audit
row. Retrofitting that means finding every write path and hoping none was
missed — and the number of write paths only grows. That seam exists, and it is
in the definition of done, so it keeps existing.

**What genuinely can wait, and why it is cheap later:**

- **The IT screens.** They read the trail; they do not produce it.
- **Hash chaining.** A property of the table, addable in place.
- **Read-access logging** — who looked at a salary, who opened the ledger. This
  is the one with a real cost: it grows without bound, it fires on every
  request rather than every change, and its retention is a policy the owner has
  to set. It is middleware, not schema, so deferring it costs a middleware and
  a table later, not a rewrite.

**One thing we did not default** (Q22): how long the access log is kept and who
may read it. Every other open question in this plan carries a default so work
never blocks. This one does not, deliberately — a log of who read what is a
surveillance decision, and picking a default quietly is how such a decision
gets made by accident rather than chosen.

**What surprised us.** The answer was already in the code and nobody had asked
it that way. "Is auditing built?" is unanswerable in the abstract; "how many of
our writes are audited?" takes one script and returns 21 of 23.

## F11 · 2026-09-11 · M4 — the half of the curation rule that was owed

**Paid off from F7.** M3 could show that uncurated things are "shown and
marked" but not that they are "absent from dropdowns", because there was no
dropdown. There is now, and it was verified by counting options rather than by
looking:

- uncurated item `BAUT L 8MM` — **not offered**
- curated item `THINNER ND SUPER` — offered
- uncurated vendor `UD SINAR ABADI` — **not offered**
- a vendor name nobody has ever recorded — **still enterable**, and created
  uncurated on the spot

That last one needed a change to `Combobox`: an optional `onCreate`. Fields
that are genuinely closed lists — a unit, an account code — pass nothing and
stay closed. A vendor is not a closed list, and a form that refuses a name the
buyer is standing in front of would be lying about what a workshop does.

**A real bug the test caught by accident.** Adding a second line produced key
`l7`, not `l2`. The cause was a module-level counter feeding React keys: React
may run a `useState` initialiser for a render it then discards, so the count
depended on how many times React changed its mind. Harmless in this instance —
the keys were still unique — but identity should not rest on that, and two
module instances would hand out the same keys. Now a `useRef` scoped to the
form. **Module-scoped mutable state is not a safe source of identity**, and the
symptom is invisible until it isn't.

**A document has no honest single status.** The list shows *lines by status* as
a set of pills rather than one status column, because a request with one line
paid and one line still waiting cannot be summarised without lying about one of
them. The document is a container; the line is the unit that carries status,
approval and money. Every screen after this one inherits that shape.

**Choosing a catalogue item is a hint being offered, not a value being set.**
It fills description, unit, suggested price and last vendor — and every one
stays editable. The rule "a hint, not a price list" stops being a sentence in
`02-database.md` and becomes what the form does: the person standing in front
of the vendor knows more than the record does.

**What surprised us.** The most useful thing on the create page turned out to be
the sentence under the total — *a draft is in nobody's queue; submitting is
what puts these lines in front of the CEO*. Saving and asking are different
acts, and nothing in the data model was going to tell anyone that.

## F12 · 2026-09-11 · the request was redefined, and the model got smaller

**The owner restated what a purchase request is.** A collection of items
somebody wants to buy, possibly from several suppliers in one request. Items
not yet approved, not yet paid, not yet received must be visible on one page.
Rather than issuing requests document by document, treat the line as the thing
that persists and reappears at the next leadership meeting. And leadership must
be able to see which items are approved, and which were **paid without being
approved**.

**M4 had already walked into the same conclusion from the other direction**
(F11: "the document is a container; the line is the unit"). Building the screen
found the shape; the owner named it. That is the frontend-first bet paying out
in the way it was supposed to.

**The redefinition made the model smaller, not larger.** Three things went
away:

1. **`pr_documents.purpose` is gone.** A request holding items for three jobs
   cannot have one purpose without lying about two of them. Moved to the line,
   where it is the most useful field on the row — "2 pail lem putih" is a cost;
   "2 pail lem putih — laminating meja HOTEL UBUD" is a decision.
2. **Carry-forward will never be built.** The recap describes MOVE TO NEW PR,
   CARRY and RETRO — machinery for making an unpaid line reappear in a later
   document. It existed because the surface was a spreadsheet with one tab per
   submission, so a line that was not in this month's tab was invisible. On a
   line-first board a line simply stays until it is settled or removed. It
   reappears at the next meeting by never having left. An entire subsystem
   deleted by changing where the list starts.
3. **The meeting board arrived seven milestones early**, because once the board
   is line-first, the four states are just a grouping of what is already there.

**The state that mattered had no example.** "Paid, not approved" read zero,
because nothing in the fixtures had money against an unapproved line. A demo
whose most important corner is always empty teaches that the corner cannot
happen — and it is exactly what does happen. One seeded line (petty cash, bench
repair, bought the same afternoon) and the board now says what it is for.

**Two gaps the owner named, both real:** a draft could not be edited, and a
line waiting for payment could not receive its evidence. Both were "designed
and unreachable", the same shape as F9. The definition-of-done clause added
then would have caught them — it is now being applied to lines as well as
fields.

**A layout bug worth remembering.** `max-width` on a `<td>` is advisory under
auto table layout: the purpose text ran straight through the Vendor column.
The constraint has to sit on an element *inside* the cell. Fits exactly at
1280 now.

## F13 — "Why is the paid amount not the approved amount?" is a question about patterns, not events

The owner asked what the application should say when leadership sees that a
request for Rp 10.080.000 was paid as Rp 9.500.000: why, how much, whose
mistake, and what the balance is.

Three of those four the application can answer exactly. **How much** is
arithmetic it already had. **Why** is a sentence a human writes, and the app's
only job is to refuse to let the line close without one. **The balance** is
the same subtraction, stated in the direction that matters: money paid beyond
a yes is owed back, money not paid is either still owed or was never spent.

**Whose mistake it was, it cannot answer, and a field claiming to would be
believed.** No system can see from the outside whether Rp 225.000 was a typo,
a vendor raising a price, or somebody paying without looking. So the model
does not carry blame. It carries a closed list of seven kinds, so the kinds
can be counted — and counting is where the owner's real question gets
answered. One Rp 200.000 gap is noise. Twelve tagged *vendor price differed*
against one supplier is a supplier who quotes badly. Six tagged *entered
wrongly* by one person is a training problem. The application cannot judge one
event; it can make a pattern impossible to miss.

Two consequences fell out of building it:

1. **The explanation is also the settlement.** A shortfall explained as
   anything other than "paid in parts" is a decision that the line is done
   cheaper — which is the `line_settlements` row A12 already asked for. One
   act, not two, and no line sits at "Rp 580.000 still owed" forever because
   nobody knew where the button was.
2. **A COMPLETED line can still owe an answer.** The status ladder said the
   sandpaper line was finished: approved, paid, received. It had also paid
   Rp 225.000 more than was approved. The board now keeps such a line visible
   until somebody explains it — the ladder describes the goods, not the money.

**A process note, and a wasted twenty minutes.** The first browser check
showed no variances at all. Nothing was wrong with the code: a `next start`
from an earlier session still held port 3100 and was serving a build made
before the change. Checking `ps` before believing a screen costs five seconds;
believing it cost twenty minutes of reading correct code.

## F14 — the standing queue turns "paid, not approved" back into a decision

M5 is one screen and a checkbox, and the interesting part was what the queue
contained on the first render: **items somebody had already bought and paid
for, sitting in the CEO's approval list.** Nothing engineered that. The queue
is "every submitted line nobody has decided", and money reaching a line is not
a decision — so the bench-repair screws that were bought the same afternoon
are still waiting for a yes.

That is the difference between a flag and a queue. The requests board shows
*paid, not approved* as a red state, which is information. The approval queue
shows the same line as a **thing to decide**: approve it after the fact and
say so, or leave it unapproved and let it stay visible. Neither the old
spreadsheet nor a status column could offer that, because both treated "paid"
as the end of the story.

Three smaller things the build taught:

1. **Module access could not hide this screen.** Everyone in procurement holds
   `procurement.read`, and the queue is the CEO's alone — so `NavItem` gained
   an `authority` field (D60). The page stays readable without the controls,
   which is the honest version: the team can see what is waiting, they just
   cannot decide it.
2. **A checkbox that springs back reads as "it did not take".** The tick has
   to stay down while the write is in flight and only revert on a refusal.
   Half a second is long enough to make somebody click twice.
3. **`<input type="number">` cannot group thousands**, so the field reads
   `4275000` under a label that reads `Rp 4,275,000`. On the one screen whose
   entire job is reading amounts this is a real cost. Deliberately not fixed
   here: it is one component used by every money field in the app, and
   swapping it for a formatted text input is a change to make once, on
   purpose, not inside a milestone about approvals.

## F15 — the approval queue was a column, not a screen

M5 built a separate approval queue. The owner's answer, the same day: make it
one screen with the requests board.

He is right, and the reason is worth keeping. Approving is not a second
subject. It is one more thing that is true about a line — like what it is for,
what it cost, and whether it has been paid — and every one of those already
lives on the board. Two screens meant two lists that could disagree about what
is outstanding, and a CEO reading a list the requester could no longer see.

What that merge deleted: a page, a navigation entry, a `NavItem.authority`
field invented one milestone earlier to hide that page (D60, superseded within
hours), a second grouping of the same rows, and a "decided recently" section
that existed only because the queue could not show a decided line. The
un-approve control moved to the drawer, where the rest of the line's story
already was.

Two things the merged board needed that neither screen had:

1. **The bank balance.** Approving without knowing what is in BCA 271 is
   approving in the abstract. The useful number is not what was approved — it
   is *how much has to be put into the account before any of it can move*, so
   the board states the balance, the approved-and-unpaid total and the
   difference (D68).
2. **A money field you can read.** `<input type="number">` cannot group
   thousands: `4275000` under a label reading `Rp 4,275,000`. Noted as a rough
   edge in F14 and deliberately deferred; putting the amount on every row of
   the main board made it the first thing to fix. `MoneyInput` is now a text
   input that groups while you type.

## F16 — the approval was recording the wrong person, and no code was wrong

The owner described how a meeting actually runs: the web app is open on one
laptop, on whoever's account, and the CEO says yes out loud. Every approval
recorded that way carries the wrong name — not through a bug, but because the
application had no way of knowing that the person who spoke is not the person
who clicked.

**A trail that names the wrong person is worse than no trail**, because it
looks authoritative. And nothing inside the app can fix it: whatever the
screen asks, the answer arrives through a session belonging to somebody else.

So the yes leaves the room. The line is sent to the approver in Google Chat,
they answer from their own account, and the identity on the record comes from
Google's authentication of that person (D69). The metadata then reads
`chat · evin@talaliving.com · 14:00` — which is what happened.

Three details that make it more than a notification:

- **Asking and answering are different acts.** Anyone in procurement may ask;
  only the addressee may answer. Sending is chasing, answering is deciding.
- **The token identifies the request, never the person.** Identity comes from
  the signed webhook. A token carrying an identity would be a password that
  anybody who saw the card could replay.
- **An answer from the wrong account is refused**, and the demo screen exists
  largely to make that refusal visible: `answer from putri@… is not that
  person's decision`.

The route is already event-shaped: `procurement.approval.requested` goes to
the outbox, a worker turns it into a card, and the answer comes back through
one endpoint. Phase 2 changes the worker, not procurement.

## F17 — two bugs that only a second batch could reveal

Grouping the board and batching the chat card were the owner's asks. Building
them surfaced two defects that had been sitting in the demo layer since M1,
both invisible until a second row of the same kind existed.

**Timestamps were being sorted as text.** The fixtures carry `+08:00` — the
office is in WITA — and everything written while the app runs carries `Z`.
Compared as strings, `09:05:00+08:00` sorts *after* `06:45:00Z`, though it
happened three hours earlier. That mattered far beyond the chat list: "the
current decision is the latest row" is how approval, notes, variance
explanations and pending requests all work, so on any day where a fixture row
and a live row met, the screen would confidently show the older answer as the
current one. One `byTime` comparator, applied at every place a timestamp was
ordered.

**A token derived from a document number is not a token.** The batch token was
built from the batch number, so the second send of the day produced the same
token as a seeded one and answers landed on the wrong list. The fix is the
rule, not the patch: a token is a capability the card carries back, so it must
be random and unique. Deriving it from anything guessable would let somebody
who can count document numbers answer a list addressed to the CEO.

Neither bug was reachable with one batch in the data. Both appeared the moment
a second one existed — which is the argument for fixtures that contain two of
everything interesting, not one.

**And the reason the batch card earns its place.** A card per line asks the
approver to hold a running total in their head; by the fifteenth they have
stopped. The list states what a single line cannot: *asked for*, *approved so
far*, *has to be paid* — that last one being approved minus what already
reached those lines, because approving something already paid for commits no
new money. Beside it sits the BCA 271 balance, so "yes" and "we can afford
it" stop being the same click. The board answers the same question from the
other side: what is still to decide, and what the decisions already taken will
cost.

## F18 — the same list, read twice, is not the same screen

F15 recorded that the approval queue was a column, not a screen, and the two
boards became one. This is the correction to that correction, and both are
right — which is the finding.

**What was wrong with two screens** was that each held its own list of what is
outstanding, and two lists can disagree. That has not changed and is not
coming back.

**What was wrong with one screen** is subtler: a board carrying approval
controls asks everybody to read leadership's questions all day. The person
attaching a receipt does not care what is waiting for a decision; the person
in the meeting does not care which invoice is missing a photo. The controls
were not in the wrong place because approving is a different subject — it is
not — but because it is a different **moment**.

So the split is by question, not by data:

- **`/procurement/pr` — the working surface.** Asked for, corrected,
  documented, paid. One row per item, one table, and the whole story in the
  drawer.
- **`/procurement/meeting` — the room.** What is waiting for a decision and
  what it would cost; what is already approved and unpaid; the BCA 271
  balance; **the transfer needed before any of it can go out** — and what that
  transfer becomes if everything still waiting is approved today.

Both read `listOpenLines()`. Neither holds state the other cannot see.

**And a demo lesson repeated.** The transfer figure read "nothing needed",
because BCA 271 was seeded with more than the board could spend — the same
mistake as the "paid, not approved" tile that always read zero (F14). The
account is now seeded lean, as it really is: funded per payment round rather
than held full. The number the screen exists for is a number the screen
actually shows.

## F19 — a cap that assumed the wrong direction, and a total that assumed a quantity

Three small corrections from one round of use, each of the same shape: a rule
that was true of the common case and wrong about the rest.

**"Approval can only reduce" assumed the request was always the higher
number.** It usually is — but a vendor raises a price between the request and
the meeting, and a leader approving Rp 1.200.000 for something asked at
Rp 870.000 is deciding, not erring. The cap turned that decision into a 422.
Removed (D76): the field now says *Rp 330.000 more than asked* in words, and
the difference between requested and approved is reported the way every other
difference on the line is.

**The amount was always quantity × price.** For a service line — no quantity,
no unit price, just a figure the vendor quoted — that meant the price could
not be edited at all, and saving the line recomputed its amount from a missing
quantity and zeroed it. The edit form now carries all three fields: changing
quantity or price recomputes the amount, and typing the amount leaves them
alone and says which figure will be used (D75).

**Ticking wrote immediately.** On a board where a meeting reads down a list of
fifteen items, every tick was a committed approval, and the total only existed
after the fact. Now a tick picks; the count and the total sit in a bar above
the lists; one confirm commits — *Approve* if you hold the authority, *Send to
the approver on Chat* if you do not (D77). The same list, the same button
position, two different acts depending on who is in the chair — which is
exactly the distinction the chat route was built to keep.

And the small one: the "to pay" total moved from the foot of the table to the
top of it. It is the answer; the rows are the working.

## F20 — the round screen's whole job is one sentence the old system could not say

M6 needed almost no new machinery: `syncRound`, `approveRound`, `transferRound`
and `closeRound` were written in M1 against the contracts. What the screen adds
is the vocabulary, and one sentence in particular:

> **The money is in BCA 271, and nothing is paid yet.**

In the sheet, "transferred" and "paid" were the same tick. A funded round
therefore looked like a set of settled invoices, and the suppliers who had not
been paid out of it stayed invisible until they called. Here the round reaches
TRANSFERRED and every line under it still reads `WAITING FOR PAYMENT`, on the
same screen, three centimetres apart. That is the demonstration the milestone
asked for, and it costs one banner because the model already refused to
conflate them.

Three things the build settled:

1. **A transfer is two ledger legs, not one.** Out of the leadership account,
   into BCA 271. The screen writes both through accounting and then tells
   procurement the round is funded (D79) — composing two services rather than
   letting either reach into the other. The out leg goes first on purpose: if
   the second fails, the books show money that left and has not landed, which
   somebody can see and fix. The reverse would show money appearing from
   nowhere.
2. **Recording the transfer is `post_ledger`, not `approve_funds`** (D78). The
   funds decision was approving the round; writing down that the money moved
   is bookkeeping, and it is literally the same act as writing the legs.
3. **There can be two live rounds**, one being funded and one already
   collecting behind it. The first draft rendered `.find()` — the first
   non-closed round — and would have hidden whichever one somebody was waiting
   on. The fixtures had both from day one, which is the only reason it showed
   up before deployment.

Closing still answers with what it released: two items, Rp 13.430.000, back in
the queue rather than quietly settled.

## F21 — "transferred" was still a tick somebody typed

M6 shipped with the round's own claim unproved: `Rp 60.000.000 transferred ·
trx-26-09-10_004`, and behind it nothing. The owner caught it immediately, and
he is right — that is the sheet's mistake wearing a new font. Every other
claim in this system already has to show its evidence: no photo, no receipt;
no document, no ledger row. Funding a round was the one place left where a
number could assert itself.

So a round cannot reach TRANSFERRED without an attachment (D80). The refusal
is a 422 with a sentence rather than a red field: *a round is funded when
there is proof it was funded*.

**And the proof arrives two ways, because the money does** (D81):

1. **We transferred it.** Somebody in accounting makes the transfer and
   uploads the receipt on the round. Both ledger legs are written, the file is
   filed against the receiving row, and the round points at it.
2. **Leadership transferred it from a phone** and dropped the photo in the
   chat thread — which is what actually happens most weeks. The file lands in
   the review queue as *money coming in*, waits there, and is booked by
   whoever writes the ledger. The round then funds itself from a transaction
   that is already in the books rather than from a second, invented copy of
   the same money.

The second road needed one new field and no new concept: `money_direction` on
the inbox row. Everything in that queue used to be somebody who bought first —
money going OUT, matched to a purchase. A transfer proof is the other
direction and is resolved by a different person for a different reason, and
without the field the two would have sat in one undifferentiated pile.

What did **not** change is the rule underneath: the reading is a proposal,
never a posting. The chat upload carries an amount, and booking it is still a
person agreeing with that amount (A13). The demo makes that visible by showing
the extraction's confidence next to the button.

One consequence worth stating: the round now points at the same file the
ledger row does, not a copy. The proof lives on the transaction that received
the money, where it can be read on its own; the round keeps only the id, and
asks the documents service what the file is called.

## F22 — funding comes in instalments, and "unallocated" was crying wolf

Two corrections, both from the same instinct: a screen that is wrong about the
ordinary case teaches people to ignore it.

**A round is funded more than once.** The model held one
`transferred_amount` and one proof, so the second instalment had nowhere to go
— it would have overwritten the first or been left out of the books. Leadership
sends part on Monday and the rest when a client pays; that is the ordinary
week, not an exception. The record is now a list (D82): each instalment with
its own amount, its own ledger row and its own proof, and the round showing
what has come in against what is still short. The transfer form stays open
while a shortfall remains and defaults to exactly that shortfall, so the second
transfer is for the part the first one did not cover.

Two small guards came with it: one `source_ref` per instalment, so a retry of
the first transfer is still a duplicate while a genuine second transfer is
allowed; and the same `trx_no` cannot be counted twice against one round —
two instalments are two transactions, and one transaction counted twice is
money invented.

**The ledger flagged two thirds of a normal month.** The first draft marked
every OUT row with unspent allocation as "money pointing at nothing" — 24 of
34 rows, which included payroll, the electricity bill and the bank charges.
Nobody raises a purchase request for payroll. Flagged only on types that are
purchases (`is_purchase`, already in the type table), the count drops to 10 and
every one of them is a row worth asking about (D83). A flag that fires on the
normal case is worse than no flag, because it trains the reader to skip it.

**M8 itself was mostly assembly.** The ledger screen needed one new API shape
— the whole row in one call, lines and allocations included, because a drawer
that needs three calls renders in three stages — and one new derived field.
Everything else was already in the service: void with a reason, mark
completed, allocate against a request line validated at the seam, attach from
the row. The screen's own contribution is what it puts side by side: what the
money bought, what it settled, and what proves it, in one place, on the row
where somebody is already standing.

## F23 — the ledger was still letting a number exist on its own

Six corrections to M8, and five of them are the same correction: a row of
money has to carry what makes it checkable, at the moment it is written, not
afterwards.

**No document, no row** (D85). The screen could attach evidence to a row that
already existed, which means a row could exist without evidence — and the ones
that stay that way are exactly the ones somebody will ask about. Posting now
takes its documents with it: uploaded first, linked in the same act, refused
without at least one nota, transfer proof or photo. A delivery note and the PO
are welcome and are not enough; *supporting is not proof*.

**A purchase says what it bought** (D86). Quantity, unit price, vendor. An
amount alone cannot be compared to the last time we bought the same thing,
which is the only way a price is ever discovered to be wrong. Payroll and the
electricity bill are exempt, because they are not purchases and nobody raises
a request for them — the same `is_purchase` flag that fixed the flag that
cried wolf (F22).

**No "allocated"** (D88). The word came from the procurement side, where a
payment covers a request line, and on a ledger screen it read as a budget:
part of the money spent, part still available. It is all spent. What the row
actually needs to say is whether a purchase names a request at all — four
words instead of two numbers.

**Void goes behind a sentence** (D89). It was a button beside "mark completed",
one accidental click from a row somebody was reading. Hiding it entirely would
be worse: an action nobody can find gets done in the database instead. So it
is one deliberate step away — *Something wrong with this row?* — and the panel
behind it says what void is for before it says how.

**The trail needed to say what changed** (D84). Who and when were already
recorded on every mutation. The owner asked for anomaly and fraud detection,
and that question is never "who touched the ledger this month" — it is "what
happened to *this* row", asked while looking at it. So the audit entry now
carries the fields: amount before and after a void, the account, the vendor,
the documents that arrived with a posting. The trail is read in the drawer,
on the row, not in a screen nobody opens.

And one that is not a correction but a fact of the business: **there are five
accounts, not four**, and one of them is leadership's. JAGO joined the list;
BCA 064's balance is shown only to whoever holds `approve_funds`, and marked
*leadership only* rather than left blank — a blank where an account should be
reads as a bug, and people file bugs about rules.

## F24 — the code had the account; the browser did not

"JAGO belum kelihatan." It was in the fixtures, in the contract, in the build —
and absent from the screen, because the sandbox lives in `localStorage` and a
snapshot saved before the account existed quietly won.

`hydrate()` merged the saved state over the fixtures table by table
(`{...initialState(), ...saved}`), so any table present in the snapshot
replaced the new one wholesale. Every visitor who had ever clicked anything
was carrying an `accounts` array from before, and would keep carrying it
forever — the demo would drift further from the code with every change to
reference data.

The fix is not to bump a version by hand, which is a thing to forget. The
stored snapshot now carries a **signature** of the shape and the reference
data — table names, account codes, user emails, transaction types — and is
discarded when it no longer matches. Anything that changes those invalidates
it automatically.

And the reset says so: *"the fixtures changed since your last visit, so the
sandbox started over."* Silently losing somebody's demo edits makes the app
look broken; naming the reason makes it look updated.

The general lesson is bigger than the demo. **Any client-held copy of
server-shaped data needs a way to know it is stale.** In Phase 2 the same
class of bug is a cached response, a service worker, or a stale local
database — and the same answer applies: store what shape the data was, and
throw it away when the shape moves.

## F25 — the same road, built twice, had already drifted

M9's brief was "one component used twice, because it is the same road". By the
time it was written, both copies existed — one in the request line drawer, one
in the ledger drawer — and they had already diverged: the ledger's had the
duplicate-bytes warning, the line's had the payment-proof handoff into the
posting form. Neither difference was a decision. That is what copies do while
nobody is looking.

One `<EvidenceStrip>` now serves both, and building it forced two things that
neither copy had:

**One document, several records.** A single invoice covers three deliveries; a
transfer receipt pays two lines. The strip offers the plausible targets — the
sibling lines of the same submission, the lines a payment settled — and
attaches the *same file* to each, with every link recording who said so.
Uploading the photograph three times would leave three files that nobody can
tell apart in a year, which is what the old shared drive is full of.

**The money-to-document path, read from the other end.** A ledger row now
shows the documents that live on the request lines it paid for: the photo
taken at the workshop door is visible from the bank row that funded it,
without either record holding a copy. It is displayed as *through
pr-26-08-18_01-L01* and cannot be edited from that end — the document belongs
to the line, and the ledger row is only looking along the link.

**And the browse screen found its real job.** `/accounting/documents` was
specced as "browse by entity, month, type", which is a filing cabinet nobody
opens. The number that earns the screen is the other one: **six files attached
to nothing**. Those are the chat uploads that arrived and were never claimed —
already visible, already counted, and now findable in one place.

Camera capture is one attribute (`capture="environment"`) and its own button,
because on a phone the difference between "open the camera" and "browse a file
tree" is the difference between the photograph being taken and the paperwork
following later, which is where the unexplained rows come from.

## F26 — "does the inbox put rejected files in the ledger?" — no, and that is the point

The question came in as a guess at what M10 was for: files uploaded to chat,
rejected in the review queue, recorded in the ledger. Half right, and the half
that is wrong is the interesting one.

**Reject is the road that never reaches the ledger.** Five roads leave this
queue, and only three of them produce a ledger row:

- *make a transaction* — money left, nobody raised a request; the file becomes
  its evidence
- *retro request line* — the request nobody wrote, written after the fact, then
  paid and allocated (D95). It is written **unapproved on purpose**: the board
  then shows it as *paid, not approved*, which is what happened. Writing it
  pre-approved would launder an unauthorised purchase into an ordinary one.
- *link to a row* — the money was already booked and this is its missing proof

The other two are the opposite of a ledger row. *Note* says "this is not a
company transaction". *Reject* says "no money of ours moved here". Both demand
a sentence, both keep the file, and neither writes anything to the books
(D94) — because the question that arrives months later is not "where is that
photo" but "what did we decide about it".

Two things the build settled:

**The duplicate warning has to point somewhere.** `nota-sinar-abadi.jpg` looks
like `trx-26-09-03_001`, already in the ledger. Saying so is not enough: the
warning names the row and offers the *link* road, prefilled. Posting it again
would invent money, and the difference between a warning and a trap is whether
it tells you what to do instead.

**The extraction's vendor is offered, not assumed** (D96). The first version
left the field empty, and posting was refused for a missing vendor whose name
was on the screen two inches above. It is now pre-selected on an exact name
match only — a near-miss quietly picking the wrong supplier would be worse
than the empty field, and the posting is still a person agreeing with the
reading rather than the reading being believed (A13).

The weekly count sits at the top for a reason worth restating: **it measures
the main road, not this screen.** A queue that grows means people are going
around the front door.

## F27 — a hand-drawn screen found two real errors in the model

M11 came in as a picture rather than a paragraph: a vendor block with orders,
payments and deliveries in one place. Building it to match found two things
the model had wrong, both invisible until the numbers sat next to each other.

**An over-delivery was being counted as value received.** HADI GLASS shipped
47 sheets against an order of 45, and the journey said Rp 425.000 was billable
— for goods nobody had asked for. The sketch's own note is the rule: *the two
extra sheets are a small vendor credit, not applied to any order here.*
`value_received` is now capped at what was ordered, and the excess is priced,
named and shown apart (D98). Without the cap, any supplier could raise an
invoice by shipping more than the order.

**A draft PO was billing its deposit.** CV SUMBER KAYU JATI had a Rp 111 juta
order still in draft, and the screen offered Rp 33,3 juta as billable, because
the deposit was 30% of a contract that nobody had issued. A deposit is earned
*on issue* — that is what a deposit is (D99). One flag on the formula, and the
line now reads "still contracted, and nothing is billable until more arrives".

Neither error existed in the old sheet, because the old sheet could not
compute either number. That is the argument for building the screen the owner
drew rather than the one the schema suggested: the layout put contract, paid,
received and billable in the same eye-line, and two of them disagreed.

**The vendor is the unit** (D97). One transfer on 19 August closed three
orders — Rp 12.680.000 to one, Rp 850.000 to another, Rp 280.000 rounding off
a third. Read order by order, each looks like a payment that never completed.
Recorded as three allocations against one transaction, and displayed as one
payment row naming all three, both facts survive: the bank moved money once,
the vendor closed three orders.

And the smallest thing on the screen is the one that will be used most: each
delivery says whether its *tanda terima* is on file. Half the shipments in the
demo are missing one half of their evidence — which is exactly the state a
real month is in, and the first thing anybody will chase.

## F28 — below or beside: the wrong question, asked usefully

Asked directly whether the supplier's detail should appear *below* the list or
*beside* it. Both were tried against the thing being shown, and both lose to a
third answer.

Beside: the detail is three stacked tables — an order with six columns,
deliveries with seven facts each, payments naming what they apply to. Half the
width is roughly 700px on the laptops this is read on, so every one of them
becomes a horizontal scroll, and the list next to it is reduced to a vendor
name and one number, which is not enough to choose from.

Below: the block is about 1,200px tall for a supplier with one order. The list
scrolls off, so switching supplier means scrolling up, and the list's own
purpose — comparing suppliers — is gone the moment one is open.

So: **a page of its own** (D103). The list stays a list, the detail gets the
full width it needs, and the vendor gets a URL. That last one was not part of
the question and is probably the biggest of the three: *"kenapa HADI GLASS
masih ada tagihan?"* arrives in chat, and the answer to it should be a link.

The general shape of this: when both offered options are about *where to put
it*, the constraint being fought is usually **how much room it needs**, and a
third option that changes the room is worth a minute before answering.


## F29 — the demo was quietly teaching the wrong business

Building the liquidation report meant asking what "money in" is, and the
answer turned the screen around. There is no client money in this business's
accounts at all: projects are billed elsewhere, and what reaches the operating
accounts is the owner moving operating funds in. The demo had a row saying
*"Client payment, HOTEL UBUD instalment 2"* — invented in an early fixture,
never questioned, and it would have shaped a schema.

Which is the finding. **A fixture is a claim about the business**, and one
nobody has read aloud can survive for weeks. The catch was not a bug report;
it was a sentence in passing while a report was being specified.

The report that came out of it is per transfer, not per month, because that is
the shape of the question — *sudah transfer 100 juta, kok sudah habis?* And
the demo answers it plainly: of seven transfers, three were spent through
before the next one arrived, one of them in a single day, and two went on
spending Rp 2,7 juta and Rp 16,3 juta past what was sent.

Two things the data cannot do, both for Phase 2:

- **Nothing marks a transfer as internal.** The pair — money leaving BCA 064,
  money arriving in BCA 271 — is two independent rows with the same amount on
  the same day. The screen matches them to name the source, and a match is not
  a fact. A `transfer_group_id` settles it.
- **No lineage between money in and money out.** Which is fine, and the report
  says so rather than inventing FIFO: it measures spending in the window
  against the transfer, and calls the excess what it is.

And one hole worth naming: an unclassified transaction type was skipping the
*did anybody decide this?* check entirely, because the flag read
`is_purchase ?? false`. Unknown types are normal here (Q10 keeps `EJO` as-is),
so the default was an exemption nobody asked for — Rp 2,48 juta of PACKING sat
outside the check. Now unknown means expected (D107).

## F30 — the plan cannot hold the obligations we already know about

The payment calendar works, and the first thing it printed was uncomfortable:
on the estimates the business itself supplied, the money runs out in **December
2026**, Rp 21 juta short, and every month after that is worse. Rp 150 juta in,
about Rp 173 juta out. That is the whole point of the screen — nobody could
see it before, because the bills lived in one person's head and the ledger
only looks backwards.

But it holds less than it should, and the reason is a schema gap.

**`po_schedule` has no expected date.** Its terms fire on an event —
`on_issue`, `on_delivery` — which is correct as a *rule* and useless as a
*date*. Of eight terms in the demo, exactly one carries a real date. So Rp
156.892.000 of supplier obligations cannot be placed in any month, and the
calendar states that under the verdict rather than spreading it evenly to make
the chart tidy. Phase 2 adds `expected_date` beside the rule: what we think
lands when, distinct from what makes it due.

Two smaller things the build settled:

**A part-paid bill is not a finished bill.** The first version of the forecast
counted only rows that had not been paid at all this month, so payroll — half
paid on the 9th — fell out of September entirely and the month looked Rp 17
juta cheaper than it is. Now the current month carries `planned − actual`,
floored at zero. The general form: *partly done* is a state, and code that
branches on *done / not done* will get it wrong in whichever direction is
worse.

**Category matching is a guess and has to look like one.** The plan finds
actuals by transaction type, which is right often enough to be useful and
wrong often enough to be dangerous. So a matched figure shows as `≈ Rp 8,5 M`,
a linked one shows plainly, and one ledger row can only ever be claimed by one
line (D110). Two lines on `RECCURING - PAYROLL` would have shown the same Rp
61 juta twice, in a number somebody was about to make a decision on.

## F31 — counting the paydays moved the year's failure forward a month

The calendar was built on one figure per line per month. Payroll went in as
Rp 120 juta on the 25th, and at month level that is harmless — the total is
the total.

It was not harmless. **Payroll goes out every Friday**, so a month with five
Fridays costs Rp 150 juta, not Rp 120 juta. Four of the next twelve months
have five. Adding that, plus two bills that happen once and were previously
impossible to write down at all, moved the month the money runs out from
**December to November** — and November is close enough that the answer
changes from *plan for it* to *do something now*.

The general shape: **a simplification that is correct at one altitude can be
wrong at another, and the way you find out is by trying to draw the lower
one.** Nothing was wrong with "one component per month" as a budget. It only
became a lie when somebody asked to see a month day by day.

So a line now has three shapes (D113), and `amount` is **per occurrence**
rather than per month:

- **weekly** — payroll. Four or five runs, counted rather than assumed.
- **monthly** — the electricity bill, the same day every month.
- **once** — certain, but only then: settling a vendor in October, paying the
  card off in November instead of carrying it. Written as a monthly line these
  would have been planned for in twelve months instead of one.

The one-off shape forced a rule to bend, correctly. D110 said two lines may
not claim one ledger category. But *pelunasan kartu kredit* shares `CREDIT
CARD` with the monthly card bill by its nature. So the rule is now about
**standing** lines only: claims resolve most-specific-first — a dated one-off,
then a line naming a vendor, then a plain category — and a ledger row is still
only ever claimed once.

And what the day view was built for showed up immediately. December's month
figure says it ends Rp 89,7 juta down. The day view says it **breaks on the
18th**, five days before that number, on a payroll run. Same month, two
different problems: one is *the month is too expensive*, the other is *the
money is in the wrong order*. Only the second one is fixed by moving a
transfer.

## F32 — the landing page was the last place that could lie

M13 was meant to be polish: phone widths, empty states, a guided walk. The
phone audit came back clean on every screen — no horizontal scroll at 390px,
drawers already full-screen with their action bar pinned — which was a relief
and not a finding.

The finding was on the page nobody had looked at since D1. The dashboard was
still the shell's sample page: invented sales orders for customers that do not
exist, a timber-yield chart for a business that has no timber yield **in this
system**, and a production trend in rupiah that came from nowhere. Every other
screen had been rebuilt on real derivations. That one had not, and it is the
first thing anybody sees — including anybody being walked through the demo.

The general shape: **the pages nobody argues about are the pages nobody
checks.** Every screen in this app got attention because somebody had a
question it could not answer. The dashboard was never wrong about anything,
because nobody ever asked it anything.

Rebuilt on the same store as the rest (D118), it now says: cash today, the
month the money runs out, what waits on a decision, what suppliers could
invoice, the twelve-month cash line, what falls due next, and the last rows
out. Its first sentence is *nothing on this page is invented* — which was
worth writing down precisely because it had not been true.

One small thing the tour found on its way past: the walk's **Next** button
collided with the ledger's own pagination **Next**. Two controls with the same
name on one screen is a real defect for anybody reading by keyboard or screen
reader, not a test artifact. Renamed to *Next step* / *Previous step*.

---

## D14 — what thirty-two findings add up to

Read end to end, the findings sort into four kinds, and the proportions are
the argument for having built the frontend first.

**Six were about the business, not the software.** An approval attributed to
whoever opened the laptop (F16). Over-delivery counted as value received
(F27). A deposit billed on an order nobody had sent (F27). A fixture claiming
client money in a business funded by its owner (F29). Payroll written as
monthly when it is weekly, hiding four runs a year (F31). Rp 156,9 juta of
obligations with no date on them (F30). None of these was a bug. Every one of
them would have been a migration.

**Nine were rules nobody had written down** until a screen had to display
something: what makes a line PAID, what a round marked TRANSFERRED does and
does not mean, when a variance needs an explanation, which document proves
what, what happens to a rejected file.

**Eleven were ordinary defects** — a cap in the wrong direction, timestamps
sorted as text, a stale snapshot beating the fixtures, two copies of one
component drifting apart. Cheap here, expensive after a migration.

**Six were about how the work is read** rather than what it does: a list read
twice is not the same screen (F18), below-or-beside was the wrong question
(F28), the pages nobody argues about are the pages nobody checks (F32).

### The three that would have hurt most

1. **F29 — the business model in a fixture.** A demo row said *"client
   payment"*. This business receives no client money into these accounts; it
   is funded by its owner. A schema built on the other assumption is wrong at
   the root, and it survived three weeks because nobody read the fixture
   aloud.
2. **F16 — the approval identity.** Every approval was being attributed to the
   wrong person, and no line of code was wrong. Only a real meeting, on a real
   laptop that was not the CEO's, could produce it.
3. **F27 — two errors found by a hand-drawn picture.** The owner sketched a
   screen; building the sketch exposed that value-received and billable-now
   were both computed wrongly. The drawing was the specification and the test
   at once.

### The method, stated once

Build the screen that has to show a number somebody can check against
reality. The purchase tracker and the payment calendar produced four of the
six business findings; the screens that mostly list and filter produced almost
none. **A screen that cannot be wrong cannot teach you anything.**

## F33 — three questions about one screen, and a self-test stuck in the past

The owner read the meeting board and asked three things. All three were right,
and the third one found a defect nobody was looking for.

**"An item already paid should not count toward *to pay if this goes
through*."** It was counting. The board's picked-total summed what each line
asked for, and some picked lines are *paid, not approved* — bought first,
approved later. Approving those commits no new money. The fix is one rule:
the total counts `amount − already paid`, floored at zero. But the approval
figure is still the real figure for the decision, so both are shown when they
differ, with the already-paid part named (D124).

**"What is the difference between APPROVED *Approved, not paid* and WAITING
FOR PAYMENT *Approved, not paid*? Aren't they the same?"** For the decision in
the room — yes, identical. The ladder separates them by whether the line sits
in a funding round that has been approved or transferred: *approved* versus
*approved and the cash is already in the paying account*. A real distinction,
and one the screen was not showing, so it printed two different words for what
read as one meaning. Fixed by saying the thing that differs — *waiting on
funding* or *cash is in the account* — rather than repeating the caption
(D123).

Worth noting what building that fix exposed: the first attempt showed *"in
round X"* versus *"not in a payment round"*, which was also wrong. Every line
in the list was in a round. Only looking at the running screen showed that the
difference is the round's **state**, not its existence.

**"What does *worth knowing before the yes, rather than on Friday* mean?"**
It meant: if you approve everything still waiting, the transfer needed goes up
to X, and it is better to see that while deciding than to have the person
making the payments discover it days later. "On Friday" assumed a weekly
payment run this business has never described. The sentence now says the thing
instead of gesturing at it.

### And the defect nobody asked about

The demo's own refusal probes — the page whose whole point is *proof that the
refusals are real* — led with:

> A8 — approving above the amount requested · expect `422
> approved_above_requested`

**That rule was deleted in D76**, because prices move between the request and
the meeting. The probe had been failing ever since, on a page nobody opens
unless they are already suspicious.

A self-test that asserts a deleted rule is worse than no test: it produces a
red row that everybody learns to ignore, and it occupies the slot where a live
rule's test should be. The slot now holds the rule that replaced it — a
request with no document behind it is refused (D125) — and it passes, with the
five probes beside it.

**The general shape: a test is a claim with an expiry date.** When a decision
is reversed, the thing asserting the old decision has to be found and changed
in the same act, or it becomes furniture.

## F34 — a status that promised something the system cannot deliver

One day after the meeting board was corrected to explain the difference
between `APPROVED` and `WAITING FOR PAYMENT`, the owner removed the
difference — and gave a reason that was better than the fix:

> *uang yang sudah dianggarkan bisa jadi dipakai untuk item approval yang baru,
> sehingga item approved lama tidak ada anggarannya jadi nominal uangnya harus
> diajukan kembali*

**Cash is fungible.** Money transferred into the paying account for last
week's approvals is spent by whichever payment is actually made first. So an
approval from last week can find its funding gone — spent on something
approved today — and the amount has to be asked for again.

Which makes `WAITING FOR PAYMENT` a lie in a single word. It meant *approved,
and the cash for it is in the account*, and the cash was never **for** it. The
ladder is now seven values, and approved-and-unpaid is one of them.

What is worth keeping is the shape of the error. The status was not invented
here — it is the running system's own vocabulary, carried over verbatim under
a standing rule not to tidy the business's words. That rule is right, and it
does not extend to a word that encodes a claim about money that is not true.
**Carrying vocabulary faithfully is not the same as carrying a model
faithfully**, and the difference only shows up when somebody asks what a word
promises.

The correction that preceded it is instructive too. Asked *"aren't these the
same?"*, the honest answer was "for the decision in the room, yes" — and the
fix made the screen explain the distinction more clearly. A better answer
would have been to ask what the distinction was *for*, which is the question
the owner answered a day later. **Explaining a distinction is not the same as
justifying it.**

So the board now states the thing the status used to hide: Rp 15.771.000 of
what is already approved has no money behind it, nothing is reserved, and an
older approval can lose its funding to a newer one and have to be asked for
again.

## F35 — an instruction is said once, and only a column catches it

The instruction field existed from D64, and it was reachable in two places:
the line drawer on the requests board, and the approver's chat card. Neither
is where an instruction is actually produced. It is produced in the room,
out loud, while the item is on the screen being argued about — *"only if they
deliver before the 20th"* — and by the time anybody has opened a drawer to
record it, the meeting has moved to the next item.

So it needed to be a column, which the owner asked for in one line. What
building it clarified is the attribution question underneath.

An instruction is leadership's word (D64) and only an approver may record one.
But the laptop in the room is usually a staffer's — the same fact that
produced F16, where approvals were being attributed to whoever opened the
session. If a staffer types what the CEO just said, whose instruction is it?

Three answers, and only one of them is honest:

- **record it as leadership's** — the same lie F16 was about, in a smaller font
- **refuse it** — the instruction is lost, which is the problem we started with
- **carry it as the meeting's words, and let the approver make it theirs** —
  it travels with the question, prefills their instruction field, and becomes
  an instruction the moment they send it back, from a field they can edit

The third one is built (D127). A `meeting_note` on the request is not a
`LineNote`: one is context attached to a question, the other is an instruction
attached to a decision, and keeping them separate is what lets a staffer type
without anybody's name ending up on words they did not choose.

The small print worth keeping: the instruction used to be rendered inside the
item column as well. With a column of its own, that copy became a duplicate —
the same text twice on one row, which reads as two instructions. Removed. A
new column is not additive; it takes ownership of the thing it shows.

## F36 — the PO module was the last placeholder, and the terms were the reason to build it

`/procurement/po` had been an eleven-line placeholder since D1, through a
fortnight in which the tracker, the calendar and the liquidation report were
all built. It survived because the tracker answers most of the same question
from the other end — *what do we owe HADI GLASS* rather than *what did we
agree on po-26-08-14_01* — and one of those two is enough to get through a
week.

What only the order-first view has is the **schedule**, and that is where the
finding is. A payment term is not a bill. It is a **trigger plus a share**:
30% on issue, the rest on delivery. Which means a term has two independent
questions — has the trigger fired, and has the money that reached this order
already covered the terms before it — and the second one is a guard nobody
had written down:

> **po-26-09-02_01-M02 · PROGRESS · goods have started arriving ·
> BLOCKED — po-26-09-02_01-M01 has not been paid**

An overhaul delivered, the progress payment's trigger fired, and the 50%
deposit never sent. Without the ordering rule, that order reads as *Rp 14,5
juta payable* and somebody pays the wrong half. With it, Rp 7.250.000 is
payable and the rest says why it is not.

The ordering itself is forced rather than chosen: **nothing in a bank transfer
says which term it was for.** Oldest-first is the only defensible reading, and
writing that down is more useful than the code implementing it.

Two smaller things the build settled:

**Amendment is supersession, and receipts have to follow the live line.** The
first version left a delivery pointing at the superseded row, so amending a
line made the goods that had arrived against it disappear from the order. The
fix is one line; the lesson is that supersession is not finished when the new
row exists — everything that pointed at the old one has to be told.

**A close that refuses has to say what it is refusing about.** Listing *Rp
14,5 juta unpaid · nothing filed against it* and then offering to close it
anyway with a written reason is the shape that works, because real orders end
untidily and a rule with no exit gets worked around outside the system.

And one regression, caught by the owner within a day of shipping it: the new
instruction column on the meeting board opened the line drawer on the first
keystroke, because the row's click handler was still underneath. **A control
placed inside a clickable row inherits the row's job unless it is told not
to** — the same fix already existed twenty lines below, on the cell holding
the quantity and amount inputs, which is exactly the kind of precedent worth
reading before adding the next cell.

## F37 — a rule that was right about evidence and wrong about time

D101 required both halves before a delivery could be recorded: the photograph
of the goods, and the signed tanda terima. The reasoning held — they answer
different questions, and a dispute three weeks later needs both.

Then the owner said what actually happens:

> *item yang dikirim dari luar biasanya datang di luar jam kerja jadi mereka
> harus lapor, sementara tanda terimanya bisa menyusul*

The truck comes at 23:40. The rule does not produce a tanda terima at 23:40;
it produces **nothing recorded at all**, and the arrival is reconstructed from
memory the next afternoon. A rule that cannot be followed at the moment it
applies is not a strict rule, it is an absent one.

So receiving became two acts (D131):

- **Report** — anyone who was there, with a photograph. Recorded, numbered,
  visible on the order and in the tracker.
- **Confirm** — procurement, with the signed tanda terima, the QC name, and
  the count somebody did in daylight.

And the part that keeps the original rule intact: **only a confirmed receipt
counts as value received.** The 80 sheets that arrived last night are on the
screen and in no total. The order still says *150 of 400 received*, because
150 is what has been acknowledged in writing.

Two things worth keeping from how this was answered.

**The question I asked was not the question that mattered.** Q28 asked who is
accountable if the person filing cannot open a PO, and assumed the answer
needed a Chat bot and a new inbox. The real answer was that accountability was
never in doubt — there *is* a procurement team with access — and the only
problem was the clock. The feature that looked necessary (a chat road into the
exception inbox) turned out to be optional; the thing that mattered was
splitting one act into two.

**The audit row carries how long the paper took.** `hours_after_arrival` on
the confirmation is the only way to tell the difference between this road
working as intended and this road being used to skip the paperwork
permanently. A concession without a measure becomes a habit.

## F38 — the order had no way to become a promise

The PO module could create an order, amend it, pay it and close it. What it
could not do was the thing an order is *for*: tell a supplier.

Three gaps, and the owner named all three in one sentence — confirmation, a
PDF for WhatsApp, an expected delivery date.

**Confirmation.** A purchase request is a request to spend. A purchase order
is a promise made to a supplier in the company's name. The demo had treated
them as the same decision, so `createPo` issued by default (D100) and nobody
in leadership ever saw the order the vendor would receive. Now: DRAFT → *asked
leadership* → *confirmed* → issued, with issuing refused until the confirmation
exists (D132). *Waiting on leadership* is its own visible state, because that
is where orders actually stall.

**The PDF.** The temptation was a PDF library. What that buys is a second
description of the same order, free to drift from the first — and the vendor's
copy is exactly the one you cannot afford to have disagree. So the vendor's
document is the app's own print view, A4, printed to PDF by the browser, and
sent through a prefilled `wa.me` link (D133). One renderer.

Building it exposed something wider: printing any page carried the sidebar and
the topbar. Fixed in the shell rather than on this page, because the next
thing somebody prints will be a ledger extract for an auditor.

**The date.** Without a promised date, nothing is late — it is merely absent,
and *absent* does not start a conversation with a supplier. With it, the demo
immediately said something nobody had asked it: **po-26-08-14_01 is 3 days
late.** That is a fact that existed all week and had nowhere to appear.

The general lesson in all three: **a module is finished when it can do the
thing outside the building.** Create, amend, pay and close are all internal.
An order that never reaches a vendor is a spreadsheet with better manners.

## F39 — payroll is where every small carelessness becomes somebody's wages

HRD was built in one pass: employees, biometric attendance, overtime, payroll,
payslips. Three things it taught, and a bug that is worth more than the three.

**The machine produces times, not days.** A fingerprint reader records
whatever it records. In a fortnight of demo data — shaped like a real export,
not a clean one — two people have no check-out and one day is missing
entirely. The tempting fix is to assume: *nobody works past six, call it
17:00*. That assumption pays for a day nobody can account for, and it does it
silently, every time. So a day with one stamp is **open**, worth nothing, and
closed only by a person who types the time and says why (D137).

**The machine cannot tell work from presence.** It knows somebody was in the
building at 19:40. It does not know whether they were finishing a table or
waiting for a lift. Deriving overtime from attendance would pay for all three,
so overtime is claimed and approved, and only approved hours reach a payslip
(D138).

**A payroll over open days is a number that looks exact and is not** — and the
people it is wrong about are the ones paid by the day, who are least able to
argue. So approving a run is refused while any day in its period is open, with
the count and a link to clear them (D139).

### The bug

The period walk built each date with `d.toISOString().slice(0, 10)`. That
converts back through UTC, and 2026-09-07 00:00 in WITA is 2026-09-06 16:00Z —
so every day came out one early and **the last day of every period was
silently dropped**.

On a monthly salary nobody would ever notice. On a daily rate it is a day's
wages, every run, for every workshop employee. It surfaced only because one
line said *4 day(s)* where the fixture plainly had five.

This is the same fault as F17, where timestamps were compared as text: **an
office day is not a UTC day, and any code that goes near a timezone to produce
a date will eventually be wrong by one.** The fix is to never go near one —
walk the dates as strings.

Which is the general lesson worth keeping from this module. Everywhere else in
this system a wrong number is an argument. Here it is somebody's pay, they
find out by counting their money, and they are the person with the least power
to get it corrected. Payroll earns its refusals.

### And what is deliberately not built

BPJS Kesehatan, BPJS Ketenagakerjaan and PPh 21 all apply and none has been
described to us. Payroll computes **gross** and the payslip says so in
Indonesian (D140). A deductions block full of zeroes would read as *nothing
was deducted*; a payslip that states it computes bruto reads as *this part is
not done yet*. Q30–Q32 hold the questions — which deductions, what an overtime
hour is worth here, and whether payroll is weekly, monthly or both.

---

## F40 — the file the machine actually produces

The owner sent the real export: *ALL DAILY WORKER PAYROLL — WEEK 1 SEPTEMBER
(31–04 SEPTEMBER 2026) — PASTE HERE BIOMETRIC ORIGIN DATA*. Eight columns,
981 rows, 35 people, eight working dates. It is worth reading before designing
anything, because it disagrees with every assumption a clean model makes.

### What is in it

```
Department,Name,No.,Date/Time,Location ID,ID Number,VerifyCode,CardNo
OUR COMPANY,Sumiati,6,29/08/2026 07:54:23,104,,FACE,
```

One row per **tap**. Not a check-in and a check-out — a tap. The person is the
machine's own `No.` (6 to 138, with gaps); the name is whatever was typed into
the device; `VerifyCode` is `FACE` or `FP` depending on which reader worked
that morning; `Date/Time` is local, `DD/MM/YYYY`, with the hour sometimes
unpadded (`01/09/2026 7:26:40`).

### What is wrong with it, counted

| | |
|---|---|
| Taps | 981 |
| People | 35 |
| Person-days | 227 |
| Double taps inside two minutes | 29 |
| Days with exactly 4 or 6 taps (a clean day) | 179 |
| **Days with 1, 2, 3, 5 or 7 taps** | **48** |

The distribution: 8 days with one tap, 2 with two, 26 with three, 138 with
four, 10 with five, 41 with six, 2 with seven.

Read the awkward ones directly:

- **Karjo, 31/08**: 07:21, 12:02, 12:33, **12:48**, 17:32, 17:58, 19:59. Six
  of those are a long day with lembur. The seventh is 12:48, twenty-six
  minutes after he came back from lunch, and nothing in the file says why.
- **Roni, 30/08**: 07:29, 12:04, 16:00. He went to lunch and came back without
  scanning, or he left at noon and the 16:00 is somebody else's finger.
- **Trisno, 30/08**: 07:43, **07:54**, 12:07, 13:02, 16:01. A second tap eleven
  minutes after the first — too far apart to be a finger that did not take.

### What this decided

**One row per tap, and the day is computed** (D141). A schema with
`check_in`/`check_out` columns cannot hold this file without discarding rows,
and the rows it discards are exactly the ones somebody needs to look at. The
six slots — *masuk, istirahat keluar, istirahat masuk, pulang, lembur mulai,
lembur selesai* — are a reading, applied on read, and a wrong reading is then
a one-line change rather than a re-import.

**Two minutes is the dedupe window.** Long enough to swallow a finger that did
not take on the first try (29 of those), short enough that Trisno's eleven
minutes stays visible as the unexplained event it is.

**Anything the reading cannot place leaves the day in `review`.** Not a
best guess, not an average of the others — 48 of 227 days, each one somebody's
wages. The timesheet exists to show which they are, and a payroll run over the
period is refused while any remain (D139).

**A number nobody is registered under is reported, never created** (D143). The
file's `No.` is the machine's numbering; the names in it are inconsistent
spellings typed at a keypad. Importing a stranger would put somebody on a
payroll who was never hired.

### The thing the file taught that the interview did not

Everyone describes attendance as *masuk dan pulang*. The device describes it
as a stream of moments, and the gap between those two descriptions is where a
payroll goes wrong. Twenty-one per cent of the days in a single ordinary week
could not be described by the rule everybody agrees on. That is not a data
quality problem to clean up before go-live; it is the steady state, and the
system's job is to make it **visible and cheap to resolve** rather than to
pretend it away.

---

## F41 — the two rules that decide whether a day is paid

The owner answered Q33 and Q34 in two sentences: *sakit* is paid with a
doctor's letter, *cuti* is paid only against what that person is owed — and
every person's number is different; overtime needs HRD, and leadership with
the overtime letter. Building them changed how the payroll is shaped more than
the sentences suggest.

### A letter is evidence, not a checkbox

The obvious build is a `has_doctor_note boolean` on the mark. It is wrong in a
way that shows up in month two: somebody ticks it, the letter never arrives,
and nothing in the system can tell the difference between *we saw the letter*
and *we meant to ask for it*.

So the letter goes where every other document in this system goes — uploaded
once, linked to the mark, with the name of whoever linked it and the minute
they did (ADR-010). `Surat Dokter` and `Surat Lembur` became document kinds
like a nota or a receiving photo, and `day_mark` and `overtime` became things
a document can hang from.

The payoff was not planned and is the best part of it: because the day's value
is **derived**, a letter handed in three days late makes that day paid the
moment it is attached. No recalculation, no correction entry, no re-running a
payroll. The screen showed it directly — Utami's 1 September went from *nilai
hari 0* to *nilai hari 1* on the upload, with the sentence under it changing
from "Sakit tanpa surat dokter — tidak dibayar" to "Sakit dengan surat dokter
— dibayar penuh".

### A leave balance must never be stored

*Cuti hanya jika punya nilai cuti berbayar* invites a `remaining_leave_days`
column that each approved day decrements. Every system that does this is
eventually wrong: a mark gets removed, a day gets re-dated, an import is
replayed, and the counter drifts. The person it drifts against is the one who
loses a paid day, and they find out at the worst moment.

So the entitlement is stored — per person, because the owner was explicit that
it differs — and what has been *used* is counted from the marks in that
calendar year, in date order. The first days of the entitlement are the paid
ones; past it, the day is still recorded and simply not paid. Roni, with five
days and five already taken in March, shows exactly that: "Cuti di luar hak —
jatah 5 hari tahun ini sudah habis." Nothing refused his cuti. It just is not
paid, and the reason is on the screen rather than in somebody's head.

### Two signatures check two different things

The temptation with *HRD dan pimpinan* is to treat it as one approval needing
a second click. It is not. HRD checks a **fact** — was he here, are these the
hours the taps show. Leadership takes a **decision** — was this work worth
paying for. That is why `approve_overtime` is a fifth authority rather than a
reuse of `approve_goods` (D24's whole point): approving that a table arrived
and approving that a man is paid for four extra hours are not the same
judgement, and the owner may not always want them in the same pair of hands.

The letter is what makes the second step real. Leadership's approval is
**refused** while no `Surat Lembur` is attached, and the button on the screen
is disabled with the reason on it — because approving without the letter is
approving a number somebody typed. HRD's step is *not* gated that way: the
hours can be checked while the paperwork is still being written, which is how
it actually happens in a workshop.

And the claim is never hidden while it waits. `waiting_hrd` ·
`waiting_surat` · `waiting_leader` are separate stages on the list precisely so
that a claim stuck at *menunggu surat lembur* for a week is visible as the
thing somebody has to chase.

### What it cost

One column (`paid_leave_days`), two document kinds, two link entities, one
authority, and two extra timestamps on a claim. No stored balances, no status
columns beside the signatures, no recalculation job. Everything that decides
money is read from what somebody actually did, each time it is asked.

---

## F42 — the sheet was the design

The owner corrected the overtime rule with one sentence about paper: leadership
signs **production** overtime, which is *satu lembar penuh isi banyak nama
karyawan lembur beserta tugas dan item yang dikerjakan*; staff have a sheet per
session with a screenshot of the work, and HRD decides — default yes.

Three things fell out of that, in order.

### One form with an optional field would have been wrong

The first instinct is one overtime record with a "needs leadership?" flag. But
the two documents are not variants. A production night is a **batch**: forty
names on one page, signed once, because that is how a supervisor actually
works — he does not sign forty things. A staff session is a **person and an
evening**, and its evidence is not a signature at all, it is the work: a
screenshot of what was on the screen.

Modelled as a sheet with lines, both are natural. Modelled as a claim with a
flag, the production case needs a grouping that does not exist and the staff
case needs an approval that should not.

### The default is the decision

*HRD memutuskan dibayar atau tidak (default ya)* is not a UI nicety. Read
literally, it inverts the burden: the person already stayed, their report is
attached, and what is left to decide is whether to **take the payment away**.
So a staff sheet ships `paid = true`, and HRD's act is either "I looked, still
paid" or "not paid, because —", which writes a reason.

The alternative — undecided means unpaid — would have quietly punished every
session nobody got around to reviewing, and the people it would punish are the
ones who worked late on something nobody was waiting for.

### The payroll document was carrying production data all along

The production sheet's lines say *item apa, proses sampai mana, berapa*. That
is not payroll. It is a production report that happens to travel on a payroll
document, and the moment somebody copies it onto a whiteboard, the workshop's
version of Thursday night and HRD's version begin to disagree.

So the line carries the work order number, the stage and the quantity, and
**leadership's signature posts them to the production board** — keyed by sheet
number, so signing twice adds nothing. Typed once, moved by the act that was
already happening.

Which is what made a seventh service necessary (D148). The board it posts to
answers a question the business could not answer before: not *what are we
building* — a workshop always knows that — but **which of the eleven things on
the floor is the one that is late**. The fixtures are deliberately not tidy:
three orders past their date, one not started with four days left, and one
where finishing is reported on seven doors while only four were sanded. That
last one is physically impossible, and the board says so in a sentence instead
of averaging it away.

### The permission that the flow forced

The Direktur may sign a production sheet. He does not hold `production.update`
— he is not the workshop. But his signature *causes* a production posting, and
a rule that refused it would leave one act half-done: hours paid, work not
recorded, and nobody told.

So `recordProgress` accepts `approve_overtime` for entries whose source is
`overtime_sheet`, and nothing else. The authority for the posting is the
signature that caused it. Writing that rule at the point it is enforced, with
the reason beside it, is cheaper than discovering it as a 403 in a demo three
weeks from now — which is exactly how it was discovered here, on the first
end-to-end run.

---

## F43 — master data is where the honest gaps live

Adding projects, products and bills of material was mostly straightforward
typing. Three decisions in it were not, and all three are about what to do with
what the data does **not** know.

### A product is not a catalogue item

The tempting shortcut is one `items` table with a flag. It is wrong in a way
that shows up immediately: `procure.items` is **half uncurated by design** —
a purchase can name something nobody has catalogued, and the system records it
rather than refusing the purchase (D26). A product is the opposite. It is
quoted, drawn, put on a work order and made; it exists before anything
references it and is always curated.

Two tables, joined by code at the seam. The bill of material is the join, and
it is the only place the two ideas touch.

### Waste is not part of the quantity

`qty` is what the drawing says. `qty × (1 + susut)` is what has to be bought.
Six boards of jati at 12% waste is 6,72 — and the workshop that ordered six
finds out on a Saturday. Keeping them in one column would have been simpler to
type and would have quietly produced the wrong purchase requisition forever.

### The cost must be allowed to be incomplete

The display rack's BOM has a steel frame that the catalogue cannot price: it is
bought as a fabrication from a vendor, not as a stock item. There were three
options — refuse the component, price it at zero, or show the total as
incomplete.

Refusing it means the BOM stays in somebody's head. Pricing it at zero produces
a number that **reads as finished** and is wrong by whatever the frame costs,
which is the worst of the three because nothing on the screen says so.

So the material cost is computed on read, components without a price are
counted and named, and the total carries *belum lengkap* wherever they exist.
The same rule the payroll screen already follows: a figure is allowed to be
missing, never allowed to be quietly wrong.

One more thing fell out of it. The price comes from the catalogue's **standard
price** where there is one and from the **last price paid** otherwise — and the
line says which it used. A last price is a hint, not a price list (D33), and a
cost built partly out of hints should admit it.

### What is deliberately still missing

Labour. The BOM prices materials and stops, and says so on the screen. An
invented hourly rate would flow straight into a quoted price, which is the
furthest possible place for a made-up number to end up (Q38). Versioning is the
other gap: a BOM is current-state, every change audited, and pinning a revision
to the work order that used it is a table nobody needs until the first dispute
about what a chair was supposed to contain (Q36).

---

## F44 — "harus ada" is a statement about what the system must notice

The owner's instruction was one line: every item must have a working drawing,
a finished picture and a size. The naive reading is three fields. The useful
reading is different, and it changed the shape of the screen more than the
shape of the table.

**If something must be there, the system has to be able to say it is not.**
That is the whole value: nobody is going to forget the drawing for the table
they are building this week — they will forget it for the product somebody
quotes in March. So the catalogue now carries a completeness column that names
what each product lacks, in words: *belum ada gambar kerja, gambar jadi*.
Six of the seven demo products are incomplete, which is what a real catalogue
looks like in month one.

**Which is why the size is three numbers.** It was free text —
`"2200 × 1000 × 750 mm"` — and free text cannot be checked. A product with
`dimension: "menunggu dari vendor"` reads as filled in. With
`length_mm`/`width_mm`/`height_mm` the question *does this product have a size*
has an answer, and anything that is not an axis (a diameter, a thickness) went
to `dimension_note` rather than being lost. The demo keeps one product — the
steel-framed rack — with no numbers and a note saying the vendor has not sent
them, because that is the honest state and the screen should show it as a gap
rather than as a size.

**Two drawings, not one.** *Gambar kerja* is what the workshop builds from;
*gambar jadi* is what the client was shown and what QC checks against. A single
"drawing" field would have silently lost whichever was filed second, and the
two are asked for by different people at different moments. Both travel the
same road as every other document here (ADR-010): uploaded once, linked to the
product by code, carrying who filed it and when — which is what makes *is this
the current drawing* answerable. A revision is a **new file against the same
product**; the older one stays, because a piece built last month was built from
it (A5).

### The order lines were the quiet half

*Di orders harus ada item dan jumlahnya* looks like a smaller request. It is
the one that made the project a real record. Before it, a project was something
spending got tagged with; now it says what was sold, and the production board
already knew what was being made — so the two can be read side by side, matched
on the product code.

The three demo projects show why that column is worth having:

| | Ordered | In production | Finished |
|---|---|---|---|
| BABY ISLAND — meja | 4 set | 4 | 3 |
| VILLA SEMINYAK — pintu | 10 daun | **12** | 0 |
| HOTEL UBUD — everything | 102 items | **0** | 0 |

The middle row is a real thing that happens — two spares were added to the work
order and nobody wrote it down against the order. The last row is a job signed
three weeks ago that nobody has started. Neither was visible anywhere in this
system, or in the spreadsheets it replaces, until these two tables sat next to
each other.

---

## F45 — one column closes the loop

The owner's question was two sentences: can a BOM line become a PR, so that at
the end of a project we can compare actual production cost against the
projection. Both halves were nearly there already — the BOM knows what a unit
needs, procurement knows what was bought — and the thing missing between them
was a single column.

### Why matching afterwards does not work

Without a link, reconciling means matching by item code and date: *this
plywood bought on 3 September was probably for the BABY ISLAND tables*.
Probably. The moment two orders run at once — which is the normal state of this
workshop, six open work orders on a Friday — the same plywood is plausibly for
either, and any split is invented. Worse, it is invented **afterwards**, by
whoever is preparing the report, which is exactly when the answer is least
checkable.

`pr_lines.source_wo_no` costs one column and removes the guesswork entirely:
projected and actual become two sums over the same set of rows.

### Draft, not submitted

The button creates a **draft** purchase request. That is deliberate and it is
the difference between a useful tool and a dangerous one: a bill of material
says what a piece *should* need. It does not know that half the plywood is
already in the rack, that the client changed the finish, or that the last
delivery was short. A list that went straight into the approval queue would
put the workshop's assumptions in front of the CEO with somebody else's name
on them.

So it lands where a person has to read it, price it and ask for it — the same
place any other request starts.

### The comparison has to compare like with like

The tempting screen subtracts *everything booked to this project* from *the
material projection* and prints the difference. It would be wrong every single
time: the ledger total includes installation, delivery, subcontracted metalwork
and whatever else the project touched, none of which is in a bill of material.

So the report puts **materials against materials** — projection against what
was asked, approved and paid on lines traceable to this project's work orders —
and shows the ledger's whole project spend **separately**, saying in words what
it contains. Two honest numbers beside each other beat one dishonest
subtraction.

The same restraint applies to labour: it is in **neither** side. The BOM does
not price hours (Q38), so putting overtime into the actual column would make
every project look like it beat its projection by exactly the amount of work
nobody costed.

### What the demo shows about its own numbers

Raise a PR from a BOM and the asked total matches the projection **exactly** —
because both read the same catalogue price. That is not a bug and the screen
says so: divergence appears later, when a quantity is edited, a vendor quotes
differently, or a second request goes in because something ran out. Which is
the honest description of where an overrun actually comes from, and a system
that showed a variance at draft time would be inventing one.

---

## F46 — the cheapest invoice was the most expensive wood

The owner asked for timber to be counted from log to board, with total cubic
metres set against what each purchase cost, per vendor. Building it produced a
number that is worth the whole module.

### The arithmetic

Two suppliers, same species, same sawyer:

| | Rp / m³ log | Rendemen | **Rp / m³ papan** |
|---|---|---|---|
| CV KAYU MANIS SELATAN | **15.507.497** | 44,8% | 34.630.228 |
| CV SUMBER KAYU JATI | 18.181.818 | 61,4% | **29.554.050** |

Kayu Manis is **Rp 2,7 juta cheaper** per cubic metre of log and **Rp 5,1 juta
dearer** per cubic metre of wood that can actually go into a table. Every
figure in the left column is on an invoice. Every figure in the right column
requires measuring what came out of the saw, and without it the business would
keep buying the wrong logs while believing it was saving money.

That is the entire justification for an eighth service.

### Three rules the numbers forced

**A partly-sawn load must not set a price.** `kyu-26-08-26_01` has three of its
five logs cut. Dividing its boards by all five logs reads as 39% yield when the
sawyer is getting 61%; dividing the whole invoice by those boards prices the
wood half again too high. So yield and cost-per-board-metre are computed over
**the logs actually sawn and their share of the invoice**, and the load says in
words how much is still in the yard.

**Vendors compare within one species.** The first version summed each vendor's
timber into one row and Kayu Manis came out at Rp 12,9 juta per log metre —
because their mahoni, at a third of the price of jati, was averaged in with it.
That made the cheaper *species* look like a cheaper *supplier*. Splitting by
vendor **and** species fixed it, and it is the same category error the project
cost report avoids by never subtracting the ledger's project total from a
materials projection.

**The seller's number is kept, not corrected.** Our measurement of the July
load came out 0,16 m³ *below* what was invoiced. The instinct is to overwrite
one with the other. But the difference is the conversation with the vendor, and
a system that stores a single figure has already lost that argument. Both are
recorded and the gap is stated.

### And the one that is deliberately not built

The board list is what came **off the saw**, not what is left in the rack.
Nothing draws it down as production consumes it (Q40), and the screen says so
in as many words. A stock figure that is never decremented is a lie; one
decremented by guesswork is a worse lie, because it looks maintained. What is
missing is not a table — the BOM already knows what a run should take — it is
somebody in the workshop writing down what was actually pulled off the pile.

## F47 — one comma, and a man was paid Rp 105

The company's overtime form was exported from a spreadsheet and read straight
in. The first row came back as **Rp 105 for 0 jam**.

The file said `"105,000"`. A spreadsheet quotes any field containing a comma,
and `line.split(",")` does not know that: the cell became two, every column
after it shifted one to the left, the hours landed in the signature column and
the rupiah lost its thousands. Nothing threw. The number was simply wrong, on
a screen whose whole job is to be trusted with wages.

The fix is fifteen lines that respect quotes (`src/lib/csv.ts`), used by the
overtime form and by the biometric import beside it — a name or a location with
a comma in it would have done exactly the same thing there. What is deliberately
**not** handled: newlines inside cells, other separators, encodings. Those have
not happened, and inventing for them would hide the day they do.

The lesson is not "use a CSV library". It is that a parsing bug in this domain
does not look like a parsing bug. It looks like a payslip.

## F48 — the payroll run that covered a week nobody worked

Building the weekly recap turned up a demo that had been quietly wrong for
several sessions: the payroll run covered 24–28 August, and the attendance file
started on the 29th. Every daily worker read **0 hari**, every payslip printed
an empty grid, and the screen was perfectly honest about it — *No day counted
in this period* — on forty rows at once.

Two things came out of it.

The first is that the run's period must be the week the timesheet actually
covers, which is a fixture fix and was one line. The second is the real one:
even on the corrected week, Karjo's slip showed **five days of hours and paid
1,5 of them**. Nothing was wrong — three of his days are in `review` because
the reader missed an *istirahat* tap, and a day nobody has read is worth
nothing until they do (D141). But a payslip that prints the hours and then
pays a third of them, with no sentence in between, is the payslip somebody
brings to HRD angry, and they would be right to.

So the slip marks those days `?`, names them in words, and says the same about
overtime the machine saw and nobody approved: *10,27 jam catatan mesin, 2 jam
dibayar*. The figures did not change. What changed is that the paper now
answers the question it was provoking.

## F49 — the delivery that nobody could find afterwards

Building stock turned up the gap it was built to close, and it is worth naming
precisely because it had been invisible for twenty-six milestones.

A request was raised, approved, ordered, delivered, confirmed with a photo and
a signed tanda terima, and paid. Every one of those steps had a screen and a
document. And then **the goods stopped existing.** Nothing in the system knew
that sixty sheets of plywood were in the gudang, so the next person to need
plywood had exactly two ways to find out whether there was any: walk to the
rack, or raise another request.

The fix is one call — confirming a receipt writes a stock movement — but the
shape matters more than the call:

**On-hand is never stored.** It is the sum of the movements, computed on read.
The spreadsheet version of this module stores the number, and it has been wrong
since the day somebody forgot a row: a stored quantity disagrees with its own
history, and the disagreement is discovered by a man standing in front of an
empty rack.

**Issuing more than the record shows is recorded, not refused.** This one is
counter-intuitive until you stand in the workshop. The wood is either on the
rack or it is not; a screen that refuses to record what a storeman just carried
out does not prevent the issue, it prevents the *record* of it — and it teaches
him to stop typing. What the system owes him instead is to say the figure has
gone negative and needs counting, which it does.

**An unpriced delivery is counted and left out of the value.** Eight sheets
arrived on a lump-sum line with no unit price. Valuing them at nought would
have shown the rack as Rp 2,3 juta cheaper than it is, with nothing on screen
to say why. So the value is over the priced part and says *belum lengkap* — the
same rule as the BOM's material cost (D149) and timber's unsawn logs (F46).
Three modules, one principle: **a figure is allowed to be missing, never
allowed to be quietly wrong.**

### And the category list that was a word list

The first filing had nine flat headings, one of which was "Production" — which
is every item in the workshop. A category earns its place by separating two
questions somebody actually asks: *how much wood is on the rack*, *which
finishing is running out*. Filing is now two levels, and **whether an item is
counted at all is a property of its category**, not a checkbox somebody has to
remember: a service is never on a rack, and neither is the electricity bill.

## F50 — the multiplier that moved a monthly salary by seventy per cent

Making the pay rules configurable was supposed to be plumbing. It changed a
number instead, and the change is worth writing down because it had been wrong
in plain sight for four milestones.

Overtime for a salaried person was priced at `base_rate / 21 / daily_hours` —
a month divided by twenty-one working days divided by eight hours. It is a
reasonable-looking guess. The regulation's own figure is **173** hours a month
(40 × 52 ÷ 12), and the difference is not small:

| | Rp / hour | 2 hours of overtime |
|---|---|---|
| `/ 21 / 8` with no multiplier | 38.690 | **77.380** |
| `/ 173`, national ladder (1,5× then 2×) | 37.572 | **131.502** |

The hourly rate barely moved. The **pay** moved by 70%, because the ladder was
missing entirely: this system had been paying overtime at the ordinary rate and
saying so on the screen (Q31), which was honest and also not what the business
does. One sentence from the owner — *lembur normal sesuai peraturan nasional* —
replaced a guess that had been visible, marked, and unchallenged since M17.

### Three rules that came out of building it

**A rule change cannot be backdated.** Days already worked were worked under a
rule somebody could have read at the time. The first version of the guard only
checked that the new version came after the previous one, which let a change
dated 1 August through on 11 September — and the test caught it saving happily.

**A version dated inside an existing run is refused, not ignored.** Payroll
picks the rule in force when the period *opened*, so a version dated mid-period
would look applied and do nothing. Silently doing nothing is worse than
refusing: the setting reads as changed, and the payslip disagrees.

**Undertime ships off.** The owner named it as a scheme that exists here, but
not what a short hour costs — and the demo had no short day in it at all, which
is how the first preview came back saying *nothing changes*. The fixture now
has one (Sumiati leaves at 14:47 on the third), and turning the rule on moves
her week by Rp 23.963. That is the number the decision needs, and it did not
exist until somebody had to look at it.

## F51 — a finished project made a finished drawing look ten weeks late

The drafting queue is sorted by the date the job actually needs each drawing,
which means it has to work out what "needed by" is. The first version took the
soonest of: the open work orders' due dates, the task's own due date, and the
target dates of every project that ordered the product.

It read, against a drawing released three weeks ago with nothing outstanding:

> **Lemari pakaian 3 pintu — lewat 74 hari**

Seventy-four days before today is 29 June. Nothing live is due then. The date
came from **OFFICE FITOUT**, a project handed over in June, closed, inactive —
which happens to have a line for the same wardrobe. A target date on a finished
job is not a deadline, and treating it as one did the specific damage this
project keeps finding: it did not just show a wrong number, it **moved a real
deadline down the queue**, because the rak display genuinely due in three days
sorted below it.

Two fixes, and the second is the more interesting one:

- Only **active** projects contribute a date. A closed job's target date is
  history.
- A released, current, unblocked task shows **selesai**, not a countdown. Its
  deadline passed because the work was done; painting that red teaches the
  drafter to ignore red.

The general rule this is the third instance of: a derived date is as capable of
being quietly wrong as a derived figure, and a wrong date is worse, because
sorting by it hides the right one.

## F52 — the column that is wrong by Friday

The Package tracker came to us as a working Google Sheet with a read-only
dashboard on top, and the sheet is good: three agents per property, a stage
ladder, and a **MOVE ON** column somebody ticks when an agent has gone quiet for
seven days.

That column is the whole reason the module was worth rebuilding rather than
mirroring. It encodes a rule — *seven days of silence, go to the next agent* —
as a piece of data a person has to maintain. Which means:

- it is only as current as the last time somebody swept the sheet;
- it disagrees with the date beside it the moment anybody forgets;
- and nothing anywhere can tell the difference between "not yet seven days" and
  "nobody has looked".

Rebuilt, the flag is derived from `sent_on` and today, and cannot be forgotten.
The demo carries the case: K. Webb was messaged on 2 September and has not
replied, so the queue says **10 hari tanpa balasan** and offers the move. The
same row in the sheet still reads `MSG SENT`, because the sweep has not
happened this week.

### Two more things the rebuild had to change

**The funnel counts properties, not agents.** A building where one agent is at
DEAL is not also a building at QUEUED; counting it in both is how a funnel stops
adding up to the number of buildings. So each property enters the funnel once,
at its **furthest** agent.

**Moving on is one act, not two.** Recycling the silent agent and messaging the
next one are the same decision, and doing half of it is how a property stalls
with nobody chasing anybody — the state the sheet produces most often. One
button does both, and it asks for the sentence that explains it, because that
sentence is what somebody reads a year later when the same agent comes up again.
