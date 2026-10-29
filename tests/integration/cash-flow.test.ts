import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { cancelInvoice, createInvoice, setInvoicePaid, updateInvoice } from "@/server/services/finance";
import {
  cashHistory,
  cashSummary,
  createCashEntry,
  deleteCashEntry,
  getFinanceSettings,
  listCashEntries,
  setCashEntrySettled,
  setOpeningBalance,
  updateCashEntry,
} from "@/server/services/cash";
import { makeUser, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  // Configuração única sem FK: não é coberta pelo TRUNCATE em cascata do helper.
  await db.financeSettings.deleteMany();
});

const entry = (over: Partial<Parameters<typeof createCashEntry>[1]> = {}) => ({
  type: "EXPENSE" as const,
  description: "Assinatura Adobe",
  amountCents: 30000,
  date: "2030-03-10",
  category: "Ferramentas e software",
  ...over,
});

describe("Fluxo de caixa", () => {
  it("restringe ao financeiro e o saldo inicial a administradores", async () => {
    const admin = await makeUser("ADMIN");
    const member = await makeUser("MEMBER");
    const manager = await makeUser("MANAGER");
    const financeManager = await makeUser("MANAGER", { canViewFinance: true });

    await expect(createCashEntry(member.actor, entry())).rejects.toThrow(/financeiro/);
    await expect(createCashEntry(manager.actor, entry())).rejects.toThrow(/financeiro/);
    await expect(cashSummary(manager.actor)).rejects.toThrow(/financeiro/);
    await expect(listCashEntries(member.actor, { month: "2030-03" })).rejects.toThrow(/financeiro/);

    await createCashEntry(financeManager.actor, entry());
    expect(await listCashEntries(financeManager.actor, { month: "2030-03" })).toHaveLength(1);

    await expect(setOpeningBalance(financeManager.actor, 100000)).rejects.toThrow(/administradores/);
    await setOpeningBalance(admin.actor, -50000);
    expect((await getFinanceSettings(financeManager.actor)).openingBalanceCents).toBe(-50000);
  });

  it("calcula saldo, resultado do mês e previstos", async () => {
    const admin = await makeUser("ADMIN");
    await setOpeningBalance(admin.actor, 1_000_00);
    await createCashEntry(admin.actor, entry({ type: "INCOME", description: "Projeto", amountCents: 5_000_00, category: "Implantação/Projeto" }));
    await createCashEntry(admin.actor, entry({ amountCents: 300_00 }));
    await createCashEntry(admin.actor, entry({ description: "Pró-labore", amountCents: 2_000_00, date: "2030-02-28", category: "Pró-labore/Retirada de sócios" }));
    // Previstos: não mexem no saldo, só no projetado.
    const payable = await createCashEntry(admin.actor, entry({ description: "Imposto", amountCents: 700_00, settled: false, category: "Impostos e taxas" }));
    await createCashEntry(admin.actor, entry({ type: "INCOME", description: "Reembolso", amountCents: 400_00, settled: false, category: "Reembolso de mídia" }));

    let s = await cashSummary(admin.actor, "2030-03");
    expect(s.balanceCents).toBe(1_000_00 + 5_000_00 - 300_00 - 2_000_00);
    expect(s.monthIncomeCents).toBe(5_000_00);
    expect(s.monthExpenseCents).toBe(300_00);
    expect(s.monthResultCents).toBe(4_700_00);
    expect(s.payableCents).toBe(700_00);
    expect(s.receivableCents).toBe(400_00);
    expect(s.projectedBalanceCents).toBe(s.balanceCents + 400_00 - 700_00);

    // Pagar a conta prevista move o valor para o saldo.
    await setCashEntrySettled(admin.actor, payable.id, true);
    s = await cashSummary(admin.actor, "2030-03");
    expect(s.balanceCents).toBe(3_700_00 - 700_00);
    expect(s.payableCents).toBe(0);

    const history = await cashHistory(admin.actor, 2, "2030-03");
    expect(history).toEqual([
      { month: "2030-02", income: 0, expense: 2_000_00 },
      { month: "2030-03", income: 5_000_00, expense: 1_000_00 },
    ]);

    // Filtros da lista
    expect(await listCashEntries(admin.actor, { month: "2030-03", type: "INCOME" })).toHaveLength(2);
    expect(await listCashEntries(admin.actor, { month: "2030-03", settled: false })).toHaveLength(1);
    expect(await listCashEntries(admin.actor, { month: "2030-03", category: "Impostos e taxas" })).toHaveLength(1);
  });

  it("valida valor, categoria e cliente", async () => {
    const admin = await makeUser("ADMIN");
    await expect(createCashEntry(admin.actor, entry({ amountCents: 0 }))).rejects.toThrow();
    await expect(createCashEntry(admin.actor, entry({ category: "X" }))).rejects.toThrow();
    await expect(createCashEntry(admin.actor, entry({ date: "10/03/2030" }))).rejects.toThrow();
    await expect(createCashEntry(admin.actor, entry({ clientId: "inexistente" }))).rejects.toThrow(/Cliente/);
  });

  it("cobrança paga gera entrada no caixa e desfazer/cancelar remove", async () => {
    const admin = await makeUser("ADMIN");
    const client = await createClient(admin.actor, { name: "Aurora", status: "ACTIVE" });
    const inv = await createInvoice(admin.actor, {
      clientId: client.id,
      competence: "2030-03",
      description: "Mensalidade de março",
      amountCents: 3_200_00,
      dueDate: "2030-03-10",
    });
    expect(await db.cashEntry.count()).toBe(0);

    await setInvoicePaid(admin.actor, inv.id, true);
    let linked = await db.cashEntry.findUniqueOrThrow({ where: { invoiceId: inv.id } });
    expect(linked).toMatchObject({ type: "INCOME", amountCents: 3_200_00, settled: true, clientId: client.id, category: "Recebimento de cliente" });
    expect(linked.description).toContain("Aurora");
    expect((await cashSummary(admin.actor)).balanceCents).toBe(3_200_00);

    // Lançamento vinculado só muda pela cobrança.
    await expect(deleteCashEntry(admin.actor, linked.id)).rejects.toThrow(/Recebimentos/);
    await expect(updateCashEntry(admin.actor, linked.id, entry())).rejects.toThrow(/Recebimentos/);
    await expect(setCashEntrySettled(admin.actor, linked.id, false)).rejects.toThrow(/Recebimentos/);

    // Editar valor e data de pagamento mantém a entrada em sincronia.
    await updateInvoice(admin.actor, inv.id, {
      clientId: client.id,
      competence: "2030-03",
      description: "Mensalidade de março",
      amountCents: 3_500_00,
      dueDate: "2030-03-10",
      status: "PAID",
      paidAt: "2030-03-12",
    });
    linked = await db.cashEntry.findUniqueOrThrow({ where: { invoiceId: inv.id } });
    expect(linked.amountCents).toBe(3_500_00);
    expect(linked.date.toISOString().slice(0, 10)).toBe("2030-03-12");
    expect(await db.cashEntry.count()).toBe(1);

    await setInvoicePaid(admin.actor, inv.id, false);
    expect(await db.cashEntry.count()).toBe(0);

    await setInvoicePaid(admin.actor, inv.id, true);
    expect(await db.cashEntry.count()).toBe(1);
    await cancelInvoice(admin.actor, inv.id);
    expect(await db.cashEntry.count()).toBe(0);

    // Criada já paga também entra no caixa.
    await createInvoice(admin.actor, {
      clientId: client.id,
      competence: "2030-04",
      description: "Implantação",
      amountCents: 1_000_00,
      dueDate: "2030-04-05",
      status: "PAID",
      paidAt: "2030-04-05",
    });
    expect(await listCashEntries(admin.actor, { month: "2030-04" })).toHaveLength(1);
  });
});
