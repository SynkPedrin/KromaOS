import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { assertManager, isAdmin, type Actor } from "@/server/auth/permissions";
import { dummyPasswordHash, generateToken, hashPassword, hashToken, verifyPassword } from "@/server/auth/crypto";
import { enforceRateLimit } from "@/server/rate-limit";
import { AppError, forbidden, invalid, notFound } from "@/server/errors";
import { sendInviteEmail, type SendResult } from "@/server/email";
import {
  acceptInviteSchema,
  changePasswordSchema,
  inviteSchema,
  loginSchema,
  memberUpdateSchema,
  profileSchema,
  setupSchema,
  type InviteInput,
} from "@/lib/schemas";

const INVITE_DAYS = 7;
const AVATAR_COLORS = ["#7625F5", "#A855F7", "#5B6BF5", "#D946A8", "#3E9B12", "#E08A00", "#111015"];
const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

// ─────────────────────────────── Login ───────────────────────────────

/**
 * Valida credenciais com rate limit por IP e por e-mail.
 * Mensagem genérica para não revelar quais e-mails existem.
 */
export async function authenticate(input: { email: string; password: string }, ip: string) {
  const { email, password } = loginSchema.parse(input);
  await enforceRateLimit(`login:ip:${ip}`, 20, 15 * 60);
  await enforceRateLimit(`login:email:${email}`, 8, 15 * 60);
  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !ok || !user.active) throw new AppError("E-mail ou senha incorretos.", "UNAUTHORIZED");
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export const hasAnyUser = async () => (await db.user.count()) > 0;

/** Cria o primeiro administrador. Só funciona enquanto não existir nenhum usuário. */
export async function createFirstAdmin(input: { name: string; email: string; password: string; jobTitle?: string | null }) {
  const data = setupSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(
    async (tx) => {
      if ((await tx.user.count()) > 0) throw forbidden("A configuração inicial já foi concluída.");
      return tx.user.create({
        data: { name: data.name, email: data.email, jobTitle: data.jobTitle, passwordHash, role: "ADMIN", canViewFinance: true, lastLoginAt: new Date() },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

// ─────────────────────────────── Equipe ───────────────────────────────

export function listMembers() {
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      canViewFinance: true,
      avatarColor: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      clientMemberships: { select: { client: { select: { id: true, name: true } } } },
      _count: { select: { assignedTasks: { where: { archivedAt: null, status: { not: "DONE" } } } } },
    },
  });
}

/** Usuários ativos para seleção de responsável e menções. */
export function userOptions() {
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, avatarColor: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Regras: gestores gerenciam membros; só administradores criam/alteram administradores,
 * concedem acesso financeiro ou alteram gestores. Ninguém se rebaixa ou se desativa.
 */
export async function updateMember(actor: Actor, userId: string, input: { role: string; jobTitle?: string | null; canViewFinance: boolean; active: boolean }) {
  assertManager(actor);
  const data = memberUpdateSchema.parse(input);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("Membro");
  if (userId === actor.id && (data.role !== target.role || !data.active)) {
    throw invalid("Você não pode alterar o próprio papel ou se desativar.");
  }
  if (!isAdmin(actor)) {
    if (target.role !== "MEMBER" || data.role !== "MEMBER") throw forbidden("Apenas administradores alteram gestores e administradores.");
    if (data.canViewFinance !== target.canViewFinance) throw forbidden("Apenas administradores concedem acesso financeiro.");
  }
  if (target.role === "ADMIN" && (data.role !== "ADMIN" || !data.active)) {
    const admins = await db.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) throw invalid("É preciso manter ao menos um administrador ativo.");
  }
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      role: data.role,
      jobTitle: data.jobTitle,
      canViewFinance: data.role === "ADMIN" ? true : data.role === "MANAGER" ? data.canViewFinance : false,
      active: data.active,
    },
  });
  // Desativar encerra as sessões imediatamente.
  if (!data.active) await db.session.deleteMany({ where: { userId } });
  return updated;
}

export async function updateProfile(actor: Actor, input: { name: string; jobTitle?: string | null; avatarColor: string }) {
  const data = profileSchema.parse(input);
  return db.user.update({ where: { id: actor.id }, data });
}

export async function changePassword(actor: Actor, input: { current: string; next: string }, currentTokenHash?: string) {
  const data = changePasswordSchema.parse(input);
  await enforceRateLimit(`pwd:${actor.id}`, 5, 15 * 60);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(data.current, user.passwordHash))) throw invalid("Senha atual incorreta.");
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(data.next) } });
  // Encerra as demais sessões do usuário.
  await db.session.deleteMany({ where: { userId: actor.id, ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}) } });
}

// ─────────────────────────────── Convites ───────────────────────────────

export function listInvitations() {
  return db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { name: true } } },
  });
}

