import type { Metadata } from "next";
import Link from "next/link";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { env, isEmailConfigured } from "@/server/env";
import { uploadLimits } from "@/server/services/files";
import { PageHeader } from "@/components/ui/display";
import { SettingsView, type SystemInfo } from "@/components/team/settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  // Só indicadores de status: nenhuma chave ou segredo é enviado ao navegador.
  const system: SystemInfo | null = isAdmin(user)
    ? {
        storageDriver: env().STORAGE_DRIVER,
        emailConfigured: isEmailConfigured(),
        appUrl: env().APP_URL,
        cronConfigured: Boolean(env().CRON_SECRET),
        limits: uploadLimits(),
      }
    : null;
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Seu perfil, sua senha e o estado do sistema."
        actions={
          isAdmin(user) ? (
            <Button variant="secondary" asChild>
              <Link href="/configuracoes/integracoes/meta">
                <Plug /> Integrações · Meta Ads
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SettingsView system={system} />
    </>
  );
}
