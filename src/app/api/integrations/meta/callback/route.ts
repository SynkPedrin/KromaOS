import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { env } from "@/server/env";
import { friendlyMetaError, MetaApiError } from "@/server/meta/graph";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, verifyOAuthState } from "@/server/meta/oauth";
import { completeMetaOAuth } from "@/server/services/meta-connection";
import { AppError } from "@/server/errors";

const SETTINGS = "/configuracoes/integracoes/meta";

/** Retorno do OAuth da Meta: valida state + sessão, troca o código e descobre as contas. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`${SETTINGS}?${new URLSearchParams(params)}`, base));
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${SETTINGS}`, base));
  if (!isAdmin(user)) return back({ erro: "permissao" });

  const q = req.nextUrl.searchParams;
  const jar = await cookies();
  if (!verifyOAuthState(q.get("state"), jar.get(OAUTH_COOKIE)?.value, jar.get(SESSION_COOKIE)?.value)) return back({ erro: "estado" });
  // Usuário cancelou ou negou permissões no diálogo da Meta.
  if (q.get("error")) return back({ erro: "cancelado" });
  const code = q.get("code");
  if (!code) return back({ erro: "estado" });

  try {
    const r = await completeMetaOAuth(user, code);
    if (r.missingScopes.length) return back({ erro: "permissoes" });
    return back({ conectado: String(r.accounts) });
  } catch (e) {
    if (e instanceof MetaApiError) {
      console.warn(`[meta] OAuth falhou: ${e.kind} code=${e.code ?? "-"}`);
      return back({ erro: "meta", detalhe: friendlyMetaError(e) });
    }
    if (e instanceof AppError) return back({ erro: "meta", detalhe: e.message });
    console.error("[meta] OAuth falhou:", e instanceof Error ? e.name : e);
    return back({ erro: "meta" });
  }
}
