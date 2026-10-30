import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { assertAdmin, type Actor } from "@/server/auth/permissions";
import { AppError, invalid, notFound } from "@/server/errors";
import { env, isMetaConfigured, metaMissingConfig, metaRedirectUri } from "@/server/env";
import { appSecretProof, friendlyMetaError, graphBase, graphGet, graphPaginate, MetaApiError } from "@/server/meta/graph";
import { assertTokenForThisApp, exchangeCodeForToken, exchangeForLongLivedToken, inspectToken, META_SCOPES } from "@/server/meta/oauth";
import { decryptToken, encryptToken } from "@/server/meta/token-crypto";
import type { MetaConnectionStatus } from "@/generated/prisma/enums";

/** "1455…" ou "act_1455…" → "act_1455…". */
export function normalizeAdAccountId(id: string) {
  const digits = id.trim().replace(/^act_/, "");
  if (!/^\d{5,25}$/.test(digits)) throw invalid("ID de conta de anúncios inválido.");
  return `act_${digits}`;
}

type RawAdAccount = {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
  disable_reason?: number;
  business_name?: string;
};

const ACCOUNT_FIELDS = "id,name,currency,timezone_name,account_status,disable_reason,business_name";

const accountData = (a: RawAdAccount) => ({
  name: a.name || a.id,
  currency: a.currency ?? "BRL",
  timezone: a.timezone_name ?? "America/Sao_Paulo",
  accountStatus: a.account_status ?? null,
  disableReason: a.disable_reason ?? null,
  businessName: a.business_name ?? null,
});

function statusForError(e: unknown): MetaConnectionStatus {
  if (e instanceof MetaApiError) {
    if (e.kind === "auth") return e.subcode === 463 || e.subcode === 467 ? "EXPIRED" : "REVOKED";
    if (e.kind === "permission") return "PERMISSION_DENIED";
  }
  return "ERROR";
}

/**
 * Conclui o OAuth: troca o código por token, obtém o de longa duração, valida no debug_token
 * (app e permissões), grava cifrado e descobre as contas de anúncios acessíveis.
 */
export async function completeMetaOAuth(actor: Actor, code: string) {
  assertAdmin(actor);
  if (!isMetaConfigured()) throw invalid(`Integração sem configuração: ${metaMissingConfig().join(", ")}.`);

  const short = await exchangeCodeForToken(code);
  // Se a troca por token longo falhar, seguimos com o curto (expira em poucas horas, e a tela avisa).
  const long = await exchangeForLongLivedToken(short.access_token).catch(() => null);
  const token = long?.access_token ?? short.access_token;

  const info = await inspectToken(token);
  assertTokenForThisApp(info);
  const me = await graphGet<{ id: string; name?: string }>("me", { fields: "id,name" }, token);
  const missing = META_SCOPES.filter((s) => !info.scopes.includes(s));
  const expiresIn = long?.expires_in ?? short.expires_in;

  const connection = await db.metaConnection.upsert({
    where: { metaUserId: me.id },
    create: {
      metaUserId: me.id,
      metaUserName: me.name ?? null,
      encryptedAccessToken: encryptToken(token),
      tokenExpiresAt: info.expiresAt ?? (expiresIn ? new Date(Date.now() + expiresIn * 1000) : null),
      dataAccessExpiresAt: info.dataAccessExpiresAt,
      scopes: info.scopes,
      status: missing.length ? "PERMISSION_DENIED" : "CONNECTED",
      connectedById: actor.id,
      lastValidatedAt: new Date(),
      lastError: missing.length ? `Permissão não concedida: ${missing.join(", ")}` : null,
    },
    update: {
      metaUserName: me.name ?? null,
      encryptedAccessToken: encryptToken(token),
      tokenExpiresAt: info.expiresAt ?? (expiresIn ? new Date(Date.now() + expiresIn * 1000) : null),
      dataAccessExpiresAt: info.dataAccessExpiresAt,
      scopes: info.scopes,
      status: missing.length ? "PERMISSION_DENIED" : "CONNECTED",
      connectedById: actor.id,
      lastValidatedAt: new Date(),
      lastError: missing.length ? `Permissão não concedida: ${missing.join(", ")}` : null,
    },
  });
  if (missing.length) return { connectionId: connection.id, accounts: 0, missingScopes: missing };

  const accounts = await discoverAdAccounts(connection.id, token);
  return { connectionId: connection.id, accounts, missingScopes: [] as string[] };
}

