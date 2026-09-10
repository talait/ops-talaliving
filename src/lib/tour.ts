/** The guided walk.
 *
 *  Flow B, as `00-context.md` names it: request → approval → payment →
 *  receiving. It exists because the demo is walked with people who have never
 *  seen it, and "click Requests, then the meeting board, then…" said out loud
 *  gets lost in the room. The tour says it on the screen instead, one step at
 *  a time, on the real pages with the real data — not a slideshow of pictures
 *  of the app (D117).
 *
 *  Two rules it keeps. It never blocks anything: every control on the page
 *  underneath still works, and somebody who wanders off is not corrected.
 *  And each step says **what to look at and why it matters**, never just where
 *  to click — a tour that only points is a worse version of a menu.
 */
export interface TourStep {
  href: string;
  title: string;
  /** What to look at on this screen, and the reason it is on the walk. */
  body: string;
}

export interface Tour {
  id: string;
  name: string;
  steps: TourStep[];
}

export const FLOW_B: Tour = {
  id: "flow-b",
  name: "Flow B — from a request to money leaving",
  steps: [
    {
      href: "/procurement/pr",
      title: "It starts as a line, not a document",
      body: "Every row here is one item somebody asked for. Open one: the status, who approved it, what was actually paid against it, and every file attached to it are all on the line — because that is the thing a question is ever asked about.",
    },
    {
      href: "/procurement/meeting",
      title: "The meeting decides what gets paid",
      body: "Tick what should be approved. The total to pay and the balance in BCA 271 sit above the list, so the room can see whether the money is there before anybody says yes.",
    },
    {
      href: "/demo/chat",
      title: "Approval is answered by the approver",
      body: "The meeting laptop is usually not the CEO's. So the request goes to Chat as one card with its totals, and whoever answers it signs it — the name on the record is theirs, not the laptop's.",
    },
    {
      href: "/procurement/pr",
      title: "Approved, and now waiting for money",
      body: "The approved line is not paid. Open it and pay from the line: the ledger row is written from here, with the evidence attached in the same act. Nothing is marked paid because somebody remembers paying it.",
    },
    {
      href: "/accounting/ledger",
      title: "Money out, with proof and detail",
      body: "The same payment as a ledger row. A row cannot be posted without at least one nota, transfer proof or photo — and a purchase must say what was bought, how many, at what price, and from whom. Cash position for all five accounts is at the top.",
    },
    {
      href: "/procurement/tracker",
      title: "What the goods say, against what the money says",
      body: "Per supplier: ordered, received, paid, and what they could invoice today. Recording a delivery needs both the photo of the goods and the signed tanda terima, plus who received it and who checked it.",
    },
    {
      href: "/accounting/verifikasi",
      title: "The exception road: bought first, approved later",
      body: "A photo arrives in Chat for something nobody raised a request for. Five roads out, none of them delete: write the request retro-actively, link it to a row already there, post it as it is, ask a question, or reject it — and rejecting never reaches the ledger.",
    },
    {
      href: "/accounting/liquidation",
      title: "Where the last transfer went",
      body: "Per transfer, not per month: what was spent before the next one arrived, how many days it lasted, and how much of it went out with no approved line or order behind it.",
    },
    {
      href: "/accounting/calendar",
      title: "Whether the money lasts the year",
      body: "Twelve months of bills against twelve months of transfers, planned above and actual below. Click a month to open it day by day — the month it runs short and the day it runs short are different questions with different answers.",
    },
  ],
};

export const TOURS: Record<string, Tour> = { [FLOW_B.id]: FLOW_B };

/** The URL for one step. The tour lives in the query string on purpose: it can
 *  be pasted into a chat, and leaving it is closing a bar rather than escaping
 *  a mode. */
export function tourHref(tour: Tour, index: number): string {
  const step = tour.steps[index];
  const join = step.href.includes("?") ? "&" : "?";
  return `${step.href}${join}tour=${tour.id}&step=${index + 1}`;
}
