# 03 — Backend API structure

> **Phase note.** The HTTP endpoints are Phase 2. **The contract in this
> document is Phase 1** — the demo layer in `src/demo/api/` implements these
> exact function signatures, this envelope, these outcome codes and these
> status codes, so screens are written once. When Phase 2 arrives, the demo
> module is replaced by `fetch` and no screen changes.

Five services. Each is independently addressable, independently documented,
and could be moved to its own host by changing one environment variable
(ADR-001). None of them imports another.

```
/api/v1/identity/…        core.*      who you are, what you may do
/api/v1/procurement/…     procure.*   vendors, items, PR, rounds, PO, receiving
/api/v1/accounting/…      acct.*      accounts, ledger, allocations, review
/api/v1/documents/…       core files  upload, link, fetch evidence
/api/v1/events/…          core.outbox subscribe, replay — the third-party seam
```

## Service contract — the same for all five

### Envelope

```jsonc
// success
{ "data": …, "meta": { "request_id": "req_…", "service": "procurement", "version": "1" } }

// list
{ "data": [ … ], "meta": { …, "page": { "limit": 50, "cursor": "…", "has_more": true } } }

// failure
{ "error": { "code": "line_already_approved", "message": "…",
             "outcome": "refused", "detail": { … } },
  "meta": { "request_id": "req_…", "service": "procurement", "version": "1" } }
```

`outcome` is one of `ok` · `refused` · `duplicate` · `noop`, and it is
**always** present on a failure. This is A7 made mechanical: §2.2 records a
run of incidents on 2026-08-28 where a refused button reported success, a
stuck claim made a row unbookable, and a sweep discarded documents with no
message. The rule that came out of it was an explicit `_outcome`; here it is
part of the envelope, so it cannot be forgotten.

### Status codes

| Code | Meaning | Client behaviour |
|---|---|---|
| 200 / 201 | done | show the result |
| 400 | malformed | developer error, show raw |
| 401 | not signed in | to `/masuk` |
| 403 | **refused** — signed in, not permitted, decision belongs to someone else | toast naming the role that may do it. The action is logged and not applied |
| 409 | **duplicate / conflict** — already decided, already posted, slot taken | toast "already recorded — nothing changed". **Never release the idempotency claim on 409** |
| 422 | validation | field-level errors in `detail`. Release the claim |
| 429 / 5xx | try again | release the claim, offer retry |

The claim rules (release on 422 and 5xx, hold on 409) are carried over from
`john-lau` unchanged — they are what makes a retried button safe.

### Idempotency

Every mutating request takes `Idempotency-Key`. The service stores
`(service, endpoint, key)` with the response. A repeat returns the first
response with `outcome: "duplicate"` and changes nothing.

The UI generates the key when the form is opened, not when it is submitted —
so a double tap on a slow phone connection is one decision, not two. This is
`card_clicks` dedupe (§3.8, three real twin-card incidents) in API form.

### Auth

`Authorization: Bearer <supabase access token>`, or the session cookie for
same-origin calls from the app. The service opens Postgres **as that user**;
RLS decides (ADR-002). There is no API key that bypasses a permission check.

### Every mutation writes

1. the business rows, in one Postgres transaction
2. one `core.audit_log` row: actor, entity, action, before, after, outcome
3. one `core.outbox` row for the domain event

All three or none. Never a business row without its audit row.

---

## `identity`

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | user, **module grants**, **authorities**, resolved permission list. The frontend `can()` is the union of these (D23, D24) |
| GET | `/users` | `it.manage_users` |
| POST | `/users` | invite; Supabase Auth handles the credential |
| PUT | `/users/{id}/modules` | grant or revoke a module and its level. `it.manage_roles`; append-only history in audit |
| PUT | `/users/{id}/authorities` | grant or revoke `approve_goods` · `approve_funds` · `post_ledger` · `resolve_inbox`. **Separate from modules, deliberately** (D24) |
| GET | `/modules`, `/authorities` | the catalogs, read from the database |

