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
| **Keep the role switcher — as a labelled demo control** | `src/components/layout/topbar.tsx` | the README says to delete it, and in production that is right: a role must come from the session, not a dropdown anyone can change. In Phase 1 it is the opposite — switching role is *how you demonstrate that permissions work*. So it stays, explicitly marked as a demo control that shows the current role's permissions, and **it is deleted in Phase 2** along with the demo layer | M2 / P2 |
| Session from the demo identity API | `src/store/session.tsx` | the provider keeps its shape, so `can()` callers do not change when it becomes `/api/v1/identity/me` | M2 |
| Sign-in and no-access pages | new `/masuk`, `/tanpa-akses` | an account with no module lands on a page that says so, rather than bouncing | M2 |
| Brand values | `src/lib/brand.ts`, `tailwind.config.ts` | still placeholders. When the real colour arrives, derive the **whole** 50–950 scale, and update `BRAND` in `charts.tsx` and `themeColor` in `layout.tsx` | owner |
| Sample dashboard data | `src/app/(app)/dashboard/page.tsx` | its hardcoded constants are replaced by reads from the demo store — the same call shape the real API will use | M12 |

## Components to add (and only these)

| Component | Why it earns its place |
|---|---|
| `<Loaded>` + `<SourceBadge>` | the rekap's own "worth keeping" list: a load failure is carried as a value and shown, never a blank table pretending to be an empty one. Badge says `live` · `cached` · `failed` |
| `<StatusPill status={…}>` | one place maps the nine `line_status` values, four round states, two PO axes and six review states onto the six existing badge tones. **One ladder, one mapping** (D6) |
| `<MoneyInput>` | wraps `NumberInput` with Indonesian grouping, whole rupiah, and a "cannot exceed requested" ceiling for approval fields (A8, at the input) |
| `<ApprovalTrail>` | vertical timeline over `pr_approvals` + revisions + allocations + receipts: who, when, from which door. Append-only data deserves an append-only display |
| `<AdvisoryBanner tone="amber">` | duplicates, receipt-total mismatches, similar transactions. **Never disables the button** (A6). Amber, dismissible, states what it saw |
| `<RefusalToast>` | renders the API `error.outcome`: refused → "this decision belongs to `<role>` — logged, not applied"; duplicate → "already recorded — nothing changed" |
| `<EvidenceStrip>` | thumbnails from `documents`, click to lightbox, drag to upload |
| `<FilterBar>` | date range, account, vendor, status — the same bar on every list, so muscle memory transfers |
| `<RefreshBadge>` | "3 new since you opened this" + a reload button. Backlog §10's own recommended order: **badge and reload first**, polling second, realtime third. Never lose a reviewer's half-typed draft to a refresh |

Nothing else. A component library is allowed (owner, 2026-08-27) but every
addition is a thing to maintain; these nine each answer a rule.

## Interaction contract

Carried from what works today, plus what the money rules demand:

1. **Details in the drawer.** Navigation between pages is for changing module.
   A PR line, a transaction, a vendor, a PO — all open in the right panel.
2. **On a phone the drawer is full height and full width**, with the action
   bar pinned to the bottom. This is the one responsive addition, and it is
   the difference between usable and not on a 6-inch screen.
3. **Never optimistic on money.** A row that is being posted shows a pending
   state and stays put. Optimistic UI on an approval means showing a decision
   that may be refused by the database a moment later.
4. **Every mutation ends in a toast** that names what happened, including
   "nothing changed".
5. **Warnings are amber and never disable anything** (A6).
6. **Refusals are readable** — the name of the role that may act, not
   "Forbidden" (A7).
7. **Approval and payment are never the same button, on any screen** (A1).
   They are not even in the same card.
8. **A number the database owns is never recomputed in the browser.** If a
   balance does not load, show `—` and the source badge. Never a substitute
   computed client-side, which is how a screen ends up disagreeing with the
   books.

## Screen inventory — v1

Routes that already exist as placeholders are marked ▸; new routes are ✚.
Every new route is one line in `nav.ts`.

### Procurement

