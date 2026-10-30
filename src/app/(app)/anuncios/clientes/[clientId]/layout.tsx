import { after } from "next/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { adsClientContext } from "@/server/services/ads";
import { refreshStaleAccounts } from "@/server/services/meta-sync";
import { ClientAdsHeader } from "@/components/ads/client-ads-header";

export default async function ClientAdsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const user = await requireUser();
  const { clientId } = await params;
  let ctx;
  try {
    ctx = await adsClientContext(user, clientId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  // Dados com mais de 30 minutos: atualiza em segundo plano depois de responder (a tela mostra a última sincronização).
  const ids = ctx.accounts.map((a) => a.id);
  if (ctx.accounts.some((a) => a.stale && !a.syncing)) after(() => refreshStaleAccounts(ids));
  return (
    <>
      <ClientAdsHeader client={ctx.client} accounts={ctx.accounts} canSync={ctx.canSync} mixedCurrency={ctx.mixedCurrency} />
      {children}
    </>
  );
}
