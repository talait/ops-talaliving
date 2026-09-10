/** Documents contracts — `core.attachments` and `core.attachment_links`.
 *
 *  This is the main road (ADR-010): somebody opens the PR line or the ledger
 *  row and attaches the file there, so the link is declared rather than
 *  inferred. Many-to-many from the start, and every link records WHO declared
 *  it — that column is the answer to the tracing problem.
 */

/** The four document types, exactly as the running system spells them. */
export const DOC_KINDS = [
  "Receipt / Invoice / Nota",
  "Payment Proof",
  "Receiving Item",
  "Others",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** `Others` never touches the ledger — it branches to notes before anything
 *  else is looked at (owner, 2026-08-27). */
export const LEDGER_DOC_KINDS: DocKind[] = [
  "Receipt / Invoice / Nota",
  "Payment Proof",
  "Receiving Item",
];

export type LinkEntity = "transaction" | "pr_line" | "po" | "receipt";

export interface Attachment {
  id: string;
  storage_path: string;
  filename: string;
  sha256: string;
  mime: string;
  bytes: number;
  uploaded_by: string;
  uploaded_at: string;
  source: "web" | "chat" | "api" | "import";
  /** Advisory only — identical bytes seen before. Never blocks (A6). */
  duplicate_suspect: boolean;
}

export interface AttachmentLink {
  id: string;
  attachment_id: string;
  entity: LinkEntity;
  entity_no: string;
  kind: DocKind;
  /** Who declared this link, and when. The whole point. */
  linked_by: string;
  linked_at: string;
}

export interface AttachmentView extends Attachment {
  links: AttachmentLink[];
  /** More than one link means one document covering several parents — the
   *  normal case here, not the parked-file problem it is today. */
  covers_count: number;
}
