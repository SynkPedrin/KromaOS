import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { taskScope, type Actor } from "@/server/auth/permissions";
import { invalid } from "@/server/errors";
import { dateOnly } from "@/lib/dates";
import { logActivity, userPublic } from "./shared";
import { getVisibleTask } from "./tasks";

/**
 * Eventos do calendário editorial. Uma mesma tarefa pode gerar dois eventos distintos:
 * - "due": prazo de entrega (quando o trabalho precisa estar pronto)
 * - "publish": data de publicação do conteúdo
 */
export type CalendarEvent = {
  key: string;
  kind: "due" | "publish";
  date: string; // ISO
  taskId: string;
  number: number;
  title: string;
  type: string;
  status: string;
  approvalStatus: string | null;
  client: { id: string; name: string } | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
};

export async function listCalendarEvents(actor: Actor, from: Date, to: Date, clientId?: string) {
  const tasks = await db.task.findMany({
    where: {
      AND: [
        taskScope(actor),
        { archivedAt: null },
        clientId ? { clientId } : {},
        { OR: [{ dueDate: { gte: from, lt: to } }, { content: { publishAt: { gte: from, lt: to } } }] },
      ],
    },
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      dueDate: true,
      client: { select: { id: true, name: true } },
      assignee: { select: userPublic },
      content: { select: { publishAt: true, approvalStatus: true } },
    },
    take: 1000,
  });

  const events: CalendarEvent[] = [];
  for (const t of tasks) {
    const base = {
      taskId: t.id,
      number: t.number,
      title: t.title,
      type: t.type,
      status: t.status,
      approvalStatus: t.content?.approvalStatus ?? null,
      client: t.client,
      assignee: t.assignee,
    };
    if (t.dueDate && t.dueDate >= from && t.dueDate < to) {
      events.push({ ...base, key: `${t.id}:due`, kind: "due", date: t.dueDate.toISOString() });
    }
    const p = t.content?.publishAt;
    if (p && p >= from && p < to) {
      events.push({ ...base, key: `${t.id}:publish`, kind: "publish", date: p.toISOString() });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

const rescheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("due"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  // O navegador calcula o novo instante preservando o horário local original.
  z.object({ kind: z.literal("publish"), at: z.string().datetime({ offset: true }) }),
]);
export type RescheduleInput = z.input<typeof rescheduleSchema>;

export async function rescheduleEvent(actor: Actor, taskId: string, input: RescheduleInput) {
  const data = rescheduleSchema.parse(input);
  await getVisibleTask(actor, taskId);
  if (data.kind === "due") {
    await db.task.update({ where: { id: taskId }, data: { dueDate: dateOnly(data.date) } });
    await logActivity(db, taskId, actor.id, "due_changed", { to: data.date });
    return;
  }
  const content = await db.contentMetadata.findUnique({ where: { taskId } });
  if (!content) throw invalid("Esta tarefa não tem data de publicação.");
  await db.contentMetadata.update({ where: { taskId }, data: { publishAt: new Date(data.at) } });
  await logActivity(db, taskId, actor.id, "publish_date_changed", { to: data.at });
}
