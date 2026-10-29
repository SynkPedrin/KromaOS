import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { clientScope, isManagerOrAdmin, taskScope, type Actor } from "@/server/auth/permissions";
import { forbidden, invalid, notFound } from "@/server/errors";
import { sanitizeRichText } from "@/server/rich-text";
import { dateOnly, addDays, startOfDayInTz } from "@/lib/dates";
import { isContentType, TASK_PRIORITY, TASK_STATUS, taskCode } from "@/lib/labels";
import {
  moveTaskSchema,
  quickTaskSchema,
  taskFiltersSchema,
  taskPatchSchema,
  checklistItemSchema,
  type QuickTaskInput,
  type TaskFilters,
  type TaskPatch,
} from "@/lib/schemas";
import { notify } from "./notifications";
import { logActivity, toNumber, userPublic, type DbLike } from "./shared";
import { trackedSecondsByTask } from "./time";

// ───────────────────────────── Acesso ─────────────────────────────

/** Carrega uma tarefa garantindo que o usuário pode vê-la (proteção contra IDOR). */
export async function getVisibleTask(actor: Actor, taskId: string, tx: DbLike = db) {
  const task = await tx.task.findFirst({
    where: { AND: [{ id: taskId }, taskScope(actor)] },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      type: true,
      parentId: true,
      clientId: true,
      assigneeId: true,
      creatorId: true,
      archivedAt: true,
    },
  });
  if (!task) throw notFound("Tarefa");
  return task;
}

/** Valida que o cliente existe, não está arquivado e é visível ao usuário. */
async function assertClientUsable(actor: Actor, clientId: string, tx: DbLike) {
  const client = await tx.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] } });
  if (!client) throw notFound("Cliente");
  if (client.archivedAt) throw invalid("Este cliente está arquivado.");
}

async function assertAssignable(userId: string, tx: DbLike) {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!u?.active) throw invalid("Responsável inválido ou desativado.");
}

// ───────────────────────────── Criação ─────────────────────────────

