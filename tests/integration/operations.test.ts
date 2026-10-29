import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClient, getClient, listClients, setClientArchived } from "@/server/services/clients";
import {
  addChecklistItem,
  createTask,
  getTaskDetail,
  listTasks,
  moveTask,
  setTaskArchived,
  updateTask,
} from "@/server/services/tasks";
import { addComment, deleteComment, editComment } from "@/server/services/comments";
import { addManualTime, deleteTimeEntry, getActiveTimer, startTimer, stopTimer } from "@/server/services/time";
import { listNotifications, markAllRead, runDeadlineSweep, unreadCount } from "@/server/services/notifications";
import { makeUser, resetDb } from "../helpers";

beforeEach(resetDb);

async function setup() {
  const admin = await makeUser("ADMIN", { name: "Pedro" });
  const designer = await makeUser("MEMBER", { name: "Matheus" });
  const outsider = await makeUser("MEMBER", { name: "Fora" });
  const client = await createClient(
    admin.actor,
    { name: "Padaria Aurora", status: "ACTIVE", services: ["SOCIAL_MEDIA", "PAID_TRAFFIC"], memberIds: [designer.id] },
    { type: "MONTHLY", status: "ACTIVE", setupFeeCents: 150000, monthlyFeeCents: 250000, mediaBudgetCents: 100000 },
  );
  return { admin, designer, outsider, client };
}

describe("clientes", () => {
  it("cadastra cliente com serviços, contrato e membros", async () => {
    const { admin, client } = await setup();
    const detail = await getClient(admin.actor, client.id);
    expect(detail.services.sort()).toEqual(["PAID_TRAFFIC", "SOCIAL_MEDIA"]);
    expect(detail.contract?.monthlyFeeCents).toBe(250000);
    expect(detail.members.map((m) => m.name)).toEqual(["Matheus"]);
  });

  it("não entrega dados financeiros a quem não tem permissão", async () => {
    const { designer, client } = await setup();
    const detail = await getClient(designer.actor, client.id);
    expect(detail.contract).toBeNull();
    expect(detail.contracts).toBeUndefined();
    const list = await listClients(designer.actor);
    expect(list[0].finance).toBeNull();
  });

  it("membro não vinculado não vê o cliente (IDOR)", async () => {
    const { outsider, client } = await setup();
    await expect(getClient(outsider.actor, client.id)).rejects.toThrow(/não encontrado/);
    expect(await listClients(outsider.actor)).toHaveLength(0);
  });

  it("membro não cadastra cliente", async () => {
    const { designer } = await setup();
    await expect(createClient(designer.actor, { name: "X", status: "PROSPECT" })).rejects.toThrow();
  });

  it("cliente arquivado não recebe novas tarefas", async () => {
    const { admin, client } = await setup();
    await setClientArchived(admin.actor, client.id, true);
    await expect(createTask(admin.actor, { title: "T", clientId: client.id })).rejects.toThrow(/arquivado/);
    expect(await listClients(admin.actor)).toHaveLength(0);
    expect(await listClients(admin.actor, { archived: true })).toHaveLength(1);
  });
});

