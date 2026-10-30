import { beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import {
  createAgendaEvent,
  deleteAgendaEvent,
  listCalendarEvents,
  moveAgendaEvent,
  updateAgendaEvent,
  type AgendaCalendarEvent,
} from "@/server/services/calendar";
import { confirmUpload, deleteFile, getFileUrl, listStatementFiles, requestUpload } from "@/server/services/files";
import { localWrite, verifyLocalToken } from "@/server/storage";
import type { UploadTarget } from "@/lib/schemas";
import { makeUser, resetDb } from "../helpers";

const PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

type Actor = Parameters<typeof requestUpload>[0];

async function upload(actor: Actor, target: UploadTarget, name: string, bytes: Uint8Array) {
  const r = await requestUpload(actor, { filename: name, sizeBytes: bytes.length, target });
  const payload = verifyLocalToken(new URL(r.uploadUrl, "http://x").searchParams.get("t")!)!;
  await localWrite(payload.k, bytes);
  return confirmUpload(actor, r.fileId);
}

const FROM = new Date("2030-11-01T00:00:00Z");
const TO = new Date("2030-12-01T00:00:00Z");
const agendaOf = async (actor: Actor, clientId?: string) =>
  (await listCalendarEvents(actor, FROM, TO, clientId)).filter((e): e is AgendaCalendarEvent => e.kind === "event");

beforeEach(async () => {
  await resetDb();
  await rm(".storage-test", { recursive: true, force: true });
});

describe("Eventos da agenda", () => {
  async function setup() {
    const admin = await makeUser("ADMIN", { name: "Pedro" });
    const member = await makeUser("MEMBER", { name: "Matheus" });
    const outsider = await makeUser("MEMBER", { name: "Visitante" });
    const client = await createClient(admin.actor, { name: "Aurora", status: "ACTIVE", memberIds: [member.id] });
    return { admin, member, outsider, client };
  }

  it("cria evento com horário, participantes e cliente e aparece no calendário", async () => {
    const { admin, member, client } = await setup();
    await createAgendaEvent(admin.actor, {
      title: "Gravação do Reel",
      startsAt: "2030-11-20T17:00:00.000Z",
      endsAt: "2030-11-20T19:00:00.000Z",
      clientId: client.id,
      attendeeIds: [admin.id, member.id, member.id],
      location: "Estúdio",
    });
    const [e] = await agendaOf(admin.actor);
    expect(e).toMatchObject({ title: "Gravação do Reel", allDay: false, location: "Estúdio", client: { name: "Aurora" }, canEdit: true });
    expect(e.attendees.map((a) => a.name).sort()).toEqual(["Matheus", "Pedro"]);
    expect(e.endsAt).toBe("2030-11-20T19:00:00.000Z");
    // O filtro por cliente também traz o evento.
    expect(await agendaOf(admin.actor, client.id)).toHaveLength(1);
  });

  it("valida fim antes do início e participante inexistente", async () => {
    const { admin } = await setup();
    await expect(
      createAgendaEvent(admin.actor, { title: "X", startsAt: "2030-11-20T17:00:00.000Z", endsAt: "2030-11-20T16:00:00.000Z" }),
    ).rejects.toThrow();
    await expect(
      createAgendaEvent(admin.actor, { title: "X", startsAt: "2030-11-20T17:00:00.000Z", attendeeIds: ["c00000000000000000000000"] }),
    ).rejects.toThrow(/Participante/);
  });

  it("visibilidade: evento interno para todos; de cliente só para quem acessa o cliente ou foi convidado", async () => {
    const { admin, member, outsider, client } = await setup();
    await createAgendaEvent(admin.actor, { title: "Reunião interna", startsAt: "2030-11-10T13:00:00.000Z" });
    await createAgendaEvent(admin.actor, { title: "Call Aurora", startsAt: "2030-11-11T13:00:00.000Z", clientId: client.id });
    await createAgendaEvent(admin.actor, {
      title: "Call Aurora com convidado",
      startsAt: "2030-11-12T13:00:00.000Z",
      clientId: client.id,
      attendeeIds: [outsider.id],
    });

    expect((await agendaOf(member.actor)).map((e) => e.title)).toEqual(["Reunião interna", "Call Aurora", "Call Aurora com convidado"]);
    expect((await agendaOf(outsider.actor)).map((e) => e.title)).toEqual(["Reunião interna", "Call Aurora com convidado"]);
    // Membro sem vínculo não cria evento para o cliente.
    await expect(createAgendaEvent(outsider.actor, { title: "X", startsAt: "2030-11-12T13:00:00.000Z", clientId: client.id })).rejects.toThrow(
      /Cliente/,
    );
  });

  it("só quem criou ou um gestor edita, move e exclui; mover preserva a duração", async () => {
    const { admin, member } = await setup();
    const e = await createAgendaEvent(member.actor, {
      title: "Briefing",
      startsAt: "2030-11-05T12:00:00.000Z",
      endsAt: "2030-11-05T13:30:00.000Z",
    });
    const other = await makeUser("MEMBER", { name: "Outro" });
    await expect(updateAgendaEvent(other.actor, e.id, { title: "Hack", startsAt: "2030-11-05T12:00:00.000Z" })).rejects.toThrow(/criou/);
    await expect(deleteAgendaEvent(other.actor, e.id)).rejects.toThrow(/criou/);
    expect((await agendaOf(other.actor))[0].canEdit).toBe(false);

    await moveAgendaEvent(member.actor, e.id, "2030-11-07T12:00:00.000Z");
    const moved = await db.agendaEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(moved.endsAt?.toISOString()).toBe("2030-11-07T13:30:00.000Z");

    await updateAgendaEvent(admin.actor, e.id, { title: "Briefing (gestor)", startsAt: "2030-11-07T12:00:00.000Z", attendeeIds: [admin.id] });
    const [after] = await agendaOf(admin.actor);
    expect(after.title).toBe("Briefing (gestor)");
    expect(after.attendees.map((a) => a.name)).toEqual(["Pedro"]);

    await deleteAgendaEvent(admin.actor, e.id);
    expect(await agendaOf(admin.actor)).toHaveLength(0);
  });

  it("avisa só quem foi adicionado (não quem criou nem quem já estava)", async () => {
    const { admin, member, outsider } = await setup();
    const e = await createAgendaEvent(admin.actor, {
      title: "Reunião de pauta",
      startsAt: "2030-11-08T13:00:00.000Z",
      attendeeIds: [admin.id, member.id],
      location: "https://meet.google.com/abc",
    });
    const invites = (userId: string) => db.notification.findMany({ where: { userId, type: "EVENT_INVITE" } });
    expect(await invites(admin.id)).toHaveLength(0);
    const [n] = await invites(member.id);
    expect(n).toMatchObject({ eventId: e.id, actorId: admin.id, title: "Pedro adicionou você a “Reunião de pauta”" });

    await updateAgendaEvent(admin.actor, e.id, {
      title: "Reunião de pauta",
      startsAt: "2030-11-08T13:00:00.000Z",
      attendeeIds: [admin.id, member.id, outsider.id],
    });
    expect(await invites(member.id)).toHaveLength(1);
    expect(await invites(outsider.id)).toHaveLength(1);
    // Excluir o evento remove os avisos ligados a ele.
    await deleteAgendaEvent(admin.actor, e.id);
    expect(await invites(member.id)).toHaveLength(0);
  });

  it("evento de vários dias aparece enquanto está acontecendo", async () => {
    const { admin } = await setup();
    await createAgendaEvent(admin.actor, { title: "Feira", startsAt: "2030-10-30T12:00:00.000Z", endsAt: "2030-11-02T21:00:00.000Z" });
    expect((await agendaOf(admin.actor)).map((e) => e.title)).toEqual(["Feira"]);
  });
});

describe("Extratos bancários no financeiro", () => {
  it("financeiro anexa PDF do mês, lista, abre e exclui", async () => {
    const admin = await makeUser("ADMIN");
    const f = await upload(admin.actor, { type: "statement", month: "2030-11" }, "Extrato novembro.pdf", PDF);
    const list = await listStatementFiles(admin.actor, "2030-11");
    expect(list.map((x) => x.originalName)).toEqual(["Extrato novembro.pdf"]);
    expect(await listStatementFiles(admin.actor, "2030-10")).toHaveLength(0);
    expect(await getFileUrl(admin.actor, f.id, true)).toContain("/api/storage");
    await deleteFile(admin.actor, f.id);
    expect(await listStatementFiles(admin.actor, "2030-11")).toHaveLength(0);
  });

  it("só aceita PDF de verdade", async () => {
    const admin = await makeUser("ADMIN");
    await expect(upload(admin.actor, { type: "statement", month: "2030-11" }, "extrato.png", PNG)).rejects.toThrow(/PDF/);
    await expect(upload(admin.actor, { type: "statement", month: "2030-11" }, "extrato.pdf", PNG)).rejects.toThrow(/não corresponde/);
  });

  it("quem não acessa o financeiro não envia, não lista e não abre extratos", async () => {
    const admin = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    const member = await makeUser("MEMBER");
    const f = await upload(admin.actor, { type: "statement", month: "2030-11" }, "extrato.pdf", PDF);
    for (const u of [manager, member]) {
      await expect(requestUpload(u.actor, { filename: "x.pdf", sizeBytes: PDF.length, target: { type: "statement", month: "2030-11" } })).rejects.toThrow(
        /financeiro/,
      );
      await expect(listStatementFiles(u.actor, "2030-11")).rejects.toThrow(/financeiro/);
      await expect(getFileUrl(u.actor, f.id, true)).rejects.toThrow(/financeiro/);
      await expect(deleteFile(u.actor, f.id)).rejects.toThrow(/financeiro/);
    }
    // Gestor autorizado pelo administrador passa a ver.
    const financeManager = await makeUser("MANAGER", { canViewFinance: true });
    expect(await listStatementFiles(financeManager.actor, "2030-11")).toHaveLength(1);
  });
});
