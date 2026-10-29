import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { assertManager, canViewFinance, clientScope, type Actor } from "@/server/auth/permissions";
import { invalid, notFound } from "@/server/errors";
import { clientBrandSchema, clientSchema, contractSchema, type ClientBrandInput, type ClientInput, type ContractInput } from "@/lib/schemas";
import { addDays, dateOnly, startOfDayInTz } from "@/lib/dates";
import { userPublic } from "./shared";

export type ClientListFilters = { status?: string; q?: string; archived?: boolean };

/** Contrato vigente: o ativo mais recente; senão, o mais recente de qualquer status. */
function currentContract<T extends { status: string; createdAt: Date }>(contracts: T[]) {
  const sorted = [...contracts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted.find((c) => c.status === "ACTIVE") ?? sorted[0] ?? null;
}

export async function listClients(actor: Actor, f: ClientListFilters = {}) {
  const finance = canViewFinance(actor);
  const where: Prisma.ClientWhereInput = {
    AND: [
      clientScope(actor),
      f.archived ? { archivedAt: { not: null } } : { archivedAt: null },
      f.status ? { status: f.status as Prisma.EnumClientStatusFilter["equals"] } : {},
      f.q ? { name: { contains: f.q, mode: "insensitive" } } : {},
    ],
  };
  const clients = await db.client.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      services: true,
      // Dados comerciais só são carregados quando o usuário pode vê-los.
      contracts: finance ? true : false,
      _count: { select: { tasks: { where: { archivedAt: null, parentId: null, status: { not: "DONE" } } } } },
    },
  });

  const today = startOfDayInTz();
  const ids = clients.map((c) => c.id);
  const [overdue, nextDue] = await Promise.all([
    db.task.groupBy({
      by: ["clientId"],
      where: { clientId: { in: ids }, archivedAt: null, status: { not: "DONE" }, dueDate: { lt: today } },
      _count: true,
    }),
    db.task.groupBy({
      by: ["clientId"],
      where: { clientId: { in: ids }, archivedAt: null, status: { not: "DONE" }, dueDate: { gte: today } },
      _min: { dueDate: true },
    }),
  ]);
  const overdueMap = new Map(overdue.map((o) => [o.clientId, o._count]));
  const nextMap = new Map(nextDue.map((n) => [n.clientId, n._min.dueDate]));

  return clients.map((c) => {
    const contract = finance && "contracts" in c ? currentContract(c.contracts as { status: string; createdAt: Date; monthlyFeeCents: number; mediaBudgetCents: number }[]) : null;
    return {
      id: c.id,
      name: c.name,
      segment: c.segment,
      status: c.status,
      contactName: c.contactName,
      logoFileId: c.logoFileId,
      archivedAt: c.archivedAt,
      services: c.services.map((s) => s.service),
      openTasks: c._count.tasks,
      overdueTasks: overdueMap.get(c.id) ?? 0,
      nextDueDate: nextMap.get(c.id) ?? null,
      finance: contract ? { monthlyFeeCents: contract.monthlyFeeCents, mediaBudgetCents: contract.mediaBudgetCents } : null,
    };
  });
}
export type ClientListItem = Awaited<ReturnType<typeof listClients>>[number];

export async function getClient(actor: Actor, clientId: string) {
  const finance = canViewFinance(actor);
  const client = await db.client.findFirst({
    where: { AND: [{ id: clientId }, clientScope(actor)] },
    include: {
      services: true,
      members: { include: { user: { select: userPublic } } },
      contracts: finance ? { orderBy: { createdAt: "desc" } } : false,
    },
  });
  if (!client) throw notFound("Cliente");

  const today = startOfDayInTz();
  const base = { clientId, archivedAt: null, parentId: null };
  const [total, done, overdue, upcoming] = await Promise.all([
    db.task.count({ where: base }),
    db.task.count({ where: { ...base, status: "DONE" } }),
    db.task.count({ where: { ...base, status: { not: "DONE" }, dueDate: { lt: today } } }),
    db.task.count({ where: { ...base, status: { not: "DONE" }, dueDate: { gte: today, lt: addDays(today, 7) } } }),
  ]);

  const contracts = finance && "contracts" in client ? (client.contracts as Prisma.ClientContractGetPayload<object>[]) : [];
  return {
    ...client,
    contracts: finance ? contracts : undefined,
    contract: finance ? currentContract(contracts) : null,
    services: client.services.map((s) => s.service),
    members: client.members.map((m) => m.user),
    stats: { total, done, pending: total - done, overdue, upcoming },
    canViewFinance: finance,
  };
}
export type ClientDetail = Awaited<ReturnType<typeof getClient>>;