export async function createTask(actor: Actor, input: QuickTaskInput) {
  const data = quickTaskSchema.parse(input);

  return db.$transaction(async (tx) => {
    let clientId = data.clientId ?? null;
    if (data.parentId) {
      const parent = await getVisibleTask(actor, data.parentId, tx);
      if (parent.parentId) throw invalid("Subtarefas não podem ter subtarefas.");
      if (parent.archivedAt) throw invalid("A tarefa principal está arquivada.");
      clientId = parent.clientId; // subtarefa herda o cliente da principal
    } else if (clientId) {
      await assertClientUsable(actor, clientId, tx);
    }
    if (data.assigneeId) await assertAssignable(data.assigneeId, tx);

    const status = data.status ?? "TODO";
    const last = await tx.task.findFirst({
      where: { status, parentId: data.parentId ?? null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const task = await tx.task.create({
      data: {
        title: data.title,
        clientId,
        assigneeId: data.assigneeId ?? null,
        creatorId: actor.id,
        parentId: data.parentId ?? null,
        type: data.type,
        status,
        priority: data.priority ?? "NORMAL",
        dueDate: data.dueDate ? dateOnly(data.dueDate) : null,
        position: (last?.position ?? 0) + 1000,
        completedAt: status === "DONE" ? new Date() : null,
        content:
          !data.parentId && isContentType(data.type)
            ? {
                create: {
                  publishAt: data.publishAt ? new Date(data.publishAt) : null,
                  platforms: data.platforms ?? [],
                },
              }
            : undefined,
      },
    });

    await logActivity(tx, task.id, actor.id, "created", { title: task.title });
    if (data.parentId) await logActivity(tx, data.parentId, actor.id, "subtask_added", { title: task.title });

    if (task.assigneeId) {
      await notify(tx, [
        {
          userId: task.assigneeId,
          actorId: actor.id,
          type: "TASK_ASSIGNED",
          title: `Nova tarefa: ${task.title}`,
          body: `${taskCode(task.number)} foi atribuída a você.`,
          taskId: task.id,
        },
      ]);
    }
    return task;
  });
}

// ───────────────────────────── Leitura ─────────────────────────────

const listSelect = {
  id: true,
  number: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  dueDate: true,
  startDate: true,
  position: true,
  estimateMinutes: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  parentId: true,
  parent: { select: { id: true, number: true, title: true } },
  client: { select: { id: true, name: true } },
  assignee: { select: userPublic },
  content: { select: { publishAt: true, approvalStatus: true, platforms: true } },
  _count: { select: { comments: true, files: true } },
} satisfies Prisma.TaskSelect;

export type TaskListItem = Prisma.TaskGetPayload<{ select: typeof listSelect }> & {
  subtaskTotal: number;
  subtaskDone: number;
};

export function buildTaskWhere(actor: Actor, f: TaskFilters): Prisma.TaskWhereInput {
  const today = startOfDayInTz();
  const and: Prisma.TaskWhereInput[] = [taskScope(actor)];
  and.push(f.archived ? { archivedAt: { not: null } } : { archivedAt: null });
  if (!f.includeSubtasks) and.push({ parentId: null });
  if (f.clientId) and.push({ clientId: f.clientId });
  if (f.assignee === "me") and.push({ assigneeId: actor.id });
  else if (f.assignee === "none") and.push({ assigneeId: null });
  else if (f.assignee) and.push({ assigneeId: f.assignee });
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.type?.length) and.push({ type: { in: f.type } });
  if (f.priority?.length) and.push({ priority: { in: f.priority } });
  if (f.contentOnly) and.push({ content: { isNot: null } });
  if (f.due === "overdue") and.push({ dueDate: { lt: today }, status: { not: "DONE" } });
  if (f.due === "week") and.push({ dueDate: { gte: today, lt: addDays(today, 7) } });
  if (f.due === "none") and.push({ dueDate: null });
  if (f.q) {
    const n = Number(f.q.replace(/^kr-?/i, ""));
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { client: { name: { contains: f.q, mode: "insensitive" } } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }
  return { AND: and };
}

export async function listTasks(actor: Actor, filters: TaskFilters = {}, take = 500): Promise<TaskListItem[]> {
  const f = taskFiltersSchema.parse(filters);
  const dir = f.dir ?? "asc";
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    f.sort === "dueDate"
      ? [{ dueDate: { sort: dir, nulls: "last" } }]
      : f.sort === "client"
        ? [{ client: { name: dir } }]
        : f.sort === "assignee"
          ? [{ assignee: { name: dir } }]
          : f.sort === "createdAt"
            ? [{ createdAt: dir }]
            : f.sort === "status"
              ? [{ status: dir }]
              : [{ position: "asc" }];

  const tasks = await db.task.findMany({ where: buildTaskWhere(actor, f), select: listSelect, orderBy, take });

  // Progresso das subtarefas em uma única consulta agregada.
  const counts = tasks.length
    ? await db.task.groupBy({
        by: ["parentId", "status"],
        where: { parentId: { in: tasks.map((t) => t.id) }, archivedAt: null },
        _count: true,
      })
    : [];
  const progress = new Map<string, { total: number; done: number }>();
  for (const c of counts) {
    const p = progress.get(c.parentId!) ?? { total: 0, done: 0 };
    p.total += c._count;
    if (c.status === "DONE") p.done += c._count;
    progress.set(c.parentId!, p);
  }

  let result = tasks.map((t) => ({
    ...t,
    subtaskTotal: progress.get(t.id)?.total ?? 0,
    subtaskDone: progress.get(t.id)?.done ?? 0,
  }));

  // Prioridade é ordenada pela gravidade, não pela ordem alfabética do enum.
  if (f.sort === "priority") {
    const sign = dir === "asc" ? 1 : -1;
    result = result.sort((a, b) => sign * (TASK_PRIORITY[a.priority].rank - TASK_PRIORITY[b.priority].rank));
  }
  return result;
}

export async function getTaskDetail(actor: Actor, taskId: string) {
  await getVisibleTask(actor, taskId);
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      client: { select: { id: true, name: true, archivedAt: true } },
      assignee: { select: userPublic },
      creator: { select: userPublic },
      parent: { select: { id: true, number: true, title: true } },
      subtasks: {
        where: { archivedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          estimateMinutes: true,
          assignee: { select: userPublic },
          _count: { select: { comments: true, files: true, checklist: true } },
        },
      },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      content: { include: { publishedBy: { select: userPublic } } },
      approvals: { orderBy: { createdAt: "desc" }, include: { recordedBy: { select: userPublic } } },
      files: {
        where: { status: "READY" },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: userPublic } },
      },
      activities: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: userPublic } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: userPublic } } },
      timeEntries: {
        orderBy: { startedAt: "desc" },
        take: 50,
        include: { user: { select: userPublic } },
      },
    },
  });

  const subIds = task.subtasks.map((s) => s.id);
  const tracked = await trackedSecondsByTask([task.id, ...subIds]);
  const ownSeconds = tracked.get(task.id) ?? 0;
  const subtaskSeconds = subIds.reduce((sum, id) => sum + (tracked.get(id) ?? 0), 0);

  return {
    ...task,
    files: task.files.map((f) => ({ ...f, sizeBytes: toNumber(f.sizeBytes) })),
    subtasks: task.subtasks.map((s) => ({ ...s, trackedSeconds: tracked.get(s.id) ?? 0 })),
    time: { ownSeconds, subtaskSeconds, totalSeconds: ownSeconds + subtaskSeconds },
    permissions: {
      canArchive: isManagerOrAdmin(actor) || task.creatorId === actor.id,
    },
  };
}
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

