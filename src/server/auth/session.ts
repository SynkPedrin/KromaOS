import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { generateToken, hashToken } from "./crypto";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "kroma_session";
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;
const DAY = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  canViewFinance: boolean;
  avatarColor: string;
};

export async function createSession(userId: string) {
  const token = generateToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      ip: clientIp(h),
    },
  });
  await setSessionCookie(token, expiresAt);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/**
 * Lê e valida a sessão atual. Memoizado por requisição com React.cache.
 * Retorna null quando não há sessão válida ou o usuário foi desativado.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          jobTitle: true,
          canViewFinance: true,
          avatarColor: true,
          active: true,
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  // Renovação deslizante: só grava quando a sessão está na metade final da validade.
  if (session.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * DAY) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
    await db.session.update({ where: { id: session.id }, data: { expiresAt } });
    try {
      await setSessionCookie(token, expiresAt);
    } catch {
      // Em Server Components não é possível gravar cookies; a renovação do banco basta.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { active, ...user } = session.user;
  return user;
});

/** Para páginas e Server Actions: redireciona ao login se não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