/** Lista (com paginação) as contas que o usuário conectado acessa e registra/atualiza no banco. */
async function discoverAdAccounts(connectionId: string, token: string) {
  const list = await graphPaginate<RawAdAccount>("me/adaccounts", { fields: ACCOUNT_FIELDS, limit: 100 }, token);
  for (const a of list) {
    if (!/^(act_)?\d{5,25}$/.test(a.id)) continue;
    const externalId = normalizeAdAccountId(a.id);
    await db.metaAdAccount.upsert({
      where: { externalId },
      create: { externalId, connectionId, ...accountData(a) },
      // Vínculo com cliente e habilitação são decisões do administrador: não mudam aqui.
      update: { connectionId, ...accountData(a) },
    });
  }
  return list.length;
}

export async function connectionToken(connectionId: string) {
  const c = await db.metaConnection.findUnique({ where: { id: connectionId } });
  if (!c?.encryptedAccessToken || c.status === "DISCONNECTED") throw new AppError("Conexão com a Meta desconectada.", "CONFLICT");
  return decryptToken(c.encryptedAccessToken);
}

/** Revalida o token (debug_token) e atualiza o status; usado na tela de integrações. */
export async function validateConnection(connectionId: string) {
  const c = await db.metaConnection.findUnique({ where: { id: connectionId } });
  if (!c?.encryptedAccessToken || c.status === "DISCONNECTED") return c;
  try {
    const info = await inspectToken(decryptToken(c.encryptedAccessToken));
    const missing = META_SCOPES.filter((s) => !info.scopes.includes(s));
    const status: MetaConnectionStatus = !info.isValid
      ? info.expiresAt && info.expiresAt < new Date()
        ? "EXPIRED"
        : "REVOKED"
      : missing.length
        ? "PERMISSION_DENIED"
        : c.status === "ERROR"
          ? "ERROR"
          : "CONNECTED";
    return db.metaConnection.update({
      where: { id: c.id },
      data: {
        status,
        scopes: info.scopes,
        tokenExpiresAt: info.expiresAt,
        dataAccessExpiresAt: info.dataAccessExpiresAt,
        lastValidatedAt: new Date(),
        lastError: status === "CONNECTED" ? null : status === "PERMISSION_DENIED" ? `Permissão não concedida: ${missing.join(", ")}` : c.lastError,
      },
    });
  } catch (e) {
    // Falha da própria Meta não derruba a conexão; só registra.
    return db.metaConnection.update({ where: { id: c.id }, data: { lastValidatedAt: new Date(), lastError: friendlyMetaError(e) } });
  }
}

/** Marca a conexão conforme o erro recebido em uma sincronização. */
export async function markConnectionError(connectionId: string, e: unknown) {
  const status = statusForError(e);
  if (status === "ERROR") return;
  await db.metaConnection.update({ where: { id: connectionId }, data: { status, lastError: friendlyMetaError(e) } });
}

/** Atualiza a lista de contas de uma conexão já existente. */
export async function refreshAdAccounts(actor: Actor, connectionId: string) {
  assertAdmin(actor);
  const token = await connectionToken(connectionId);
  try {
    return await discoverAdAccounts(connectionId, token);
  } catch (e) {
    await markConnectionError(connectionId, e);
    throw new AppError(friendlyMetaError(e), "CONFLICT");
  }
}

