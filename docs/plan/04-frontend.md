# 04 — Frontend design

> **Phase note.** In Phase 1 this document *is* the work — the whole workflow
> is frontend. Screens call `src/demo/api/*`, which implements `03-api.md`
> exactly, so nothing here changes when the real backend arrives.

**The design system in this repo is finished and we are not redesigning it.**
The shell, the token scale, the component set, the two keyframes and the
menu-as-data model all stay exactly as they are. This document says how the
procurement and accounting screens are built *with* them, and lists the small
number of components that have to be added.

## What already exists and is reused as-is

| Piece | File | Contract |
|---|---|---|
| Shell | `src/app/(app)/layout.tsx` | sidebar + topbar never scroll; only `<main>` does. That is what makes it feel like desktop software |
| Menu as data | `src/lib/nav.ts` | adding a page is one array entry. Items the role may not see are **not rendered at all**, and a section that empties disappears |
| Permissions | `src/lib/roles.ts`, `src/store/session.tsx` | `can()` hides menus and buttons. It is not a guard — the guard is RLS (ADR-002) |
| Cards, badges, buttons, stat cards, page header, empty state, progress | `src/components/ui/primitives.tsx` | six tones: brand · green · amber · red · slate · violet |
| Table | `src/components/ui/data-table.tsx` | column definitions as data, row click opens a drawer |
| Drawer + Modal | `src/components/ui/drawer.tsx` | **details open in the right panel, never a new page.** The table stays visible behind; closing returns you exactly where you were |
| Tabs, combobox, number input, toaster | `src/components/ui/` | |
| Charts | `src/components/charts/charts.tsx` | recharts, brand colour pinned |
| Money and dates | `src/lib/format.ts` | `formatIDR`, `formatIDRCompact`, `formatM3` (3 decimals — 0,001 m³ of a log is money) |
| Motion | `tailwind.config.ts` | exactly two keyframes: `fade-in`, `slide-in`. Everything else is `transition-colors`. Software used eight hours a day must never make its user wait for an animation |

## What has to change in the existing shell

| Change | File | Why | Milestone |
|---|---|---|---|
| **Replace the role dropdown with a grant picker** | `src/components/layout/topbar.tsx` | access is now several module grants plus four separate authorities (D23, D24), so a single-choice dropdown cannot express it. In Phase 1 it becomes a demo control that toggles modules and authorities and shows what each unlocks — which demonstrates permissions far better than a dropdown did. **Deleted in Phase 2** with the rest of the demo layer | M2 / P2 |
| Session from the demo identity API | `src/store/session.tsx` | the provider keeps its shape, so `can()` callers do not change when it becomes `/api/v1/identity/me` | M2 |
| Sign-in and no-access pages | new `/signin`, `/no-access` (D38) | an account with no module lands on a page that says so, rather than bouncing | M2 |
| Brand values | `src/lib/brand.ts`, `tailwind.config.ts` | still placeholders. When the real colour arrives, derive the **whole** 50–950 scale, and update `BRAND` in `charts.tsx` and `themeColor` in `layout.tsx` | owner |
| ~~Sample dashboard data~~ | `src/app/(app)/dashboard/page.tsx` | **done (M13)** — the invented sales orders and timber-yield chart are gone; it reads cash, the twelve-month plan, the approval queue, supplier obligations, the inbox and the last ledger rows, all from the demo store (D118) | M13 |

## Components to add (and only these)

| Component | Why it earns its place |
|---|---|
| `<Loaded>` + `<SourceBadge>` | the rekap's own "worth keeping" list: a load failure is carried as a value and shown, never a blank table pretending to be an empty one. Badge says `live` · `cached` · `failed` |
| `<StatusPill status={…}>` | one place maps the nine `line_status` values, four round states, two PO axes and six review states onto the six existing badge tones. **One ladder, one mapping** (D6) |
| `<MoneyInput>` | wraps `NumberInput` with Indonesian grouping, whole rupiah, and a "cannot exceed requested" ceiling for approval fields (A8, at the input) |
| `<ApprovalTrail>` | vertical timeline over `pr_approvals` + revisions + allocations + receipts: who, when, from which door. Append-only data deserves an append-only display |
| `<AdvisoryBanner tone="amber">` | duplicates, receipt-total mismatches, similar transactions. **Never disables the button** (A6). Amber, dismissible, states what it saw |
| `<RefusalToast>` | renders the API `error.outcome`: refused → "this decision belongs to `<role>` — logged, not applied"; duplicate → "already recorded — nothing changed" |
| `<EvidenceStrip>` | **built (M9)**, one component on both drawers: the documents already filed, what each one covers, *also covers* to point one file at another record, and two upload buttons — **Photograph** (opens the camera directly on a phone) and **Choose a file**. A ledger row also shows, read-only, the documents that live on the request lines its money paid for. Older description: the attach block above: thumbnails, kind, the agreement check, *Lampirkan*, *juga mencakup…*. Appears identically in the PR line drawer and the ledger row drawer — **the main road, so it is one component used twice** |
| `<FilterBar>` | date range, account, vendor, status — the same bar on every list, so muscle memory transfers |
| `<RefreshBadge>` | "3 new since you opened this" + a reload button. Backlog §10's own recommended order: **badge and reload first**, polling second, realtime third. Never lose a reviewer's half-typed draft to a refresh |

