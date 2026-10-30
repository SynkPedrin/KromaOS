import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { completeMetaOAuth, disconnectMeta, linkAdAccount, normalizeAdAccountId } from "@/server/services/meta-connection";
import { periodReach, syncAdAccount } from "@/server/services/meta-sync";
import { getAdsOverview, getClientAds } from "@/server/services/ads";
import { buildAuthorizeUrl, oauthBinding, verifyOAuthState } from "@/server/meta/oauth";
import { decryptToken } from "@/server/meta/token-crypto";
import { shiftDays, todayInTz } from "@/lib/ads/periods";
import { makeUser, resetDb } from "../helpers";

// Credenciais fictícias só para os testes (nunca as de produção).
process.env.META_APP_ID = "999000111";
process.env.META_APP_SECRET = "test-app-secret-0123456789";
process.env.META_TOKEN_ENCRYPTION_KEY = "test-encryption-key-0123456789-abcdef";
process.env.META_GRAPH_API_VERSION = "v26.0";

const TZ = "America/Sao_Paulo";
const today = todayInTz(TZ);
const d1 = shiftDays(today, -1);
const d2 = shiftDays(today, -2);

type Call = { path: string; params: URLSearchParams };
let calls: Call[] = [];
let scopes = ["ads_read", "public_profile"];
let tokenValid = true;
let failWith: { code: number; subcode?: number } | null = null;

const page = (data: unknown[], after?: string) => ({ data, paging: after ? { cursors: { after }, next: `https://graph.facebook.com/next?after=${after}` } : { cursors: {} } });

const actions = (lead: number, conv = 0) => [
  { action_type: "lead", value: String(lead) },
  { action_type: "offsite_conversion.fb_pixel_lead", value: String(lead) },
  ...(conv ? [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(conv) }] : []),
];

