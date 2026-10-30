import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { taskScope, type Actor } from "@/server/auth/permissions";
import { addDays, startOfDayInTz } from "@/lib/dates";
import { taskCode } from "@/lib/labels";
import { notFound } from "@/server/errors";
import { userPublic, type DbLike } from "./shared";

type NewNotification = {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  taskId?: string | null;
  eventId?: string | null;
  dedupeKey?: string;
};

/**
 * Cria notificações, ignorando o próprio autor da ação e destinatários duplicados.
 * Notificações com dedupeKey repetida são descartadas silenciosamente.
 */
export async function notify(tx: DbLike, items: NewNotification[]) {
  const seen = new Set<string>();
  const data = items.filter((n) => {
    if (n.actorId && n.userId === n.actorId) return false;
    const k = `${n.userId}:${n.type}:${n.taskId ?? ""}:${n.eventId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (data.length) await tx.notification.createMany({ data, skipDuplicates: true });
}

/** Filtra usuários que conseguem ver a tarefa (evita notificar quem não pode abri-la). */
export async function usersWhoCanSeeTask(tx: DbLike, taskId: string, userIds: string[]) {
  if (!userIds.length) return [];
  const users = await tx.user.findMany({
    where: { id: { in: userIds }, active: true },
    select: { id: true, role: true, canViewFinance: true },
  });
  const allowed: string[] = [];
  for (const u of users) {
    const visible = await tx.task.count({ where: { AND: [{ id: taskId }, taskScope(u)] } });
    if (visible) allowed.push(u.id);
  }
  return allowed;
}

export async function listNotifications(actor: Actor, opts: { unreadOnly?: boolean; take?: number } = {}) {
  return db.notification.findMany({
    where: { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
    include: {
      actor: { select: userPublic },
      task: { select: { id: true, number: true, title: true, client: { select: { name: true } } } },
      event: { select: { id: true, startsAt: true, allDay: true } },
    },
  });
}

export const unreadCount = (actor: Actor) => db.notification.count({ where: { userId: actor.id, readAt: null } });

export async function markRead(actor: Actor, id: string) {
  const r = await db.notification.updateMany({ where: { id, userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  if (!r.count) {
    const exists = await db.notification.count({ where: { id, userId: actor.id } });
    if (!exists) throw notFound("Notificação");
  }
}

export async function markAllRead(actor: Actor) {
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}

/**
 * Rotina agendada (cron): avisa responsáveis sobre prazos nas próximas 24h
 * e tarefas que venceram. A dedupeKey garante um único aviso por tarefa/dia.
 * Também marca como atrasadas as cobranças pendentes vencidas.
 */
export async function runDeadlineSweep(now = new Date()) {
  const today = startOfDayInTz(now);
  const tomorrowEnd = addDays(today, 2);
  const dayKey = today.toISOString().slice(0, 10);

  const open = { archivedAt: null, status: { not: "DONE" as const }, assigneeId: { not: null } };

  const dueSoon = await db.task.findMany({
    where: { ...open, dueDate: { gte: today, lt: tomorrowEnd } },
    select: { id: true, number: true, title: true, assigneeId: true },
  });
  const overdue = await db.task.findMany({
    where: { ...open, dueDate: { lt: today } },
    select: { id: true, number: true, title: true, assigneeId: true },
  });

  await notify(db, [
    ...dueSoon.map((t) => ({
      userId: t.assigneeId!,
      type: "DUE_SOON" as const,
      title: `Prazo próximo: ${t.title}`,
      body: `${taskCode(t.number)} vence em breve.`,
      taskId: t.id,
      dedupeKey: `due_soon:${t.id}:${dayKey}`,
    })),
    ...overdue.map((t) => ({
      userId: t.assigneeId!,
      type: "OVERDUE" as const,
      title: `Tarefa atrasada: ${t.title}`,
      body: `${taskCode(t.number)} passou do prazo.`,
      taskId: t.id,
      dedupeKey: `overdue:${t.id}:${dayKey}`,
    })),
  ]);

  const invoices = await db.invoice.updateMany({
    where: { status: "PENDING", dueDate: { lt: today } },
    data: { status: "OVERDUE" },
  });

  return { dueSoon: dueSoon.length, overdue: overdue.length, invoicesMarkedOverdue: invoices.count };
}
