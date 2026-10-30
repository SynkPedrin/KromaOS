import "server-only";
import { db } from "@/server/db";
import { friendlyMetaError, graphGet, graphPaginate, MetaApiError } from "@/server/meta/graph";
import { connectionToken, markConnectionError, normalizeAdAccountId } from "@/server/services/meta-connection";
import { budgetToCents, describeCreative, moneyToCents, parseActions, parseActionValues, toInt } from "@/lib/ads/metrics";
import { shiftDays, todayInTz } from "@/lib/ads/periods";
import type { MetaInsightLevel, MetaSyncKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Sincronização Meta → banco. Lê entidades (campanhas, conjuntos, anúncios, criativos) e métricas
 * diárias por nível; as telas leem só do banco. Uma trava por conta evita sincronizações simultâneas.
 */

const LOCK_MINUTES = 10;
export const STALE_MINUTES = 30;

/** Janela de métricas diárias por tipo de sincronização (dias, incluindo hoje). */
const WINDOW_DAYS: Record<MetaSyncKind, number> = { INITIAL: 90, RECENT: 3, MANUAL: 3, RECONCILE: 28 };

const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,buying_type,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
const ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,destination_type,promoted_object,targeting,start_time,end_time";
const AD_FIELDS = "id,name,adset_id,campaign_id,status,effective_status,creative{id},preview_shareable_link,created_time,updated_time";
const CREATIVE_FIELDS =
  "id,name,object_type,thumbnail_url,image_url,video_id,body,title,call_to_action_type,object_story_spec,asset_feed_spec,instagram_permalink_url,link_url";
const METRIC_FIELDS = "date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values";
const LEVEL_ID: Record<MetaInsightLevel, { api: string; id: string; name?: string }> = {
  ACCOUNT: { api: "account", id: "account_id" },
  CAMPAIGN: { api: "campaign", id: "campaign_id", name: "campaign_name" },
  ADSET: { api: "adset", id: "adset_id", name: "adset_name" },
  AD: { api: "ad", id: "ad_id", name: "ad_name" },
};

const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const time = (v?: string | null) => (v ? new Date(v) : null);

type InsightRow = Record<string, unknown> & {
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

async function acquireLock(accountId: string) {
  const now = new Date();
  const r = await db.metaAdAccount.updateMany({
    where: { id: accountId, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
    data: { syncLockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) },
  });
  return r.count === 1;
}

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

export type SyncResult = { status: "SUCCESS" | "ERROR" | "SKIPPED"; records: number; error?: string };

export async function syncAdAccount(
  accountId: string,
  opts: { kind: MetaSyncKind; since?: string; triggeredById?: string } = { kind: "RECENT" },
): Promise<SyncResult> {
  const account = await db.metaAdAccount.findUnique({ where: { id: accountId } });
  if (!account) return { status: "ERROR", records: 0, error: "Conta não encontrada." };
  if (!account.connectionId) return { status: "ERROR", records: 0, error: "Conta sem conexão com a Meta." };
  if (!(await acquireLock(account.id))) return { status: "SKIPPED", records: 0 };

  const kind: MetaSyncKind = account.historyFrom ? opts.kind : "INITIAL";
  const today = todayInTz(account.timezone);
  let since = opts.since ?? shiftDays(today, -(WINDOW_DAYS[kind] - 1));
  if (kind === "INITIAL" && opts.since && opts.since > shiftDays(today, -89)) since = shiftDays(today, -89);
  const job = await db.metaSyncJob.create({
    data: { adAccountId: account.id, kind, triggeredById: opts.triggeredById ?? null, since: dbDate(since), until: dbDate(today) },
  });

  let records = 0;
  try {
    const token = await connectionToken(account.connectionId);
    const act = normalizeAdAccountId(account.externalId);

    const info = await graphGet<{ name?: string; currency?: string; timezone_name?: string; account_status?: number; disable_reason?: number; business_name?: string }>(
      act,
      { fields: "name,currency,timezone_name,account_status,disable_reason,business_name" },
      token,
    );
    const currency = info.currency ?? account.currency;
    await db.metaAdAccount.update({
      where: { id: account.id },
      data: {
        name: info.name ?? account.name,
        currency,
        timezone: info.timezone_name ?? account.timezone,
        accountStatus: info.account_status ?? null,
        disableReason: info.disable_reason ?? null,
        businessName: info.business_name ?? null,
      },
    });

    records += await syncEntities(account.id, act, currency, token);
    for (const level of ["ACCOUNT", "CAMPAIGN", "ADSET", "AD"] as const) {
      records += await syncDailyInsights(account.id, act, level, since, today, token);
    }

    const historyFrom = account.historyFrom && ymdOf(account.historyFrom) < since ? account.historyFrom : dbDate(since);
    await db.metaAdAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), lastSyncOk: true, lastSyncError: null, historyFrom },
    });
    await db.metaSyncJob.update({ where: { id: job.id }, data: { status: "SUCCESS", records, finishedAt: new Date() } });
    return { status: "SUCCESS", records };
  } catch (e) {
    const message = e instanceof MetaApiError ? friendlyMetaError(e) : e instanceof Error && e.name === "AppError" ? e.message : friendlyMetaError(e);
    if (!(e instanceof MetaApiError)) console.error("[meta] sincronização falhou:", e instanceof Error ? `${e.name}: ${e.message}` : e);
    if (e instanceof MetaApiError) await markConnectionError(account.connectionId, e);
    await db.metaAdAccount.update({ where: { id: account.id }, data: { lastSyncOk: false, lastSyncError: message } });
    await db.metaSyncJob.update({ where: { id: job.id }, data: { status: "ERROR", records, error: message, finishedAt: new Date() } });
    return { status: "ERROR", records, error: message };
  } finally {
    await db.metaAdAccount.update({ where: { id: account.id }, data: { syncLockedUntil: null } });
  }
}

