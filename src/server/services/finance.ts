import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { assertFinance, type Actor } from "@/server/auth/permissions";
import { notFound } from "@/server/errors";
import { dateOnly, monthKey, startOfDayInTz } from "@/lib/dates";
import { invoiceSchema, mediaInvestmentSchema, type InvoiceInput, type MediaInvestmentInput } from "@/lib/schemas";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { syncInvoiceCashEntry } from "./cash";

/** Status efetivo: pendente com vencimento passado é "atrasado", mesmo antes da rotina diária. */
export function effectiveInvoiceStatus(i: { status: InvoiceStatus; dueDate: Date }, today = startOfDayInTz()): InvoiceStatus {
  return i.status === "PENDING" && i.dueDate < today ? "OVERDUE" : i.status;
}

/** Contratos recorrentes que compõem o MRR: contrato ativo + cliente ativo e não arquivado. */
const mrrContractWhere: Prisma.ClientContractWhereInput = {
  status: "ACTIVE",
  type: { in: ["MONTHLY", "HYBRID"] },
  client: { status: "ACTIVE", archivedAt: null },
};

export async function computeMrr() {
  const agg = await db.clientContract.aggregate({ where: mrrContractWhere, _sum: { monthlyFeeCents: true } });
  return agg._sum.monthlyFeeCents ?? 0;
}

export async function computePlannedMedia() {
  const agg = await db.clientContract.aggregate({
    where: { status: "ACTIVE", client: { status: "ACTIVE", archivedAt: null } },
    _sum: { mediaBudgetCents: true },
  });
  return agg._sum.mediaBudgetCents ?? 0;
}

export async function financeSummary(actor: Actor, month = monthKey(new Date())) {
  assertFinance(actor);
  const today = startOfDayInTz();
  const nextMonth = new Date(month);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

  const [mrr, plannedMedia, activeClients, setup, receivable, received, mediaMonth] = await Promise.all([
    computeMrr(),
    computePlannedMedia(),
    db.client.count({ where: { status: "ACTIVE", archivedAt: null } }),
    db.clientContract.aggregate({
      where: { client: { archivedAt: null }, status: { not: "ENDED" } },
      _sum: { setupFeeCents: true },
    }),
    db.invoice.aggregate({ where: { status: { in: ["PENDING", "OVERDUE"] } }, _sum: { amountCents: true }, _count: true }),
    db.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: month, lt: nextMonth } },
      _sum: { amountCents: true },
    }),
    db.mediaInvestment.aggregate({
      where: { month },
      _sum: { plannedCents: true, actualCents: true },
    }),
  ]);
  const overdue = await db.invoice.aggregate({
    where: { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: today } }] },
    _sum: { amountCents: true },
    _count: true,
  });
  const mrrClients = await db.clientContract.count({ where: { ...mrrContractWhere, monthlyFeeCents: { gt: 0 } } });

  return {
    mrrCents: mrr,
    setupCents: setup._sum.setupFeeCents ?? 0,
    plannedMediaCents: plannedMedia,
    activeClients,
    avgTicketCents: mrrClients ? Math.round(mrr / mrrClients) : 0,
    receivableCents: receivable._sum.amountCents ?? 0,
    receivableCount: receivable._count,
    overdueCents: overdue._sum.amountCents ?? 0,
    overdueCount: overdue._count,
    receivedThisMonthCents: received._sum.amountCents ?? 0,
    mediaMonth: {
      plannedCents: mediaMonth._sum.plannedCents ?? 0,
      actualCents: mediaMonth._sum.actualCents ?? 0,
    },
  };
}

/** Recebido x faturado nos últimos meses (para o gráfico do financeiro). */
export async function revenueHistory(actor: Actor, months = 6) {
  assertFinance(actor);
  const start = monthKey(new Date());
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const invoices = await db.invoice.findMany({
    where: { competence: { gte: start }, status: { not: "CANCELED" } },
    select: { competence: true, amountCents: true, status: true },
  });
  const buckets = new Map<string, { billed: number; received: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    buckets.set(d.toISOString().slice(0, 7), { billed: 0, received: 0 });
  }
  for (const inv of invoices) {
    const b = buckets.get(inv.competence.toISOString().slice(0, 7));
    if (!b) continue;
    b.billed += inv.amountCents;
    if (inv.status === "PAID") b.received += inv.amountCents;
  }
  return [...buckets.entries()].map(([month, v]) => ({ month, ...v }));
}

// ─────────────────────────────── Cobranças ───────────────────────────────

