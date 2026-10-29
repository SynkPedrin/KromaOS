"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import * as finance from "@/server/services/finance";
import * as cash from "@/server/services/cash";
import { saveContract } from "@/server/services/clients";
import type { CashEntryInput, ContractInput, InvoiceInput, MediaInvestmentInput } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

export async function createInvoiceAction(input: InvoiceInput) {
  return withUser(async (u) => {
    await finance.createInvoice(u, input);
    refresh();
  });
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  return withUser(async (u) => {
    await finance.updateInvoice(u, id, input);
    refresh();
  });
}

export async function setInvoicePaidAction(id: string, paid: boolean) {
  return withUser(async (u) => {
    await finance.setInvoicePaid(u, id, paid);
    refresh();
  });
}

export async function cancelInvoiceAction(id: string) {
  return withUser(async (u) => {
    await finance.cancelInvoice(u, id);
    refresh();
  });
}

export async function saveMediaInvestmentAction(input: MediaInvestmentInput) {
  return withUser(async (u) => {
    await finance.saveMediaInvestment(u, input);
    refresh();
  });
}

export async function deleteMediaInvestmentAction(id: string) {
  return withUser(async (u) => {
    await finance.deleteMediaInvestment(u, id);
    refresh();
  });
}

export async function saveContractFinanceAction(clientId: string, input: ContractInput, contractId?: string) {
  return withUser(async (u) => {
    await saveContract(u, clientId, input, contractId);
    refresh();
  });
}

export async function createCashEntryAction(input: CashEntryInput) {
  return withUser(async (u) => {
    await cash.createCashEntry(u, input);
    refresh();
  });
}

export async function updateCashEntryAction(id: string, input: CashEntryInput) {
  return withUser(async (u) => {
    await cash.updateCashEntry(u, id, input);
    refresh();
  });
}

export async function setCashEntrySettledAction(id: string, settled: boolean) {
  return withUser(async (u) => {
    await cash.setCashEntrySettled(u, id, settled);
    refresh();
  });
}

export async function deleteCashEntryAction(id: string) {
  return withUser(async (u) => {
    await cash.deleteCashEntry(u, id);
    refresh();
  });
}

export async function setOpeningBalanceAction(cents: number) {
  return withUser(async (u) => {
    await cash.setOpeningBalance(u, cents);
    refresh();
  });
}
