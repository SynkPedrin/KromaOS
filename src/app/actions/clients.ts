"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import * as clients from "@/server/services/clients";
import { setClientMainLogo } from "@/server/services/files";
import { canViewFinance } from "@/server/auth/permissions";
import type { ClientBrandInput, ClientInput, ContractInput } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

/** Cria o cliente; o contrato só é considerado para quem acessa o financeiro (o serviço também garante). */
export async function createClientAction(input: ClientInput, contract?: ContractInput) {
  return withUser(async (u) => {
    const c = await clients.createClient(u, input, contract);
    refresh();
    return { id: c.id };
  });
}

/** Atualiza dados do cliente e, quando informado e permitido, o contrato vigente. */
export async function updateClientAction(clientId: string, input: ClientInput, contract?: ContractInput, contractId?: string) {
  return withUser(async (u) => {
    await clients.updateClient(u, clientId, input);
    if (contract && canViewFinance(u)) await clients.saveContract(u, clientId, contract, contractId);
    refresh();
  });
}

export async function saveContractAction(clientId: string, contract: ContractInput, contractId?: string) {
  return withUser(async (u) => {
    await clients.saveContract(u, clientId, contract, contractId);
    refresh();
  });
}

export async function archiveClientAction(clientId: string, archived: boolean) {
  return withUser(async (u) => {
    await clients.setClientArchived(u, clientId, archived);
    refresh();
  });
}

export async function updateClientBrandAction(clientId: string, input: ClientBrandInput) {
  return withUser(async (u) => {
    const brand = await clients.updateClientBrand(u, clientId, input);
    refresh();
    return brand;
  });
}

export async function setClientMainLogoAction(clientId: string, fileId: string) {
  return withUser(async (u) => {
    await setClientMainLogo(u, clientId, fileId);
    refresh();
  });
}