function assertCanGrant(actor: Actor, role: string, canViewFinance: boolean) {
  assertManager(actor);
  if (!isAdmin(actor) && (role !== "MEMBER" || canViewFinance)) {
    throw forbidden("Gestores só podem convidar membros sem acesso financeiro.");
  }
}

export type InviteOutcome = { invitationId: string; email: SendResult; acceptUrl: string | null };

async function deliver(invitationId: string, token: string, inviterName: string): Promise<InviteOutcome> {
  const inv = await db.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  const url = `${env().APP_URL}/convite/${token}`;
  const email = await sendInviteEmail({ to: inv.email, name: inv.name, inviterName, url, expiresAt: inv.expiresAt });
  await db.invitation.update({
    where: { id: invitationId },
    data: {
      sendCount: { increment: email.sent ? 1 : 0 },
      lastSentAt: email.sent ? new Date() : inv.lastSentAt,
      lastError: email.sent ? null : email.reason === "not_configured" ? "Resend não configurado" : (email.message ?? "Falha no envio"),
    },
  });
  // Sem e-mail configurado, o administrador recebe o link para compartilhar manualmente.
  return { invitationId, email, acceptUrl: email.sent ? null : url };
}

export async function createInvitation(actor: Actor & { name: string }, input: InviteInput) {
  const data = inviteSchema.parse(input);
  assertCanGrant(actor, data.role, data.canViewFinance);
  await enforceRateLimit(`invite:${actor.id}`, 20, 60 * 60, "Limite de convites por hora atingido.");

  const existingUser = await db.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw invalid("Já existe uma conta com este e-mail.");

  const token = generateToken();
  const inv = await db.$transaction(async (tx) => {
    // Um convite pendente por e-mail: os anteriores são revogados.
    await tx.invitation.updateMany({
      where: { email: data.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.invitation.create({
      data: {
        email: data.email,
        name: data.name,
        jobTitle: data.jobTitle,
        role: data.role,
        canViewFinance: data.role === "ADMIN" ? true : data.role === "MANAGER" ? data.canViewFinance : false,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        invitedById: actor.id,
      },
    });
  });
  return deliver(inv.id, token, actor.name);
}

/** Reenvio gera um novo token (o anterior deixa de valer) e renova a validade. */
export async function resendInvitation(actor: Actor & { name: string }, invitationId: string) {
  const inv = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.acceptedAt || inv.revokedAt) throw notFound("Convite");
  assertCanGrant(actor, inv.role, inv.canViewFinance);
  await enforceRateLimit(`invite-resend:${invitationId}`, 3, 60 * 60, "Este convite já foi reenviado várias vezes. Aguarde.");
  const token = generateToken();
  await db.invitation.update({
    where: { id: invitationId },
    data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  return deliver(invitationId, token, actor.name);
}

export async function revokeInvitation(actor: Actor, invitationId: string) {
  assertManager(actor);
  const inv = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.acceptedAt) throw notFound("Convite");
  await db.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
}

export type InvitationState =
  | { state: "valid"; name: string; email: string; jobTitle: string | null; expiresAt: Date }
  | { state: "expired" | "used" | "invalid" };

export async function getInvitationByToken(token: string): Promise<InvitationState> {
  if (!token || token.length < 20) return { state: "invalid" };
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.revokedAt) return { state: "invalid" };
  if (inv.acceptedAt) return { state: "used" };
  if (inv.expiresAt < new Date()) return { state: "expired" };
  return { state: "valid", name: inv.name, email: inv.email, jobTitle: inv.jobTitle, expiresAt: inv.expiresAt };
}

/**
 * Aceita o convite: cria a conta (ou reativa/vincula uma conta existente com o mesmo e-mail)
 * e invalida o token na mesma transação — uso único garantido pelo update condicional.
 */
export async function acceptInvitation(input: { token: string; name: string; password: string }, ip: string) {
  const data = acceptInviteSchema.parse(input);
  await enforceRateLimit(`accept:${ip}`, 10, 15 * 60);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { tokenHash: hashToken(data.token) } });
    if (!inv || inv.revokedAt) throw invalid("Convite inválido.");
    if (inv.acceptedAt) throw invalid("Este convite já foi utilizado.");
    if (inv.expiresAt < new Date()) throw invalid("Este convite expirou. Peça um novo ao administrador.");

    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid("Este convite já foi utilizado.");

    const existing = await tx.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      return tx.user.update({
        where: { id: existing.id },
        data: { name: data.name, passwordHash, active: true, role: inv.role, canViewFinance: inv.canViewFinance, jobTitle: inv.jobTitle ?? existing.jobTitle, lastLoginAt: new Date() },
      });
    }
    return tx.user.create({
      data: {
        name: data.name,
        email: inv.email,
        passwordHash,
        role: inv.role,
        jobTitle: inv.jobTitle,
        canViewFinance: inv.canViewFinance,
        avatarColor: randomColor(),
        lastLoginAt: new Date(),
      },
    });
  });
}