const toDate = (v: string | null | undefined) => (v ? dateOnly(v) : null);

export async function createClient(actor: Actor, input: ClientInput, contractInput?: ContractInput) {
  assertManager(actor);
  const data = clientSchema.parse(input);
  const contract = contractInput && canViewFinance(actor) ? contractSchema.parse(contractInput) : null;
  return db.client.create({
    data: {
      name: data.name,
      contactName: data.contactName,
      email: data.email,
      whatsapp: data.whatsapp,
      segment: data.segment,
      status: data.status,
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      notes: data.notes,
      services: { create: data.services.map((service) => ({ service })) },
      members: data.memberIds?.length ? { create: data.memberIds.map((userId) => ({ userId })) } : undefined,
      contracts: contract ? { create: contractData(contract) } : undefined,
    },
  });
}

function contractData(c: ReturnType<typeof contractSchema.parse>) {
  return {
    type: c.type,
    status: c.status,
    setupFeeCents: c.setupFeeCents,
    monthlyFeeCents: c.monthlyFeeCents,
    mediaBudgetCents: c.mediaBudgetCents,
    billingDay: c.billingDay ?? null,
    startDate: toDate(c.startDate),
    endDate: toDate(c.endDate),
    notes: c.notes,
  };
}

export async function updateClient(actor: Actor, clientId: string, input: ClientInput) {
  assertManager(actor);
  const data = clientSchema.parse(input);
  const exists = await db.client.count({ where: { id: clientId } });
  if (!exists) throw notFound("Cliente");
  return db.$transaction(async (tx) => {
    await tx.clientService.deleteMany({ where: { clientId } });
    if (data.memberIds) {
      await tx.clientMember.deleteMany({ where: { clientId, userId: { notIn: data.memberIds } } });
      await tx.clientMember.createMany({
        data: data.memberIds.map((userId) => ({ clientId, userId })),
        skipDuplicates: true,
      });
    }
    return tx.client.update({
      where: { id: clientId },
      data: {
        name: data.name,
        contactName: data.contactName,
        email: data.email,
        whatsapp: data.whatsapp,
        segment: data.segment,
        status: data.status,
        startDate: toDate(data.startDate),
        endDate: toDate(data.endDate),
        notes: data.notes,
        services: { create: data.services.map((service) => ({ service })) },
      },
    });
  });
}

/** Paleta de cores e fontes da identidade visual do cliente. */
export async function updateClientBrand(actor: Actor, clientId: string, input: ClientBrandInput) {
  assertManager(actor);
  const data = clientBrandSchema.parse(input);
  if (!(await db.client.count({ where: { id: clientId } }))) throw notFound("Cliente");
  return db.client.update({
    where: { id: clientId },
    data: { brandColors: data.brandColors, brandFonts: data.brandFonts },
    select: { brandColors: true, brandFonts: true },
  });
}

/** Cria ou atualiza o contrato vigente (apenas quem acessa o financeiro). */
export async function saveContract(actor: Actor, clientId: string, input: ContractInput, contractId?: string) {
  if (!canViewFinance(actor)) throw invalid("Acesso restrito ao financeiro.");
  const data = contractData(contractSchema.parse(input));
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Cliente");
  if (contractId) {
    const c = await db.clientContract.findFirst({ where: { id: contractId, clientId } });
    if (!c) throw notFound("Contrato");
    return db.clientContract.update({ where: { id: contractId }, data });
  }
  return db.clientContract.create({ data: { ...data, clientId } });
}

export async function setClientArchived(actor: Actor, clientId: string, archived: boolean) {
  assertManager(actor);
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) throw notFound("Cliente");
  await db.client.update({ where: { id: clientId }, data: { archivedAt: archived ? new Date() : null } });
}

/** Opções enxutas para selects (respeita o escopo do usuário). */
export function clientOptions(actor: Actor) {
  return db.client.findMany({
    where: { AND: [clientScope(actor), { archivedAt: null }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