**Note on `src/lib/roles.ts`.** Today the catalog lives in code, which the
existing README defends well: a fresh database can be bootstrapped without
anyone guessing what roles should exist. We keep that — the file stays the
**seed source**, generated into `0002_core_identity.sql`. The database is what
gets *enforced*; the file is what gets *reviewed*. One direction, no drift.

## `procurement`

Reference data:

| Method | Path | Notes |
|---|---|---|
| GET | `/vendors` | `?q=` type-ahead, `?curated=` |
| POST | `/vendors` | a new vendor is always accepted, born `is_curated=false` |
| PUT | `/vendors/{id}/curate` | promote, merge (absorbed spelling → `aka`) |
| GET | `/items` | `?q=`, returns `standard_price ?? last_price` as a *hint* |
| POST | `/items` | born uncurated |
| GET | `/uom`, `/categories`, `/projects` | closed lists, from the database |

PR chain:

| Method | Path | Notes |
|---|---|---|
| POST | `/pr` | create draft; `doc_no` minted by Postgres |
| GET | `/pr` | `?status=&requester=&project=&from=&to=` |
| GET | `/pr/{doc_no}` | document + lines + coverage + status, one call |
| PUT | `/pr/{doc_no}/lines` | edit while DRAFT; after submit → supersede |
| POST | `/pr/{doc_no}/submit` | DRAFT → SUBMITTED, lines get `-LNN` |
| POST | `/pr/{doc_no}/reopen` | only while no gate has decided |
| PUT | `/pr/lines/{line_no}` | edit an item **while nobody has approved it** (D66). `item_total` may be sent explicitly: the amount is quantity × price only when the line has both, so a service line keeps the figure somebody typed instead of being recomputed to zero (D75) — not merely while the document is a draft. **409** once approved, once money has been allocated, or once removed. The previous values go into the audit row |
| POST | `/pr/lines/{line_no}/note` | `{instructions?, remark?}` — leadership's optional words, on a line decided or not (D64). Append-only; **422** when both are empty |
| POST | `/documents/links` | `{url, title?}` — filing an address as evidence (D125). **422** on anything that is not http(s). A link is supporting, never primary: a shop page does not say money moved |
| POST | `/pr/approval-requests` | `{line_nos[], to?, notes?}` — `notes` carries what the room said about each item, per line (D127); it reaches the approver as context and prefills their instruction field, never as a recorded instruction of its own — ask the approver in chat (D69), as **one batch** (D70). Anyone in procurement may ask. Skips lines already decided or already asked; **409 when that leaves nothing**. Returns the batch with its three totals. Emits one `procurement.approval.requested` carrying the list — a worker turns that into a single chat card |
| GET | `/pr/approval-batches` | `?for_email=&pending=1` — the lists waiting on one person, each with `requested_total`, `approved_total`, `to_pay_total` |
| POST | `/pr/approval-batches/{token}/approve-rest` | yes to everything still open in the batch, at the amounts asked. Same identity rule: **403 unless the answerer is the addressee**, 409 when nothing is left open |
| POST | `/pr/approval-requests/{token}/answer` | the answer coming back from chat. **The identity is taken from the platform's signed request, never from the body or the session** — that is the whole reason the round trip exists. **403 when the answerer is not the addressee**, 409 when already answered. Writes the approval with `channel: chat` and the approver's own name |
| POST | `/pr/lines/{line_no}/approve` | `{approved: true\|false, approved_qty?, approved_amount?, instructions?, remark?}` — a **checkbox**, not a vocabulary (D28). The quantity may be cut as well as the amount, and cutting the quantity recomputes the amount at the unit price (D65). `step` ∈ `GOODS` · `FUNDS`; there is no IT step (D20). The approved figures are **not capped at what was requested** (D76): a price can move between the request and the meeting, and the gap is reported rather than refused. Answers any chat card still open on the line. **403 without the matching authority** — `approve_goods` is the CEO's alone (D19). Each toggle writes an append-only row carrying timestamp, name, email and channel |
| GET | `/pr/queue` | the standing approval queue: every submitted line not approved and not removed (D21). Nothing ages out |
| POST | `/pr/lines/{line_no}/remove` | no longer needed (D29). Soft — the row stays with who and when. **409 once any money has been allocated to the line**: that is a return or a credit, not a removal |
| GET | `/pr/lines/{line_no}/history` | approvals, revisions, allocations, receipts — the full trail |
| GET | `/pr/lines/{line_no}/for-posting` | the seam accounting calls before writing a payment against a line (ADR-004): description, approved amount, vendor, project, already-covered, removed. Never a table read across services |
| POST | `/pr/lines/{line_no}/variance` | explain why paid ≠ approved. `{reason, note?}`, reason from a closed list of seven (D55). **409 when there is nothing to explain** — inside the Rp 1.000 tolerance, or nothing paid. **422 when `reason = other` without a note.** Append-only: a different explanation is a new row. An underpayment explained as anything but `partial_payment` also writes the `line_settlements` row that closes the line (D56) |
| GET | `/pr/variances` | every line where paid ≠ approved by more than the tolerance, open or finished, worst first. Not filtered to open lines — a difference does not stop being one because the line closed |

