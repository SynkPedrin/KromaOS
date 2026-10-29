import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldAlert } from "lucide-react";
import { AuthFrame } from "@/components/brand/auth-frame";
import { GlassCard } from "@/components/ui/display";
import { AcceptInviteForm } from "@/components/auth-forms";
import { getInvitationByToken } from "@/server/services/team";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvitationByToken(token);

  return (
    <AuthFrame>
      <GlassCard className="glass-strong rounded-3xl p-7 sm:p-8">
        {inv.state === "valid" ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">Olá, {inv.name.split(" ")[0]}!</h1>
            <p className="mb-6 mt-1 text-sm text-ink-2">
              Você foi convidado para o KROMA OS{inv.jobTitle ? ` como ${inv.jobTitle}` : ""}. Válido até {formatDateTime(inv.expiresAt)}.
            </p>
            <AcceptInviteForm token={token} name={inv.name} email={inv.email} />
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-purple-50 text-purple">
              {inv.state === "expired" ? <Clock className="size-5" /> : <ShieldAlert className="size-5" />}
            </div>
            <h1 className="text-lg font-bold">
              {inv.state === "expired" ? "Este convite expirou" : inv.state === "used" ? "Convite já utilizado" : "Convite inválido"}
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              {inv.state === "used"
                ? "Sua conta já foi criada. É só entrar com seu e-mail e senha."
                : "Peça a um administrador para enviar um novo convite."}
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-purple hover:underline">
              Ir para o login
            </Link>
          </div>
        )}
      </GlassCard>
    </AuthFrame>
  );
}