/** Graph API falsa: responde pelos caminhos usados pela integração. */
function fakeGraph(path: string, p: URLSearchParams) {
  if (failWith && path !== "debug_token") return { status: 400, body: { error: { message: "fail", code: failWith.code, error_subcode: failWith.subcode } } };
  if (path === "oauth/access_token") {
    if (p.get("code") === "bad") return { status: 400, body: { error: { message: "invalid code", code: 100 } } };
    return { status: 200, body: p.get("fb_exchange_token") ? { access_token: "long-token", expires_in: 5_184_000 } : { access_token: "short-token", expires_in: 3600 } };
  }
  if (path === "debug_token")
    return {
      status: 200,
      body: { data: { is_valid: tokenValid, app_id: "999000111", user_id: "u1", scopes, expires_at: Math.floor(Date.now() / 1000) + 5_000_000, data_access_expires_at: 0 } },
    };
  if (path === "me") return { status: 200, body: { id: "u1", name: "Pedro Meta" } };
  if (path === "me/adaccounts") {
    const acc = (id: string, name: string) => ({ id: `act_${id}`, name, currency: "BRL", timezone_name: TZ, account_status: 1 });
    return { status: 200, body: p.get("after") ? page([acc("2223334445", "Outra Conta")]) : page([acc("1455371035858511", "Studio da Beleza Rita")], "c1") };
  }
  if (/^act_\d+$/.test(path)) return { status: 200, body: { id: path, name: "Studio da Beleza Rita", currency: "BRL", timezone_name: TZ, account_status: 1 } };
  if (path.endsWith("/campaigns")) {
    const c = (id: string, name: string, objective: string, status: string) => ({ id, name, objective, status, effective_status: status, daily_budget: "5000" });
    return { status: 200, body: p.get("after") ? page([c("c2", "Tráfego Insta", "OUTCOME_TRAFFIC", "PAUSED")]) : page([c("c1", "Leads Botox", "OUTCOME_LEADS", "ACTIVE")], "p2") };
  }
  if (path.endsWith("/adsets"))
    return {
      status: 200,
      body: page([
        { id: "s1", name: "Mulheres 25-45", campaign_id: "c1", status: "ACTIVE", effective_status: "ACTIVE", optimization_goal: "LEAD_GENERATION", targeting: { age_min: 25, age_max: 45, genders: [2], geo_locations: { cities: [{ name: "São Paulo", radius: 10, distance_unit: "kilometer" }] } } },
        { id: "s2", name: "Tráfego", campaign_id: "c2", status: "PAUSED", effective_status: "PAUSED", optimization_goal: "LINK_CLICKS" },
      ]),
    };
  if (path.endsWith("/ads"))
    return {
      status: 200,
      body: page([
        { id: "ad1", name: "Vídeo antes e depois", adset_id: "s1", campaign_id: "c1", status: "ACTIVE", effective_status: "ACTIVE", creative: { id: "cr1" }, preview_shareable_link: "https://fb.me/preview" },
        { id: "ad2", name: "Carrossel", adset_id: "s2", campaign_id: "c2", status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED", creative: { id: "cr2" } },
      ]),
    };
  if (path === "" && p.get("ids"))
    return {
      status: 200,
      body: {
        cr1: { id: "cr1", video_id: "v1", thumbnail_url: "https://scontent.xx.fbcdn.net/t1.jpg", object_story_spec: { video_data: { message: "Agende sua avaliação", title: "Botox", call_to_action: { type: "WHATSAPP_MESSAGE" } } } },
        cr2: { id: "cr2", thumbnail_url: "https://scontent.xx.fbcdn.net/t2.jpg", object_story_spec: { link_data: { message: "Conheça", child_attachments: [{ picture: "a" }, { picture: "b" }] } } },
      },
    };
  if (path.endsWith("/insights")) {
    const level = p.get("level");
    const daily = p.get("time_increment") === "1";
    if (!daily) {
      // Alcance do período fechado (não é soma dos dias).
      if (level === "account") return { status: 200, body: page([{ account_id: "1455371035858511", reach: "1500", impressions: "5000", spend: "150.00" }]) };
      return { status: 200, body: page([{ campaign_id: "c1", reach: "1200", impressions: "4000", spend: "120.00" }]) };
    }
    const row = (date: string, extra: Record<string, unknown>, spend: string, impressions: number, link: number, acts: unknown[]) => ({
      date_start: date,
      date_stop: date,
      spend,
      impressions: String(impressions),
      reach: String(Math.round(impressions / 2)),
      clicks: String(link * 2),
      inline_link_clicks: String(link),
      actions: acts,
      ...extra,
    });
    if (level === "account") return { status: 200, body: page([row(d2, { account_id: "1455371035858511" }, "70.00", 2000, 40, actions(4, 2)), row(d1, { account_id: "1455371035858511" }, "80.00", 3000, 60, actions(6, 1))]) };
    if (level === "campaign")
      return {
        status: 200,
        body: page([row(d2, { campaign_id: "c1", campaign_name: "Leads Botox" }, "60.00", 1600, 30, actions(4)), row(d1, { campaign_id: "c1", campaign_name: "Leads Botox" }, "60.00", 2400, 40, actions(6)), row(d1, { campaign_id: "c2", campaign_name: "Tráfego Insta" }, "30.00", 1000, 30, [{ action_type: "link_click", value: "30" }])]),
      };
    if (level === "adset")
      return {
        status: 200,
        body: page([row(d2, { adset_id: "s1" }, "60.00", 1600, 30, actions(4)), row(d1, { adset_id: "s1" }, "60.00", 2400, 40, actions(6)), row(d1, { adset_id: "s2" }, "30.00", 1000, 30, [{ action_type: "link_click", value: "30" }])]),
      };
    return {
      status: 200,
      body: page([row(d2, { ad_id: "ad1" }, "60.00", 1600, 30, actions(4)), row(d1, { ad_id: "ad1" }, "60.00", 2400, 40, actions(6)), row(d1, { ad_id: "ad2" }, "30.00", 1000, 30, [])]),
    };
  }
  return { status: 404, body: { error: { message: `rota falsa sem resposta: ${path}`, code: 803 } } };
}

beforeEach(async () => {
  await resetDb();
  calls = [];
  scopes = ["ads_read", "public_profile"];
  tokenValid = true;
  failWith = null;
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+\/?/, "");
    calls.push({ path, params: url.searchParams });
    if (init?.method === "DELETE") return new Response(JSON.stringify({ success: true }), { status: 200 });
    const r = fakeGraph(path, url.searchParams);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function connectedSetup() {
  const admin = await makeUser("ADMIN", { name: "Pedro" });
  await completeMetaOAuth(admin.actor, "good-code");
  const client = await createClient(admin.actor, { name: "Studio Da Beleza", status: "ACTIVE" });
  const account = await db.metaAdAccount.findUniqueOrThrow({ where: { externalId: "act_1455371035858511" } });
  await linkAdAccount(admin.actor, { accountId: account.id, clientId: client.id });
  return { admin, client, account };
}

describe("OAuth da Meta", () => {
  it("state só vale para a sessão que iniciou o fluxo", () => {
    const state = "s".repeat(32);
    const cookie = oauthBinding(state, "session-A");
    expect(verifyOAuthState(state, cookie, "session-A")).toBe(true);
    expect(verifyOAuthState(state, cookie, "session-B")).toBe(false);
    expect(verifyOAuthState("x".repeat(32), cookie, "session-A")).toBe(false);
    expect(verifyOAuthState(state, undefined, "session-A")).toBe(false);
    expect(verifyOAuthState(null, cookie, "session-A")).toBe(false);
  });

  it("URL de autorização pede só ads_read e leva state e redirect", () => {
    const url = new URL(buildAuthorizeUrl("abc".repeat(10)));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("scope")).toBe("ads_read");
    expect(url.searchParams.get("state")).toBe("abc".repeat(10));
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/integrations\/meta\/callback$/);
  });

  it("callback troca o código, guarda token longo cifrado e lista contas com paginação", async () => {
    const admin = await makeUser("ADMIN");
    const r = await completeMetaOAuth(admin.actor, "good-code");
    expect(r).toMatchObject({ accounts: 2, missingScopes: [] });
    const c = await db.metaConnection.findFirstOrThrow();
    expect(c).toMatchObject({ status: "CONNECTED", metaUserName: "Pedro Meta", connectedById: admin.id });
    expect(c.encryptedAccessToken).not.toContain("long-token");
    expect(decryptToken(c.encryptedAccessToken!)).toBe("long-token");
    expect((await db.metaAdAccount.findMany({ orderBy: { name: "asc" } })).map((a) => a.externalId)).toEqual(["act_2223334445", "act_1455371035858511"]);
    // Chamadas com token de usuário levam appsecret_proof.
    expect(calls.find((x) => x.path === "me")?.params.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
    // Contas novas não são sincronizadas até o vínculo com um cliente.
    expect(await db.metaAdAccount.count({ where: { enabled: true } })).toBe(0);
  });

  it("sem ads_read a conexão fica como permissão insuficiente e não lista contas", async () => {
    scopes = ["public_profile"];
    const admin = await makeUser("ADMIN");
    const r = await completeMetaOAuth(admin.actor, "good-code");
    expect(r.missingScopes).toEqual(["ads_read"]);
    expect((await db.metaConnection.findFirstOrThrow()).status).toBe("PERMISSION_DENIED");
    expect(await db.metaAdAccount.count()).toBe(0);
  });

  it("token inválido ou código recusado não cria conexão", async () => {
    const admin = await makeUser("ADMIN");
    tokenValid = false;
    await expect(completeMetaOAuth(admin.actor, "good-code")).rejects.toThrow(/Token inválido/);
    tokenValid = true;
    await expect(completeMetaOAuth(admin.actor, "bad")).rejects.toThrow();
    expect(await db.metaConnection.count()).toBe(0);
  });

  it("só administradores conectam, vinculam e desconectam", async () => {
    const manager = await makeUser("MANAGER");
    await expect(completeMetaOAuth(manager.actor, "good-code")).rejects.toThrow(/administradores/);
    const { account, admin } = await connectedSetup();
    await expect(linkAdAccount(manager.actor, { accountId: account.id, clientId: null })).rejects.toThrow(/administradores/);
    const conn = await db.metaConnection.findFirstOrThrow();
    await expect(disconnectMeta(manager.actor, conn.id)).rejects.toThrow(/administradores/);
    await disconnectMeta(admin.actor, conn.id);
    expect(await db.metaConnection.findFirstOrThrow()).toMatchObject({ status: "DISCONNECTED", encryptedAccessToken: null });
  });
});

describe("vínculo de contas com clientes", () => {
  it("normaliza o ID e exige confirmação para mover a conta de cliente", async () => {
    expect(normalizeAdAccountId("1455371035858511")).toBe("act_1455371035858511");
    expect(normalizeAdAccountId("act_1455371035858511")).toBe("act_1455371035858511");
    expect(() => normalizeAdAccountId("act_abc")).toThrow();

    const { admin, account, client } = await connectedSetup();
    expect(await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ clientId: client.id, enabled: true });
    const other = await createClient(admin.actor, { name: "Outro Cliente", status: "ACTIVE" });
    await expect(linkAdAccount(admin.actor, { accountId: account.id, clientId: other.id })).rejects.toThrow(/já está vinculada a Studio Da Beleza/);
    await linkAdAccount(admin.actor, { accountId: account.id, clientId: other.id, move: true });
    expect((await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } })).clientId).toBe(other.id);
    await linkAdAccount(admin.actor, { accountId: account.id, clientId: null });
    expect(await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ clientId: null, enabled: false });
  });
});

