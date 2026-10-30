import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { emailProvider, env } from "@/server/env";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TZ = "America/Sao_Paulo";

/** Moldura comum dos e-mails: marca, título, corpo, botão e rodapé. */
function layout(p: { title: string; heading: string; body: string; cta?: { label: string; url: string }; footnote?: string }) {
  const logo = `${env().APP_URL}/brand/kroma-k.png`;
  const cta = p.cta
    ? `<tr><td style="padding:12px 40px 8px">
          <a href="${escapeHtml(p.cta.url)}" style="display:inline-block;background:#7625F5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px">${escapeHtml(p.cta.label)}</a>
        </td></tr>`
    : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(p.title)}</title></head>
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
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700">${p.heading}</h1>
          ${p.body}
        </td></tr>
        ${cta}
        <tr><td style="padding:16px 40px 32px">${p.footnote ?? ""}</td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #f0edf5;font-size:12px;color:#9A94A3">KROMA — Sua marca em outra frequência.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function inviteEmailHtml(p: { name: string; inviterName: string; url: string; expiresAt: Date }) {
  const url = escapeHtml(p.url);
  const expires = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: TZ }).format(p.expiresAt);
  return layout({
    title: "Convite KROMA OS",
    heading: `Olá, ${escapeHtml(p.name)}!`,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4552">${escapeHtml(p.inviterName)} convidou você para a central de operações da <strong>KROMA</strong>. É por aqui que a equipe organiza tarefas, conteúdos, aprovações e entregas.</p>`,
    cta: { label: "Aceitar convite", url: p.url },
    footnote: `<p style="margin:0 0 8px;font-size:13px;color:#77717F">Este convite é pessoal e expira em <strong>${expires}</strong>.</p>
          <p style="margin:0;font-size:12px;color:#9A94A3;word-break:break-all">Se o botão não funcionar, copie este endereço: ${url}</p>`,
  });
}

export type EventEmail = {
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  clientName: string | null;
  organizerName: string;
  attendeeNames: string[];
  url: string;
};

/** "quinta-feira, 14 de novembro de 2030 · 14:00–16:00" no fuso da agência. */
export function eventWhen(e: Pick<EventEmail, "startsAt" | "endsAt" | "allDay">) {
  const day = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: e.allDay ? "UTC" : TZ }).format(e.startsAt);
  if (e.allDay) return `${day} · dia inteiro`;
  const t = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TZ }).format(d);
  return `${day} · ${t(e.startsAt)}${e.endsAt ? `–${t(e.endsAt)}` : ""} (horário de Brasília)`;
}

export function eventEmailHtml(name: string, e: EventEmail) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;font-size:13px;color:#77717F;width:110px;vertical-align:top">${label}</td><td style="padding:6px 0;font-size:14px;color:#17141D">${value}</td></tr>`;
  const location = e.location
    ? /^https?:\/\//i.test(e.location)
      ? `<a href="${escapeHtml(e.location)}" style="color:#7625F5">${escapeHtml(e.location)}</a>`
      : escapeHtml(e.location)
    : null;
  const rows = [
    row("Quando", escapeHtml(eventWhen(e))),
    location ? row("Local", location) : "",
    e.clientName ? row("Cliente", escapeHtml(e.clientName)) : "",
    e.attendeeNames.length ? row("Participantes", escapeHtml(e.attendeeNames.join(", "))) : "",
    e.notes ? row("Observações", escapeHtml(e.notes).replace(/\n/g, "<br>")) : "",
  ].join("");
  return layout({
    title: e.title,
    heading: escapeHtml(e.title),
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4552">Olá, ${escapeHtml(name)}! ${escapeHtml(e.organizerName)} adicionou você a este evento.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 8px;border-top:1px solid #f0edf5;border-bottom:1px solid #f0edf5">${rows}</table>`,
    cta: { label: "Ver no calendário", url: e.url },
    footnote: `<p style="margin:0;font-size:12px;color:#9A94A3">O arquivo anexo (.ics) adiciona o evento à sua agenda do Google, Apple ou Outlook.</p>`,
  });
}

/** Arquivo iCalendar (RFC 5545) para o convidado salvar o evento na própria agenda. */
export function eventIcs(uid: string, e: EventEmail) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const next = new Date(e.startsAt.getTime() + 86_400_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KROMA//KROMA OS//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@kroma-os`,
    `DTSTAMP:${stamp(new Date())}`,
    ...(e.allDay
      ? [`DTSTART;VALUE=DATE:${ymd(e.startsAt)}`, `DTEND;VALUE=DATE:${ymd(next)}`]
      : [`DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt ?? new Date(e.startsAt.getTime() + 3_600_000))}`]),
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    `DESCRIPTION:${text([e.clientName ? `Cliente: ${e.clientName}` : "", e.notes ?? "", e.url].filter(Boolean).join("\n"))}`,
    `URL:${e.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "failed"; message?: string };

type Mail = { to: string; subject: string; html: string; text: string; attachments?: { filename: string; content: string; contentType: string }[] };

let smtp: Transporter | null = null;

/** Envia por SMTP (Gmail) ou Resend. Nunca registra credenciais em logs. */
export async function sendEmail(m: Mail): Promise<SendResult> {
  const provider = emailProvider();
  if (!provider) return { sent: false, reason: "not_configured" };
  const e = env();
  try {
    if (provider === "smtp") {
      smtp ??= nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_PORT === 465,
        auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
      });
      await smtp.sendMail({ from: e.SMTP_FROM || `KROMA OS <${e.SMTP_USER}>`, ...m });
      return { sent: true };
    }
    const { error } = await new Resend(e.RESEND_API_KEY).emails.send({
      from: e.RESEND_FROM_EMAIL!,
      ...m,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), contentType: a.contentType })),
    });
    if (error) return { sent: false, reason: "failed", message: error.message?.slice(0, 200) };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: "failed", message: err instanceof Error ? err.message.slice(0, 200) : "Erro desconhecido" };
  }
}

export function sendInviteEmail(p: { to: string; name: string; inviterName: string; url: string; expiresAt: Date }): Promise<SendResult> {
  return sendEmail({
    to: p.to,
    subject: "Você foi convidado para o KROMA OS",
    html: inviteEmailHtml(p),
    text: `Olá, ${p.name}! ${p.inviterName} convidou você para o KROMA OS. Aceite o convite: ${p.url} (válido até ${p.expiresAt.toLocaleString("pt-BR", { timeZone: TZ })}).`,
  });
}

export function sendEventEmail(to: { email: string; name: string }, uid: string, e: EventEmail): Promise<SendResult> {
  return sendEmail({
    to: to.email,
    subject: `Novo evento: ${e.title} — ${eventWhen(e)}`,
    html: eventEmailHtml(to.name, e),
    text: `Olá, ${to.name}! ${e.organizerName} adicionou você ao evento "${e.title}" (${eventWhen(e)}).${e.location ? ` Local: ${e.location}.` : ""} Ver no calendário: ${e.url}`,
    attachments: [{ filename: "evento.ics", content: eventIcs(uid, e), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
  });
}
