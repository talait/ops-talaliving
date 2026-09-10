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
| POST | `/pr/lines/{line_no}/approve` | `{step, decision, approved_qty, approved_amount, reason}`; `step` ∈ `GOODS` · `FUNDS` — **there is no IT step** (D20). **422 if approved > requested** (A8). **403 without the matching authority** — `approve_goods` is the CEO's alone (D19). 409 if you already decided this line at this step |
| GET | `/pr/queue` | the standing approval queue: every requested line neither approved, rejected nor withdrawn (D21). A `HOLD` stays in it |
| POST | `/pr/lines/{line_no}/withdraw` | the requester takes their own line back, before any decision (Q17). Soft — the row stays, with who and when |
| GET | `/pr/lines/{line_no}/history` | approvals, revisions, allocations, receipts — the full trail |

Rounds:

| Method | Path | Notes |
|---|---|---|
| POST | `/rounds/sync` | roll every approved-and-still-owed line into the single OPEN round. Idempotent; safe to call on every page load |
| GET | `/rounds/{round_no}` | requested, balances, TO TRANSFER, funded-by |
| POST | `/rounds/{round_no}/approve` | `procurement.approve_funds`. Freezes the numbers |
| POST | `/rounds/{round_no}/transfer` | records amount + transaction. **Does not make any line PAID** (A10) |
| POST | `/rounds/{round_no}/close` | the step everyone forgets. Response lists what is still owed and is being released |

PO and receiving:

| Method | Path | Notes |
|---|---|---|
| POST | `/po` | born DRAFT |
| GET | `/po/{po_no}` | two axes, exposure, schedule, credits, documents |
| POST | `/po/{po_no}/amend` | the only way an issued obligation moves |
| POST | `/po/{po_no}/close` | refused unless both axes are done **and** the evidence chain exists, or a settlement with a reason |
| POST | `/receipts` | `{line_no | po_line_no, qty, condition, attachment_ids[]}`. **422 without a photo.** A problem condition returns `outcome: ok` plus a `notified` flag and leaves the line open (A18) |

## `accounting`

| Method | Path | Notes |
|---|---|---|
| GET | `/accounts` | with balances from `v_account_balance` |
| GET | `/transactions` | `?account=&type=&from=&to=&vendor=&status=&q=` |
| POST | `/transactions` | the **one write seam**. Requires `source_ref`; a repeat is `duplicate`, never a second row |
| GET | `/transactions/{trx_no}` | + lines + documents + allocations + the PR/PO path |
| POST | `/transactions/{trx_no}/void` | amount → 0, reason mandatory. Reversible |
| POST | `/transactions/{trx_no}/complete` | mark COMPLETED. §10.1 item 15 — never built in v1, built here |
| POST | `/allocations` | `{trx_no, pr_line_no, amount, method}`. **422 if Σ allocations would exceed the transaction** (A9) |
| POST | `/allocations/{id}/supersede` | corrections are new rows |
| GET | `/review` | the PENDING queue |
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
`procurement.pr.submitted`, `procurement.line.approved`,
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