describe("sincronização", () => {
  it("traz entidades com paginação, criativos e métricas diárias por nível", async () => {
    const { account } = await connectedSetup();
    const r = await syncAdAccount(account.id, { kind: "RECENT" });
    expect(r.status).toBe("SUCCESS");
    expect((await db.metaCampaign.findMany({ orderBy: { name: "asc" } })).map((c) => c.name)).toEqual(["Leads Botox", "Tráfego Insta"]);
    expect(await db.metaAdSet.count()).toBe(2);
    const creative = await db.metaCreative.findUniqueOrThrow({ where: { externalId: "cr1" } });
    expect(creative).toMatchObject({ format: "VIDEO", primaryText: "Agende sua avaliação", headline: "Botox", callToAction: "WHATSAPP_MESSAGE" });
    expect((await db.metaCreative.findUniqueOrThrow({ where: { externalId: "cr2" } })).format).toBe("CAROUSEL");
    expect(await db.metaInsight.count({ where: { level: "ACCOUNT" } })).toBe(2);
    expect(await db.metaInsight.count({ where: { level: "AD" } })).toBe(3);
    // Primeira sincronização de uma conta é sempre a inicial (90 dias).
    const job = await db.metaSyncJob.findFirstOrThrow();
    expect(job).toMatchObject({ kind: "INITIAL", status: "SUCCESS" });
    expect(job.since?.toISOString().slice(0, 10)).toBe(shiftDays(today, -89));
    expect((await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } })).lastSyncOk).toBe(true);
    // Insights pedem séries diárias com a atribuição configurada no anúncio.
    const insight = calls.find((c) => c.path.endsWith("/insights") && c.params.get("level") === "ad");
    expect(insight?.params.get("time_increment")).toBe("1");
    expect(insight?.params.get("use_unified_attribution_setting")).toBe("true");
  });

  it("reprocessar o mesmo intervalo substitui as métricas (sem duplicar)", async () => {
    const { account } = await connectedSetup();
    await syncAdAccount(account.id, { kind: "RECENT" });
    await syncAdAccount(account.id, { kind: "RECENT" });
    expect(await db.metaInsight.count({ where: { level: "ACCOUNT" } })).toBe(2);
    expect((await db.metaSyncJob.findMany({ orderBy: { startedAt: "asc" } })).map((j) => j.kind)).toEqual(["INITIAL", "RECENT"]);
  });

  it("não roda duas sincronizações da mesma conta ao mesmo tempo", async () => {
    const { account } = await connectedSetup();
    await db.metaAdAccount.update({ where: { id: account.id }, data: { syncLockedUntil: new Date(Date.now() + 60_000) } });
    expect((await syncAdAccount(account.id)).status).toBe("SKIPPED");
  });

  it("token revogado marca a conexão e mantém os últimos dados", async () => {
    const { account } = await connectedSetup();
    await syncAdAccount(account.id, { kind: "RECENT" });
    failWith = { code: 190, subcode: 460 };
    const r = await syncAdAccount(account.id, { kind: "RECENT" });
    expect(r.status).toBe("ERROR");
    expect(r.error).toMatch(/Reconecte/);
    expect((await db.metaConnection.findFirstOrThrow()).status).toBe("REVOKED");
    expect(await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ lastSyncOk: false });
    expect(await db.metaInsight.count({ where: { level: "ACCOUNT" } })).toBe(2);
    expect((await db.metaSyncJob.findFirstOrThrow({ where: { status: "ERROR" } })).error).toMatch(/Reconecte/);
  });

  it("limite de uso da Meta é tentado de novo e depois reportado", async () => {
    const { account } = await connectedSetup();
    failWith = { code: 17 };
    const r = await syncAdAccount(account.id, { kind: "RECENT" });
    expect(r.error).toMatch(/limitou/);
    // 3 tentativas na primeira chamada (dados da conta).
    expect(calls.filter((c) => /^act_\d+$/.test(c.path)).length).toBe(3);
    expect((await db.metaConnection.findFirstOrThrow()).status).toBe("CONNECTED");
  });

  it("alcance do período vem da API e fica em cache", async () => {
    const { account } = await connectedSetup();
    const acc = await db.metaAdAccount.findUniqueOrThrow({ where: { id: account.id } });
    const first = await periodReach(acc, "ACCOUNT", d2, d1);
    expect(first?.reach.get("act_1455371035858511")).toBe(1500);
    const n = calls.length;
    const again = await periodReach(acc, "ACCOUNT", d2, d1);
    expect(again).toMatchObject({ stale: false });
    expect(calls.length).toBe(n);
    // Falha da API: devolve o último valor guardado, marcado como desatualizado.
    await db.metaInsightPeriod.updateMany({ data: { fetchedAt: new Date(Date.now() - 2 * 60 * 60_000) } });
    failWith = { code: 2 };
    expect(await periodReach(acc, "ACCOUNT", d2, d1)).toMatchObject({ stale: true });
  });
});