describe("tarefas", () => {
  it("cria tarefa rápida, atribui responsável e notifica", async () => {
    const { admin, designer, client } = await setup();
    const t = await createTask(admin.actor, {
      title: "Produzir Reel de Black Friday",
      clientId: client.id,
      assigneeId: designer.id,
      dueDate: "2030-11-20",
      type: "REEL",
    });
    expect(t.number).toBeGreaterThan(0);
    expect(t.dueDate?.toISOString()).toBe("2030-11-20T12:00:00.000Z");
    const n = await listNotifications(designer.actor);
    expect(n[0].type).toBe("TASK_ASSIGNED");
    // Tipo de conteúdo cria metadados do Studio automaticamente.
    expect(await db.contentMetadata.count({ where: { taskId: t.id } })).toBe(1);
  });

  it("tarefa sem responsável é válida", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "Interna" });
    expect(t.assigneeId).toBeNull();
    const list = await listTasks(admin.actor, { assignee: "none" });
    expect(list.map((x) => x.id)).toContain(t.id);
  });

  it("subtarefas: um nível, herdam cliente, progresso calculado", async () => {
    const { admin, client } = await setup();
    const parent = await createTask(admin.actor, { title: "Reel", clientId: client.id, type: "REEL" });
    const titles = ["Criar roteiro", "Gravar vídeo", "Editar vídeo"];
    const subs = [];
    for (const title of titles) subs.push(await createTask(admin.actor, { title, parentId: parent.id }));
    expect(subs[0].clientId).toBe(client.id);
    await expect(createTask(admin.actor, { title: "neta", parentId: subs[0].id })).rejects.toThrow(/não podem ter subtarefas/);

    await updateTask(admin.actor, subs[0].id, { status: "DONE" });
    const [item] = await listTasks(admin.actor, { clientId: client.id });
    expect(item.subtaskTotal).toBe(3);
    expect(item.subtaskDone).toBe(1);
    // Concluir subtarefas não conclui a principal automaticamente.
    expect(item.status).toBe("TODO");
  });

  it("drag-and-drop persiste status e posição; histórico registra a mudança", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "Copy", type: "COPY" });
    await moveTask(admin.actor, t.id, { status: "IN_REVIEW", position: 1500.5 });
    const detail = await getTaskDetail(admin.actor, t.id);
    expect(detail.status).toBe("IN_REVIEW");
    expect(detail.position).toBe(1500.5);
    expect(detail.activities.some((a) => a.action === "status_changed")).toBe(true);
  });

  it("aguardando aprovação notifica gestores", async () => {
    const { admin, designer } = await setup();
    const t = await createTask(designer.actor, { title: "Arte", type: "COPY" });
    await moveTask(designer.actor, t.id, { status: "AWAITING_APPROVAL", position: 1 });
    const n = await listNotifications(admin.actor);
    expect(n.some((x) => x.type === "APPROVAL_REQUESTED")).toBe(true);
  });

  it("conteúdo que exige legenda não pode ser concluído sem legenda", async () => {
    const { admin, client } = await setup();
    const t = await createTask(admin.actor, { title: "Post", clientId: client.id, type: "STATIC_POST" });
    await expect(updateTask(admin.actor, t.id, { status: "DONE" })).rejects.toThrow(/legenda/);
    await expect(moveTask(admin.actor, t.id, { status: "DONE", position: 1 })).rejects.toThrow(/legenda/);
  });

  it("higieniza a descrição (remove javascript: e nós desconhecidos)", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "Desc" });
    await updateTask(admin.actor, t.id, {
      description: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Briefing" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "mal", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
              { type: "text", text: "bom", marks: [{ type: "link", attrs: { href: "https://kroma.com" } }, { type: "bold" }] },
            ],
          },
          { type: "iframe", attrs: { src: "https://evil" } },
        ],
      },
    });
    const d = await getTaskDetail(admin.actor, t.id);
    const json = JSON.stringify(d.description);
    expect(json).not.toContain("javascript");
    expect(json).not.toContain("iframe");
    expect(json).toContain("https://kroma.com/");
    expect(json).toContain("bold");
  });

  it("membro vê tarefas de clientes vinculados, não de outros (IDOR)", async () => {
    const { admin, designer, outsider, client } = await setup();
    const t = await createTask(admin.actor, { title: "Do cliente", clientId: client.id });
    await expect(getTaskDetail(designer.actor, t.id)).resolves.toBeTruthy();
    await expect(getTaskDetail(outsider.actor, t.id)).rejects.toThrow(/não encontrad/);
    await expect(updateTask(outsider.actor, t.id, { title: "hack" })).rejects.toThrow();
    expect((await listTasks(outsider.actor)).find((x) => x.id === t.id)).toBeUndefined();
  });

  it("filtros combinados e ordenação por prioridade", async () => {
    const { admin, designer, client } = await setup();
    await createTask(admin.actor, { title: "A", clientId: client.id, assigneeId: designer.id, priority: "LOW", type: "COPY" });
    await createTask(admin.actor, { title: "B", clientId: client.id, assigneeId: designer.id, priority: "URGENT", type: "COPY" });
    await createTask(admin.actor, { title: "C", clientId: client.id, priority: "HIGH", type: "BRANDING" });
    const r = await listTasks(admin.actor, { clientId: client.id, assignee: designer.id, type: ["COPY"], sort: "priority", dir: "desc" });
    expect(r.map((x) => x.title)).toEqual(["B", "A"]);
  });

  it("arquivamento: membro só arquiva o que criou; principal leva subtarefas", async () => {
    const { admin, designer, client } = await setup();
    const t = await createTask(admin.actor, { title: "P", clientId: client.id });
    const s = await createTask(admin.actor, { title: "S", parentId: t.id });
    await expect(setTaskArchived(designer.actor, t.id, true)).rejects.toThrow();
    await setTaskArchived(admin.actor, t.id, true);
    expect((await db.task.findUniqueOrThrow({ where: { id: s.id } })).archivedAt).not.toBeNull();
    expect(await listTasks(admin.actor)).toHaveLength(0);
  });

  it("checklist em subtarefa", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "P" });
    const s = await createTask(admin.actor, { title: "S", parentId: t.id });
    await addChecklistItem(admin.actor, s.id, { text: "Revisar ortografia" });
    expect((await getTaskDetail(admin.actor, s.id)).checklist).toHaveLength(1);
  });
});

