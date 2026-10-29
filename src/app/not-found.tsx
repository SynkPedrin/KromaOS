import Link from "next/link";
import { AuthFrame } from "@/components/brand/auth-frame";
import { GlassCard } from "@/components/ui/display";

export default function NotFound() {
  return (
    <AuthFrame>
      <GlassCard className="glass-strong rounded-3xl p-8 text-center">
        <p className="font-display text-4xl font-semibold text-purple">404</p>
        <h1 className="mt-2 text-lg font-bold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-ink-2">O endereço não existe ou você não tem acesso a ele.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-purple hover:underline">
          Voltar ao Dashboard
        </Link>
      </GlassCard>
    </AuthFrame>
  );
}