| Route | Screen | Milestone |
|---|---|---|
| ▸ `/procurement/pr` | PR list: filter bar, table, row → drawer with lines, coverage, trail. Header actions: **Buat PR** | M4 |
| ✚ `/procurement/pr/baru` | multi-line create. A full page, not a drawer — this is the one place people type for ten minutes. Item combobox with last price and unit, vendor type-ahead that accepts a new name, running total | M4 |
| ✚ `/procurement/persetujuan` | approval queue for the signed-in approver, grouped by document. Per line: APPROVED · HOLD · REJECTED, an editable approved amount that **cannot exceed requested**, a mandatory reason on HOLD/REJECTED | M5 |
| ✚ `/procurement/ronde` | the OPEN round: requested, paying-account balances, TO TRANSFER, remaining after payment. Approve round · record transfer · **close round** (with the list of what closing releases) | M6 |
| ✚ `/procurement/rapat` | meeting board, four columns: ✅ lunas · ⏳ disetujui belum bayar · ⚠️ dibayar belum disetujui · • belum keduanya | M12 |
| ▸ `/procurement/po` | PO list + detail drawer: **two separate progress bars**, payment and delivery, never merged. Exposure stated in words | M11 |
| ▸ `/procurement/penerimaan` | receiving: pick a live PR or PO line, qty, condition, **photo required**, QC by | M11 |
| ▸ `/procurement/supplier` | vendors: curated and uncurated split, merge proposal, purchase history | M3 |

### Accounting

| Route | Screen | Milestone |
|---|---|---|
| ▸ `/accounting/ledger` | the ledger: filter bar, table, row → drawer with lines, evidence, allocations, the path to PR and PO. Actions: mark COMPLETED, VOID with a reason | M8 |
| ▸ `/accounting/verifikasi` | **WAITING REVIEW.** The queue, one document at a time: photo on the left, form on the right, three buttons — Confirm & post · Attach to existing · Reject. Advisory duplicate banners. This is the screen that decides money; it gets the most care | M9 |
| ▸ `/accounting/cashflow` | five account balances from the view, movement chart, tie-out | M12 |
| ✚ `/accounting/bukti` | evidence browser by entity, month, type | M10 |
| ✚ `/accounting/catatan` | `Others` documents — a different notepad that does not touch the company ledger (owner, 2026-08-27) | M9 |
| ▸ `/accounting/budget`, `/accounting/payslip` | untouched placeholders | — |

Every other module keeps its honest "not built yet" placeholder. A page that
looks nearly finished generates false bug reports; a page that says it is not
built does not.

## The review screen, in detail

It is worth spelling out, because it is where the system's care shows.

```
┌──────────────────────────────┬───────────────────────────────┐
│  evidence                    │  what the AI read             │
│  ┌────────────────────────┐  │  vendor    [ combobox      ]  │
│  │                        │  │  date      [ 2026-09-10    ]  │
│  │      the photo         │  │  type      ( ) Receipt        │
│  │   pinch, rotate, zoom  │  │            (•) Payment Proof  │
│  │                        │  │            ( ) Receiving Item │
│  └────────────────────────┘  │            ( ) Others         │
│  ⚠ identical bytes seen      │  account   [ BCA 271 ▾     ]  │
│    2026-09-08 — advisory     │  ──────────────────────────   │
│  ⚠ trx-26-09-09_014 has the  │  items                        │
│    same amount and account   │  ▸ … qty · unit · price       │
│                              │  + tambah item                │
│                              │  ──────────────────────────   │
│                              │  covers PR line               │
│                              │  [ — not on a PR —        ▾]  │
│  confidence 74 — check it    │                               │
├──────────────────────────────┴───────────────────────────────┤
│  [ Confirm & post ]  [ Attach to existing ]  [ Reject ]      │
└──────────────────────────────────────────────────────────────┘
```

Rules the screen must hold, each from a real incident:

- **Three buttons, not two.** Attach exists because a payment proof arriving
  for an already-booked receipt has only bad answers otherwise: Confirm
  double-books, Reject loses the evidence (Flow D, 2026-08-28).
- `Others` never reaches the ledger — it branches to notes **before** anything
  else is touched.
- **"— not on a PR —" is a deliberate choice**, always offered, never the
  default that happens by accident.
- A value the extraction produced that is outside a closed list stays
  selectable: "a value outside the list isn't wrong, just uncurated".
- Human-added item rows are marked as human-added. "What did the AI read"
  must stay answerable forever.
- Duplicate warnings **point at the Attach button** instead of blocking.
- An unsaved draft is discarded on moving to the next row, and the screen says
  so. This is not a place to leave half-finished work.
- Confirming shows a staged progress overlay, not a frozen button. In v1 the
  post is one database transaction rather than 11–14 seconds of spreadsheet
  round-trips — but the overlay stays, because slow networks exist.

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
