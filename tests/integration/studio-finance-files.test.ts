import { beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { createTask, getTaskDetail, updateTask } from "@/server/services/tasks";
import { recordApproval, setPublished, updateContent } from "@/server/services/content";
import { listCalendarEvents, rescheduleEvent } from "@/server/services/calendar";
import {
  cancelInvoice,
  computeMrr,
  createInvoice,
  financeSummary,
  listInvoices,
  saveMediaInvestment,
  setInvoicePaid,
} from "@/server/services/finance";
import { dashboardMetrics, operationSeries } from "@/server/services/dashboard";
import { confirmUpload, deleteFile, getFileUrl, requestUpload } from "@/server/services/files";
import { localWrite, verifyLocalToken } from "@/server/storage";
import { makeUser, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  await rm(".storage-test", { recursive: true, force: true });
});

async function setup() {
  const admin = await makeUser("ADMIN", { name: "Pedro" });
  const designer = await makeUser("MEMBER", { name: "Matheus" });
  const manager = await makeUser("MANAGER", { name: "Gestor" });
  const client = await createClient(
    admin.actor,
    { name: "Aurora", status: "ACTIVE", memberIds: [designer.id] },
    { type: "MONTHLY", status: "ACTIVE", setupFeeCents: 100000, monthlyFeeCents: 300000, mediaBudgetCents: 200000 },
  );
  return { admin, designer, manager, client };
}

describe("KROMA Studio", () => {
  it("cria Reel, escreve legenda, define publicação, aprova e publica", async () => {
    const { admin, designer, client } = await setup();
    const reel = await createTask(admin.actor, {
      title: "Reel Black Friday",
      clientId: client.id,
      type: "REEL",
      assigneeId: designer.id,
      dueDate: "2030-11-20",
      platforms: ["INSTAGRAM", "TIKTOK"],
    });
    await updateContent(designer.actor, reel.id, {
      caption: "Black Friday chegou! 🔥\n\nAproveite.",
      hashtags: "#blackfriday #aurora",
      cta: "Compre pelo link da bio",
      publishAt: "2030-11-25T13:00:00.000Z",
    });

    // Membro não registra aprovação interna; gestor sim.
    await expect(recordApproval(designer.actor, reel.id, { kind: "INTERNAL", decision: "APPROVED" })).rejects.toThrow();
    await recordApproval(admin.actor, reel.id, { kind: "INTERNAL", decision: "APPROVED", note: "Ok interno" });
    let d = await getTaskDetail(admin.actor, reel.id);
    expect(d.content?.approvalStatus).toBe("AWAITING_APPROVAL");

    await recordApproval(designer.actor, reel.id, { kind: "CLIENT", decision: "APPROVED", clientContact: "Joana (cliente)" });
    d = await getTaskDetail(admin.actor, reel.id);
    expect(d.content?.approvalStatus).toBe("APPROVED");
    expect(d.approvals).toHaveLength(2);
    expect(d.approvals[0].kind).toBe("CLIENT");
    expect(d.approvals[0].clientContact).toBe("Joana (cliente)");

    await setPublished(designer.actor, reel.id, true);
    d = await getTaskDetail(admin.actor, reel.id);
    expect(d.content?.approvalStatus).toBe("PUBLISHED");
    expect(d.content?.publishedById).toBe(designer.id);
    expect(d.content?.publishedAt).not.toBeNull();
    expect(d.status).toBe("DONE");
    expect(d.content?.caption).toContain("\n\n");
  });

  it("não publica nem aprova (cliente) sem legenda; ajustes notificam o responsável", async () => {
    const { admin, designer, client } = await setup();
    const post = await createTask(admin.actor, { title: "Post", clientId: client.id, type: "STATIC_POST", assigneeId: designer.id });
    await expect(setPublished(admin.actor, post.id, true)).rejects.toThrow(/legenda/);
    await expect(recordApproval(admin.actor, post.id, { kind: "CLIENT", decision: "APPROVED" })).rejects.toThrow(/legenda/);
    await recordApproval(admin.actor, post.id, { kind: "CLIENT", decision: "CHANGES_REQUESTED", note: "Trocar cor" });
    const n = await db.notification.findMany({ where: { userId: designer.id, type: "CHANGES_REQUESTED" } });
    expect(n).toHaveLength(1);
  });

  it("criativo sem exigência de legenda pode ser concluído", async () => {
    const { admin, client } = await setup();
    const ad = await createTask(admin.actor, { title: "Ad", clientId: client.id, type: "AD_CREATIVE" });
    await updateContent(admin.actor, ad.id, { requiresCaption: false });
    await expect(updateTask(admin.actor, ad.id, { status: "DONE" })).resolves.toBeTruthy();
  });
});

