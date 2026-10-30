import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/server/env";

/**
 * Cliente HTTP mínimo da Graph API: appsecret_proof em toda chamada com token de usuário,
 * limite de concorrência, retry com backoff para falhas transitórias e limites de uso,
 * paginação por cursor e erros classificados. Tokens e URLs com parâmetros nunca vão para o log.
 */

export type MetaErrorKind = "auth" | "permission" | "rate_limit" | "transient" | "invalid";

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly kind: MetaErrorKind,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);

export function classifyMetaError(status: number, code?: number, subcode?: number): MetaErrorKind {
  if (code === 190 || code === 102) return "auth";
  if (code !== undefined && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80099))) return "rate_limit";
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299) || (code === 100 && subcode === 33)) return "permission";
  if (code === 1 || code === 2 || status >= 500) return "transient";
  return "invalid";
}

/** Mensagem segura para a interface (sem detalhes internos da Meta). */
export function friendlyMetaError(e: unknown): string {
  if (!(e instanceof MetaApiError)) return "Não foi possível falar com a Meta agora. Tente novamente em instantes.";
  switch (e.kind) {
    case "auth":
      return "A autorização da Meta expirou ou foi revogada. Reconecte a conta em Integrações.";
    case "permission":
      return "A Meta negou acesso a esta conta. Confira se o usuário conectado tem acesso à conta de anúncios e se a permissão ads_read foi concedida.";
    case "rate_limit":
      return "A Meta limitou temporariamente as consultas desta conta. Os dados serão atualizados na próxima tentativa.";
    case "transient":
      return "A Meta está instável no momento. Tente novamente em alguns minutos.";
    default:
      return "A Meta recusou a consulta. Verifique a configuração do app e tente novamente.";
  }
}

const MAX_CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = process.env.NODE_ENV === "test" ? 1 : 1000;
const TIMEOUT_MS = 30_000;

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export const graphBase = () => `https://graph.facebook.com/${env().META_GRAPH_API_VERSION}`;

export function appSecretProof(token: string) {
  const secret = env().META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET não configurado");
  return createHmac("sha256", secret).update(token).digest("hex");
}

type Params = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, params: Params) {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return url;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET na Graph API. `token` é um token de usuário (recebe appsecret_proof), o token do app ("id|secret")
 * ou null nas trocas de código OAuth, que levam client_secret nos próprios parâmetros.
 */
export async function graphGet<T>(path: string, params: Params, token: string | null): Promise<T> {
  const auth = token === null ? {} : { access_token: token, appsecret_proof: token.includes("|") ? undefined : appSecretProof(token) };
  const url = buildUrl(path, { ...params, ...auth });
  const label = path.split("?")[0];

  let lastError: MetaApiError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await withSlot(() => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }));
    } catch {
      lastError = new MetaApiError("Falha de rede ao consultar a Meta", "transient");
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number; error_subcode?: number } } | null;
    if (res.ok && body && !body.error) return body as T;

    const err = body?.error;
    const kind = classifyMetaError(res.status, err?.code, err?.error_subcode);
    lastError = new MetaApiError(err?.message ?? `HTTP ${res.status}`, kind, err?.code, err?.error_subcode, res.status);
    console.warn(`[meta] GET ${label} falhou (tentativa ${attempt}): ${kind} code=${err?.code ?? "-"} subcode=${err?.error_subcode ?? "-"}`);
    if ((kind === "transient" || kind === "rate_limit") && attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_MS * (kind === "rate_limit" ? 4 : 1) * 2 ** (attempt - 1));
      continue;
    }
    throw lastError;
  }
  throw lastError ?? new MetaApiError("Falha ao consultar a Meta", "transient");
}

type Page<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Percorre todas as páginas seguindo o cursor `after` enquanto a Meta indicar `next`. */
export async function graphPaginate<T>(path: string, params: Params, token: string, maxPages = 100): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body = await graphGet<Page<T>>(path, { ...params, after }, token);
    out.push(...(body.data ?? []));
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) return out;
  }
  console.warn(`[meta] GET ${path}: limite de ${maxPages} páginas atingido`);
  return out;
}

export const appAccessToken = () => {
  const e = env();
  if (!e.META_APP_ID || !e.META_APP_SECRET) throw new Error("App da Meta não configurado");
  return `${e.META_APP_ID}|${e.META_APP_SECRET}`;
};
