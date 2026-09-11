"use client";

import { Badge, type Tone } from "./primitives";
import type {
  LineStatus, RoundStatus, PoStatus, PoPaymentState, PoDeliveryState,
} from "@/services/procurement/contracts";
import type { TrxStatus, InboxStatus } from "@/services/accounting/contracts";

/** One mapping from every status vocabulary onto the six badge tones.
 *
 *  It lives in one file because the alternative is what the old system has:
 *  eleven colour strings in a sheet painter that do not agree with the nine in
 *  the canonical view. If a status means the same thing on two screens, it has
 *  to look the same on both, and the only way to guarantee that is to have one
 *  place that decides.
 */
const LINE: Record<LineStatus, Tone> = {
  DRAFT: "slate",
  "WAITING FOR APPROVAL": "amber",
  APPROVED: "brand",
  PAID: "green",
  PARTIAL: "amber",
  COMPLETED: "green",
  REMOVED: "red",
};

const ROUND: Record<RoundStatus, Tone> = {
  OPEN: "amber",
  APPROVED: "brand",
  TRANSFERRED: "violet",
  CLOSED: "green",
};

const PO: Record<PoStatus, Tone> = {
  DRAFT: "slate", ISSUED: "brand", CLOSED: "green", CANCELLED: "red",
};

const PAYMENT: Record<PoPaymentState, Tone> = {
  UNPAID: "slate", PARTIAL: "amber", SETTLED: "green",
};

const DELIVERY: Record<PoDeliveryState, Tone> = {
  PENDING: "slate", PARTIAL: "amber", COMPLETE: "green",
};

const TRX: Record<TrxStatus, Tone> = {
  POSTED: "amber", COMPLETED: "green", UNTRACKED: "slate", VOID: "red",
};

const INBOX: Record<InboxStatus, Tone> = {
  PENDING: "amber", CONFIRMED: "green", ATTACHED: "violet",
  REJECTED: "red", CANCELLED: "slate", NOTED: "slate",
};

const MAPS = {
  line: LINE, round: ROUND, po: PO,
  payment: PAYMENT, delivery: DELIVERY, trx: TRX, inbox: INBOX,
} as const;

export type StatusKind = keyof typeof MAPS;

export function StatusPill({
  kind,
  status,
  dot = true,
}: {
  kind: StatusKind;
  status: string;
  dot?: boolean;
}) {
  const tone = (MAPS[kind] as Record<string, Tone>)[status] ?? "slate";
  return <Badge tone={tone} dot={dot}>{status}</Badge>;
}
