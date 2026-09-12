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
| B3 | ~~An image has to be opened through a button before it can be seen. Every picture in the queue should show its own preview~~ | `/accounting/verifikasi` | **fixed** 2026-09-12 (M39) — a preview on the selected document and on every decided one, swapping in place rather than opening a modal. What it draws is a stand-in that says so on its face (D208); Phase 2 puts the file in the same slot |
| B4 | **Already decided** grows without limit and pushes the queue off the screen. It should carry a window of the last few days and paginate | `/accounting/verifikasi` | **half done (M26)** — both lists now page, twelve at a time, and the queue pages too (D157). The date window is still open: paging keeps the screen usable, it does not answer *how far back is worth showing* |

## Scheduled — the owner's answers of 2026-09-11

| # | What | Note |
|---|---|---|
| S1 | ~~**Stock: materials and hardware, properly categorised**~~ | **built 2026-09-11 (M27)** — `/inventory/material` and `/inventory/penyesuaian`, D169–D172. Confirming a receipt now stocks the goods. What is still open is the other half of Q40: nothing draws stock down from a BOM automatically — an issue is recorded by the person who carried it out, against the SPK |
| S2 | ~~**Berkas 201 and Cuti & Izin**~~ | **built 2026-09-11 (M29)** — D177, D178. Compliance removed from the menu |
| S3 | ~~**Desain, for the drafters**~~ | **built 2026-09-11 (M30)** — `/produksi/desain`, D179 |
| S4 | ~~**Pay schemes as configuration**~~ | **built 2026-09-11 (M28)** — `/it/aturan-gaji`, D173–D176. Overtime now follows the national ladder (Q31 answered); undertime is built and off by default |
| S5 | ~~**Rekening koran upload for the leadership accounts**~~ | **built 2026-09-11 (M31)** — `/accounting/rekening-koran`, D180–D182. Q42 answered: the statement is the only road, and the USD rate is typed per line |
| S6 | ~~**Package: the agent-commission programme**~~ | **built 2026-09-12 (M32)** — `/marketing/pipeline` and `/marketing/agen`, D183–D186, from the owner's own pipeline dashboard as the reference |

## Placeholder screens — routes that exist and hold nothing

**A placeholder is a finding, not a file** (F54). A route created to hold a
place goes on this list in the same commit, because the menu is the only other
record that it is empty and the menu is what makes it look full.

| Route | What it should hold | Status |
|---|---|---|
| `/it/audit` · `/it/aktivitas` · `/it/pengguna` · `/it/peran` | ~~the two trails, the grants, the catalogue~~ | **built 2026-09-12 (M34)** — they were placeholders for thirty-one milestones and nothing in the build could say so (F54) |
| ~~`/proyek/pengiriman`~~ | ~~delivery of finished goods to the site~~ | **built 2026-09-13 (M40)** — D209–D212 |
| ~~`/proyek/instalasi`~~ | ~~installation on site, and what it found~~ | **built 2026-09-13 (M40)** — D209–D212 |
| ~~`/proyek/serah-terima`~~ | ~~handover, and what the client signed~~ | **built 2026-09-13 (M40)** — D209–D212 |
| `/pengaturan` | the settings that are today constants in `src/lib/` | open |
| `/accounting/payslip` | nothing — it duplicates `/hrd/payroll`. Decide whether accounting reads payslips at all, then build or remove | open |

## Asked for, not yet scheduled

| # | What | Note |
|---|---|---|
| W2 | **Two roads to a confirmed PO**: when leadership create the order themselves it is confirmed on creation — asking themselves is theatre; when anybody else creates it, the confirmation goes out on chat like a request batch does | Raised 2026-09-11. Cheap and obvious once the approval gate exists (D132). The chat half reuses the machinery already built for approval batches — the outbox event is already written on `requestPoApproval`, so what is missing is the card, not the plumbing |
| W3 | **The PDF a vendor receives should carry its own signature.** Open question: does that mean a scanned signature image, or a QR code the vendor can scan to see the order on our side? | Raised 2026-09-11. See **Q29** — the two answers solve different problems and only one of them survives a photocopier |
| W1 | ~~Receiving reported by whoever actually saw the goods arrive~~ | **answered and built** 2026-09-11 (D131). The owner's answer changed the shape: there *is* a procurement team with access, so accountability was never in doubt — the problem is only that goods arrive outside working hours. So receiving split into a report (photo, anyone present) and a confirmation (tanda terima, procurement). The Chat route is no longer required for it: the same two acts work from the app tonight, and a bot can produce the report later without changing anything |