Nothing else. A component library is allowed (owner, 2026-08-27) but every
addition is a thing to maintain; these nine each answer a rule.

## Interaction contract

Carried from what works today, plus what the money rules demand:

1. **A menu entry a user has no access to is not rendered.** Accounting off
   means no ledger entry, not a disabled one (D22). The union of a user's
   module grants decides the menu; their authorities decide the controls
   inside it.
2. **Details in the drawer.** Navigation between pages is for changing module.
   A PR line, a transaction, a vendor, a PO — all open in the right panel.
3. **On a phone the drawer is full height and full width**, with the action
   bar pinned to the bottom. This is the one responsive addition, and it is
   the difference between usable and not on a 6-inch screen.
4. **Never optimistic on money.** A row that is being posted shows a pending
   state and stays put. Optimistic UI on an approval means showing a decision
   that may be refused by the database a moment later.
5. **Every mutation ends in a toast** that names what happened, including
   "nothing changed".
6. **Warnings are amber and never disable anything** (A6).
7. **Refusals are readable** — the name of the role that may act, not
   "Forbidden" (A7).
8. **Approval and payment are never the same button, on any screen** (A1).
   They are not even in the same card.
9. **Evidence is attached from the thing it belongs to.** Every PR line and
   every ledger row carries an attach affordance; no screen asks a person to
   pick a parent off a list unless the parent is genuinely unknown (ADR-010).
10. **A number the database owns is never recomputed in the browser.** If a
   balance does not load, show `—` and the source badge. Never a substitute
   computed client-side, which is how a screen ends up disagreeing with the
   books.

## Screen inventory — v1

Routes that already exist as placeholders are marked ▸; new routes are ✚.
Every new route is one line in `nav.ts`.

### Procurement

