import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GlassCard } from "@/components/ui/display";
import { SetupForm } from "@/components/auth-forms";
import { hasAnyUser } from "@/server/services/team";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function SetupPage() {
  // Sempre no pedido: o estado "existe algum usuário?" não pode ser congelado no build.
  await connection();
  // Disponível apenas enquanto não houver nenhum usuário (o serviço também garante isso).
  if (await hasAnyUser()) redirect("/login");
  return (
    <GlassCard className="glass-strong rounded-3xl p-7 sm:p-8">
      <span className="inline-flex rounded-full bg-lime px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-lime-ink">Primeiro acesso</span>
      <h1 className="mt-3 text-xl font-bold tracking-tight">Crie a conta de administrador</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">Ela terá acesso completo. Depois você convida a equipe pelo menu Membros.</p>
      <SetupForm />
    </GlassCard>
  );
}
