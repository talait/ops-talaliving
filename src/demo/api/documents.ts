/** Implements `/api/v1/documents` from `03-api.md`.
 *
 *  The main road (ADR-010): a document is attached FROM the record it belongs
 *  to, so the link is declared rather than inferred, and every link carries
 *  who declared it.
 */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  Attachment, AttachmentLink, AttachmentView, DocKind, LinkEntity,
} from "@/services/documents/contracts";
import { getState, apply, newId, writeAudit, writeOutbox } from "../store";
import { latency, actingUser, conflict, replayed, remember } from "./_kit";

const SERVICE = "documents" as const;

/** Below the framework's own body limit on purpose, so an oversized file gets
 *  an error that names the limit instead of a connection that dies. */
export const MAX_BYTES = 15 * 1024 * 1024;

function view(att: Attachment): AttachmentView {
  const links = getState().attachment_links.filter((l) => l.attachment_id === att.id);
  return { ...att, links, covers_count: links.length };
}

export async function upload(
  input: { filename: string; mime: string; bytes: number; sha256?: string },
  idempotencyKey?: string,
): Promise<Result<AttachmentView>> {
  await latency();
  const cached = replayed<AttachmentView>(SERVICE, "upload", idempotencyKey);
  if (cached) return cached;

  if (input.bytes > MAX_BYTES) {
    return invalid(
      SERVICE, "file_too_large",
      `File is ${(input.bytes / 1024 / 1024).toFixed(1)} MB, over the 15 MB limit.`,
      { field: "bytes", limit: MAX_BYTES },
    );
  }

  const sha = input.sha256 ?? newId("sha").slice(4, 16);
  /* Identical bytes seen before is a warning, never a block: the same receipt
   * really can be photographed twice, and refusing it hides the second one. */
  const duplicate = getState().attachments.some((a) => a.sha256 === sha);

  const user = actingUser();
  const att: Attachment = {
    id: newId("att"),
    storage_path: `demo/${new Date().toISOString().slice(0, 7)}/${input.filename}`,
    filename: input.filename, sha256: sha, mime: input.mime, bytes: input.bytes,
    uploaded_by: user.id, uploaded_at: new Date().toISOString(),
    source: "web", duplicate_suspect: duplicate,
  };
  apply((draft) => {
    draft.attachments.push(att);
    writeAudit(draft, { service: SERVICE, entity: "attachment", entity_no: att.filename, action: "upload", outcome: "ok", reason: duplicate ? "identical bytes seen before" : null });
  });
  const result = view(att);
  remember(SERVICE, "upload", idempotencyKey, result);
  return ok(SERVICE, result);
}

/** Attach from the record. The parent is already known, so this asks only for
 *  the document kind — vendor, amount and line come from where you were
 *  standing when you tapped. */
export async function link(
  input: { attachment_id: string; entity: LinkEntity; entity_no: string; kind: DocKind },
  idempotencyKey?: string,
): Promise<Result<AttachmentLink>> {
  await latency();
  const endpoint = `link:${input.attachment_id}:${input.entity_no}`;
  const cached = replayed<AttachmentLink>(SERVICE, endpoint, idempotencyKey);
  if (cached) return cached;

  const state = getState();
  if (!state.attachments.some((a) => a.id === input.attachment_id)) {
    return notFound(SERVICE, "attachment_not_found", "File not found.");
  }
  const already = state.attachment_links.find(
    (l) => l.attachment_id === input.attachment_id && l.entity === input.entity
      && l.entity_no === input.entity_no && l.kind === input.kind,
  );
  if (already) {
    return conflict(SERVICE, "already_linked", "This document is already linked there — nothing changed.");
  }

  const user = actingUser();
  const row: AttachmentLink = {
    id: newId("lnk"), attachment_id: input.attachment_id,
    entity: input.entity, entity_no: input.entity_no, kind: input.kind,
    linked_by: user.id, linked_at: new Date().toISOString(),
  };
  apply((draft) => {
    draft.attachment_links.push(row);
    writeAudit(draft, { service: SERVICE, entity: input.entity, entity_no: input.entity_no, action: "link", outcome: "ok", reason: null });
    writeOutbox(draft, { service: SERVICE, event_type: "documents.link.created", payload: { ...input } });
  });
  remember(SERVICE, endpoint, idempotencyKey, row);
  return ok(SERVICE, row);
}

/** Removing a link is not deleting a file. The file stays, both actions are in
 *  the audit log, and a wrong link is corrected by removing and adding rather
 *  than by moving. */
export async function unlink(linkId: string): Promise<Result<{ removed: string }>> {
  await latency();
  const existing = getState().attachment_links.find((l) => l.id === linkId);
  if (!existing) return notFound(SERVICE, "link_not_found", "Link not found.");
  apply((draft) => {
    draft.attachment_links = draft.attachment_links.filter((l) => l.id !== linkId);
    writeAudit(draft, { service: SERVICE, entity: existing.entity, entity_no: existing.entity_no, action: "unlink", outcome: "ok", reason: null });
  });
  return ok(SERVICE, { removed: linkId });
}

export async function byEntity(entity: LinkEntity, entityNo: string): Promise<Result<AttachmentView[]>> {
  await latency();
  const state = getState();
  const ids = state.attachment_links
    .filter((l) => l.entity === entity && l.entity_no === entityNo)
    .map((l) => l.attachment_id);
  return ok(SERVICE, state.attachments.filter((a) => ids.includes(a.id)).map(view));
}

export async function listAttachments(): Promise<Result<AttachmentView[]>> {
  await latency();
  return ok(SERVICE, getState().attachments.map(view));
}