Rounds:

| Method | Path | Notes |
|---|---|---|
| POST | `/rounds/sync` | roll every approved-and-still-owed line into the single OPEN round. Idempotent; safe to call on every page load |
| GET | `/rounds/{round_no}` | requested, balances, TO TRANSFER, funded-by |
| POST | `/rounds/{round_no}/approve` | `procurement.approve_funds`. Freezes the numbers |
| POST | `/rounds/{round_no}/transfer` | records **one instalment** — amount + transaction + **the proof** (D82); a round takes as many as it needs and reports what is still short. **409 when the same `trx_no` is counted twice** against one round. `post_ledger`, not `approve_funds` (D78) — the funds decision was approving the round. **422 without `proof_attachment_id`** (D80): a round is funded when there is proof it was funded. **Does not make any line PAID** (A10) |
| POST | `/rounds/{round_no}/close` | the step everyone forgets. Response lists what is still owed and is being released |

PO and receiving:

| Method | Path | Notes |
|---|---|---|
| POST | `/po` | `{vendor_id, lines[{description, qty, uom, unit_price}], dp_percent?, note?, issue?}`. **Issued by default** and born DRAFT only when `issue: false` (D100) — a PO nobody sent is a document, not an obligation. **422** without a vendor, without lines, or with a line carrying no unit price; a `dp_percent` writes the DP and FINAL terms |
| GET | `/po/{po_no}` | two axes, exposure, schedule with each term's state, what may be paid now, amendments, payments and documents — one call, because a screen that needs three renders in three stages |
| POST | `/po/{po_no}/approval-requests` | asks leadership to confirm the order. **409** unless it is a draft nobody has confirmed. Emits `procurement.po.approval_requested` — the seam, not a second write path |
| POST | `/po/{po_no}/approve` | `{approved, note?}`, `approve_goods` only. **422** to decline without a sentence — somebody has to tell the supplier something |
| PUT | `/po/{po_no}/expected-delivery` | `{expected_delivery, reason?}`. **422** without a reason once the order is issued and a date was already agreed (D134) |
| POST | `/po/{po_no}/issue` | DRAFT → ISSUED, its own act with its own audit row. **409** if it is not a draft, **422** if it has no lines. Before it nothing is owed; after it the deposit is payable (D99) |
| POST | `/po/{po_no}/amend` | `{line_no, qty?, unit_price?, description?, reason}` — the only way an issued obligation moves (D129). Supersession, never an edit: the old line stays and points at the new one, receipts follow the live line, and **422 without a reason**. **409** on a closed order |
| GET | `/vendors/{vendor_id}/journey` | one supplier's whole story: contract value, paid, outstanding, value received (capped at ordered — D98), *billable now* (D99), the vendor credit, and every order with its lines, receipts and evidence |
| GET | `/vendors/journeys` | every supplier we have issued an order to, most billable first. The tracker's list and its obligations strip (D102) |
| POST | `/po/{po_no}/close` | **422** listing what is unfinished — unpaid balance, goods not arrived, nothing filed — unless `settle_reason` is given, which goes on the audit row (D130). **409** on an order that is already closed or was never issued |
| POST | `/receipts` | `{line_no | po_line_no, qty, condition, qc_by?, documents[{attachment_id, kind}], note?}`. **422 without the photograph** — it is the one thing whoever is standing there can always produce. With the signed tanda terima it is `CONFIRMED`; without it, `REPORTED` (D131). A problem condition returns `outcome: ok` plus a `notified` flag and leaves the line open (A18) |
| POST | `/receipts/{receipt_no}/confirm` | `{delivery_note_attachment_id, qc_by?, qty_received?, condition?}` — procurement completing a reported arrival. **Only a confirmed receipt counts as value received.** The audit row carries `hours_after_arrival` |
| GET | `/receipts/reported` | arrivals waiting for their tanda terima, oldest first — the morning queue |