describe("calendário", () => {
  it("prazo e publicação são eventos distintos; reagendamento persiste", async () => {
    const { admin, client } = await setup();
    const reel = await createTask(admin.actor, {
      title: "Reel",
      clientId: client.id,
      type: "REEL",
      dueDate: "2030-11-20",
      publishAt: "2030-11-25T13:00:00.000Z",
    });
    const from = new Date("2030-11-01T00:00:00Z");
    const to = new Date("2030-12-01T00:00:00Z");
    let events = await listCalendarEvents(admin.actor, from, to);
    expect(events.map((e) => e.kind).sort()).toEqual(["due", "publish"]);

    await rescheduleEvent(admin.actor, reel.id, { kind: "due", date: "2030-11-22" });
    await rescheduleEvent(admin.actor, reel.id, { kind: "publish", at: "2030-11-27T13:00:00.000Z" });
    events = await listCalendarEvents(admin.actor, from, to, client.id);
    expect(events.find((e) => e.kind === "due")?.date).toBe("2030-11-22T12:00:00.000Z");
    expect(events.find((e) => e.kind === "publish")?.date).toBe("2030-11-27T13:00:00.000Z");
  });
});

describe("financeiro", () => {
  it("MRR considera apenas clientes e contratos ativos (prospect fora)", async () => {
    const { admin } = await setup();
    await createClient(admin.actor, { name: "Prospect", status: "PROSPECT" }, {
      type: "MONTHLY", status: "ACTIVE", setupFeeCents: 0, monthlyFeeCents: 999900, mediaBudgetCents: 0,
    });
    await createClient(admin.actor, { name: "Pausado", status: "PAUSED" }, {
      type: "MONTHLY", status: "ACTIVE", setupFeeCents: 0, monthlyFeeCents: 500000, mediaBudgetCents: 0,
    });
    expect(await computeMrr()).toBe(300000);
    const s = await financeSummary(admin.actor);
    expect(s.mrrCents).toBe(300000);
    expect(s.activeClients).toBe(1);
    expect(s.avgTicketCents).toBe(300000);
    expect(s.plannedMediaCents).toBe(200000); // investimento em mídia separado do faturamento
  });

  it("recebimentos: pendente, atrasado (efetivo), pago e cancelado", async () => {
    const { admin, client } = await setup();
    const late = await createInvoice(admin.actor, {
      clientId: client.id, competence: "2020-01", description: "Mensalidade jan", amountCents: 300000, dueDate: "2020-01-10",
    });
    await createInvoice(admin.actor, {
      clientId: client.id, competence: "2099-01", description: "Futura", amountCents: 100000, dueDate: "2099-01-10",
    });
    let list = await listInvoices(admin.actor);
    expect(list.find((i) => i.id === late.id)?.effectiveStatus).toBe("OVERDUE");
    expect((await listInvoices(admin.actor, { status: "OVERDUE" })).length).toBe(1);

    await setInvoicePaid(admin.actor, late.id, true);
    list = await listInvoices(admin.actor, { status: "PAID" });
    expect(list[0].paidAt).not.toBeNull();
    const s = await financeSummary(admin.actor);
    expect(s.receivedThisMonthCents).toBe(300000); // pago hoje
    expect(s.receivableCents).toBe(100000);

    await cancelInvoice(admin.actor, late.id);
    expect((await listInvoices(admin.actor, { status: "CANCELED" })).length).toBe(1);
  });

  it("investimento em mídia por plataforma e mês (upsert)", async () => {
    const { admin, client } = await setup();
    await saveMediaInvestment(admin.actor, { clientId: client.id, platform: "META", month: "2030-05", plannedCents: 100000 });
    await saveMediaInvestment(admin.actor, { clientId: client.id, platform: "META", month: "2030-05", plannedCents: 100000, actualCents: 87000 });
    const rows = await db.mediaInvestment.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].actualCents).toBe(87000);
  });

  it("financeiro bloqueado para membros e gestores sem autorização", async () => {
    const { designer, manager, client } = await setup();
    await expect(financeSummary(designer.actor)).rejects.toThrow(/financeiro/);
    await expect(financeSummary(manager.actor)).rejects.toThrow(/financeiro/);
    await expect(
      createInvoice(manager.actor, { clientId: client.id, competence: "2030-01", description: "x", amountCents: 1, dueDate: "2030-01-01" }),
    ).rejects.toThrow();
    const authorized = { ...manager.actor, canViewFinance: true };
    await expect(financeSummary(authorized)).resolves.toBeTruthy();
  });

  it("dashboard mostra valores financeiros só a quem pode ver", async () => {
    const { admin, designer, client } = await setup();
    await createTask(admin.actor, { title: "Atrasada", clientId: client.id, dueDate: "2020-01-01" });
    const a = await dashboardMetrics(admin.actor);
    expect(a.mrrCents).toBe(300000);
    expect(a.mediaCents).toBe(200000);
    expect(a.overdue).toBe(1);
    expect(a.activeClients).toBe(1);
    const m = await dashboardMetrics(designer.actor);
    expect(m.mrrCents).toBeNull();
    expect(m.mediaCents).toBeNull();
    const series = await operationSeries(admin.actor, 7);
    expect(series).toHaveLength(7);
    expect(series.reduce((s, d) => s + d.created, 0)).toBe(1);
  });
});