// ───────────────────────────── Atualização ─────────────────────────────

/** Regra de negócio: conteúdo que exige legenda só pode ser concluído com legenda preenchida. */
async function assertCanComplete(taskId: string, tx: DbLike) {
  const content = await tx.contentMetadata.findUnique({ where: { taskId } });
  if (content?.requiresCaption && !content.caption?.trim()) {
    throw invalid("Preencha a legenda antes de concluir esta entrega.");
  }
}

export async function updateTask(actor: Actor, taskId: string, patch: TaskPatch) {
  const data = taskPatchSchema.parse(patch);

  return db.$transaction(async (tx) => {
    const before = await getVisibleTask(actor, taskId, tx);
    const full = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    const update: Prisma.TaskUncheckedUpdateInput = {};
    const activities: { action: string; data?: Prisma.InputJsonValue }[] = [];

    if (data.title !== undefined && data.title !== full.title) {
      update.title = data.title;
      activities.push({ action: "title_changed", data: { from: full.title, to: data.title } });
    }
    if (data.description !== undefined) {
      update.description = (sanitizeRichText(data.description) ?? undefined) as Prisma.InputJsonValue | undefined;
      if (update.description === undefined) update.description = { type: "doc", content: [] };
    }
    if (data.clientId !== undefined && data.clientId !== full.clientId) {
      if (full.parentId) throw invalid("O cliente da subtarefa segue a tarefa principal.");
      if (data.clientId) await assertClientUsable(actor, data.clientId, tx);
      update.clientId = data.clientId;
      activities.push({ action: "client_changed" });
    }
    if (data.assigneeId !== undefined && data.assigneeId !== full.assigneeId) {
      if (data.assigneeId) await assertAssignable(data.assigneeId, tx);
      update.assigneeId = data.assigneeId;
      activities.push({ action: "assignee_changed", data: { to: data.assigneeId } });
    }
    if (data.type !== undefined && data.type !== full.type) {
      update.type = data.type;
      activities.push({ action: "type_changed", data: { from: full.type, to: data.type } });
      // Ao virar conteúdo do Studio, cria os metadados (legenda, publicação, aprovação).
      if (isContentType(data.type) && !full.parentId) {
        await tx.contentMetadata.upsert({ where: { taskId }, create: { taskId }, update: {} });
      }
    }
    if (data.status !== undefined && data.status !== full.status) {
      if (data.status === "DONE") await assertCanComplete(taskId, tx);
      update.status = data.status;
      update.completedAt = data.status === "DONE" ? new Date() : null;
      activities.push({ action: "status_changed", data: { from: full.status, to: data.status } });
    }
    if (data.priority !== undefined && data.priority !== full.priority) {
      update.priority = data.priority;
      activities.push({ action: "priority_changed", data: { from: full.priority, to: data.priority } });
    }
    if (data.startDate !== undefined) update.startDate = data.startDate ? dateOnly(data.startDate) : null;
    if (data.dueDate !== undefined) {
      const next = data.dueDate ? dateOnly(data.dueDate) : null;
      if (next?.getTime() !== full.dueDate?.getTime()) {
        update.dueDate = next;
        activities.push({ action: "due_changed", data: { to: data.dueDate } });
      }
    }
    if (data.estimateMinutes !== undefined) update.estimateMinutes = data.estimateMinutes;

    if (Object.keys(update).length === 0) return full;
    const task = await tx.task.update({ where: { id: taskId }, data: update });

    for (const a of activities) await logActivity(tx, taskId, actor.id, a.action, a.data);
    await notifyStatusAndAssignee(tx, actor, before, task);
    return task;
  });
}

