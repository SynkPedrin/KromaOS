"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import * as meta from "@/server/services/meta-connection";
import { syncAdAccount } from "@/server/services/meta-sync";

const refresh = () => {
  revalidatePath("/anuncios", "layout");
  revalidatePath("/configuracoes/integracoes/meta");
};

/** Vincula a conta ao cliente e, se ficou habilitada, faz a primeira sincronização em segundo plano. */
export async function linkAdAccountAction(input: { accountId: string; clientId: string | null; move?: boolean }) {
  return withUser(async (u) => {
    const account = await meta.linkAdAccount(u, input);
    if (account.enabled) after(() => syncAdAccount(account.id, { kind: "INITIAL", triggeredById: u.id }));
    refresh();
    return { syncing: account.enabled };
  });
}

export async function refreshAdAccountsAction(connectionId: string) {
  return withUser(async (u) => {
    const n = await meta.refreshAdAccounts(u, connectionId);
    refresh();
    return { accounts: n };
  });
}

export async function disconnectMetaAction(connectionId: string) {
  return withUser(async (u) => {
    await meta.disconnectMeta(u, connectionId);
    refresh();
  });
}
