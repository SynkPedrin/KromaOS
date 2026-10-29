import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { canViewFinance, clientScope, taskScope, type Actor } from "@/server/auth/permissions";
import { addDays, startOfDayInTz, ymdInTz } from "@/lib/dates";
import { computeMrr, computePlannedMedia } from "./finance";
import { userPublic } from "./shared";

export async function dashboardMetrics(actor: Actor) {
  const today = startOfDayInTz();
  const scope = taskScope(actor);
  const open = { AND: [scope, { archivedAt: null, status: { not: "DONE" as const } }] };
  const finance = canViewFinance(actor);

  const [activeClients, pending, overdue, week, mrr, media] = await Promise.all([
    db.client.count({ where: { AND: [clientScope(actor), { status: "ACTIVE", archivedAt: null }] } }),
    db.task.count({ where: open }),
    db.task.count({ where: { AND: [open, { dueDate: { lt: today } }] } }),
    db.task.count({ where: { AND: [open, { dueDate: { gte: today, lt: addDays(today, 7) } }] } }),
    finance ? computeMrr() : Promise.resolve(null),
    finance ? computePlannedMedia() : Promise.resolve(null),
  ]);
  return { activeClients, pending, overdue, week, mrrCents: mrr, mediaCents: media };
}

/**
 * Série diária de criadas, concluídas e atrasos (tarefas que venceram naquele dia
 * e não foram concluídas até o prazo). Calculada no Postgres, agrupada no fuso da agência.
 */
export async function operationSeries(actor: Actor, days: 7 | 30 | 90) {
  const today = startOfDayInTz();
  const from = addDays(today, -(days - 1));
  const to = addDays(today, 1);
  const visibleIds = await db.task.findMany({
    where: { AND: [taskScope(actor), { OR: [{ createdAt: { gte: from } }, { completedAt: { gte: from } }, { dueDate: { gte: from, lt: to } }] }] },
    select: { id: true },
  });
  const ids = visibleIds.map((t) => t.id);
  const empty = new Map<string, { created: number; completed: number; overdue: number }>();
  for (let i = 0; i < days; i++) empty.set(ymdInTz(addDays(from, i)), { created: 0, completed: 0, overdue: 0 });
  if (!ids.length) return [...empty.entries()].map(([date, v]) => ({ date, ...v }));

  const tz = "America/Sao_Paulo";
  const rows = await db.$queryRaw<{ day: string; kind: string; n: bigint }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, 'created' AS kind, count(*) AS n
      FROM "Task" WHERE id IN (${Prisma.join(ids)}) AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1
    UNION ALL
    SELECT to_char(("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD'), 'completed', count(*)
      FROM "Task" WHERE id IN (${Prisma.join(ids)}) AND "completedAt" >= ${from} AND "completedAt" < ${to} GROUP BY 1
    UNION ALL
    SELECT to_char("dueDate", 'YYYY-MM-DD'), 'overdue', count(*)
      FROM "Task" WHERE id IN (${Prisma.join(ids)}) AND "dueDate" >= ${from} AND "dueDate" < ${today}
        AND "archivedAt" IS NULL
        AND ("completedAt" IS NULL OR "completedAt" >= "dueDate" + interval '12 hours')
      GROUP BY 1`;
  for (const r of rows) {
    const b = empty.get(r.day);
    if (b) b[r.kind as "created" | "completed" | "overdue"] = Number(r.n);
  }
  return [...empty.entries()].map(([date, v]) => ({ date, ...v }));
}

export async function upcomingDeliveries(actor: Actor, take = 8) {
  const today = startOfDayInTz();
  return db.task.findMany({
    where: {
      AND: [taskScope(actor), { archivedAt: null, status: { not: "DONE" }, dueDate: { gte: addDays(today, -30) } }],
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take,
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      dueDate: true,
      client: { select: { id: true, name: true } },
      assignee: { select: userPublic },
    },
  });
}

/** Clientes que exigem atenção: atrasos primeiro, depois quem tem mais entregas pendentes. */
export async function featuredClients(actor: Actor, take = 6) {
  const today = startOfDayInTz();
  const finance = canViewFinance(actor);
  const clients = await db.client.findMany({
    where: { AND: [clientScope(actor), { archivedAt: null, status: { in: ["ACTIVE", "ONBOARDING"] } }] },
    select: {
      id: true,
      name: true,
      logoFileId: true,
      status: true,
      contracts: finance
        ? { where: { status: "ACTIVE" }, select: { monthlyFeeCents: true, mediaBudgetCents: true }, take: 1, orderBy: { createdAt: "desc" } }
        : false,
    },
  });
  const ids = clients.map((c) => c.id);
  const [pending, overdue, next] = await Promise.all([
    db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, archivedAt: null, parentId: null, status: { not: "DONE" } }, _count: true }),
    db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, archivedAt: null, status: { not: "DONE" }, dueDate: { lt: today } }, _count: true }),
    db.task.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, archivedAt: null, status: { not: "DONE" }, dueDate: { gte: today } }, _min: { dueDate: true } }),
  ]);
  const p = new Map(pending.map((x) => [x.clientId, x._count]));
  const o = new Map(overdue.map((x) => [x.clientId, x._count]));
  const n = new Map(next.map((x) => [x.clientId, x._min.dueDate]));
  return clients
    .map((c) => {
      const contract = finance && "contracts" in c ? (c.contracts as { monthlyFeeCents: number; mediaBudgetCents: number }[])[0] : undefined;
      return {
        id: c.id,
        name: c.name,
        logoFileId: c.logoFileId,
        pending: p.get(c.id) ?? 0,
        overdue: o.get(c.id) ?? 0,
        nextDueDate: n.get(c.id) ?? null,
        monthlyFeeCents: contract?.monthlyFeeCents ?? null,
        mediaBudgetCents: contract?.mediaBudgetCents ?? null,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.pending - a.pending || a.name.localeCompare(b.name))
    .slice(0, take);
}
