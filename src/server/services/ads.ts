import "server-only";
import { db } from "@/server/db";
import { clientScope, isAdmin, type Actor } from "@/server/auth/permissions";
import { notFound } from "@/server/errors";
import { APP_TIMEZONE } from "@/lib/dates";
import {
  actionCount,
  addTotals,
  costPerResult,
  cpc,
  cpm,
  ctr,
  emptyTotals,
  frequency,
  normalizeStatus,
  resultKindFor,
  RESULT_KINDS,
  roas,
  type ResultKind,
  type Totals,
} from "@/lib/ads/metrics";
import { eachDay, previousPeriod, resolvePeriod, shiftDays, todayInTz, type Period } from "@/lib/ads/periods";
import { periodReach, STALE_MINUTES } from "@/server/services/meta-sync";
import type { MetaInsightLevel } from "@/generated/prisma/enums";

/**
 * Leitura dos anúncios para as telas: sempre do banco sincronizado, com o escopo de clientes do
 * usuário aplicado no servidor (trocar o ID na URL não abre cliente de outra pessoa).
 */

export type PeriodInput = { periodo?: string | null; de?: string | null; ate?: string | null };

const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

const accountSelect = {
  id: true,
  externalId: true,
  name: true,
  currency: true,
  timezone: true,
  accountStatus: true,
  enabled: true,
  lastSyncedAt: true,
  lastSyncOk: true,
  lastSyncError: true,
  syncLockedUntil: true,
  historyFrom: true,
  connectionId: true,
  clientId: true,
  connection: { select: { status: true } },
} as const;

type AccountRow = {
  id: string;
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: number | null;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  syncLockedUntil: Date | null;
  historyFrom: Date | null;
  connectionId: string | null;
  clientId: string | null;
  connection: { status: string } | null;
};

export function accountSyncInfo(a: AccountRow) {
  const ageMin = a.lastSyncedAt ? Math.round((Date.now() - a.lastSyncedAt.getTime()) / 60_000) : null;
  return {
    id: a.id,
    externalId: a.externalId,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    accountStatus: a.accountStatus,
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    lastSyncOk: a.lastSyncOk,
    lastSyncError: a.lastSyncError,
    syncing: Boolean(a.syncLockedUntil && a.syncLockedUntil > new Date()),
    stale: ageMin === null || ageMin > STALE_MINUTES,
    connectionStatus: a.connection?.status ?? "DISCONNECTED",
    historyFrom: a.historyFrom ? ymdOf(a.historyFrom) : null,
  };
}
export type AccountSyncInfo = ReturnType<typeof accountSyncInfo>;

