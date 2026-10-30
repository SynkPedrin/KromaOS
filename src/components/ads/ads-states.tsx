import Link from "next/link";
import { CloudDownload, History, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { formatDate } from "@/lib/format";
import type { ClientAds } from "@/server/services/ads";
import { StaleBanner, SyncButton } from "./ads-ui";

/**
 * Estados comuns das telas do cliente: sem conta vinculada, aguardando a primeira sincronização
 * ou período anterior ao histórico. Retorna null quando há dados para exibir.
 */
export function ClientAdsGate({ data }: { data: ClientAds }) {
  if (data.empty) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState
          icon={<Megaphone />}
          title="Nenhuma conta de anúncios vinculada"
          description="Conecte uma conta de anúncios para visualizar campanhas e resultados deste cliente."
          action={
            data.canSync ? (
              <Button asChild>
                <Link href="/configuracoes/integracoes/meta">Conectar Meta Ads</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }
  if (!data.historyFrom) {
    return (
      <div className="glass rounded-3xl">
        <StaleBanner accounts={data.accounts} clientId={data.client.id} canSync={data.canSync} />
        <EmptyState
          icon={<CloudDownload />}
          title="Aguardando a primeira sincronização"
          description="Os dados dos últimos 90 dias são trazidos da Meta logo após o vínculo. Isso leva alguns instantes."
          action={data.canSync ? <SyncButton clientId={data.client.id} label="Sincronizar agora" /> : undefined}
        />
      </div>
    );
  }
  return null;
}

export function HistoryNotice({ data }: { data: Extract<ClientAds, { empty: false }> }) {
  if (!data.beforeHistory || !data.historyFrom) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-warning/[0.08] px-4 py-3 ring-1 ring-warning/20">
      <History className="size-4 shrink-0 text-[#8a5300]" />
      <p className="min-w-0 flex-1 text-sm text-[#6b4300]">
        O histórico sincronizado começa em {formatDate(`${data.historyFrom}T12:00:00Z`)}. Dias anteriores aparecem como “Não disponível” até serem buscados na Meta.
      </p>
      {data.canSync && <SyncButton clientId={data.client.id} since={data.period.since} label="Buscar histórico" variant="secondary" />}
    </div>
  );
}
