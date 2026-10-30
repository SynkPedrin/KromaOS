/**
 * Normalização das respostas da Meta Marketing API e indicadores derivados.
 * Regra geral: ausência de dado é null ("Não disponível"), nunca zero inventado.
 */

export type ActionMap = Record<string, number>;
type RawAction = { action_type?: string; value?: string | number };

// ─────────────────────────── Valores ───────────────────────────

/** Moedas em que a Meta informa orçamentos sem casas decimais (offset 1). */
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

/** "123.45" (unidade da moeda) → centavos. Vazio ou inválido → null. */
export function moneyToCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Orçamentos já vêm na menor unidade da moeda; normaliza para "centavos" do formato interno. */
export function budgetToCents(v: string | number | null | undefined, currency: string): number | null {
  if (v === null || v === undefined || v === "" || Number(v) <= 0) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? n * 100 : n;
}

export function toInt(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Lista de ações da Meta → mapa { action_type: quantidade }. */
export function parseActions(list: RawAction[] | null | undefined): ActionMap {
  const out: ActionMap = {};
  for (const a of list ?? []) {
    if (!a.action_type) continue;
    const n = Number(a.value);
    if (Number.isFinite(n)) out[a.action_type] = (out[a.action_type] ?? 0) + n;
  }
  return out;
}

/** Valores de conversão (action_values) → centavos por action_type. */
export function parseActionValues(list: RawAction[] | null | undefined): ActionMap {
  const out: ActionMap = {};
  for (const [k, v] of Object.entries(parseActions(list))) out[k] = Math.round(v * 100);
  return out;
}

export function mergeActions(target: ActionMap, add: unknown) {
  if (!add || typeof add !== "object") return target;
  for (const [k, v] of Object.entries(add as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) target[k] = (target[k] ?? 0) + v;
  }
  return target;
}

// ─────────────────────────── Resultados ───────────────────────────

/**
 * Tipos de resultado e os action_types que os representam, em ordem de preferência.
 * Usa-se o PRIMEIRO action_type presente (os tipos agregados da Meta já incluem os detalhados);
 * somar todos contaria o mesmo lead mais de uma vez.
 */
export const RESULT_KINDS = {
  lead: { label: "Leads", unit: "lead", actionTypes: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"] },
  messaging: { label: "Conversas iniciadas", unit: "conversa", actionTypes: ["onsite_conversion.messaging_conversation_started_7d"] },
  purchase: { label: "Compras", unit: "compra", actionTypes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"] },
  registration: {
    label: "Cadastros",
    unit: "cadastro",
    actionTypes: ["omni_complete_registration", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
  },
  link_click: { label: "Cliques no link", unit: "clique", actionTypes: ["link_click"] },
  landing_page_view: { label: "Visualizações da página de destino", unit: "visualização", actionTypes: ["landing_page_view", "omni_landing_page_view"] },
  post_engagement: { label: "Engajamentos com a publicação", unit: "engajamento", actionTypes: ["post_engagement"] },
  page_like: { label: "Curtidas na página", unit: "curtida", actionTypes: ["like"] },
  video_view: { label: "Visualizações do vídeo (3 s)", unit: "visualização", actionTypes: ["video_view"] },
  app_install: { label: "Instalações do app", unit: "instalação", actionTypes: ["omni_app_install", "mobile_app_install", "app_install"] },
} as const;

export type ResultKind = keyof typeof RESULT_KINDS;

export function actionCount(actions: ActionMap, kind: ResultKind): number {
  for (const t of RESULT_KINDS[kind].actionTypes) if (actions[t] !== undefined) return actions[t];
  return 0;
}

const BY_EVENT: Record<string, ResultKind> = {
  PURCHASE: "purchase",
  LEAD: "lead",
  COMPLETE_REGISTRATION: "registration",
};

const BY_GOAL: Record<string, ResultKind | null> = {
  LEAD_GENERATION: "lead",
  QUALITY_LEAD: "lead",
  CONVERSATIONS: "messaging",
  LINK_CLICKS: "link_click",
  LANDING_PAGE_VIEWS: "landing_page_view",
  POST_ENGAGEMENT: "post_engagement",
  ENGAGED_USERS: "post_engagement",
  PAGE_LIKES: "page_like",
  THRUPLAY: "video_view",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "video_view",
  APP_INSTALLS: "app_install",
  // Reconhecimento: o resultado é alcance/impressões, não uma ação.
  REACH: null,
  IMPRESSIONS: null,
  AD_RECALL_LIFT: null,
};

const BY_OBJECTIVE: Record<string, ResultKind> = {
  OUTCOME_LEADS: "lead",
  LEAD_GENERATION: "lead",
  OUTCOME_SALES: "purchase",
  CONVERSIONS: "purchase",
  OUTCOME_TRAFFIC: "link_click",
  LINK_CLICKS: "link_click",
  OUTCOME_ENGAGEMENT: "post_engagement",
  POST_ENGAGEMENT: "post_engagement",
  MESSAGES: "messaging",
  OUTCOME_APP_PROMOTION: "app_install",
  APP_INSTALLS: "app_install",
  VIDEO_VIEWS: "video_view",
};

/**
 * Tipo de resultado de um conjunto: pela meta de otimização (mais precisa), depois pelo evento
 * de conversão promovido e, por fim, pelo objetivo da campanha. null = sem resultado por ação.
 */
export function resultKindFor(adSet: { optimizationGoal?: string | null; promotedObject?: unknown }, campaignObjective?: string | null): ResultKind | null {
  const goal = adSet.optimizationGoal ?? "";
  if (goal in BY_GOAL) return BY_GOAL[goal];
  const event = (adSet.promotedObject as { custom_event_type?: string } | null)?.custom_event_type;
  if (event && BY_EVENT[event]) return BY_EVENT[event];
  if (campaignObjective && BY_OBJECTIVE[campaignObjective]) return BY_OBJECTIVE[campaignObjective];
  return null;
}

// ─────────────────────────── Indicadores ───────────────────────────

export type Totals = {
  spendCents: number;
  impressions: number;
  clicks: number;
  linkClicks: number | null;
  actions: ActionMap;
  actionValues: ActionMap;
};

export const emptyTotals = (): Totals => ({ spendCents: 0, impressions: 0, clicks: 0, linkClicks: null, actions: {}, actionValues: {} });

export function addTotals(t: Totals, row: { spendCents: number; impressions: number; clicks: number; linkClicks: number | null; actions: unknown; actionValues?: unknown }) {
  t.spendCents += row.spendCents;
  t.impressions += row.impressions;
  t.clicks += row.clicks;
  if (row.linkClicks !== null) t.linkClicks = (t.linkClicks ?? 0) + row.linkClicks;
  mergeActions(t.actions, row.actions);
  mergeActions(t.actionValues, row.actionValues);
  return t;
}

const ratio = (num: number | null, den: number | null) => (num === null || den === null || den <= 0 ? null : num / den);

/** CPM em centavos: custo por mil impressões. */
export const cpm = (spendCents: number, impressions: number) => {
  const r = ratio(spendCents, impressions);
  return r === null ? null : r * 1000;
};
/** CPC (link) em centavos: investimento / cliques no link. */
export const cpc = (spendCents: number, linkClicks: number | null) => ratio(spendCents, linkClicks);
/** CTR (link) em %: cliques no link / impressões. */
export const ctr = (linkClicks: number | null, impressions: number) => {
  const r = ratio(linkClicks, impressions);
  return r === null ? null : r * 100;
};
export const frequency = (impressions: number, reach: number | null) => ratio(impressions, reach);
/** Custo por resultado só com investimento e resultados válidos da mesma definição. */
export const costPerResult = (spendCents: number, results: number | null) => (spendCents > 0 ? ratio(spendCents, results) : null);

/** ROAS só existe com valor de compra atribuído pela Meta; sem isso, null. */
export function roas(t: Totals): number | null {
  const value = t.actionValues.omni_purchase ?? t.actionValues.purchase ?? null;
  return value && value > 0 && t.spendCents > 0 ? value / t.spendCents : null;
}

/** Variação % só quando o período anterior tem base positiva. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

// ─────────────────────────── Status ───────────────────────────

export type StatusKey = "active" | "paused" | "review" | "issues" | "rejected" | "ended" | "archived" | "deleted" | "pending";

export const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  active: { label: "Ativo", color: "#3E9B12" },
  paused: { label: "Pausado", color: "#6E6A75" },
  review: { label: "Em análise", color: "#7625F5" },
  issues: { label: "Com problemas", color: "#E08A00" },
  rejected: { label: "Reprovado", color: "#E5484D" },
  ended: { label: "Encerrado", color: "#3B6FD9" },
  archived: { label: "Arquivado", color: "#9A94A3" },
  deleted: { label: "Excluído", color: "#9A94A3" },
  pending: { label: "Pagamento pendente", color: "#E08A00" },
};

/**
 * Status efetivo prevalece sobre o configurado: um anúncio "ACTIVE" dentro de campanha pausada
 * aparece como pausado; com data de término no passado, como encerrado.
 */
export function normalizeStatus(effective: string | null | undefined, configured: string | null | undefined, endTime?: Date | string | null, now = new Date()) {
  const eff = (effective ?? configured ?? "").toUpperCase();
  let key: StatusKey;
  let detail: string | null = null;
  switch (eff) {
    case "ACTIVE":
      key = endTime && new Date(endTime) < now ? "ended" : "active";
      break;
    case "PAUSED":
      key = "paused";
      break;
    case "CAMPAIGN_PAUSED":
      key = "paused";
      detail = "Campanha pausada";
      break;
    case "ADSET_PAUSED":
      key = "paused";
      detail = "Conjunto pausado";
      break;
    case "PENDING_REVIEW":
    case "IN_PROCESS":
    case "PREAPPROVED":
      key = "review";
      break;
    case "DISAPPROVED":
      key = "rejected";
      break;
    case "WITH_ISSUES":
      key = "issues";
      break;
    case "PENDING_BILLING_INFO":
      key = "pending";
      break;
    case "ARCHIVED":
      key = "archived";
      break;
    case "DELETED":
      key = "deleted";
      break;
    default:
      key = "paused";
      detail = eff ? `Status da Meta: ${eff}` : "Status não informado";
  }
  return { key, label: STATUS_META[key].label, color: STATUS_META[key].color, detail, configured: configured ?? null };
}

export const ACCOUNT_STATUS: Record<number, { label: string; ok: boolean }> = {
  1: { label: "Ativa", ok: true },
  2: { label: "Desativada", ok: false },
  3: { label: "Pagamento pendente", ok: false },
  7: { label: "Em análise de risco", ok: false },
  8: { label: "Acerto pendente", ok: false },
  9: { label: "Em período de carência", ok: true },
  100: { label: "Encerramento pendente", ok: false },
  101: { label: "Encerrada", ok: false },
  201: { label: "Ativa", ok: true },
  202: { label: "Encerrada", ok: false },
};

export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Cadastros (leads)",
  OUTCOME_APP_PROMOTION: "Promoção do app",
  OUTCOME_SALES: "Vendas",
  BRAND_AWARENESS: "Reconhecimento da marca",
  REACH: "Alcance",
  LINK_CLICKS: "Tráfego",
  POST_ENGAGEMENT: "Engajamento",
  LEAD_GENERATION: "Geração de cadastros",
  MESSAGES: "Mensagens",
  CONVERSIONS: "Conversões",
  VIDEO_VIEWS: "Visualizações do vídeo",
  APP_INSTALLS: "Instalações do app",
};

export const objectiveLabel = (o: string | null | undefined) => (o ? (OBJECTIVE_LABEL[o] ?? o) : "Não informado");

export const OPTIMIZATION_LABEL: Record<string, string> = {
  LEAD_GENERATION: "Leads",
  QUALITY_LEAD: "Leads de qualidade",
  CONVERSATIONS: "Conversas",
  LINK_CLICKS: "Cliques no link",
  LANDING_PAGE_VIEWS: "Visualizações da página",
  OFFSITE_CONVERSIONS: "Conversões",
  ONSITE_CONVERSIONS: "Conversões no Facebook/Instagram",
  VALUE: "Valor das conversões",
  POST_ENGAGEMENT: "Engajamento",
  REACH: "Alcance",
  IMPRESSIONS: "Impressões",
  THRUPLAY: "ThruPlay",
  PROFILE_VISIT: "Visitas ao perfil",
  APP_INSTALLS: "Instalações do app",
  AD_RECALL_LIFT: "Lembrança do anúncio",
};

// ─────────────────────────── Criativos ───────────────────────────

export type CreativeFormat = "IMAGE" | "VIDEO" | "CAROUSEL" | "OTHER";

type RawCreative = {
  object_type?: string;
  video_id?: string;
  image_url?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
  link_url?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      description?: string;
      link?: string;
      picture?: string;
      call_to_action?: { type?: string };
      child_attachments?: { name?: string; picture?: string; image_hash?: string; link?: string }[];
    };
    video_data?: { message?: string; title?: string; image_url?: string; video_id?: string; call_to_action?: { type?: string; value?: { link?: string } } };
    photo_data?: { caption?: string; url?: string };
  };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[]; call_to_action_types?: string[]; videos?: unknown[]; link_urls?: { website_url?: string }[] };
};