/** Clientes visíveis ao usuário que têm conta de anúncios vinculada. */
export async function adsClients(actor: Actor) {
  const clients = await db.client.findMany({
    where: { AND: [clientScope(actor), { archivedAt: null }, { metaAdAccounts: { some: {} } }] },
    select: { id: true, name: true, logoFileId: true, metaAdAccounts: { select: accountSelect, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return clients.map((c) => ({ id: c.id, name: c.name, logoFileId: c.logoFileId, accounts: c.metaAdAccounts.map(accountSyncInfo) }));
}
export type AdsClient = Awaited<ReturnType<typeof adsClients>>[number];

type Insight = {
  adAccountId: string;
  level: MetaInsightLevel;
  externalId: string;
  name: string | null;
  date: Date;
  spendCents: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  linkClicks: number | null;
  actions: unknown;
  actionValues: unknown;
};

function loadInsights(accountIds: string[], level: MetaInsightLevel, since: string, until: string): Promise<Insight[]> {
  return db.metaInsight.findMany({
    where: { adAccountId: { in: accountIds }, level, date: { gte: dbDate(since), lte: dbDate(until) } },
    select: {
      adAccountId: true,
      level: true,
      externalId: true,
      name: true,
      date: true,
      spendCents: true,
      impressions: true,
      reach: true,
      clicks: true,
      linkClicks: true,
      actions: true,
      actionValues: true,
    },
  });
}

const inRange = (r: { date: Date }, since: string, until: string) => {
  const d = ymdOf(r.date);
  return d >= since && d <= until;
};

function sumRows(rows: Insight[]) {
  return rows.reduce((t, r) => addTotals(t, r), emptyTotals());
}

function groupBy<T, K>(rows: T[], key: (r: T) => K) {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Indicadores comuns a qualquer agrupamento (sem resultados, que dependem do tipo). */
function metricsOf(t: Totals) {
  return {
    spendCents: t.spendCents,
    impressions: t.impressions,
    clicks: t.clicks,
    linkClicks: t.linkClicks,
    cpm: cpm(t.spendCents, t.impressions),
    cpc: cpc(t.spendCents, t.linkClicks),
    ctr: ctr(t.linkClicks, t.impressions),
    leads: actionCount(t.actions, "lead"),
    conversations: actionCount(t.actions, "messaging"),
    roas: roas(t),
  };
}
export type BaseMetrics = ReturnType<typeof metricsOf>;

type KindTotals = Map<ResultKind, { count: number; spendCents: number }>;

/** Resultados por tipo a partir de linhas de conjuntos: cada conjunto conta só a ação do seu tipo. */
function resultsByKind(adSetRows: Insight[], kindOf: (adSetExt: string) => ResultKind | null): KindTotals {
  const out: KindTotals = new Map();
  for (const [ext, rows] of groupBy(adSetRows, (r) => r.externalId)) {
    const kind = kindOf(ext);
    if (!kind) continue;
    const t = sumRows(rows);
    const cur = out.get(kind) ?? { count: 0, spendCents: 0 };
    cur.count += actionCount(t.actions, kind);
    cur.spendCents += t.spendCents;
    out.set(kind, cur);
  }
  return out;
}

/** Resultado principal: o tipo que concentra mais investimento; custo só sobre esse investimento. */
function primaryResult(kinds: KindTotals, totalSpend: number) {
  let best: { kind: ResultKind; count: number; spendCents: number } | null = null;
  for (const [kind, v] of kinds) if (!best || v.spendCents > best.spendCents) best = { kind, ...v };
  if (!best) return null;
  return {
    kind: best.kind,
    label: RESULT_KINDS[best.kind].label,
    count: best.count,
    costPerResult: costPerResult(best.spendCents, best.count),
    spendShare: totalSpend > 0 ? best.spendCents / totalSpend : null,
    mixed: kinds.size > 1,
  };
}
export type PrimaryResult = ReturnType<typeof primaryResult>;

// ─────────────────────────── Visão geral (todas as contas) ───────────────────────────

export async function getAdsOverview(actor: Actor, input: PeriodInput) {
  const clients = await adsClients(actor);
  const period = resolvePeriod(input, APP_TIMEZONE);
  const prev = previousPeriod(period);
  const accounts = clients.flatMap((c) => c.accounts.map((a) => ({ ...a, clientId: c.id })));
  const ids = accounts.map((a) => a.id);
  const [rows, campaigns] = await Promise.all([
    ids.length ? loadInsights(ids, "ACCOUNT", prev.since, period.until) : Promise.resolve([]),
    db.metaCampaign.findMany({ where: { adAccountId: { in: ids } }, select: { adAccountId: true, effectiveStatus: true, status: true, stopTime: true } }),
  ]);

  const byAccount = groupBy(rows, (r) => r.adAccountId);
  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const perClient = clients.map((c) => {
    const accs = c.accounts;
    const cur = sumRows(accs.flatMap((a) => (byAccount.get(a.id) ?? []).filter((r) => inRange(r, period.since, period.until))));
    const before = sumRows(accs.flatMap((a) => (byAccount.get(a.id) ?? []).filter((r) => inRange(r, prev.since, prev.until))));
    const active = campaigns.filter((x) => accs.some((a) => a.id === x.adAccountId) && normalizeStatus(x.effectiveStatus, x.status, x.stopTime).key === "active").length;
    return {
      id: c.id,
      name: c.name,
      logoFileId: c.logoFileId,
      currency: accs[0]?.currency ?? "BRL",
      mixedCurrency: new Set(accs.map((a) => a.currency)).size > 1,
      accounts: accs,
      current: metricsOf(cur),
      previous: metricsOf(before),
      activeCampaigns: active,
    };
  });

  const totalsByCurrency = currencies.map((currency) => {
    const accs = accounts.filter((a) => a.currency === currency).map((a) => a.id);
    const cur = sumRows(rows.filter((r) => accs.includes(r.adAccountId) && inRange(r, period.since, period.until)));
    const before = sumRows(rows.filter((r) => accs.includes(r.adAccountId) && inRange(r, prev.since, prev.until)));
    const days = eachDay(period.since, period.until);
    const daily = groupBy(
      rows.filter((r) => accs.includes(r.adAccountId) && inRange(r, period.since, period.until)),
      (r) => ymdOf(r.date),
    );
    return {
      currency,
      spendCents: cur.spendCents,
      previousSpendCents: before.spendCents,
      series: days.map((d) => ({ date: d, spendCents: (daily.get(d) ?? []).reduce((n, r) => n + r.spendCents, 0) })),
    };
  });

  const all = sumRows(rows.filter((r) => inRange(r, period.since, period.until)));
  const allPrev = sumRows(rows.filter((r) => inRange(r, prev.since, prev.until)));
  return {
    period,
    previous: prev,
    clients: perClient,
    totalsByCurrency,
    current: metricsOf(all),
    previousMetrics: metricsOf(allPrev),
    activeCampaigns: perClient.reduce((n, c) => n + c.activeCampaigns, 0),
    accounts,
    hasAccounts: accounts.length > 0,
  };
}
export type AdsOverview = Awaited<ReturnType<typeof getAdsOverview>>;

// ─────────────────────────── Dashboard do cliente ───────────────────────────

/** Cliente + contas vinculadas, validando o escopo do usuário. */
export async function adsClientContext(actor: Actor, clientId: string, accountParam?: string | null) {
  const client = await db.client.findFirst({
    where: { AND: [{ id: clientId }, clientScope(actor)] },
    select: { id: true, name: true, logoFileId: true, archivedAt: true, metaAdAccounts: { select: accountSelect, orderBy: { name: "asc" } } },
  });
  if (!client) throw notFound("Cliente");
  const accounts = client.metaAdAccounts;
  const mixed = new Set(accounts.map((a) => a.currency)).size > 1;
  // Moedas diferentes não se somam: nesse caso a tela mostra uma conta por vez.
  const selected = accounts.filter((a) => (accountParam && accountParam !== "todas" ? a.id === accountParam : true));
  const chosen = selected.length ? (mixed && selected.length > 1 ? [selected[0]] : selected) : accounts.slice(0, mixed ? 1 : accounts.length);
  return {
    client: { id: client.id, name: client.name, logoFileId: client.logoFileId },
    accounts: accounts.map(accountSyncInfo),
    selected: chosen,
    selectedIds: chosen.map((a) => a.id),
    mixedCurrency: mixed,
    canSync: isAdmin(actor),
  };
}

type Parts = { campaigns?: boolean; adSets?: boolean; ads?: boolean };

export async function getClientAds(actor: Actor, clientId: string, input: PeriodInput & { conta?: string | null }, parts: Parts = {}) {
  const ctx = await adsClientContext(actor, clientId, input.conta);
  const accounts = ctx.selected;
  const tz = accounts[0]?.timezone ?? APP_TIMEZONE;
  const currency = accounts[0]?.currency ?? "BRL";
  const period: Period = resolvePeriod(input, tz);
  const prev = previousPeriod(period);
  const ids = ctx.selectedIds;
  if (!ids.length) return { ...ctx, period, previous: prev, currency, tz, empty: true as const };

  const today = todayInTz(tz);
  const adRange = { since: period.since < shiftDays(today, -1) ? period.since : shiftDays(today, -1), until: period.until > today ? period.until : today };
  const [accountRows, adSetRows, campaignRows, adRows, campaigns, adSets, ads] = await Promise.all([
    loadInsights(ids, "ACCOUNT", prev.since, period.until),
    loadInsights(ids, "ADSET", prev.since, period.until),
    loadInsights(ids, "CAMPAIGN", period.since, period.until),
    parts.ads ? loadInsights(ids, "AD", adRange.since, adRange.until) : Promise.resolve([]),
    db.metaCampaign.findMany({ where: { adAccountId: { in: ids } }, orderBy: { name: "asc" } }),
    db.metaAdSet.findMany({ where: { adAccountId: { in: ids } }, orderBy: { name: "asc" } }),
    parts.ads
      ? db.metaAd.findMany({ where: { adAccountId: { in: ids } }, include: { creative: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const campaignByExt = new Map(campaigns.map((c) => [c.externalId, c]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const adSetByExt = new Map(adSets.map((s) => [s.externalId, s]));
  const kindOfAdSet = (ext: string) => {
    const s = adSetByExt.get(ext);
    if (!s) return null;
    return resultKindFor(s, campaignById.get(s.campaignId)?.objective);
  };

  const cur = (rows: Insight[]) => rows.filter((r) => inRange(r, period.since, period.until));
  const before = (rows: Insight[]) => rows.filter((r) => inRange(r, prev.since, prev.until));

  // Totais da conta e resultados (tipo principal) no período e no anterior.
  const totals = sumRows(cur(accountRows));
  const totalsPrev = sumRows(before(accountRows));
  const kinds = resultsByKind(cur(adSetRows), kindOfAdSet);
  const kindsPrev = resultsByKind(before(adSetRows), kindOfAdSet);
  const result = primaryResult(kinds, totals.spendCents);
  const resultPrev = result ? (kindsPrev.get(result.kind) ?? { count: 0, spendCents: 0 }) : null;

  // Alcance só é exato por período fechado e por conta: com várias contas, não somamos.
  const single = accounts.length === 1 ? accounts[0] : null;
  const [reachNow, reachCampaigns] = await Promise.all([
    single ? periodReach(single, "ACCOUNT", period.since, period.until) : Promise.resolve(null),
    single && parts.campaigns ? periodReach(single, "CAMPAIGN", period.since, period.until) : Promise.resolve(null),
  ]);
  const reach = single && reachNow ? (reachNow.reach.get(single.externalId) ?? (totals.impressions === 0 ? 0 : null)) : null;

  // Série diária (dias sem linha = sem entrega, desde que o dia já tenha sido sincronizado).
  const historyFrom = accounts.map((a) => (a.historyFrom ? ymdOf(a.historyFrom) : null)).reduce<string | null>((m, d) => (d && (!m || d > m) ? d : m), null);
  const seriesFor = (since: string, until: string) => {
    const acc = groupBy(accountRows.filter((r) => inRange(r, since, until)), (r) => ymdOf(r.date));
    const sets = groupBy(adSetRows.filter((r) => inRange(r, since, until)), (r) => ymdOf(r.date));
    return eachDay(since, until).map((d) => {
      const synced = historyFrom !== null && d >= historyFrom;
      const t = sumRows(acc.get(d) ?? []);
      const k = result ? resultsByKind(sets.get(d) ?? [], kindOfAdSet).get(result.kind) : undefined;
      return {
        date: d,
        spendCents: synced ? t.spendCents : null,
        impressions: synced ? t.impressions : null,
        reach: synced && single ? (acc.get(d)?.[0]?.reach ?? 0) : null,
        linkClicks: synced ? (t.linkClicks ?? 0) : null,
        results: synced && result ? (k?.count ?? 0) : null,
        costPerResult: synced && result && k ? costPerResult(k.spendCents, k.count) : null,
      };
    });
  };

  const summary = {
    ...metricsOf(totals),
    reach,
    reachStale: reachNow?.stale ?? false,
    frequency: reach === null ? null : frequency(totals.impressions, reach),
    result,
  };
  const previousSummary = {
    ...metricsOf(totalsPrev),
    resultCount: resultPrev?.count ?? null,
    costPerResult: resultPrev ? costPerResult(resultPrev.spendCents, resultPrev.count) : null,
  };

  // Campanhas: entidades sincronizadas + campanhas que só aparecem nas métricas (ex.: arquivadas).
  const campaignMetrics = groupBy(cur(campaignRows), (r) => r.externalId);
  const adSetsByCampaign = groupBy(adSets, (s) => s.campaignId);
  const adSetCur = groupBy(cur(adSetRows), (r) => r.externalId);
  const campaignIds = new Set([...campaigns.map((c) => c.externalId), ...campaignMetrics.keys()]);
  const campaignList = [...campaignIds].map((ext) => {
    const c = campaignByExt.get(ext);
    const rows = campaignMetrics.get(ext) ?? [];
    const t = sumRows(rows);
    const sets = c ? (adSetsByCampaign.get(c.id) ?? []) : [];
    const setKinds = new Set(sets.map((s) => kindOfAdSet(s.externalId)).filter((k): k is ResultKind => !!k));
    const kindTotals = resultsByKind(
      sets.flatMap((s) => adSetCur.get(s.externalId) ?? []),
      kindOfAdSet,
    );
    const onlyKind = setKinds.size === 1 ? [...setKinds][0] : null;
    const kt = onlyKind ? kindTotals.get(onlyKind) : undefined;
    const status = c ? normalizeStatus(c.effectiveStatus, c.status, c.stopTime) : normalizeStatus("ARCHIVED", null);
    return {
      id: c?.id ?? ext,
      externalId: ext,
      name: c?.name ?? rows[0]?.name ?? ext,
      objective: c?.objective ?? null,
      status,
      dailyBudgetCents: c?.dailyBudgetCents ?? null,
      lifetimeBudgetCents: c?.lifetimeBudgetCents ?? null,
      budgetOnAdSets: Boolean(c && !c.dailyBudgetCents && !c.lifetimeBudgetCents && sets.some((s) => s.dailyBudgetCents || s.lifetimeBudgetCents)),
      startTime: c?.startTime?.toISOString() ?? null,
      stopTime: c?.stopTime?.toISOString() ?? null,
      ...metricsOf(t),
      reach: reachCampaigns ? (reachCampaigns.reach.get(ext) ?? (t.impressions === 0 ? 0 : null)) : null,
      resultKind: onlyKind,
      resultLabel: onlyKind ? RESULT_KINDS[onlyKind].label : setKinds.size > 1 ? "Misto" : null,
      results: onlyKind ? (kt?.count ?? 0) : null,
      costPerResult: onlyKind && kt ? costPerResult(kt.spendCents, kt.count) : null,
      series: parts.campaigns
        ? eachDay(period.since, period.until).map((d) => {
            const day = rows.filter((r) => ymdOf(r.date) === d);
            return { date: d, spendCents: day.reduce((n, r) => n + r.spendCents, 0), impressions: day.reduce((n, r) => n + r.impressions, 0) };
          })
        : [],
    };
  });
  campaignList.sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name));

  const adSetList =
    parts.adSets || parts.campaigns
      ? adSets.map((s) => {
          const t = sumRows(adSetCur.get(s.externalId) ?? []);
          const kind = kindOfAdSet(s.externalId);
          const results = kind ? actionCount(t.actions, kind) : null;
          const campaign = campaignById.get(s.campaignId);
          return {
            id: s.id,
            externalId: s.externalId,
            campaignId: s.campaignId,
            campaignName: campaign?.name ?? "",
            name: s.name,
            status: normalizeStatus(s.effectiveStatus, s.status, s.endTime),
            dailyBudgetCents: s.dailyBudgetCents,
            lifetimeBudgetCents: s.lifetimeBudgetCents,
            optimizationGoal: s.optimizationGoal,
            billingEvent: s.billingEvent,
            bidStrategy: s.bidStrategy,
            destinationType: s.destinationType,
            targeting: summarizeTargeting(s.targeting),
            startTime: s.startTime?.toISOString() ?? null,
            endTime: s.endTime?.toISOString() ?? null,
            ...metricsOf(t),
            resultKind: kind,
            resultLabel: kind ? RESULT_KINDS[kind].label : null,
            results,
            costPerResult: kind ? costPerResult(t.spendCents, results) : null,
          };
        })
      : [];
  adSetList.sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name));

  const yesterday = shiftDays(today, -1);
  const adCur = groupBy(adRows.filter((r) => inRange(r, period.since, period.until)), (r) => r.externalId);
  const delivered = new Set(adRows.filter((r) => ymdOf(r.date) >= yesterday && r.impressions > 0).map((r) => r.externalId));
  const adList = ads.map((a) => {
    const t = sumRows(adCur.get(a.externalId) ?? []);
    const set = adSets.find((s) => s.id === a.adSetId);
    const kind = set ? kindOfAdSet(set.externalId) : null;
    const results = kind ? actionCount(t.actions, kind) : null;
    const status = normalizeStatus(a.effectiveStatus, a.status);
    return {
      id: a.id,
      externalId: a.externalId,
      name: a.name,
      status,
      campaignId: a.campaignId,
      campaignName: campaignById.get(a.campaignId)?.name ?? "",
      adSetId: a.adSetId,
      adSetName: set?.name ?? "",
      previewUrl: a.previewUrl,
      creative: a.creative
        ? {
            format: a.creative.format,
            thumbnailUrl: a.creative.thumbnailUrl,
            imageUrl: a.creative.imageUrl,
            videoId: a.creative.videoId,
            primaryText: a.creative.primaryText,
            headline: a.creative.headline,
            description: a.creative.description,
            callToAction: a.creative.callToAction,
            linkUrl: a.creative.linkUrl,
            instagramPermalinkUrl: a.creative.instagramPermalinkUrl,
            carousel: (a.creative.carousel as { name: string | null; picture: string; link: string | null }[] | null) ?? null,
          }
        : null,
      // "Em veiculação": status efetivo ativo E impressões registradas desde ontem.
      delivering: status.key === "active" && delivered.has(a.externalId),
      ...metricsOf(t),
      resultKind: kind,
      resultLabel: kind ? RESULT_KINDS[kind].label : null,
      results,
      costPerResult: kind ? costPerResult(t.spendCents, results) : null,
    };
  });

  return {
    ...ctx,
    empty: false as const,
    period,
    previous: prev,
    currency,
    tz,
    historyFrom,
    beforeHistory: historyFrom !== null && period.since < historyFrom,
    summary,
    previousSummary,
    series: seriesFor(period.since, period.until),
    previousSeries: seriesFor(prev.since, prev.until),
    activeCampaigns: campaigns.filter((c) => normalizeStatus(c.effectiveStatus, c.status, c.stopTime).key === "active").length,
    campaigns: campaignList,
    adSets: adSetList,
    ads: adList,
  };
}
export type ClientAds = Awaited<ReturnType<typeof getClientAds>>;
export type ClientAdsData = Extract<ClientAds, { empty: false }>;

/** Resumo legível da segmentação, só com os campos que a Meta devolver. */
function summarizeTargeting(t: unknown) {
  if (!t || typeof t !== "object") return null;
  const x = t as {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[]; regions?: { name?: string }[]; cities?: { name?: string; radius?: number; distance_unit?: string }[]; custom_locations?: { radius?: number; distance_unit?: string }[] };
    flexible_spec?: { interests?: { name?: string }[] }[];
    interests?: { name?: string }[];
    custom_audiences?: { name?: string }[];
    excluded_custom_audiences?: { name?: string }[];
    publisher_platforms?: string[];
    targeting_automation?: { advantage_audience?: number };
  };
  const genders = x.genders?.length === 1 ? (x.genders[0] === 1 ? "Homens" : "Mulheres") : "Todos os gêneros";
  const places = [
    ...(x.geo_locations?.cities ?? []).map((c) => (c.radius ? `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : c.name)),
    ...(x.geo_locations?.regions ?? []).map((r) => r.name),
    ...(x.geo_locations?.countries ?? []),
    ...(x.geo_locations?.custom_locations?.length ? [`${x.geo_locations.custom_locations.length} local(is) personalizado(s)`] : []),
  ].filter((v): v is string => !!v);
  const interests = [...(x.interests ?? []), ...(x.flexible_spec ?? []).flatMap((f) => f.interests ?? [])].map((i) => i.name).filter((v): v is string => !!v);
  return {
    age: x.age_min || x.age_max ? `${x.age_min ?? 18}–${x.age_max ?? "65+"} anos` : null,
    genders,
    places,
    interests: interests.slice(0, 12),
    audiences: (x.custom_audiences ?? []).map((a) => a.name).filter((v): v is string => !!v),
    excluded: (x.excluded_custom_audiences ?? []).map((a) => a.name).filter((v): v is string => !!v),
    platforms: x.publisher_platforms ?? [],
    advantage: x.targeting_automation?.advantage_audience === 1,
  };
}