describe("arquivos", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

  async function upload(actor: Parameters<typeof requestUpload>[0], taskId: string, name: string, bytes: Uint8Array) {
    const r = await requestUpload(actor, { filename: name, sizeBytes: bytes.length, target: { type: "task", id: taskId } });
    const payload = verifyLocalToken(new URL(r.uploadUrl, "http://x").searchParams.get("t")!)!;
    await localWrite(payload.k, bytes);
    return r;
  }

  it("upload válido, URL assinada, exclusão consistente", async () => {
    const { admin, client } = await setup();
    const t = await createTask(admin.actor, { title: "Arte", clientId: client.id });
    const r = await upload(admin.actor, t.id, "capa.png", PNG);
    const file = await confirmUpload(admin.actor, r.fileId);
    expect(file.status).toBe("READY");
    expect(file.kind).toBe("IMAGE");

    const url = await getFileUrl(admin.actor, file.id, true);
    expect(url).toMatch(/^\/api\/storage\?t=/);
    expect((await getTaskDetail(admin.actor, t.id)).files).toHaveLength(1);

    await deleteFile(admin.actor, file.id);
    expect(await db.fileAsset.count()).toBe(0);
  });

  it("rejeita executável disfarçado de imagem e remove o objeto", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "X" });
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0]); // cabeçalho "MZ" de .exe
    const r = await upload(admin.actor, t.id, "foto.png", exe);
    await expect(confirmUpload(admin.actor, r.fileId)).rejects.toThrow(/não corresponde/);
    expect(await db.fileAsset.count()).toBe(0);
  });

  it("rejeita extensão proibida e tamanho acima do limite", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "X" });
    await expect(
      requestUpload(admin.actor, { filename: "virus.exe", sizeBytes: 10, target: { type: "task", id: t.id } }),
    ).rejects.toThrow(/não permitido/);
    await expect(
      requestUpload(admin.actor, { filename: "grande.png", sizeBytes: 21 * 1024 * 1024, target: { type: "task", id: t.id } }),
    ).rejects.toThrow(/limite/);
    await expect(
      requestUpload(admin.actor, { filename: "video.mov", sizeBytes: 400 * 1024 * 1024, target: { type: "task", id: t.id } }),
    ).resolves.toBeTruthy();
  });

  it("falha de upload (objeto não enviado) é tratada", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "X" });
    const r = await requestUpload(admin.actor, { filename: "a.pdf", sizeBytes: 100, target: { type: "task", id: t.id } });
    await expect(confirmUpload(admin.actor, r.fileId)).rejects.toThrow(/não foi concluído/);
  });

  it("usuário sem acesso não obtém URL do arquivo", async () => {
    const { admin, client } = await setup();
    const outsider = await makeUser("MEMBER");
    const t = await createTask(admin.actor, { title: "Arte", clientId: client.id });
    const r = await upload(admin.actor, t.id, "capa.png", PNG);
    const f = await confirmUpload(admin.actor, r.fileId);
    await expect(getFileUrl(outsider.actor, f.id, true)).rejects.toThrow();
    await expect(
      requestUpload(outsider.actor, { filename: "a.png", sizeBytes: 10, target: { type: "task", id: t.id } }),
    ).rejects.toThrow();
  });
});
