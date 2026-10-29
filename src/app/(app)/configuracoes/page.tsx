import type { Metadata } from "next";
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
      <PageHeader title="Configurações" description="Seu perfil, sua senha e o estado do sistema." />
      <SettingsView system={system} />
    </>
  );
}