/** Extrai formato, textos e CTA dos campos que a Meta retornar (todos opcionais). */
export function describeCreative(c: RawCreative) {
  const link = c.object_story_spec?.link_data;
  const video = c.object_story_spec?.video_data;
  const feed = c.asset_feed_spec;
  const children = link?.child_attachments?.filter((x) => x.picture) ?? [];

  let format: CreativeFormat = "OTHER";
  if (children.length > 1) format = "CAROUSEL";
  else if (c.video_id || video?.video_id || c.object_type === "VIDEO" || (feed?.videos?.length ?? 0) > 0) format = "VIDEO";
  else if (c.image_url || link?.picture || c.object_type === "PHOTO" || c.object_type === "SHARE") format = "IMAGE";

  return {
    format,
    primaryText: c.body ?? link?.message ?? video?.message ?? c.object_story_spec?.photo_data?.caption ?? feed?.bodies?.[0]?.text ?? null,
    headline: c.title ?? link?.name ?? video?.title ?? feed?.titles?.[0]?.text ?? null,
    description: link?.description ?? null,
    callToAction: c.call_to_action_type ?? link?.call_to_action?.type ?? video?.call_to_action?.type ?? feed?.call_to_action_types?.[0] ?? null,
    linkUrl: c.link_url ?? link?.link ?? video?.call_to_action?.value?.link ?? feed?.link_urls?.[0]?.website_url ?? null,
    imageUrl: c.image_url ?? link?.picture ?? video?.image_url ?? null,
    videoId: c.video_id ?? video?.video_id ?? null,
    carousel: children.length > 1 ? children.map((x) => ({ name: x.name ?? null, picture: x.picture!, link: x.link ?? null })) : null,
  };
}