type RawCampaign = {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
};
type RawAdSet = {
  id: string;
  name?: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  destination_type?: string;
  promoted_object?: Prisma.InputJsonValue;
  targeting?: Prisma.InputJsonValue;
  start_time?: string;
  end_time?: string;
};
type RawAd = {
  id: string;
  name?: string;
  adset_id: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  creative?: { id: string };
  preview_shareable_link?: string;
  created_time?: string;
  updated_time?: string;
};
type RawCreative = Parameters<typeof describeCreative>[0] & {
  id: string;
  name?: string;
  thumbnail_url?: string;
  instagram_permalink_url?: string;
};

async function syncEntities(adAccountId: string, act: string, currency: string, token: string) {
  const [campaigns, adSets, ads] = await Promise.all([
    graphPaginate<RawCampaign>(`${act}/campaigns`, { fields: CAMPAIGN_FIELDS, limit: 200 }, token),
    graphPaginate<RawAdSet>(`${act}/adsets`, { fields: ADSET_FIELDS, limit: 200 }, token),
    graphPaginate<RawAd>(`${act}/ads`, { fields: AD_FIELDS, limit: 200 }, token),
  ]);
  const now = new Date();

  const campaignIds = new Map<string, string>();
  await inChunks(campaigns, 50, async (chunk) => {
    const saved = await db.$transaction(
      chunk.map((c) => {
        const data = {
          adAccountId,
          name: c.name ?? c.id,
          objective: c.objective ?? null,
          status: c.status ?? null,
          effectiveStatus: c.effective_status ?? null,
          buyingType: c.buying_type ?? null,
          dailyBudgetCents: budgetToCents(c.daily_budget, currency),
          lifetimeBudgetCents: budgetToCents(c.lifetime_budget, currency),
          startTime: time(c.start_time),
          stopTime: time(c.stop_time),
          createdTime: time(c.created_time),
          updatedTime: time(c.updated_time),
          syncedAt: now,
        };
        return db.metaCampaign.upsert({ where: { externalId: c.id }, create: { externalId: c.id, ...data }, update: data, select: { id: true, externalId: true } });
      }),
    );
    for (const s of saved) campaignIds.set(s.externalId, s.id);
  });

  const adSetIds = new Map<string, string>();
  const validSets = adSets.filter((s) => campaignIds.has(s.campaign_id));
  await inChunks(validSets, 50, async (chunk) => {
    const saved = await db.$transaction(
      chunk.map((s) => {
        const data = {
          adAccountId,
          campaignId: campaignIds.get(s.campaign_id)!,
          name: s.name ?? s.id,
          status: s.status ?? null,
          effectiveStatus: s.effective_status ?? null,
          dailyBudgetCents: budgetToCents(s.daily_budget, currency),
          lifetimeBudgetCents: budgetToCents(s.lifetime_budget, currency),
          optimizationGoal: s.optimization_goal ?? null,
          billingEvent: s.billing_event ?? null,
          bidStrategy: s.bid_strategy ?? null,
          destinationType: s.destination_type ?? null,
          promotedObject: s.promoted_object ?? undefined,
          targeting: s.targeting ?? undefined,
          startTime: time(s.start_time),
          endTime: time(s.end_time),
          syncedAt: now,
        };
        return db.metaAdSet.upsert({ where: { externalId: s.id }, create: { externalId: s.id, ...data }, update: data, select: { id: true, externalId: true } });
      }),
    );
    for (const s of saved) adSetIds.set(s.externalId, s.id);
  });

  // Criativos em lotes de 50 (?ids=) com miniatura maior que o padrão de 64 px.
  const creativeExtIds = [...new Set(ads.map((a) => a.creative?.id).filter((x): x is string => !!x))];
  const creativeIds = new Map<string, string>();
  for (let i = 0; i < creativeExtIds.length; i += 50) {
    const batch = creativeExtIds.slice(i, i + 50);
    const res = await graphGet<Record<string, RawCreative>>("", { ids: batch.join(","), fields: CREATIVE_FIELDS, thumbnail_width: 720, thumbnail_height: 720 }, token);
    const saved = await db.$transaction(
      Object.values(res).map((c) => {
        const d = describeCreative(c);
        const data = {
          adAccountId,
          name: c.name ?? null,
          objectType: c.object_type ?? null,
          format: d.format,
          thumbnailUrl: c.thumbnail_url ?? null,
          imageUrl: d.imageUrl,
          videoId: d.videoId,
          primaryText: d.primaryText,
          headline: d.headline,
          description: d.description,
          callToAction: d.callToAction,
          linkUrl: d.linkUrl,
          instagramPermalinkUrl: c.instagram_permalink_url ?? null,
          carousel: d.carousel ?? undefined,
          syncedAt: now,
        };
        return db.metaCreative.upsert({ where: { externalId: c.id }, create: { externalId: c.id, ...data }, update: data, select: { id: true, externalId: true } });
      }),
    );
    for (const s of saved) creativeIds.set(s.externalId, s.id);
  }

  const validAds = ads.filter((a) => adSetIds.has(a.adset_id) && campaignIds.has(a.campaign_id));
  await inChunks(validAds, 50, (chunk) =>
    db.$transaction(
      chunk.map((a) => {
        const data = {
          adAccountId,
          campaignId: campaignIds.get(a.campaign_id)!,
          adSetId: adSetIds.get(a.adset_id)!,
          creativeId: (a.creative?.id && creativeIds.get(a.creative.id)) || null,
          name: a.name ?? a.id,
          status: a.status ?? null,
          effectiveStatus: a.effective_status ?? null,
          previewUrl: a.preview_shareable_link ?? null,
          createdTime: time(a.created_time),
          updatedTime: time(a.updated_time),
          syncedAt: now,
        };
        return db.metaAd.upsert({ where: { externalId: a.id }, create: { externalId: a.id, ...data }, update: data });
      }),
    ),
  );
  return campaigns.length + validSets.length + creativeExtIds.length + validAds.length;
}

