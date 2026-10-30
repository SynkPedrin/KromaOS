import type { Metadata } from "next";
import { after } from "next/server";
import { requireUser } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { getAdsOverview } from "@/server/services/ads";
import { refreshStaleAccounts } from "@/server/services/meta-sync";
import { PageHeader } from "@/components/ui/display";
import { AdsOverviewView } from "@/components/ads/overview-view";
import { AdsSubnav } from "@/components/ads/ads-ui";

export const metadata: Metadata = { title: "Anúncios" };

type SP = { periodo?: string; de?: string; ate?: string };

export default async function AdsOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const data = await getAdsOverview(user, await searchParams);
  // Contas com dados mais velhos que 30 minutos são atualizadas depois da resposta.
  if (data.accounts.some((a) => a.stale && !a.syncing)) after(() => refreshStaleAccounts(data.accounts.map((a) => a.id)));
  return (
    <>
      <PageHeader title="Anúncios" description="Investimento, campanhas e resultados de mídia paga de todos os clientes, direto da Meta." />
      <AdsSubnav clients={data.clients.map(({ id, name, logoFileId }) => ({ id, name, logoFileId }))} isAdmin={isAdmin(user)} />
      <AdsOverviewView data={JSON.parse(JSON.stringify(data))} isAdmin={isAdmin(user)} />
    </>
  );
}