export const FORMAT_LABEL: Record<CreativeFormat, string> = { IMAGE: "Imagem", VIDEO: "Vídeo", CAROUSEL: "Carrossel", OTHER: "Outro formato" };

export const CTA_LABEL: Record<string, string> = {
  LEARN_MORE: "Saiba mais",
  SHOP_NOW: "Comprar agora",
  SIGN_UP: "Cadastre-se",
  CONTACT_US: "Fale conosco",
  MESSAGE_PAGE: "Enviar mensagem",
  WHATSAPP_MESSAGE: "Enviar mensagem no WhatsApp",
  SEND_MESSAGE: "Enviar mensagem",
  BOOK_TRAVEL: "Reservar",
  BOOK_NOW: "Reservar agora",
  GET_OFFER: "Obter oferta",
  GET_QUOTE: "Solicitar orçamento",
  APPLY_NOW: "Inscreva-se",
  DOWNLOAD: "Baixar",
  SUBSCRIBE: "Assinar",
  CALL_NOW: "Ligar agora",
  ORDER_NOW: "Pedir agora",
  WATCH_MORE: "Assistir mais",
  INSTAGRAM_MESSAGE: "Enviar mensagem no Instagram",
  NO_BUTTON: "Sem botão",
};

export const ctaLabel = (cta: string | null | undefined) => (cta ? (CTA_LABEL[cta] ?? cta.replaceAll("_", " ").toLowerCase()) : null);

// ─────────────────────────── Formatação ───────────────────────────

export function formatCurrency(cents: number | null, currency = "BRL", compact = false) {
  if (cents === null) return "Não disponível";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  }).format(cents / 100);
}

export const formatInt = (n: number | null) => (n === null ? "Não disponível" : Math.round(n).toLocaleString("pt-BR"));
export const formatCompact = (n: number | null) =>
  n === null ? "Não disponível" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const formatPct = (n: number | null, digits = 2) => (n === null ? "Não disponível" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`);
export const formatDecimal = (n: number | null, digits = 2) => (n === null ? "Não disponível" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
