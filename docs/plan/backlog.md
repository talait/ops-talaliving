# Backlog — reported, not yet built

Things somebody noticed while using the demo, kept here so they are neither
lost nor silently promoted above the work in hand. Each one says what was
observed, not what to build — the fix is decided when it is picked up.

Fixed items stay, struck through, with the commit that closed them. A backlog
that only shows what is left teaches nobody anything.

## Bugs

| # | What happens | Where | Status |
|---|---|---|---|
| B1 | ~~Clicking into the instruction box opens the line drawer behind it and takes the focus with it~~ | `/procurement/meeting` | **fixed** 2026-09-11 — the cell stops the row's click (F36) |
| B2 | The evidence chips — *photo of the goods*, *tanda terima*, *on file* — read as labels and cannot be opened. They should reach the file they describe | `/procurement/tracker/[vendor]` | open |
| B3 | An image has to be opened through a button before it can be seen. Every picture in the queue should show its own preview | `/accounting/verifikasi` | open |
| B4 | **Already decided** grows without limit and pushes the queue off the screen. It should carry a window of the last few days and paginate | `/accounting/verifikasi` | **half done (M26)** — both lists now page, twelve at a time, and the queue pages too (D157). The date window is still open: paging keeps the screen usable, it does not answer *how far back is worth showing* |

## Scheduled — the owner's answers of 2026-09-11

| # | What | Note |
|---|---|---|
| S1 | ~~**Stock: materials and hardware, properly categorised**~~ | **built 2026-09-11 (M27)** — `/inventory/material` and `/inventory/penyesuaian`, D169–D172. Confirming a receipt now stocks the goods. What is still open is the other half of Q40: nothing draws stock down from a BOM automatically — an issue is recorded by the person who carried it out, against the SPK |
| S2 | **Berkas 201 and Cuti & Izin** | the two HR screens that stay. Compliance is dropped (D165) |
| S3 | **Desain, for the drafters** | the queue, not the folder: what is undrawn, whose turn, which revision the workshop is cutting from (D167) |
| S4 | ~~**Pay schemes as configuration**~~ | **built 2026-09-11 (M28)** — `/it/aturan-gaji`, D173–D176. Overtime now follows the national ladder (Q31 answered); undertime is built and off by default |
| S5 | **Rekening koran upload for the leadership accounts** | BCA 064 and **BCA USD 081** — both already in the ledger as `custody: leadership`, neither pays a vendor directly. Not shared openly, so the statement is how their rows reach the ledger at all. One is in USD: the rate goes on the row (Q42) |
| S6 | **Package: the agent-commission programme** | its own session; the owner has an artifact (D166) |

## Asked for, not yet scheduled

| # | What | Note |
|---|---|---|
| W2 | **Two roads to a confirmed PO**: when leadership create the order themselves it is confirmed on creation — asking themselves is theatre; when anybody else creates it, the confirmation goes out on chat like a request batch does | Raised 2026-09-11. Cheap and obvious once the approval gate exists (D132). The chat half reuses the machinery already built for approval batches — the outbox event is already written on `requestPoApproval`, so what is missing is the card, not the plumbing |
| W3 | **The PDF a vendor receives should carry its own signature.** Open question: does that mean a scanned signature image, or a QR code the vendor can scan to see the order on our side? | Raised 2026-09-11. See **Q29** — the two answers solve different problems and only one of them survives a photocopier |
| W1 | ~~Receiving reported by whoever actually saw the goods arrive~~ | **answered and built** 2026-09-11 (D131). The owner's answer changed the shape: there *is* a procurement team with access, so accountability was never in doubt — the problem is only that goods arrive outside working hours. So receiving split into a report (photo, anyone present) and a confirmation (tanda terima, procurement). The Chat route is no longer required for it: the same two acts work from the app tonight, and a bot can produce the report later without changing anything |