export async function listInvoices(actor: Actor, f: { clientId?: string; status?: InvoiceStatus } = {}) {
  assertFinance(actor);
  const today = startOfDayInTz();
  const statusWhere: Prisma.InvoiceWhereInput =
    f.status === "OVERDUE"
      ? { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: today } }] }
      : f.status === "PENDING"
        ? { status: "PENDING", dueDate: { gte: today } }
        : f.status
          ? { status: f.status }
          : {};
  const invoices = await db.invoice.findMany({
    where: { AND: [f.clientId ? { clientId: f.clientId } : {}, statusWhere] },
    orderBy: [{ dueDate: "desc" }],
    include: { client: { select: { id: true, name: true } } },
    take: 500,
  });
  return invoices.map((i) => ({ ...i, effectiveStatus: effectiveInvoiceStatus(i, today) }));
}

function invoiceData(input: InvoiceInput) {
  const d = invoiceSchema.parse(input);
  return {
    clientId: d.clientId,
    competence: dateOnly(`${d.competence}-01`),
    description: d.description,
    amountCents: d.amountCents,
    dueDate: dateOnly(d.dueDate),
    status: d.status,
    // Ao marcar como pago sem data, assume hoje.
    paidAt: d.status === "PAID" ? (d.paidAt ? dateOnly(d.paidAt) : new Date()) : null,
  };
}

export async function createInvoice(actor: Actor, input: InvoiceInput) {
  assertFinance(actor);
  const data = invoiceData(input);
  if (!(await db.client.count({ where: { id: data.clientId } }))) throw notFound("Cliente");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({ data: { ...data, createdById: actor.id } });
    await syncInvoiceCashEntry(tx, inv.id, actor.id);
    return inv;
  });
}

export async function updateInvoice(actor: Actor, id: string, input: InvoiceInput) {
  assertFinance(actor);
  if (!(await db.invoice.count({ where: { id } }))) throw notFound("Cobrança");
  const data = invoiceData(input);
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.update({ where: { id }, data });
    await syncInvoiceCashEntry(tx, id, actor.id);
    return inv;
  });
}

export async function setInvoicePaid(actor: Actor, id: string, paid: boolean) {
  assertFinance(actor);
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) throw notFound("Cobrança");
  return db.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: paid
        ? { status: "PAID", paidAt: new Date() }
        : { status: inv.dueDate < startOfDayInTz() ? "OVERDUE" : "PENDING", paidAt: null },
    });
    // Pagamento gera a entrada no caixa; desfazer remove.
    await syncInvoiceCashEntry(tx, id, actor.id);
    return updated;
  });
}

/** Cobranças são canceladas, não apagadas (histórico financeiro). */
export async function cancelInvoice(actor: Actor, id: string) {
  assertFinance(actor);
  if (!(await db.invoice.count({ where: { id } }))) throw notFound("Cobrança");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.update({ where: { id }, data: { status: "CANCELED", paidAt: null } });
    await syncInvoiceCashEntry(tx, id, actor.id);
    return inv;
  });
}

// ─────────────────────────── Investimento em mídia ───────────────────────────

export async function listMediaInvestments(actor: Actor, f: { clientId?: string; month?: string } = {}) {
  assertFinance(actor);
  return db.mediaInvestment.findMany({
    where: {
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.month ? { month: dateOnly(`${f.month}-01`) } : {}),
    },
    orderBy: [{ month: "desc" }, { client: { name: "asc" } }],
    include: { client: { select: { id: true, name: true } } },
    take: 500,
  });
}

export async function saveMediaInvestment(actor: Actor, input: MediaInvestmentInput) {
  assertFinance(actor);
  const d = mediaInvestmentSchema.parse(input);
  if (!(await db.client.count({ where: { id: d.clientId } }))) throw notFound("Cliente");
  const month = dateOnly(`${d.month}-01`);
  const values = { plannedCents: d.plannedCents, actualCents: d.actualCents ?? null, notes: d.notes };
  return db.mediaInvestment.upsert({
    where: { clientId_platform_month: { clientId: d.clientId, platform: d.platform, month } },
    create: { clientId: d.clientId, platform: d.platform, month, ...values },
    update: values,
  });
}

export async function deleteMediaInvestment(actor: Actor, id: string) {
  assertFinance(actor);
  if (!(await db.mediaInvestment.count({ where: { id } }))) throw notFound("Registro");
  await db.mediaInvestment.delete({ where: { id } });
}

/** Histórico financeiro de um cliente (aba Financeiro da página do cliente). */
export async function clientFinance(actor: Actor, clientId: string) {
  assertFinance(actor);
  const [invoices, media] = await Promise.all([
    listInvoices(actor, { clientId }),
    listMediaInvestments(actor, { clientId }),
  ]);
  const paid = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amountCents, 0);
  const open = invoices
    .filter((i) => i.effectiveStatus === "PENDING" || i.effectiveStatus === "OVERDUE")
    .reduce((s, i) => s + i.amountCents, 0);
  return { invoices, media, totals: { paidCents: paid, openCents: open } };
}

