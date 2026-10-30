import "server-only";
import { env, metaRedirectUri } from "@/server/env";
import { hmac, safeEqual } from "@/server/auth/crypto";
import { appAccessToken, graphGet, MetaApiError } from "./graph";

/** Somente leitura nesta versão: nada de ads_management. */
export const META_SCOPES = ["ads_read"] as const;

export const OAUTH_COOKIE = "kroma_meta_oauth";
export const OAUTH_COOKIE_PATH = "/api/integrations/meta";
export const OAUTH_TTL_SECONDS = 600;

/**
 * O valor do cookie amarra o `state` à sessão que iniciou o fluxo: no callback, o mesmo
 * state só é aceito com o mesmo cookie de sessão (proteção contra CSRF e troca de sessão).
 */
export function oauthBinding(state: string, sessionToken: string) {
  return hmac(env().AUTH_SECRET, `meta-oauth:${state}:${sessionToken}`);
}

export function verifyOAuthState(state: string | null, cookie: string | undefined, sessionToken: string | undefined) {
  if (!state || !cookie || !sessionToken || state.length < 20) return false;
  return safeEqual(cookie, oauthBinding(state, sessionToken));
}

export function buildAuthorizeUrl(state: string) {
  const e = env();
  const url = new URL(`https://www.facebook.com/${e.META_GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", e.META_APP_ID!);
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (e.META_LOGIN_CONFIG_ID) url.searchParams.set("config_id", e.META_LOGIN_CONFIG_ID);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

type TokenResponse = { access_token: string; token_type?: string; expires_in?: number };

export async function exchangeCodeForToken(code: string) {
  const e = env();
  return graphGet<TokenResponse>(
    "oauth/access_token",
    { client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, redirect_uri: metaRedirectUri(), code },
    null,
  );
}

/** Token de usuário de longa duração (cerca de 60 dias). Não é renovável sem novo login. */
export async function exchangeForLongLivedToken(shortToken: string) {
  const e = env();
  return graphGet<TokenResponse>(
    "oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, fb_exchange_token: shortToken },
    null,
  );
}

export type TokenInfo = {
  isValid: boolean;
  appId: string | null;
  userId: string | null;
  scopes: string[];
  expiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
};

const epoch = (s?: number) => (s ? new Date(s * 1000) : null);

/** Valida o token com o token do app (debug_token). */
export async function inspectToken(token: string): Promise<TokenInfo> {
  const { data } = await graphGet<{
    data: { is_valid?: boolean; app_id?: string; user_id?: string; scopes?: string[]; expires_at?: number; data_access_expires_at?: number };
  }>("debug_token", { input_token: token }, appAccessToken());
  return {
    isValid: Boolean(data?.is_valid),
    appId: data?.app_id ?? null,
    userId: data?.user_id ?? null,
    scopes: data?.scopes ?? [],
    // expires_at = 0 significa token sem expiração (ex.: usuário do sistema).
    expiresAt: epoch(data?.expires_at),
    dataAccessExpiresAt: epoch(data?.data_access_expires_at),
  };
}

export function assertTokenForThisApp(info: TokenInfo) {
  if (!info.isValid) throw new MetaApiError("Token inválido", "auth", 190);
  if (info.appId !== env().META_APP_ID) throw new MetaApiError("Token emitido para outro app", "auth", 190);
}
