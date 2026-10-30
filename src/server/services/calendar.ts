import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { clientScope, isManagerOrAdmin, taskScope, type Actor } from "@/server/auth/permissions";
import { forbidden, invalid, notFound } from "@/server/errors";
import { agendaEventSchema, type AgendaEventInput } from "@/lib/schemas";
import { dateOnly } from "@/lib/dates";
import { logActivity, userPublic } from "./shared";
import { getVisibleTask } from "./tasks";

/**
 * Itens do calendário. Uma mesma tarefa pode gerar dois itens distintos:
 * - "due": prazo de entrega (quando o trabalho precisa estar pronto)
 * - "publish": data de publicação do conteúdo
 * e há os eventos da agenda ("event": reuniões, gravações, calls), que não são tarefas.
 */
export type CalendarEvent = TaskCalendarEvent | AgendaCalendarEvent;

export type TaskCalendarEvent = {
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

export type AgendaCalendarEvent = {
  key: string;
  kind: "event";
  date: string; // início (ISO)
  endsAt: string | null;
  allDay: boolean;
  eventId: string;
  title: string;
  location: string | null;
  notes: string | null;
  client: { id: string; name: string } | null;
  attendees: { id: string; name: string; avatarColor: string }[];
  createdBy: { id: string; name: string; avatarColor: string };
  canEdit: boolean;
};

/** Eventos sem cliente são da equipe toda; com cliente, seguem o acesso ao cliente. Convidados sempre veem. */
function agendaScope(actor: Actor): Prisma.AgendaEventWhereInput {
  if (isManagerOrAdmin(actor)) return {};
  return { OR: [{ clientId: null }, { client: clientScope(actor) }, { attendees: { some: { userId: actor.id } } }, { createdById: actor.id }] };
}

const canEditAgendaEvent = (actor: Actor, e: { createdById: string }) => e.createdById === actor.id || isManagerOrAdmin(actor);

const agendaSelect = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  location: true,
  notes: true,
  createdById: true,
  client: { select: { id: true, name: true } },
  createdBy: { select: userPublic },
  attendees: { select: { user: { select: userPublic } } },
} satisfies Prisma.AgendaEventSelect;

function toCalendarItem(actor: Actor, e: Prisma.AgendaEventGetPayload<{ select: typeof agendaSelect }>): AgendaCalendarEvent {
  return {
    key: `${e.id}:event`,
    kind: "event",
    date: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    allDay: e.allDay,
    eventId: e.id,
    title: e.title,
    location: e.location,
    notes: e.notes,
    client: e.client,
    attendees: e.attendees.map((a) => a.user),
    createdBy: e.createdBy,
    canEdit: canEditAgendaEvent(actor, e),
  };
}

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

  // Eventos que começam no período ou que ainda estão acontecendo nele.
  const agenda = await db.agendaEvent.findMany({
    where: {
      AND: [
        agendaScope(actor),
        clientId ? { clientId } : {},
        { startsAt: { lt: to } },
        { OR: [{ startsAt: { gte: from } }, { endsAt: { gte: from } }] },
      ],
    },
    select: agendaSelect,
    orderBy: { startsAt: "asc" },
    take: 1000,
  });

  const events: CalendarEvent[] = agenda.map((e) => toCalendarItem(actor, e));
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

// ─────────────────────────── Eventos da agenda ───────────────────────────

async function eventData(actor: Actor, input: AgendaEventInput) {
  const d = agendaEventSchema.parse(input);
  if (d.clientId) {
    const ok = await db.client.count({ where: { AND: [{ id: d.clientId }, clientScope(actor)] } });
    if (!ok) throw notFound("Cliente");
  }
  const attendeeIds = [...new Set(d.attendeeIds)];
  if (attendeeIds.length && (await db.user.count({ where: { id: { in: attendeeIds }, active: true } })) !== attendeeIds.length) {
    throw invalid("Participante inválido.");
  }
  return {
    attendeeIds,
    data: {
      title: d.title,
      startsAt: new Date(d.startsAt),
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      allDay: d.allDay,
      clientId: d.clientId ?? null,
      location: d.location || null,
      notes: d.notes || null,
    },
  };
}

async function editableEvent(actor: Actor, eventId: string) {
  const e = await db.agendaEvent.findFirst({ where: { AND: [{ id: eventId }, agendaScope(actor)] } });
  if (!e) throw notFound("Evento");
  if (!canEditAgendaEvent(actor, e)) throw forbidden("Apenas quem criou o evento ou um gestor pode alterá-lo.");
  return e;
}

export async function createAgendaEvent(actor: Actor, input: AgendaEventInput) {
  const { data, attendeeIds } = await eventData(actor, input);
  return db.agendaEvent.create({
    data: { ...data, createdById: actor.id, attendees: { create: attendeeIds.map((userId) => ({ userId })) } },
  });
}

export async function updateAgendaEvent(actor: Actor, eventId: string, input: AgendaEventInput) {
  await editableEvent(actor, eventId);
  const { data, attendeeIds } = await eventData(actor, input);
  return db.$transaction(async (tx) => {
    await tx.agendaEventAttendee.deleteMany({ where: { eventId } });
    return tx.agendaEvent.update({
      where: { id: eventId },
      data: { ...data, attendees: { create: attendeeIds.map((userId) => ({ userId })) } },
    });
  });
}

export async function deleteAgendaEvent(actor: Actor, eventId: string) {
  await editableEvent(actor, eventId);
  await db.agendaEvent.delete({ where: { id: eventId } });
}

/** Arrastar no calendário: o navegador manda o novo início; a duração é preservada. */
export async function moveAgendaEvent(actor: Actor, eventId: string, startsAtIso: string) {
  const e = await editableEvent(actor, eventId);
  const startsAt = new Date(z.string().datetime({ offset: true }).parse(startsAtIso));
  const endsAt = e.endsAt ? new Date(startsAt.getTime() + (e.endsAt.getTime() - e.startsAt.getTime())) : null;
  await db.agendaEvent.update({ where: { id: eventId }, data: { startsAt, endsAt } });
}