## `accounting`

| Method | Path | Notes |
|---|---|---|
| GET | `/accounts` | with balances from `v_account_balance` |
| GET | `/transactions` | `?account=&type=&from=&to=&vendor=&status=&q=&include_void=&limit=&offset=`. Paged at the service — the meta carries `total`, so a screen can say "page 2 of 9" rather than "next" into the dark. Voided rows are excluded unless asked for, so the page count matches what the reader sees |
| POST | `/transactions` | the **one write seam**. Requires `source_ref`; a repeat is `duplicate`, never a second row. **422 without at least one primary document** — nota, transfer proof or photo of what arrived (D85); supporting documents may ride along but cannot stand alone. **422 when a purchase type carries no lines, no quantity, no unit price or no vendor** (D86), and when the lines do not add up to the amount. The files are linked in the same act, so an undocumented row never exists |
| GET | `/transaction-types` | the thirteen, with `is_purchase` — which decides whether a row is expected to name what it bought and who from |
| GET | `/transactions/{trx_no}/history` | the audit trail of one row, with what changed field by field (D84) |
| GET | `/transactions/{trx_no}` | one call: the row, its lines, its allocations (each naming the request line it settled), and the PR/PO path. A drawer that needs three calls renders in three stages |
| POST | `/transactions/{trx_no}/void` | amount → 0, reason mandatory. Reversible |
| POST | `/transactions/{trx_no}/complete` | mark COMPLETED. §10.1 item 15 — never built in v1, built here |
| POST | `/allocations` | `{trx_no, pr_line_no, amount, method}`. **422 if Σ allocations would exceed the transaction** (A9) |
| POST | `/allocations/{id}/supersede` | corrections are new rows |
| POST | `/transactions/from-line` | **paying a request line is one act** (D53): writes the transaction, the allocation to the line, and the document link, with the PR line number in the ledger description. Requires the `post_ledger` authority. `source_ref = pr-line:<line_no>:<date>:<amount>`, so a retry is `duplicate` — never a second payment. **422** when the line does not exist, **409** when it was removed or the same payment is already posted |
| GET | `/review` | the PENDING queue |
| GET | `/review?direction=in` | the same queue, filtered to money coming IN — a transfer proof leadership dropped in chat, waiting to be booked (D81) |
| POST | `/review/{ref_id}/confirm-in` | book one as an IN transaction: writes the row, files the photo against it, closes the inbox row with `produced_trx_id`. The amount is confirmed by a person, never taken from the extraction (A13). `post_ledger` |
| GET | `/incoming` | money already booked into a paying account, with the proof on each row — what the payment-round screen offers instead of asking somebody to retype an amount the ledger already holds |
| POST | `/review/{ref_id}/confirm` | → a transaction. `Others` goes to notes, not the ledger |
| POST | `/review/{ref_id}/attach` | → links to existing transactions, creates no money |
| POST | `/review/{ref_id}/reject` | recorded, never discarded |
| POST | `/review/{ref_id}/rows` | add an item the extraction missed |
| POST | `/statements` | upload a leadership-account statement; line-by-line confirm before booking |
| GET | `/reports/cashflow`, `/reports/liquidation` | |

