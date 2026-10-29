import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GlassCard } from "@/components/ui/display";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { hasAnyUser } from "@/server/services/team";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  // Instalação nova: conduz à criação do primeiro administrador.
  if (!(await hasAnyUser())) redirect("/setup");
  return (
    <GlassCard className="glass-strong rounded-3xl p-7 sm:p-8">
      <h1 className="text-xl font-bold tracking-tight">Bem-vindo de volta</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">Entre para acessar a central de operações.</p>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-ink-3">Acesso apenas por convite. Esqueceu a senha? Fale com um administrador.</p>
    </GlassCard>
  );
}