describe("leitura para as telas", () => {
  it("dashboard do cliente: totais, indicadores, resultado principal e alcance do período", async () => {
    const { admin, account, client } = await connectedSetup();
    await syncAdAccount(account.id, { kind: "RECENT" });
    const data = await getClientAds(admin.actor, client.id, { periodo: "custom", de: d2, ate: d1 }, { campaigns: true, adSets: true, ads: true });
    if (data.empty) throw new Error("esperava dados");
    const s = data.summary;
    expect(s.spendCents).toBe(15000);
    expect(s.impressions).toBe(5000);
    expect(s.linkClicks).toBe(100);
    expect(s.clicks).toBe(200);
    expect(s.cpc).toBe(150);
    expect(s.ctr).toBe(2);
    expect(s.cpm).toBe(3000);
    expect(s.leads).toBe(10); // ação "lead", sem somar o equivalente do pixel
    expect(s.conversations).toBe(3);
    expect(s.reach).toBe(1500);
    expect(s.frequency).toBeCloseTo(5000 / 1500);
    // Resultado principal: leads (maior investimento), custo só sobre os conjuntos de leads.
    expect(s.result).toMatchObject({ kind: "lead", count: 10, costPerResult: 1200, mixed: true });
    expect(s.roas).toBeNull();

    const leads = data.campaigns.find((c) => c.name === "Leads Botox")!;
    expect(leads).toMatchObject({ spendCents: 12000, results: 10, costPerResult: 1200, reach: 1200, resultLabel: "Leads" });
    expect(leads.status.key).toBe("active");
    expect(data.campaigns.find((c) => c.name === "Tráfego Insta")).toMatchObject({ resultLabel: "Cliques no link", results: 30, costPerResult: 100 });
    expect(data.adSets.find((x) => x.name === "Mulheres 25-45")?.targeting).toMatchObject({ age: "25–45 anos", genders: "Mulheres", places: ["São Paulo (+10 km)"] });

    const ad1 = data.ads.find((a) => a.externalId === "ad1")!;
    expect(ad1).toMatchObject({ delivering: true, results: 10, previewUrl: "https://fb.me/preview" });
    expect(ad1.creative?.format).toBe("VIDEO");
    // Ativo no anúncio, mas a campanha está pausada: não conta como em veiculação.
    expect(data.ads.find((a) => a.externalId === "ad2")).toMatchObject({ delivering: false });
    expect(data.ads.find((a) => a.externalId === "ad2")?.status.key).toBe("paused");

    // Série diária com zero só em dias sincronizados.
    expect(data.series.map((p) => p.spendCents)).toEqual([7000, 8000]);
    expect(data.previousSeries.every((p) => p.spendCents === 0)).toBe(true);
  });

  it("membro só vê clientes vinculados; trocar o ID na URL não abre outro cliente", async () => {
    const { admin, account, client } = await connectedSetup();
    await syncAdAccount(account.id, { kind: "RECENT" });
    const outsider = await makeUser("MEMBER");
    await expect(getClientAds(outsider.actor, client.id, {})).rejects.toThrow(/Cliente não encontrado/);
    expect((await getAdsOverview(outsider.actor, {})).hasAccounts).toBe(false);

    const member = await makeUser("MEMBER");
    await db.clientMember.create({ data: { clientId: client.id, userId: member.id } });
    const data = await getClientAds(member.actor, client.id, { periodo: "custom", de: d2, ate: d1 });
    expect(data.empty).toBe(false);
    expect(data.canSync).toBe(false);
    expect((await getClientAds(admin.actor, client.id, {})).canSync).toBe(true);
  });

  it("cliente sem conta vinculada e visão geral consolidada", async () => {
    const { admin, account } = await connectedSetup();
    const empty = await createClient(admin.actor, { name: "Sem anúncios", status: "ACTIVE" });
    expect((await getClientAds(admin.actor, empty.id, {})).empty).toBe(true);

    await syncAdAccount(account.id, { kind: "RECENT" });
    const o = await getAdsOverview(admin.actor, { periodo: "custom", de: d2, ate: d1 });
    expect(o.hasAccounts).toBe(true);
    expect(o.totalsByCurrency).toMatchObject([{ currency: "BRL", spendCents: 15000 }]);
    expect(o.activeCampaigns).toBe(1);
    expect(o.current).toMatchObject({ impressions: 5000, linkClicks: 100, leads: 10, conversations: 3 });
    expect(o.clients.map((c) => c.name)).toEqual(["Studio Da Beleza"]);
  });
});
