import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CashEntryType } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { assertAdmin, assertFinance, type Actor } from "@/server/auth/permissions";
import { invalid, notFound } from "@/server/errors";
import { dateOnly, monthKey, ymdInTz } from "@/lib/dates";
import { INVOICE_CASH_CATEGORY } from "@/lib/labels";
import { cashEntrySchema, openingBalanceSchema, type CashEntryInput } from "@/lib/schemas";

// Fluxo de caixa: entradas e saídas da conta da agência.
// Saldo em conta = saldo inicial + entradas realizadas − saídas realizadas.
// Lançamentos não realizados (settled = false) são previsões e só entram no saldo projetado.

const SETTINGS_ID = "default";
const LINKED_MESSAGE = "Este lançamento vem de uma cobrança. Altere-o pela aba Recebimentos.";

function monthRange(month: string) {
  const start = monthKey(month);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

/** Soma por tipo; ausência de lançamentos vale zero. */
async function sumByType(where: Prisma.CashEntryWhereInput) {
  const rows = await db.cashEntry.groupBy({ by: ["type"], where, _sum: { amountCents: true } });
  const get = (t: CashEntryType) => rows.find((r) => r.type === t)?._sum.amountCents ?? 0;
  return { income: get("INCOME"), expense: get("EXPENSE") };
}

export async function getFinanceSettings(actor: Actor) {
  assertFinance(actor);
  const s = await db.financeSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { openingBalanceCents: s?.openingBalanceCents ?? 0 };
}

export async function setOpeningBalance(actor: Actor, cents: number) {
  assertAdmin(actor);
  const value = openingBalanceSchema.parse(cents);
  return db.financeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, openingBalanceCents: value },
    update: { openingBalanceCents: value },
  });
}

export async function cashSummary(actor: Actor, month = ymdInTz(new Date()).slice(0, 7)) {
  const { openingBalanceCents } = await getFinanceSettings(actor);
  const { start, end } = monthRange(month);
  const [settled, monthly, pending, pendingCount] = await Promise.all([
    sumByType({ settled: true }),
    sumByType({ settled: true, date: { gte: start, lt: end } }),
    sumByType({ settled: false }),
    db.cashEntry.groupBy({ by: ["type"], where: { settled: false }, _count: true }),
  ]);
  const balance = openingBalanceCents + settled.income - settled.expense;
  const count = (t: CashEntryType) => pendingCount.find((r) => r.type === t)?._count ?? 0;
  return {
    openingBalanceCents,
    balanceCents: balance,
    monthIncomeCents: monthly.income,
    monthExpenseCents: monthly.expense,
    monthResultCents: monthly.income - monthly.expense,
    receivableCents: pending.income,
    receivableCount: count("INCOME"),
    payableCents: pending.expense,
    payableCount: count("EXPENSE"),
    projectedBalanceCents: balance + pending.income - pending.expense,
  };
}

/** Entradas e saídas realizadas nos últimos meses, terminando no mês informado. */
export async function cashHistory(actor: Actor, months = 6, endMonth = ymdInTz(new Date()).slice(0, 7)) {
  assertFinance(actor);
  const start = monthKey(endMonth);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const { end } = monthRange(endMonth);
  const entries = await db.cashEntry.findMany({
    where: { settled: true, date: { gte: start, lt: end } },
    select: { type: true, date: true, amountCents: true },
  });
  const buckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    buckets.set(d.toISOString().slice(0, 7), { income: 0, expense: 0 });
  }
  for (const e of entries) {
    const b = buckets.get(e.date.toISOString().slice(0, 7));
    if (!b) continue;
    if (e.type === "INCOME") b.income += e.amountCents;
    else b.expense += e.amountCents;
  }
  return [...buckets.entries()].map(([m, v]) => ({ month: m, ...v }));
}

export type CashFilters = { month: string; type?: CashEntryType; category?: string; settled?: boolean; clientId?: string };

export async function listCashEntries(actor: Actor, f: CashFilters) {
  assertFinance(actor);
  const { start, end } = monthRange(f.month);
  return db.cashEntry.findMany({
    where: {
      date: { gte: start, lt: end },
      ...(f.type ? { type: f.type } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.settled !== undefined ? { settled: f.settled } : {}),
      ...(f.clientId ? { clientId: f.clientId } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { client: { select: { id: true, name: true } } },
    take: 1000,
  });
}

async function entryData(input: CashEntryInput) {
  const d = cashEntrySchema.parse(input);
  if (d.clientId && !(await db.client.count({ where: { id: d.clientId } }))) throw notFound("Cliente");
  return { ...d, date: dateOnly(d.date) };
}

async function editableEntry(id: string) {
  const entry = await db.cashEntry.findUnique({ where: { id } });
  if (!entry) throw notFound("Lançamento");
  if (entry.invoiceId) throw invalid(LINKED_MESSAGE);
  return entry;
}

export async function createCashEntry(actor: Actor, input: CashEntryInput) {
  assertFinance(actor);
  return db.cashEntry.create({ data: { ...(await entryData(input)), createdById: actor.id } });
}

export async function updateCashEntry(actor: Actor, id: string, input: CashEntryInput) {
  assertFinance(actor);
  await editableEntry(id);
  return db.cashEntry.update({ where: { id }, data: await entryData(input) });
}

export async function setCashEntrySettled(actor: Actor, id: string, settled: boolean) {
  assertFinance(actor);
  await editableEntry(id);
  return db.cashEntry.update({ where: { id }, data: { settled } });
}

export async function deleteCashEntry(actor: Actor, id: string) {
  assertFinance(actor);
  await editableEntry(id);
  await db.cashEntry.delete({ where: { id } });
}

/**
 * Mantém a entrada de caixa de uma cobrança em sincronia: existe só enquanto a cobrança
 * está paga, com o mesmo valor e a data de pagamento. Chamado dentro da transação da cobrança.
 */
export async function syncInvoiceCashEntry(tx: Tx, invoiceId: string, actorId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { client: { select: { name: true } } } });
  if (!inv || inv.status !== "PAID") {
    await tx.cashEntry.deleteMany({ where: { invoiceId } });
    return;
  }
  const data = {
    type: "INCOME" as const,
    description: `${inv.description} · ${inv.client.name}`.slice(0, 200),
    amountCents: inv.amountCents,
    date: dateOnly(ymdInTz(inv.paidAt ?? new Date())),
    category: INVOICE_CASH_CATEGORY,
    settled: true,
    clientId: inv.clientId,
  };
  await tx.cashEntry.upsert({
    where: { invoiceId },
    create: { ...data, invoiceId, createdById: actorId },
    update: data,
  });
}
