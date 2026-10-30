import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { metaIntegrationState } from "@/server/services/meta-connection";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { MetaIntegration, type MetaIntegrationData } from "@/components/ads/meta-integration";

export const metadata: Metadata = { title: "Integração Meta Ads" };

type SP = { conectado?: string; erro?: string; detalhe?: string };

export default async function MetaIntegrationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const back = (
    <Link href="/configuracoes" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-purple">
      <ArrowLeft className="size-3.5" /> Configurações
    </Link>
  );
  if (!isAdmin(user)) {
    return (
      <>
        {back}
        <PageHeader title="Integrações" />
        <div className="glass rounded-3xl">
          <EmptyState icon={<Lock />} title="Acesso restrito" description="Somente administradores conectam contas e vinculam clientes. Os anúncios dos seus clientes ficam em Anúncios." />
        </div>
      </>
    );
  }
  const [state, sp] = await Promise.all([metaIntegrationState(user), searchParams]);
  return (
    <>
      {back}
      <PageHeader title="Integrações" description="Conexões com plataformas externas. Credenciais ficam só no servidor e tokens são guardados cifrados." />
      <MetaIntegration
        data={JSON.parse(JSON.stringify(state)) as MetaIntegrationData}
        notice={{ connected: sp.conectado, error: sp.erro, detail: sp.detalhe?.slice(0, 300) }}
      />
    </>
  );
}
