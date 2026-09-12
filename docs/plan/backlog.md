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
| ~~`/pengaturan`~~ | ~~the settings that are today constants in `src/lib/`~~ | **built 2026-09-13 (M42)** — D214–D216. **The placeholder list is now empty.** |
| ~~`/accounting/payslip`~~ | ~~nothing — it duplicates `/hrd/payroll`~~ | **removed** 2026-09-13 (M41) — owner: accounting does not read payslips. Deleted rather than parked: D105 parked two *working* screens over a judgement that might change; this was an empty route, and the question it was holding open has been answered (D213) |

## From the interview of 2026-09-13 — answered, deliberately not built yet

Nineteen questions were answered in one conversation (D227–D249). Five were
small enough to ship in the same commit. **These are the rest**, kept here
rather than in the open-questions table because they are no longer questions —
the decision is made and only the build is outstanding. Numbered as the owner
and I numbered them while agreeing what to do first.

| # | What was decided | Size | Note |
|---|---|---|---|
| #6 | ~~**The pay model splits into pokok + tunjangan**, with the hourly divisor derived from *setahun gaji ÷ hari kerja efektif ÷ jam sehari* rather than 173~~ | large | **built 2026-09-13 (M46)** — D250, D251, D252. The seeded split moves nobody's total at full attendance; what it moves is what a missed day costs. Lateness ships computed and not applied. Four findings fell out (F70–F73) |
| #7 | **Simplify the production stages, and add a subcontract route** | medium | D236. The stage list is seeded data (Q35's whole point), so the simplification is a seed edit; the subcontract route is not — a piece that is made elsewhere and comes back for finishing and packing is a different path through production, not five skipped stages |
| #8 | **Version the bill of material**, pinned to the work order that used it | medium | D237. A revision table plus `bom_rev` on the work order. Cheap now; the cost is a year of orders needing back-fill later, which is why the answer reversed the default |
| #9 | **Layered BOM, a button that raises a PR from one, and a typed labour cost** | large | D238, D239. Layering turns costing from a sum into a walk. The labour figure is typed from the owner's own formula and the system will not derive it |
| #10b | **BPJS and PPh: the enrolment register, and the per-person reconciliation** | medium | D227. The half of Q30 this commit did not build. *Names × rate against what was actually paid* is the audit the owner described, and it needs a roll of who is enrolled from what date — which does not exist yet in any system |
| #11 | **KPI analyzer and task tracker**, with lateness as one of the points | large | D230, and the measurement #39 wants for labour hours (D239). Held deliberately: it is a module, not a feature, and it is the first thing here that measures **people** rather than money or goods |
| #12 | **QR** — on the vendor PO (W3) and per box for installation (W4) | Phase 2 | D244. Both need a public read route and a token |

## Open, from building #6

| # | Question | Why it is a question and not a default |
|---|---|---|
| Q44 | **One business, two schedules, one start time.** The office day starts at 08:00 in the rule book; the workshop taps in at 06:49, 06:55, 07:02. With the owner's 15-minute grace on top, **nobody in the system is late** — including the man carrying a hand-typed Rp 45.000 lateness deduction | Raised 2026-09-13 (F70). The answer is either a start time per unit, or a start time per person, or the machine's records being read differently for the workshop — and all three are policy. A default here would invent a rule that decides whether thirty-five people are late every morning. The payslip now flags the contradiction rather than resolving it (D252) |
| Q45 | **What is this business's own `hari kerja efektif`?** Seeded at 288 — six days a week less tanggal merah and cuti bersama, which is also 24 days a month | Raised 2026-09-13 (D249). It is the denominator in every hourly rate the company computes, so it is worth the owner stating rather than the seed implying. The rule screen shows the arithmetic and names it as the company's own |
| Q46 | **Does a company half day earn the full tunjangan?** Today it does — the person was here, and only HRD's separate decision takes it away | Raised 2026-09-13 (D250). Follows from the owner's correction rather than from anything he said about half days specifically, so it is marked as a reading, not a ruling |

## Asked for, not yet scheduled

| # | What | Note |
|---|---|---|
| W2 | **Two roads to a confirmed PO**: when leadership create the order themselves it is confirmed on creation — asking themselves is theatre; when anybody else creates it, the confirmation goes out on chat like a request batch does | Raised 2026-09-11. Cheap and obvious once the approval gate exists (D132). The chat half reuses the machinery already built for approval batches — the outbox event is already written on `requestPoApproval`, so what is missing is the card, not the plumbing |
| W3 | **The PDF a vendor receives should carry its own signature** — answered: a **QR resolving to our own PO page** (D244). Needs a public read route and a token, so Phase 2 | Raised 2026-09-11, answered 2026-09-13. The two other candidates are dead: a scanned signature survives a photocopier and therefore proves nothing, a cryptographic one nobody in this trade can verify. The QR also catches an amended order presented as the original, because what the vendor sees is live |
| W4 | **QR per box, as the marker for installation** — the owner's second sentence on Q29, and a different thing from W3 | Raised 2026-09-13 (D244). A purchase order is one document with one QR; an installation needs a code **per box** that survives being carried to a site, and resolves to what is inside it and where it goes. Not built by widening W3 |
| W1 | ~~Receiving reported by whoever actually saw the goods arrive~~ | **answered and built** 2026-09-11 (D131). The owner's answer changed the shape: there *is* a procurement team with access, so accountability was never in doubt — the problem is only that goods arrive outside working hours. So receiving split into a report (photo, anyone present) and a confirmation (tanda terima, procurement). The Chat route is no longer required for it: the same two acts work from the app tonight, and a bot can produce the report later without changing anything |