/** Desconecta: tenta revogar na Meta (melhor esforço) e apaga o token. Os dados já sincronizados ficam. */
export async function disconnectMeta(actor: Actor, connectionId: string) {
  assertAdmin(actor);
  const c = await db.metaConnection.findUnique({ where: { id: connectionId } });
  if (!c) throw notFound("Conexão");
  if (c.encryptedAccessToken) {
    try {
      const token = decryptToken(c.encryptedAccessToken);
      await fetch(`${graphBase()}/me/permissions?appsecret_proof=${appSecretProof(token)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // A revogação remota é opcional; o token local é apagado de qualquer forma.
    }
  }
  await db.metaConnection.update({
    where: { id: c.id },
    data: { status: "DISCONNECTED", encryptedAccessToken: null, tokenExpiresAt: null, lastError: null },
  });
}

const linkSchema = z.object({
  accountId: z.string().min(1),
  clientId: z.string().min(1).nullable(),
  move: z.boolean().optional(),
});

/**
 * Vincula (ou desvincula, com clientId null) uma conta a um cliente do KROMA OS.
 * Uma conta pertence a um único cliente; trocar de cliente exige confirmação explícita (move).
 */
export async function linkAdAccount(actor: Actor, input: z.input<typeof linkSchema>) {
  assertAdmin(actor);
  const d = linkSchema.parse(input);
  const account = await db.metaAdAccount.findUnique({ where: { id: d.accountId }, include: { client: { select: { name: true } } } });
  if (!account) throw notFound("Conta de anúncios");
  if (d.clientId) {
    const client = await db.client.findFirst({ where: { id: d.clientId, archivedAt: null }, select: { id: true } });
    if (!client) throw notFound("Cliente");
    if (account.clientId && account.clientId !== d.clientId && !d.move) {
      throw new AppError(`Esta conta já está vinculada a ${account.client?.name ?? "outro cliente"}. Confirme para mover.`, "CONFLICT");
    }
  }
  return db.metaAdAccount.update({
    where: { id: account.id },
    data: { clientId: d.clientId, enabled: Boolean(d.clientId) },
  });
}

/** Estado da integração para a tela de configurações (sem tokens). */
export async function metaIntegrationState(actor: Actor) {
  assertAdmin(actor);
  const stale = await db.metaConnection.findMany({
    where: { status: { not: "DISCONNECTED" }, OR: [{ lastValidatedAt: null }, { lastValidatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }] },
    select: { id: true },
  });
  if (isMetaConfigured()) await Promise.all(stale.map((c) => validateConnection(c.id)));

  const [connections, accounts, clients, lastJobs] = await Promise.all([
    db.metaConnection.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        metaUserName: true,
        metaUserId: true,
        scopes: true,
        tokenExpiresAt: true,
        dataAccessExpiresAt: true,
        lastValidatedAt: true,
        lastError: true,
        connectedById: true,
        createdAt: true,
        _count: { select: { adAccounts: true } },
      },
    }),
    db.metaAdAccount.findMany({
      orderBy: [{ clientId: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      include: { client: { select: { id: true, name: true, logoFileId: true } } },
    }),
    db.client.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.metaSyncJob.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { adAccount: { select: { name: true } } } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: connections.map((c) => c.connectedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const e = env();
  const initial = e.META_INITIAL_AD_ACCOUNT_ID ? normalizeAdAccountId(e.META_INITIAL_AD_ACCOUNT_ID) : null;
  return {
    configured: isMetaConfigured(),
    missingConfig: metaMissingConfig(),
    redirectUri: metaRedirectUri(),
    apiVersion: e.META_GRAPH_API_VERSION,
    initialAccountId: initial,
    connections: connections.map((c) => ({ ...c, connectedBy: users.find((u) => u.id === c.connectedById)?.name ?? null })),
    accounts,
    clients,
    lastJobs,
  };
}
