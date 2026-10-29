import "server-only";
import { Resend } from "resend";
import { env, isEmailConfigured } from "@/server/env";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function inviteEmailHtml(p: { name: string; inviterName: string; url: string; expiresAt: Date }) {
  const name = escapeHtml(p.name);
  const inviter = escapeHtml(p.inviterName);
  const url = escapeHtml(p.url);
  const expires = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(p.expiresAt);
  const logo = `${env().APP_URL}/brand/kroma-k.png`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Convite KROMA OS</title></head>
<body style="margin:0;padding:0;background:#F4F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#17141D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#efe6ff 0%,#F4F2F7 45%,#f3ffd6 100%);padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;border:1px solid #ece8f3;box-shadow:0 12px 40px rgba(30,20,50,.08)">
        <tr><td style="padding:36px 40px 8px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td><img src="${logo}" width="44" height="44" alt="KROMA" style="display:block;border-radius:12px"></td>
            <td style="padding-left:12px;font-size:20px;font-weight:800;letter-spacing:.14em">KROMA<span style="color:#7625F5"> OS</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 40px 0">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700">Olá, ${name}!</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4552">${inviter} convidou você para a central de operações da <strong>KROMA</strong>. É por aqui que a equipe organiza tarefas, conteúdos, aprovações e entregas.</p>
        </td></tr>
        <tr><td style="padding:12px 40px 8px">
          <a href="${url}" style="display:inline-block;background:#7625F5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px">Aceitar convite</a>
        </td></tr>
        <tr><td style="padding:16px 40px 32px">
          <p style="margin:0 0 8px;font-size:13px;color:#77717F">Este convite é pessoal e expira em <strong>${expires}</strong>.</p>
          <p style="margin:0;font-size:12px;color:#9A94A3;word-break:break-all">Se o botão não funcionar, copie este endereço: ${url}</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #f0edf5;font-size:12px;color:#9A94A3">KROMA — Sua marca em outra frequência.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "failed"; message?: string };

/** Envia o convite pelo Resend. Nunca registra a chave de API em logs. */
export async function sendInviteEmail(p: { to: string; name: string; inviterName: string; url: string; expiresAt: Date }): Promise<SendResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not_configured" };
  const resend = new Resend(env().RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({
      from: env().RESEND_FROM_EMAIL!,
      to: p.to,
      subject: "Você foi convidado para o KROMA OS",
      html: inviteEmailHtml(p),
      text: `Olá, ${p.name}! ${p.inviterName} convidou você para o KROMA OS. Aceite o convite: ${p.url} (válido até ${p.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}).`,
    });
    if (error) return { sent: false, reason: "failed", message: error.message?.slice(0, 200) };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "failed", message: e instanceof Error ? e.message.slice(0, 200) : "Erro desconhecido" };
  }
}