| Route | Screen | Milestone |
|---|---|---|
| ▸ `/procurement/pr` | **The working surface** (D74): asking, correcting, documenting, paying. One row per item — item, vendor, quantity, amount, status — with the four meeting-state chips and the paid≠approved chip as filters. Everything else is in the drawer: the decision and its trail, coverage, the variance and its explanation, documents, and recording a payment straight into the ledger. Old description follows. PR list: filter bar, table, row → drawer with lines, coverage, trail, evidence. Line actions: **attach a document here**, **remove** (until money has reached it). Header: **Buat PR** | M4 |
| ▸ `/procurement/pr` (same board) | **Approved against paid.** A strip above the table: how much was paid beyond approval, how much under, how many still unexplained, and the counts by reason — the pattern, not the event (D55). Filters the board to those lines, which are drawn from the variance list rather than the open board, because a difference outlives the line. In the drawer: the three numbers, the gap in words, the explanation or the form that records one, and — on an approved line that is not settled — **Record the payment**, which writes the ledger row, the allocation and the document link in one act (D53) | M4b |
| ✚ `/procurement/meeting` | **The leadership meeting, as a screen** (D74). Four numbers across the top: approved and still to pay, waiting for a decision, the BCA 271 balance, and **the transfer needed before what is approved can be paid** — plus what that transfer becomes if everything waiting is approved today. Then two lists: waiting for a decision — **ticking picks, it does not decide** (D77); the count and the total appear in a bar above the lists with one confirm, *Approve* for the authority holder and *Send to the approver on Chat* for everybody else — and approved-waiting-for-payment with its total at the top of the table, not the foot. **Add an item** creates a real request, submitted on the spot (D73) | M5c |
| ✚ `/demo/chat` | Google Chat, standing in for itself. **Send a transfer proof** puts a receipt in the review queue the way leadership really does — from a phone, booking nothing. And **one card per send**, carrying the list and its three totals — asked for, approved so far, what has to be paid — plus the BCA 271 balance and the top-up if it falls short. Per item: quantity, amount, instructions, approve or not yet; and *approve the rest as asked* for what is left. Answering somebody else's list is refused, which is the point of the route (D69, D70) | M5b |
| ✚ `/procurement/pr/baru` | multi-line create. A full page, not a drawer — this is the one place people type for ten minutes. Item combobox with last price and unit, vendor type-ahead that accepts a new name, running total | M4 |
| ✚ `/procurement/persetujuan` | **the standing queue** — every submitted line not approved and not removed, grouped by document. Per line: **a checkbox**, and an approved amount that starts at what was requested and may only be reduced. Nothing else. Visible only with `approve_goods` | M5 |
| ✚ `/procurement/rounds` | **built (M6), then parked** (D105) — kept and working, no further work. Every live round (usually one, sometimes two — one being funded, one collecting): the four-state rail with what each state means, then requested · BCA 271 · to transfer · remaining after payment. **Roll in what is owed** (idempotent), **approve** (freezes the numbers, `approve_funds`), **record the transfer** — two roads (D81): *we transferred it* uploads the receipt and writes both ledger legs, or *money already in* books what leadership dropped in chat and funds the round from a row that is already in the ledger. Neither can finish without the proof (D80), **close** (which answers with the list of what it just released). A TRANSFERRED round shows every item still `WAITING FOR PAYMENT` — the proof that funding is not paying (A10) | M6 |
| ✚ `/procurement/rapat` | meeting board, four columns: ✅ lunas · ⏳ disetujui belum bayar · ⚠️ dibayar belum disetujui · • belum keduanya | M12 |
| ✚ `/procurement/tracker` | **built (M11)** — opens on what the company owes every supplier at once: contracted, paid, owed, and of that, *billable now*, with the vendor credit stated separately (D102). Live suppliers in one card, fully settled in a collapsed one. `Add new PO` issues an order without leaving the screen (D100) | M11 |
| ✚ `/procurement/tracker/[vendor]` | **built (M11)** — one supplier, full width (D103): four figures, then every order with ordered-vs-received and condition per line (`+2 OVER`, `NOT ARRIVED`), its note, and its delivery history — receipt number, quantity, condition, date, **who received it, who checked it**, and the photo and tanda terima named separately (D101). Then the payment history **across all orders**, because one transfer closes three (D97), each row naming what it applies to and whether its proof is filed. Finally total PO, balance, and *billable now* with the over-delivery credit stated apart (D98, D99). **Record arrival** refuses without both documents | M11 |
| ▸ `/procurement/po` | PO list + detail drawer: **two separate progress bars**, payment and delivery, never merged. Exposure stated in words | M11 |
| ▸ `/procurement/penerimaan` | receiving: pick a live PR or PO line, qty, condition, **photo required**, QC by | M11 |
| ▸ `/procurement/supplier` | vendors: curated and uncurated split, merge proposal, purchase history | M3 |

### Accounting

