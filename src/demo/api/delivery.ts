/** The last leg: what left the yard, what was fitted, and the signature.
 *
 *  Three refusals hold this service up, and each one exists because the wrong
 *  answer is worse than no answer:
 *
 *  - **you cannot deliver what has not been made** (D210) — a delivery note
 *    for goods still on the floor is a promise somebody will drive to a site
 *    to discover is empty;
 *  - **you cannot fit what has not arrived** (D210) — the same thing one step
 *    later, and the more expensive one, because a crew is already there;
 *  - **a handover refuses without its signed BAST** (D211). Every other
 *    refusal in this system is about money. This one is about a claim: it says
 *    the client accepted the work, and the client is the one person who cannot
 *    correct our record of that.
 */
import { ok, invalid, notFound, type Result } from "@/services/_shared/envelope";
import type {
  DeliveryView, InstallationView, SnagView, FulfilmentView,
  SnagSeverity,
} from "@/services/delivery/contracts";
import { getState, apply, newId, nextDocNumber, writeAudit } from "../store";
import {
  fulfilmentView, fulfilmentViews, deliveryView, installationView, snagView,
  deliveredFor, installedFor,
} from "../delivery-derive";
import { latency, actingUser, requireModule, conflict, replayed, remember } from "./_kit";

const SERVICE = "production" as const;

function today(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/* ── Reading ──────────────────────────────────────────────────────────── */

export async function listFulfilment(): Promise<Result<FulfilmentView[]>> {
  await latency();
  return ok(SERVICE, fulfilmentViews(getState(), today()));
}

export async function getFulfilment(projectCode: string): Promise<Result<FulfilmentView>> {
  await latency();
  const v = fulfilmentView(getState(), projectCode, today());
  if (!v) return notFound(SERVICE, "project_not_found", `Tidak ada proyek ${projectCode}.`);
  return ok(SERVICE, v);
}

export async function listDeliveries(
  filter: { project_code?: string } = {},
): Promise<Result<DeliveryView[]>> {
  await latency();
  const state = getState();
  return ok(SERVICE, state.deliveries
    .filter((d) => !filter.project_code || d.project_code === filter.project_code)
    .map((d) => deliveryView(state, d, today()))
    .sort((a, b) => b.dispatched_on.localeCompare(a.dispatched_on)));
}

export async function listInstallations(
  filter: { project_code?: string } = {},
): Promise<Result<InstallationView[]>> {
  await latency();
  const state = getState();
  return ok(SERVICE, state.installations
    .filter((i) => !filter.project_code || i.project_code === filter.project_code)
    .map((i) => installationView(state, i))
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date)));
}

export async function listSnags(
  filter: { project_code?: string; open_only?: boolean } = {},
): Promise<Result<SnagView[]>> {
  await latency();
  const state = getState();
  return ok(SERVICE, state.snags
    .filter((s) => (!filter.project_code || s.project_code === filter.project_code)
      && (!filter.open_only || s.status === "OPEN"))
    .map((s) => snagView(state, s, today()))
    .sort((a, b) => {
      if ((a.status === "OPEN") !== (b.status === "OPEN")) return a.status === "OPEN" ? -1 : 1;
      return b.raised_on.localeCompare(a.raised_on);
    }));
}

/* ── Writing ──────────────────────────────────────────────────────────── */