describe("comentários e menções", () => {
  it("menção notifica, edita e exclui só o próprio, sobrevive à conclusão", async () => {
    const { admin, designer, outsider, client } = await setup();
    const t = await createTask(admin.actor, { title: "Reel", clientId: client.id, type: "COPY" });
    const c = await addComment(admin.actor, t.id, {
      body: "@Matheus consegue ajustar a capa desse Reel?",
      mentionIds: [designer.id, outsider.id],
    });
    // O outsider não vê a tarefa: a menção é descartada.
    expect(c.mentionIds).toEqual([designer.id]);
    const n = await listNotifications(designer.actor);
    expect(n.find((x) => x.type === "MENTION")?.taskId).toBe(t.id);
    expect(await unreadCount(outsider.actor)).toBe(0);

    await expect(editComment(designer.actor, c.id, { body: "hack" })).rejects.toThrow(/próprios/);
    const edited = await editComment(admin.actor, c.id, { body: "Atualizado" });
    expect(edited.editedAt).not.toBeNull();

    await updateTask(admin.actor, t.id, { status: "DONE" });
    expect((await getTaskDetail(admin.actor, t.id)).comments).toHaveLength(1);

    await expect(deleteComment(designer.actor, c.id)).rejects.toThrow();
    await deleteComment(admin.actor, c.id);
    expect((await getTaskDetail(admin.actor, t.id)).comments).toHaveLength(0);

    await markAllRead(designer.actor);
    expect(await unreadCount(designer.actor)).toBe(0);
  });
});

describe("controle de tempo", () => {
  it("um timer ativo por usuário; total agrega subtarefas sem duplicar", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "Carrossel" });
    const s = await createTask(admin.actor, { title: "Arte", parentId: t.id });

    await startTimer(admin.actor, t.id);
    await startTimer(admin.actor, s.id); // encerra o anterior automaticamente
    expect(await db.timeEntry.count({ where: { userId: admin.id, endedAt: null } })).toBe(1);
    expect((await getActiveTimer(admin.actor))?.taskId).toBe(s.id);
    await stopTimer(admin.actor);
    expect(await getActiveTimer(admin.actor)).toBeNull();

    await addManualTime(admin.actor, t.id, { minutes: 60, date: "2030-01-10" });
    await addManualTime(admin.actor, s.id, { minutes: 35, date: "2030-01-10" });
    const d = await getTaskDetail(admin.actor, t.id);
    const subTimer = (await db.timeEntry.findMany({ where: { taskId: s.id, source: "TIMER" } }))[0].durationSeconds!;
    const ownTimer = (await db.timeEntry.findMany({ where: { taskId: t.id, source: "TIMER" } }))[0].durationSeconds!;
    expect(d.time.ownSeconds).toBe(3600 + ownTimer);
    expect(d.time.subtaskSeconds).toBe(35 * 60 + subTimer);
    expect(d.time.totalSeconds).toBe(d.time.ownSeconds + d.time.subtaskSeconds);
  });

  it("banco impede dois timers ativos mesmo sem passar pelo serviço", async () => {
    const { admin } = await setup();
    const t = await createTask(admin.actor, { title: "X" });
    await db.timeEntry.create({ data: { userId: admin.id, taskId: t.id, startedAt: new Date() } });
    await expect(db.timeEntry.create({ data: { userId: admin.id, taskId: t.id, startedAt: new Date() } })).rejects.toThrow();
  });

  it("só exclui o próprio registro", async () => {
    const { admin, designer, client } = await setup();
    const t = await createTask(admin.actor, { title: "X", clientId: client.id });
    const e = await addManualTime(admin.actor, t.id, { minutes: 10, date: "2030-01-01" });
    await expect(deleteTimeEntry(designer.actor, e.id)).rejects.toThrow();
    await deleteTimeEntry(admin.actor, e.id);
  });
});

describe("rotina de prazos", () => {
  it("gera avisos de prazo/atraso uma única vez por dia", async () => {
    const { admin, designer } = await setup();
    const now = new Date();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    await createTask(admin.actor, { title: "Atrasada", assigneeId: designer.id, dueDate: ymd(new Date(now.getTime() - 3 * 86400000)) });
    await createTask(admin.actor, { title: "Amanhã", assigneeId: designer.id, dueDate: ymd(new Date(now.getTime() + 86400000)) });
    await markAllRead(designer.actor);
    const r1 = await runDeadlineSweep();
    expect(r1.overdue).toBe(1);
    expect(r1.dueSoon).toBe(1);
    await runDeadlineSweep();
    expect(await unreadCount(designer.actor)).toBe(2);
  });
});