async function notifyStatusAndAssignee(
  tx: DbLike,
  actor: Actor,
  before: { assigneeId: string | null; status: TaskStatus },
  task: { id: string; number: number; title: string; assigneeId: string | null; status: TaskStatus; creatorId: string },
) {
  const items: Parameters<typeof notify>[1] = [];
  if (task.assigneeId && task.assigneeId !== before.assigneeId) {
    items.push({
      userId: task.assigneeId,
      actorId: actor.id,
      type: "TASK_ASSIGNED",
      title: `Tarefa atribuída: ${task.title}`,
      body: `${taskCode(task.number)} foi atribuída a você.`,
      taskId: task.id,
    });
  }
  if (task.status !== before.status && task.status === "AWAITING_APPROVAL") {
    const approvers = await tx.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true },
    });
    const recipients = new Set([task.creatorId, ...approvers.map((a) => a.id)]);
    for (const userId of recipients) {
      items.push({
        userId,
        actorId: actor.id,
        type: "APPROVAL_REQUESTED",
        title: `Aprovação solicitada: ${task.title}`,
        body: `${taskCode(task.number)} está ${TASK_STATUS.AWAITING_APPROVAL.label.toLowerCase()}.`,
        taskId: task.id,
      });
    }
  }
  await notify(tx, items);
}

/** Drag-and-drop do Kanban: novo status + posição calculada pelo cliente entre vizinhos. */
export async function moveTask(actor: Actor, taskId: string, input: { status: TaskStatus; position: number }) {
  const { status, position } = moveTaskSchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await getVisibleTask(actor, taskId, tx);
    if (status !== before.status && status === "DONE") await assertCanComplete(taskId, tx);
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        position,
        ...(status !== before.status ? { completedAt: status === "DONE" ? new Date() : null } : {}),
      },
    });
    if (status !== before.status) {
      await logActivity(tx, taskId, actor.id, "status_changed", { from: before.status, to: status });
      await notifyStatusAndAssignee(tx, actor, before, task);
    }
    return task;
  });
}

export async function setTaskArchived(actor: Actor, taskId: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const t = await getVisibleTask(actor, taskId, tx);
    if (!isManagerOrAdmin(actor) && t.creatorId !== actor.id) {
      throw forbidden("Apenas gestores ou quem criou a tarefa podem arquivá-la.");
    }
    const now = archived ? new Date() : null;
    await tx.task.update({ where: { id: taskId }, data: { archivedAt: now } });
    // Arquivar a principal arquiva junto as subtarefas.
    if (!t.parentId) await tx.task.updateMany({ where: { parentId: taskId }, data: { archivedAt: now } });
    await logActivity(tx, taskId, actor.id, archived ? "archived" : "unarchived");
  });
}

// ───────────────────────────── Checklist ─────────────────────────────

export async function addChecklistItem(actor: Actor, taskId: string, input: { text: string }) {
  const { text } = checklistItemSchema.parse(input);
  await getVisibleTask(actor, taskId);
  const count = await db.checklistItem.count({ where: { taskId } });
  if (count >= 100) throw invalid("Limite de itens no checklist atingido.");
  return db.checklistItem.create({ data: { taskId, text, position: count } });
}

async function visibleChecklistItem(actor: Actor, itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("Item");
  await getVisibleTask(actor, item.taskId);
  return item;
}

export async function toggleChecklistItem(actor: Actor, itemId: string, done: boolean) {
  await visibleChecklistItem(actor, itemId);
  return db.checklistItem.update({ where: { id: itemId }, data: { done } });
}

export async function deleteChecklistItem(actor: Actor, itemId: string) {
  await visibleChecklistItem(actor, itemId);
  await db.checklistItem.delete({ where: { id: itemId } });
}
