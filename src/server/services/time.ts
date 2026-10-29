import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Actor } from "@/server/auth/permissions";
import { AppError, forbidden, invalid, notFound } from "@/server/errors";
import { dateOnly } from "@/lib/dates";
import { manualTimeSchema } from "@/lib/schemas";
import { logActivity, userPublic } from "./shared";
import { getVisibleTask } from "./tasks";

/**
 * Soma dos registros encerrados por tarefa. Timers em andamento não entram aqui —
 * a interface soma o trecho em curso a partir de startedAt.
 */
export async function trackedSecondsByTask(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, number>();
  const rows = await db.timeEntry.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds }, endedAt: { not: null } },
    _sum: { durationSeconds: true },
  });
  return new Map(rows.map((r) => [r.taskId, r._sum.durationSeconds ?? 0]));
}

export async function getActiveTimer(actor: Actor) {
  return db.timeEntry.findFirst({
    where: { userId: actor.id, endedAt: null },
    include: { task: { select: { id: true, number: true, title: true, client: { select: { name: true } } } } },
  });
}

/**
 * Inicia um timer no servidor. Se houver outro timer ativo do mesmo usuário, ele é
 * encerrado antes (um timer por pessoa). O índice parcial único no banco garante a regra
 * mesmo com requisições concorrentes.
 */
export async function startTimer(actor: Actor, taskId: string) {
  const task = await getVisibleTask(actor, taskId);
  if (task.archivedAt) throw invalid("Não é possível registrar tempo em tarefa arquivada.");
  try {
    return await db.$transaction(async (tx) => {
      const running = await tx.timeEntry.findFirst({ where: { userId: actor.id, endedAt: null } });
      if (running) {
        if (running.taskId === taskId) return running;
        await closeEntry(tx, running.id, running.startedAt);
      }
      const entry = await tx.timeEntry.create({
        data: { userId: actor.id, taskId, startedAt: new Date(), source: "TIMER" },
      });
      await logActivity(tx, taskId, actor.id, "timer_started");
      return entry;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("Você já tem um timer ativo. Tente novamente.", "CONFLICT");
    }
    throw e;
  }
}

async function closeEntry(tx: Prisma.TransactionClient, id: string, startedAt: Date) {
  const endedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  return tx.timeEntry.update({ where: { id }, data: { endedAt, durationSeconds } });
}

export async function stopTimer(actor: Actor) {
  return db.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({ where: { userId: actor.id, endedAt: null } });
    if (!running) return null;
    const entry = await closeEntry(tx, running.id, running.startedAt);
    await logActivity(tx, running.taskId, actor.id, "time_logged", { seconds: entry.durationSeconds });
    return entry;
  });
}

export async function addManualTime(actor: Actor, taskId: string, input: { minutes: number; date: string; note?: string | null }) {
  const data = manualTimeSchema.parse(input);
  await getVisibleTask(actor, taskId);
  const startedAt = dateOnly(data.date);
  const entry = await db.timeEntry.create({
    data: {
      userId: actor.id,
      taskId,
      startedAt,
      endedAt: new Date(startedAt.getTime() + data.minutes * 60_000),
      durationSeconds: data.minutes * 60,
      source: "MANUAL",
      note: data.note ?? null,
    },
  });
  await logActivity(db, taskId, actor.id, "time_logged", { seconds: entry.durationSeconds, manual: true });
  return entry;
}

export async function deleteTimeEntry(actor: Actor, entryId: string) {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw notFound("Registro");
  await getVisibleTask(actor, entry.taskId);
  if (entry.userId !== actor.id && actor.role !== "ADMIN") throw forbidden("Você só pode excluir seus próprios registros.");
  await db.timeEntry.delete({ where: { id: entryId } });
}

export async function listTimeEntries(actor: Actor, taskId: string) {
  await getVisibleTask(actor, taskId);
  return db.timeEntry.findMany({
    where: { taskId },
    orderBy: { startedAt: "desc" },
    include: { user: { select: userPublic } },
  });
}
