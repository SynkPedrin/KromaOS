import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { generateToken } from "@/server/auth/crypto";
import { env, isMetaConfigured } from "@/server/env";
import { buildAuthorizeUrl, OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_TTL_SECONDS, oauthBinding } from "@/server/meta/oauth";

const SETTINGS = "/configuracoes/integracoes/meta";

/** Inicia o OAuth da Meta: só administradores, com state amarrado à sessão atual. */
export async function GET() {
  const base = env().APP_URL;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${SETTINGS}`, base));
  if (!isAdmin(user)) return NextResponse.redirect(new URL(`${SETTINGS}?erro=permissao`, base));
  if (!isMetaConfigured()) return NextResponse.redirect(new URL(`${SETTINGS}?erro=configuracao`, base));

  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.redirect(new URL(`/login?next=${SETTINGS}`, base));
  const state = generateToken(24);
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(OAUTH_COOKIE, oauthBinding(state, session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_TTL_SECONDS,
  });
  return res;
}