| Route | Screen | Milestone |
|---|---|---|
| ▸ `/accounting/ledger` | **built (M8)**: cash position across the five accounts at the top — the leadership one locked unless you hold `approve_funds` (D87) — and clicking one filters the ledger to it. Paged at the service, 25 a page. **New entry** enforces both rules at the point of writing: at least one primary document (D85), and quantity, price and vendor on a purchase (D86). No "allocated" figure anywhere (D88); a purchase with no request behind it says so in four words. Void is behind *Something wrong with this row?* (D89), and every row carries its own history with what changed (D84). Older description: filter by account, type and text; rows show date, description, amount, **unallocated where a request was expected** (D83), evidence count and status. The drawer holds what it bought, what it paid for, the documents — attached **from the row** (ADR-010) — VOID with a mandatory reason, and mark completed. Nothing is deleted: a voided row stays with its amount at zero and its reason on it. Old description follows. the ledger: filter bar, table, row → drawer with lines, evidence, allocations, the path to PR and PO. Actions: mark COMPLETED, VOID with a reason | M8 |
| ▸ `/accounting/verifikasi` | **built (M10)**: the weekly arrival count on top (a measure of the main road, not of this screen), the queue on the left, and five roads on the right — make a transaction · retro request line · link to a row · note · reject. The last two keep the file and never touch the ledger (D94). A duplicate warning names the row it looks like and offers *link* rather than refusing anything. `Others` starts on the notes road. Resolved rows stay listed underneath. Older description: **The exception inbox.** Only documents whose parent is unknown — bought first, approved later. Photo left, form right; resolve into a transaction, a retroactive PR line, a link to something existing, a note, or a rejection. Should stay small | M10 |
| ▸ `/accounting/cashflow` | five account balances from the view, movement chart, tie-out | M12 |
| ✚ `/procurement/meeting` (revised) | the picked total counts only what is **still to pay** — a line bought first and approved later commits nothing more, and the approval figure is shown beside it when they differ (D124). Lines with no document behind them are marked before the yes and refused at it (D125). In the approved-and-unpaid list the status column says what separates `APPROVED` from `WAITING FOR PAYMENT` — *waiting on funding* or *cash is in the account* — instead of printing two words for one meaning (D123) | M5c |
| ✚ `/accounting/liquidation` | **built (M12a)** — every transfer of operating money in, newest first, with how long each one lasted. Open one: what the balance was before it landed, everything that left before the next transfer arrived, and a running column counting the transfer down — negative once spending passes it, because *we carried on out of what was already there* is a different fact from *it ran out*. Grouped by type, vendor and project, and the part with no approved line or order behind it named (D106, D107) | M12a |
| ✚ Guided walk (`?tour=flow-b`) | **built (M13)** — nine steps across the real screens, in the order the business works: request → meeting → chat approval → pay from the line → ledger → tracker → the exception inbox → liquidation → calendar. A bar along the bottom, never a spotlight: everything underneath stays live (D117). Two lines of text on a phone with tap-for-the-rest, and the step lives in the URL so it can be pasted into a chat | M13 |
| ✚ `/accounting/calendar` | **built (M12b, extended M12c)** — twelve months across, every line down the side, planned above and actual below (`≈` when matched by category rather than named by a person). A line is **weekly, monthly or one-off** (D113), so a five-payday month shows `Rp 150.0M 5×` and a vendor settlement appears in one month only. **Click a month** and it opens day by day: the dated movements in order, the balance running down, the first day it goes under in red and the lowest point named (D115), with the undated supplier obligations stated underneath rather than spread across the days. The reminder at the top is the same events filtered by date (D116). A cell opens *this month only*, which needs a reason; the **not in the plan** row is what keeps it honest (D111) | M12b |
| ✚ `/accounting/documents` | **built (M9), then parked** (D93, restated in D105). Every file with what it is attached to, filtered by type, month and text. The owner does not need it; it stays as it is and gets no more work. The number that mattered — files attached to nothing — is the exception inbox's job | M9 |
| ✚ `/accounting/bukti` | evidence browser by entity, month, type; and the inbox health number | M9 |
| ✚ `/accounting/catatan` | `Others` documents — a different notepad that does not touch the company ledger (owner, 2026-08-27) | M10 |
| ▸ `/accounting/budget`, `/accounting/payslip` | untouched placeholders | — |

Every other module keeps its honest "not built yet" placeholder. A page that
looks nearly finished generates false bug reports; a page that says it is not
built does not.

## Attaching a document: the main road

ADR-010 changes where evidence enters. It is worth drawing, because it is the
interaction the whole system now turns on and it has to be two taps.

Every PR line drawer and every ledger row drawer carries the same block:

```
┌──────────────────────────────────────────────────────────────┐
│  pr-26-09-10_01-L03   KAYU JATI SORTIMEN A   4,2 m³          │
│  diminta Rp 18.900.000 · disetujui Rp 18.900.000             │
├──────────────────────────────────────────────────────────────┤
│  Dokumen                                    [ + Lampirkan ]  │
│  ┌──────┐ ┌──────┐                                           │
│  │ nota │ │bukti │   nota · 09 Sep · Rp 18.900.000  ✓ cocok  │
│  │      │ │bayar │   bukti bayar · 10 Sep · trx-26-09-10_004 │
│  └──────┘ └──────┘                                           │
│  ⚠ nota Rp 19.100.000 — Rp 200.000 di atas yang disetujui.   │
│    Dicatat, tidak diblokir.                                  │
└──────────────────────────────────────────────────────────────┘
```

What makes it work:

1. **The parent is known, so nothing is asked twice.** Tapping *Lampirkan*
   opens the camera or the file picker, asks only for the document kind
   (nota · bukti bayar · foto barang · lainnya), and links it. Vendor, amount,
   line and PR come from the record.
2. **The check runs after, and only warns.** The extraction compares what it
   reads against what the line says. Agreement gets a quiet ✓; disagreement
   gets an amber line stating both numbers. Never a blocked button (A6).
3. **One document, several parents** is a first-class action, not a repair.
   An attached document's menu has *juga mencakup…* — pick the other lines or
   transactions it covers, and each becomes its own link, each recording who
   declared it.
4. **Every link says who and when.** Tracing was the thing that was hard;
   a link that records the person who declared it is the fix.
5. **Removing a link is not deleting a file.** The file stays, the link goes,
   both are in the audit log.

## The exception inbox