**Validation at the seam** (ADR-004): `POST /allocations` calls
`procurement.GET /pr/lines/{line_no}` before writing. A line that does not
exist is a 422 with the line number echoed — not a text field written
hopefully and validated by a sweep three hours later.

Liquidation:

| Method | Path | Notes |
|---|---|---|
| GET | `/fundings` | every transfer of operating money into an account that pays people, newest first, with how long each one lasted (D106) |
| GET | `/fundings/{trx_no}` | one transfer: the balance before it, every row that left before the next transfer arrived with the transfer counting down, and the split by type, vendor and project |

Payment calendar:

| Method | Path | Notes |
|---|---|---|
| GET | `/cash/plan` | twelve months from the current one: every recurring line, planned against actual, the *not in the plan* row, and the month the money runs out. Computed, never stored (A3) |
| GET | `/cash/due` | the next three weeks and anything already late, by date — the same events the month expansion uses (D116) |
| GET | `/cash/plan/{month}` | one month opened up: every dated movement in order with the balance running down, the first day it goes under, the lowest point, and the undated obligations no day can hold (D115) |
| POST | `/cash/components` | `{name, direction, amount, frequency, due_day \| due_weekday \| due_date, type_code?, vendor_id?, account_id?}`. `frequency` is `weekly`, `monthly` or `once`, and `amount` is **per occurrence** (D113). **422** without the date a one-off needs. **409 when another *standing* line already claims that category** (D110) — a one-off may share one, because it is dated and claims first |
| PATCH | `/cash/components/{id}` | estimate, day, name, or `active: false` to take it off the calendar. The audit row carries before and after |
| PUT | `/cash/components/{id}/months/{month}` | one month that differs. **422 without a reason** — in three months nobody remembers why one cell is bigger |
| POST | `/cash/settlements` | `{component_id, month, trx_no}` — naming the ledger row that paid a bill. **409 if that row is already named by another line.** The calendar never posts a transaction: money is recorded in the ledger, with its evidence, and named here afterwards (D112) |

## `documents`

| Method | Path | Notes |
|---|---|---|
| POST | `/upload` | multipart, ≤15 MB. Returns `attachment_id` + `sha256` + `duplicate_suspect` |
| POST | `/links` | link an attachment to an entity with a `kind` |
| GET | `/{id}` | signed URL, short TTL |
| GET | `/{id}/thumb?size=220\|400\|800` | server-side, cached |
| GET | `/by-entity/{entity}/{entity_no}` | everything attached to a thing |

The size limit sits **below** the framework's body limit deliberately, so a
too-large file gets a 413 that names the limit instead of a connection that
dies — the same reason `john-lau` set 15 MB under Next's 16 MB.

## `events` — the seam for a third service

| Method | Path | Notes |
|---|---|---|
| GET | `/outbox` | `?service=&type=&since=&undelivered=1` |
| POST | `/subscriptions` | `{url, event_types[], secret}` — a webhook |
| POST | `/outbox/{id}/replay` | redeliver |
| GET | `/openapi.json` | every service publishes one |

This is how Google Chat comes back, how a Sheets export is fed, and how any
future system attaches — by subscribing to events and calling the same
endpoints a person's browser calls. **No second write path** (§1.3: "we are
not building a second system").

Event names are `<service>.<entity>.<past tense>`:
`procurement.pr.submitted`, `procurement.approval.requested`, `procurement.line.approved`,
`procurement.round.closed`, `accounting.transaction.posted`,
`accounting.transaction.voided`, `accounting.allocation.recorded`.

---

## Testing, so a contract is a promise

Each service ships with:

1. **contract tests** — every endpoint, happy path plus every refusal code
2. **RLS tests** — the same call as `finance`, as `employee`, as anon.
   The rekap warns that testing permissions with a service role "answers the
   wrong question" (§6.4); these tests run as a real signed-in user
3. **rule tests** — one per rule in `00-context.md` §A that the service owns.
   A18 is a test, not a paragraph
4. **the integrity job** (ADR-004) in CI against seeded data

A milestone is not DONE until its rule tests are green.