/** A consignment. Refuses to promise more than exists. */
export async function createDelivery(
  input: {
    project_code: string;
    dispatched_on: string;
    vehicle?: string | null;
    driver?: string | null;
    lines: { project_line_id: string; qty: number; note?: string | null }[];
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<DeliveryView>> {
  await latency();
  const cached = replayed<DeliveryView>(SERVICE, "createDelivery", idempotencyKey);
  if (cached) return cached;
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;

  const state = getState();
  const ful = fulfilmentView(state, input.project_code, today());
  if (!ful) return notFound(SERVICE, "project_not_found", `Tidak ada proyek ${input.project_code}.`);
  if (input.lines.length === 0) {
    return invalid(SERVICE, "no_lines", "Surat jalan tanpa barang bukan surat jalan.", { field: "lines" });
  }

  for (const l of input.lines) {
    const line = ful.lines.find((x) => x.project_line_id === l.project_line_id);
    if (!line) return notFound(SERVICE, "line_not_found", "Baris pesanan itu bukan milik proyek ini.");
    if (l.qty <= 0) return invalid(SERVICE, "qty_required", "Berapa yang dikirim?", { field: "qty" });
    /* The line has nothing matchable behind it, so there is no figure to
       refuse against. Warn on the screen, do not block: a service line and an
       uncatalogued item are both legitimate things to put on a truck. */
    if (line.ready_to_ship != null && l.qty > line.ready_to_ship) {
      return conflict(
        SERVICE, "not_enough_made",
        `Baris ${line.line_no}: siap kirim ${line.ready_to_ship} ${line.uom}, diminta ${l.qty}. Yang sudah dibuat ${line.made}, sudah terkirim ${line.delivered}. Surat jalan untuk barang yang belum jadi adalah janji yang ketahuan di lokasi.`,
        { ready_to_ship: line.ready_to_ship, asked: l.qty, made: line.made, delivered: line.delivered },
      );
    }
  }

  const user = actingUser();
  let no = "";
  apply((draft) => {
    no = nextDocNumber(draft, "krm");
    const id = newId("dlv");
    draft.deliveries.push({
      id, delivery_no: no,
      project_code: input.project_code,
      dispatched_on: input.dispatched_on,
      vehicle: input.vehicle?.trim() || null,
      driver: input.driver?.trim() || null,
      status: "IN_TRANSIT",
      received_by: null, received_at: null,
      surat_jalan_attachment_id: null, photo_attachment_id: null,
      note: input.note?.trim() || null, cancelled_reason: null,
      created_by: user.id, created_at: new Date().toISOString(),
    });
    for (const l of input.lines) {
      const pl = draft.project_lines.find((p) => p.id === l.project_line_id)!;
      draft.delivery_lines.push({
        id: newId("dll"), delivery_id: id,
        project_line_id: l.project_line_id,
        description: pl.description, qty: l.qty, uom: pl.uom,
        note: l.note?.trim() || null,
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "delivery", entity_no: no,
      action: "dispatch", outcome: "ok", reason: null,
      detail: { project: input.project_code, lines: input.lines.length, by: user.email },
    });
  });

  const view = await getDelivery(no);
  if (view.data) remember(SERVICE, "createDelivery", idempotencyKey, view.data);
  return view;
}

export async function getDelivery(deliveryNo: string): Promise<Result<DeliveryView>> {
  await latency();
  const state = getState();
  const d = state.deliveries.find((x) => x.delivery_no === deliveryNo);
  if (!d) return notFound(SERVICE, "delivery_not_found", `Tidak ada pengiriman ${deliveryNo}.`);
  return ok(SERVICE, deliveryView(state, d, today()));
}

/** Marking it arrived. **Both halves of the evidence or neither** — the same
 *  rule receiving already follows (D101). */
export async function markArrived(
  input: {
    delivery_no: string;
    received_by: string;
    surat_jalan_attachment_id: string;
    photo_attachment_id?: string | null;
  },
): Promise<Result<DeliveryView>> {
  await latency();
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;

  const state = getState();
  const d = state.deliveries.find((x) => x.delivery_no === input.delivery_no);
  if (!d) return notFound(SERVICE, "delivery_not_found", `Tidak ada pengiriman ${input.delivery_no}.`);
  if (d.status === "ARRIVED") {
    return conflict(SERVICE, "already_arrived", "Pengiriman ini sudah tercatat sampai.", { at: d.received_at });
  }
  if (d.status === "CANCELLED") {
    return conflict(SERVICE, "cancelled", "Pengiriman ini dibatalkan.", { reason: d.cancelled_reason });
  }
  if (!input.received_by?.trim()) {
    return invalid(SERVICE, "receiver_required", "Siapa yang menerima di lokasi? Tanpa nama, tidak ada yang bisa ditanya tiga minggu lagi.", { field: "received_by" });
  }
  if (!input.surat_jalan_attachment_id) {
    return invalid(SERVICE, "surat_jalan_required", "Lampirkan surat jalan yang ditandatangani. Itu satu-satunya bukti bahwa barangnya diakui diterima.", { field: "surat_jalan_attachment_id" });
  }

  const user = actingUser();
  apply((draft) => {
    const row = draft.deliveries.find((x) => x.id === d.id)!;
    row.status = "ARRIVED";
    row.received_by = input.received_by.trim();
    row.received_at = new Date().toISOString();
    row.surat_jalan_attachment_id = input.surat_jalan_attachment_id;
    row.photo_attachment_id = input.photo_attachment_id ?? row.photo_attachment_id;
    writeAudit(draft, {
      service: SERVICE, entity: "delivery", entity_no: d.delivery_no,
      action: "arrive", outcome: "ok", reason: null,
      detail: { received_by: input.received_by.trim(), by: user.email },
    });
  });
  return getDelivery(d.delivery_no);
}

/** A visit, and what was fitted on it. Refuses to fit more than arrived. */
export async function recordInstallation(
  input: {
    project_code: string;
    visit_date: string;
    crew?: string | null;
    lines: { project_line_id: string; qty: number; note?: string | null }[];
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<InstallationView>> {
  await latency();
  const cached = replayed<InstallationView>(SERVICE, "recordInstallation", idempotencyKey);
  if (cached) return cached;
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;

  const state = getState();
  const ful = fulfilmentView(state, input.project_code, today());
  if (!ful) return notFound(SERVICE, "project_not_found", `Tidak ada proyek ${input.project_code}.`);
  if (input.lines.length === 0) {
    return invalid(SERVICE, "no_lines", "Kunjungan tanpa barang terpasang dicatat sebagai dijadwalkan, bukan selesai.", { field: "lines" });
  }

  for (const l of input.lines) {
    const line = ful.lines.find((x) => x.project_line_id === l.project_line_id);
    if (!line) return notFound(SERVICE, "line_not_found", "Baris pesanan itu bukan milik proyek ini.");
    if (l.qty <= 0) return invalid(SERVICE, "qty_required", "Berapa yang terpasang?", { field: "qty" });
    if (l.qty > line.on_site) {
      return conflict(
        SERVICE, "not_enough_on_site",
        `Baris ${line.line_no}: di lokasi ada ${line.on_site} ${line.uom} yang belum terpasang, dilaporkan ${l.qty}. Sudah berangkat ${line.delivered}, tercatat sampai ${line.arrived}, terpasang ${line.installed}. Kalau barangnya memang ada di sana, pengirimannya yang belum dicatat sampai.`,
        { on_site: line.on_site, asked: l.qty, delivered: line.delivered, arrived: line.arrived, installed: line.installed },
      );
    }
  }

  const user = actingUser();
  let no = "";
  apply((draft) => {
    no = nextDocNumber(draft, "pas");
    const id = newId("ins");
    draft.installations.push({
      id, install_no: no,
      project_code: input.project_code,
      visit_date: input.visit_date,
      crew: input.crew?.trim() || null,
      status: "DONE",
      note: input.note?.trim() || null, cancelled_reason: null,
      created_by: user.id, created_at: new Date().toISOString(),
    });
    for (const l of input.lines) {
      draft.installation_lines.push({
        id: newId("inl"), installation_id: id,
        project_line_id: l.project_line_id, qty: l.qty,
        note: l.note?.trim() || null,
      });
    }
    writeAudit(draft, {
      service: SERVICE, entity: "installation", entity_no: no,
      action: "install", outcome: "ok", reason: null,
      detail: { project: input.project_code, lines: input.lines.length, by: user.email },
    });
  });

  const state2 = getState();
  const row = state2.installations.find((i) => i.install_no === no)!;
  const view = ok(SERVICE, installationView(state2, row));
  remember(SERVICE, "recordInstallation", idempotencyKey, view.data);
  return view;
}

/** Something found wrong. Raised by whoever saw it, including the client. */
export async function raiseSnag(
  input: {
    project_code: string;
    project_line_id?: string | null;
    raised_by: string;
    description: string;
    severity: SnagSeverity;
    photo_attachment_id?: string | null;
  },
): Promise<Result<SnagView>> {
  await latency();
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;
  if (!input.description?.trim()) {
    return invalid(SERVICE, "description_required", "Apa yang salah? Catatan tanpa isi tidak bisa diperbaiki siapa pun.", { field: "description" });
  }
  if (!input.raised_by?.trim()) {
    return invalid(SERVICE, "raiser_required", "Siapa yang menemukan? Klien dan tim kita menuntut tindak lanjut yang berbeda.", { field: "raised_by" });
  }

  const user = actingUser();
  let no = "";
  apply((draft) => {
    no = nextDocNumber(draft, "tmn");
    draft.snags.push({
      id: newId("sng"), snag_no: no,
      project_code: input.project_code,
      project_line_id: input.project_line_id ?? null,
      raised_on: today(), raised_by: input.raised_by.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: "OPEN",
      photo_attachment_id: input.photo_attachment_id ?? null,
      fixed_on: null, fixed_by: null, fix_note: null,
    });
    writeAudit(draft, {
      service: SERVICE, entity: "snag", entity_no: no,
      action: "raise", outcome: "ok", reason: null,
      detail: { project: input.project_code, severity: input.severity, by: user.email },
    });
  });

  const state = getState();
  const row = state.snags.find((s) => s.snag_no === no)!;
  return ok(SERVICE, snagView(state, row, today()));
}

export async function closeSnag(
  input: { snag_no: string; fixed_by: string; fix_note: string },
): Promise<Result<SnagView>> {
  await latency();
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;

  const state = getState();
  const s = state.snags.find((x) => x.snag_no === input.snag_no);
  if (!s) return notFound(SERVICE, "snag_not_found", `Tidak ada catatan ${input.snag_no}.`);
  if (s.status === "FIXED") {
    return conflict(SERVICE, "already_fixed", "Catatan ini sudah ditutup.", { on: s.fixed_on });
  }
  if (!input.fix_note?.trim()) {
    return invalid(SERVICE, "fix_note_required", "Apa yang dikerjakan? Catatan yang ditutup tanpa keterangan akan dibuka lagi oleh orang yang sama.", { field: "fix_note" });
  }

  const user = actingUser();
  apply((draft) => {
    const row = draft.snags.find((x) => x.id === s.id)!;
    row.status = "FIXED";
    row.fixed_on = today();
    row.fixed_by = input.fixed_by?.trim() || user.full_name;
    row.fix_note = input.fix_note.trim();
    writeAudit(draft, {
      service: SERVICE, entity: "snag", entity_no: s.snag_no,
      action: "fix", outcome: "ok", reason: input.fix_note.trim(),
      detail: { by: user.email },
    });
  });

  const after = getState();
  return ok(SERVICE, snagView(after, after.snags.find((x) => x.id === s.id)!, today()));
}

/** The signature. The only record that says a job is finished. */
export async function recordHandover(
  input: {
    project_code: string;
    handed_on: string;
    client_rep: string;
    our_rep: string;
    bast_attachment_id: string;
    note?: string | null;
  },
  idempotencyKey?: string,
): Promise<Result<FulfilmentView>> {
  await latency();
  const cached = replayed<FulfilmentView>(SERVICE, "recordHandover", idempotencyKey);
  if (cached) return cached;
  const denied = requireModule(SERVICE, "project");
  if (denied) return denied;

  const state = getState();
  const ful = fulfilmentView(state, input.project_code, today());
  if (!ful) return notFound(SERVICE, "project_not_found", `Tidak ada proyek ${input.project_code}.`);
  if (ful.handover) {
    return conflict(SERVICE, "already_handed_over", `Proyek ini sudah diserahterimakan ${ful.handover.handed_on} (${ful.handover.handover_no}).`, { handover_no: ful.handover.handover_no });
  }
  if (!input.bast_attachment_id) {
    return invalid(
      SERVICE, "bast_required",
      "Lampirkan BAST yang sudah ditandatangani. Serah terima tanpa dokumennya adalah klaim bahwa klien menerima pekerjaan ini — dan klien satu-satunya pihak yang tidak bisa mengoreksi catatan kita.",
      { field: "bast_attachment_id" },
    );
  }
  if (!input.client_rep?.trim() || !input.our_rep?.trim()) {
    return invalid(SERVICE, "reps_required", "Siapa yang tanda tangan di kedua sisi? Itu yang tertulis di kertasnya.", { field: "client_rep" });
  }

  /* Nothing installed at all is not a handover, it is a misfiled document. */
  if (ful.installed_qty === 0 && ful.delivered_qty === 0) {
    return conflict(
      SERVICE, "nothing_delivered",
      "Belum ada satu pun barang yang tercatat terkirim atau terpasang di proyek ini. Kalau pekerjaannya memang selesai, pengiriman dan pemasangannya yang belum dicatat.",
      { delivered: ful.delivered_qty, installed: ful.installed_qty },
    );
  }

  const open = state.snags.filter((s) => s.project_code === input.project_code && s.status === "OPEN");
  const user = actingUser();
  let no = "";
  apply((draft) => {
    no = nextDocNumber(draft, "bast");
    draft.handovers.push({
      id: newId("hdo"), handover_no: no,
      project_code: input.project_code,
      handed_on: input.handed_on,
      client_rep: input.client_rep.trim(),
      our_rep: input.our_rep.trim(),
      bast_attachment_id: input.bast_attachment_id,
      /* Frozen, not derived. A handover signed with three notes open stays a
         handover signed with three notes open, however fast they are fixed
         afterwards (D212). */
      open_snags_at_handover: open.length,
      open_snag_nos: open.map((s) => s.snag_no),
      note: input.note?.trim() || null,
      created_by: user.id, created_at: new Date().toISOString(),
    });
    writeAudit(draft, {
      service: SERVICE, entity: "handover", entity_no: no,
      action: "hand_over", outcome: "ok", reason: null,
      detail: {
        project: input.project_code, client_rep: input.client_rep.trim(),
        open_snags: open.length, by: user.email,
      },
    });
  });

  return getFulfilment(input.project_code);
}