The old review screen, minus everything that existed to support a guess. It
holds only documents whose parent is genuinely unknown — someone bought
something before any PR existed, photographed it into Chat, and the system
has no idea what it belongs to.

Resolutions, one of five:

| Action | Result |
|---|---|
| **Jadikan transaksi** | posts a ledger row, off-PR, visible in `v_unlinked_transactions` |
| **Buat baris PR retroaktif** | the purchase-first case with a name on it: creates the line it should have had, still needing approval |
| **Tautkan** | it belongs to something that already exists — link it and create no money |
| **Catatan** | `Others`. Goes to notes, never the ledger, and branches before anything else is touched |
| **Tolak** | recorded, never discarded (A16) |

Two rules the screen keeps from the old one, because both were paid for:
`Others` branches before the ledger is touched, and duplicate warnings are
advisory and point at *Tautkan* rather than blocking.

And one number on it that is not decoration: **how many documents came in
this way this week.** If the exception road grows, the normal road has a
problem — people are routing around it, and the reason is worth finding.

## The approval screen

Worth drawing, because it is now almost nothing — and that is the point.

```
┌──────────────────────────────────────────────────────────────┐
│  pr-26-09-11_02 · Andi · 11 Sep                              │
├───┬──────────────────────────────────────────┬───────────────┤
│ ☑ │ KAYU JATI SORTIMEN A      4,2 m³         │ Rp 18.900.000 │
│ ☐ │ AMPLAS 120 GRIT           50 lembar      │ Rp    375.000 │
│ ☑ │ LEM PUTIH FOX 5 KG         2 pail        │ Rp    460.000 │
│   │                            ↳ disetujui   │ Rp    230.000 │
└───┴──────────────────────────────────────────┴───────────────┘
   3 baris · 2 dicentang · Rp 19.130.000 akan naik ke ronde
```

- **A checkbox is the whole decision** (D28). Checked is approved; unchecked
  is not yet. There is no hold, no reject, no reason field.
- **An unchecked line simply stays.** It is on the list tomorrow and the day
  after, until it is checked or removed. Nothing expires (D21, D29).
- **The amount may come down, never up.** It starts at what was requested;
  editing it below is how the CEO approves two of the five that were asked
  for (A8). The reduction shows inline, as above.
- **A line nobody wants is removed, not rejected** — from the PR drawer, by
  whoever knows it is no longer needed, and never once money has reached it.
- **Every toggle is recorded**: time, name, email, and which door it came
  through. That is the metadata the owner asked for, and it is why the
  checkbox can be this plain — the audit trail carries the nuance the status
  vocabulary used to.

## The demo layer, from the screen's point of view

A screen never knows it is a demo. It calls a service module and handles an
envelope:

```ts
const res = await procurement.approveLine({
  lineNo: "pr-26-09-10_01-L03",
  step: "GOODS",
  decision: "APPROVED",
  approvedAmount: 4_950_000,
  idempotencyKey: formKey,          // made when the form opened, not on submit
});

if (res.error) return toastRefusal(res.error);   // 403 / 409 / 422, with outcome
toastOk(res.data);
```

That is the same code in Phase 2. The only difference is what
`src/demo/api/procurement.ts` does internally — a reducer over a browser store
today, a `fetch` later.

Three things the demo must do that a naive mock would not:

1. **Refuse.** Approving above requested is a 422. Approving a step that is
   not your role is a 403 whose message names the role that may. A repeated
   submit with the same idempotency key is a 409 `duplicate` that changes
   nothing. If the demo always succeeds, every screen is written optimistic
   and the real API breaks all of them at once.
2. **Derive.** Coverage, the nine-value line status, account balances and the
   two PO axes are computed in `src/demo/derive.ts` on every read. There is no
   stored status field anywhere, because there will not be one later (A3).
3. **Take time.** 150–400 ms of simulated latency, so pending states, disabled
   buttons and the confirm overlay are all exercised for real.

## Saying it is a demo, without shouting

- a small persistent marker in the topbar: `DEMO · data is not real`
- "Reset demo data" in the topbar menu, with a confirm
- the sign-in page states that any of the demo users can be picked and no
  password is checked

That is enough. Watermarking every card would make the workflow harder to
judge, which defeats the purpose of building it.


## Phone

The owner is driving this from a phone this week, and warehouse staff will
report receiving from one. Not an afterthought:

- sidebar is already a drawer under `md`
- tables collapse to stacked cards under `sm`; the first two columns become
  the card title and subtitle
- drawer → full screen, actions pinned bottom, thumb-reachable
- the receiving flow is camera-first: photo, then quantity, then condition
- no hover-only affordance anywhere
