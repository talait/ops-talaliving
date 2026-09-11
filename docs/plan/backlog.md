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
| B4 | **Already decided** grows without limit and pushes the queue off the screen. It should carry a window of the last few days and paginate | `/accounting/verifikasi` | open |

## Asked for, not yet scheduled

| # | What | Note |
|---|---|---|
| W1 | Receiving reported by whoever actually saw the goods arrive — the driver, a supervisor, the security guard on the gate. They photograph it, send it to Google Chat, and a bot files it | Raised 2026-09-11. See **Q28**: it may mean the exception inbox becomes the main road for receiving rather than the exception, which would be a change of shape, not a feature |