function insightData(adAccountId: string, level: MetaInsightLevel, r: InsightRow, fallbackId: string) {
  const meta = LEVEL_ID[level];
  return {
    adAccountId,
    level,
    externalId: level === "ACCOUNT" ? fallbackId : String(r[meta.id] ?? ""),
    name: meta.name ? ((r[meta.name] as string | undefined) ?? null) : null,
    date: dbDate(r.date_start),
    spendCents: moneyToCents(r.spend) ?? 0,
    impressions: toInt(r.impressions) ?? 0,
    reach: toInt(r.reach),
    clicks: toInt(r.clicks) ?? 0,
    linkClicks: toInt(r.inline_link_clicks),
    actions: parseActions(r.actions),
    actionValues: parseActionValues(r.action_values),
    attribution: "unified",
  };
}

/** Substitui as métricas diárias do intervalo (resultados atribuídos podem mudar dias depois). */
async function syncDailyInsights(adAccountId: string, act: string, level: MetaInsightLevel, since: string, until: string, token: string) {
  const meta = LEVEL_ID[level];
  const fields = [METRIC_FIELDS, meta.id, meta.name].filter(Boolean).join(",");
  const rows = await graphPaginate<InsightRow>(
    `${act}/insights`,
    {
      level: meta.api,
      fields,
      time_range: JSON.stringify({ since, until }),
      time_increment: 1,
      use_unified_attribution_setting: true,
      limit: 500,
    },
    token,
  );
  const data = rows.map((r) => insightData(adAccountId, level, r, act)).filter((r) => r.externalId);
  await db.$transaction([
    db.metaInsight.deleteMany({ where: { adAccountId, level, date: { gte: dbDate(since), lte: dbDate(until) } } }),
    db.metaInsight.createMany({ data, skipDuplicates: true }),
  ]);
  return data.length;
}

const MARKER = "__fetched__";

/**
 * Alcance do período fechado (não é somável dia a dia). Lido da API sob demanda e guardado
 * como cache; se a Meta falhar, devolve o último valor guardado marcado como desatualizado.
 */
export async function periodReach(
  account: { id: string; externalId: string; connectionId: string | null; timezone: string },
  level: "ACCOUNT" | "CAMPAIGN",
  since: string,
  until: string,
): Promise<{ reach: Map<string, number | null>; stale: boolean } | null> {
  const today = todayInTz(account.timezone);
  const ttl = (until >= shiftDays(today, -2) ? STALE_MINUTES : 24 * 60) * 60_000;
  const where = { adAccountId: account.id, level, since: dbDate(since), until: dbDate(until) };
  const cached = await db.metaInsightPeriod.findMany({ where });
  const toMap = (rows: typeof cached) => new Map(rows.filter((r) => r.externalId !== MARKER).map((r) => [r.externalId, r.reach]));
  const fresh = cached.some((r) => r.externalId === MARKER && Date.now() - r.fetchedAt.getTime() < ttl);
  if (fresh) return { reach: toMap(cached), stale: false };
  if (!account.connectionId) return cached.length ? { reach: toMap(cached), stale: true } : null;

  try {
    const token = await connectionToken(account.connectionId);
    const act = normalizeAdAccountId(account.externalId);
    const meta = LEVEL_ID[level];
    const rows = await graphPaginate<InsightRow>(
      `${act}/insights`,
      {
        level: meta.api,
        fields: ["reach,impressions,spend", meta.id].join(","),
        time_range: JSON.stringify({ since, until }),
        use_unified_attribution_setting: true,
        limit: 500,
      },
      token,
    );
    const now = new Date();
    const data = [
      ...rows.map((r) => ({
        ...where,
        externalId: level === "ACCOUNT" ? act : String(r[meta.id] ?? ""),
        reach: toInt(r.reach),
        impressions: toInt(r.impressions) ?? 0,
        spendCents: moneyToCents(r.spend) ?? 0,
        fetchedAt: now,
      })),
      { ...where, externalId: MARKER, reach: null, impressions: 0, spendCents: 0, fetchedAt: now },
    ];
    await db.$transaction([db.metaInsightPeriod.deleteMany({ where }), db.metaInsightPeriod.createMany({ data, skipDuplicates: true })]);
    return { reach: toMap(data as typeof cached), stale: false };
  } catch (e) {
    if (e instanceof MetaApiError) await markConnectionError(account.connectionId, e);
    return cached.length ? { reach: toMap(cached), stale: true } : null;
  }
}

/** Contas que a rotina deve sincronizar: habilitadas, vinculadas e com conexão ativa. */
function syncableWhere(): Prisma.MetaAdAccountWhereInput {
  return { enabled: true, clientId: { not: null }, connection: { status: "CONNECTED" } };
}

/** Rotina agendada: sincroniza todas as contas, parando de iniciar novas perto do limite de tempo. */
export async function syncAllAccounts(kind: "RECENT" | "RECONCILE", budgetMs = 240_000) {
  const started = Date.now();
  const accounts = await db.metaAdAccount.findMany({ where: syncableWhere(), select: { id: true }, orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } } });
  const results: SyncResult[] = [];
  for (const a of accounts) {
    if (Date.now() - started > budgetMs) break;
    results.push(await syncAdAccount(a.id, { kind }));
  }
  return {
    accounts: accounts.length,
    processed: results.length,
    ok: results.filter((r) => r.status === "SUCCESS").length,
    failed: results.filter((r) => r.status === "ERROR").length,
    records: results.reduce((n, r) => n + r.records, 0),
  };
}

/** Atualização em segundo plano ao abrir as telas: só contas com dados mais velhos que 30 min. */
export async function refreshStaleAccounts(accountIds: string[]) {
  const limit = new Date(Date.now() - STALE_MINUTES * 60_000);
  const stale = await db.metaAdAccount.findMany({
    where: { id: { in: accountIds }, ...syncableWhere(), OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: limit } }] },
    select: { id: true },
  });
  for (const a of stale) await syncAdAccount(a.id, { kind: "RECENT" });
}
