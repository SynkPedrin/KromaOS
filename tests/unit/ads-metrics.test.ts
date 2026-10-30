import { describe, expect, it } from "vitest";
import {
  actionCount,
  addTotals,
  budgetToCents,
  costPerResult,
  cpc,
  cpm,
  ctr,
  describeCreative,
  emptyTotals,
  frequency,
  moneyToCents,
  normalizeStatus,
  parseActions,
  parseActionValues,
  pctChange,
  resultKindFor,
  roas,
} from "@/lib/ads/metrics";
import { daysBetween, previousPeriod, resolvePeriod, shiftDays } from "@/lib/ads/periods";
import { classifyMetaError } from "@/server/meta/graph";

describe("valores da Meta", () => {
  it("converte gasto (unidade da moeda) e orçamento (menor unidade) para centavos", () => {
    expect(moneyToCents("123.45")).toBe(12345);
    expect(moneyToCents("0")).toBe(0);
    expect(moneyToCents(undefined)).toBeNull();
    expect(moneyToCents("abc")).toBeNull();
    expect(budgetToCents("5000", "BRL")).toBe(5000);
    expect(budgetToCents("1000", "JPY")).toBe(100000);
    expect(budgetToCents("0", "BRL")).toBeNull();
    expect(budgetToCents(undefined, "BRL")).toBeNull();
  });

  it("agrupa a lista de ações e valores de conversão", () => {
    const a = parseActions([
      { action_type: "lead", value: "3" },
      { action_type: "link_click", value: "40" },
      { action_type: "lead", value: "2" },
      { value: "9" },
    ]);
    expect(a).toEqual({ lead: 5, link_click: 40 });
    expect(parseActionValues([{ action_type: "omni_purchase", value: "199.90" }])).toEqual({ omni_purchase: 19990 });
  });
});

describe("indicadores derivados", () => {
  it("CPM, CPC (link), CTR (link) e frequência com divisão por zero tratada", () => {
    expect(cpm(10000, 20000)).toBe(500); // R$ 100 / 20 mil impressões = R$ 5,00 por mil
    expect(cpm(10000, 0)).toBeNull();
    expect(cpc(10000, 50)).toBe(200);
    expect(cpc(10000, 0)).toBeNull();
    expect(cpc(10000, null)).toBeNull();
    expect(ctr(50, 2000)).toBe(2.5);
    expect(ctr(null, 2000)).toBeNull();
    expect(frequency(3000, 1000)).toBe(3);
    expect(frequency(3000, null)).toBeNull();
  });

  it("custo por resultado só com investimento e resultados válidos", () => {
    expect(costPerResult(10000, 4)).toBe(2500);
    expect(costPerResult(10000, 0)).toBeNull();
    expect(costPerResult(0, 4)).toBeNull();
    expect(costPerResult(10000, null)).toBeNull();
  });

  it("variação percentual não divide por zero", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
  });

  it("ROAS só com valor de compra atribuído", () => {
    const t = addTotals(emptyTotals(), { spendCents: 10000, impressions: 1, clicks: 0, linkClicks: null, actions: {}, actionValues: { omni_purchase: 35000 } });
    expect(roas(t)).toBe(3.5);
    expect(roas(addTotals(emptyTotals(), { spendCents: 10000, impressions: 1, clicks: 0, linkClicks: null, actions: { lead: 2 } }))).toBeNull();
  });

  it("cliques no link não se confundem com cliques totais", () => {
    const t = addTotals(emptyTotals(), { spendCents: 100, impressions: 10, clicks: 9, linkClicks: null, actions: {} });
    expect(t.clicks).toBe(9);
    expect(t.linkClicks).toBeNull();
    addTotals(t, { spendCents: 100, impressions: 10, clicks: 5, linkClicks: 2, actions: {} });
    expect(t.linkClicks).toBe(2);
  });
});

describe("interpretação de resultados", () => {
  it("usa a meta de otimização, depois o evento promovido e o objetivo da campanha", () => {
    expect(resultKindFor({ optimizationGoal: "LEAD_GENERATION" }, "OUTCOME_LEADS")).toBe("lead");
    expect(resultKindFor({ optimizationGoal: "CONVERSATIONS" }, "OUTCOME_ENGAGEMENT")).toBe("messaging");
    expect(resultKindFor({ optimizationGoal: "OFFSITE_CONVERSIONS", promotedObject: { custom_event_type: "PURCHASE" } }, "OUTCOME_SALES")).toBe("purchase");
    expect(resultKindFor({ optimizationGoal: "REACH" }, "OUTCOME_AWARENESS")).toBeNull();
    // Tráfego para o perfil do Instagram não vira "cliques no link" pelo objetivo da campanha.
    expect(resultKindFor({ optimizationGoal: "VISIT_INSTAGRAM_PROFILE" }, "OUTCOME_TRAFFIC")).toBeNull();
    expect(resultKindFor({ optimizationGoal: "CONVERSATIONS", destinationType: "WHATSAPP" } as never, "OUTCOME_SALES")).toBe("messaging");
    expect(resultKindFor({ optimizationGoal: null }, "OUTCOME_TRAFFIC")).toBe("link_click");
    expect(resultKindFor({ optimizationGoal: null }, "SOMETHING_NEW")).toBeNull();
  });

  it("conta o primeiro action_type disponível, sem somar os equivalentes", () => {
    expect(actionCount({ lead: 5, "offsite_conversion.fb_pixel_lead": 3 }, "lead")).toBe(5);
    expect(actionCount({ "offsite_conversion.fb_pixel_lead": 3 }, "lead")).toBe(3);
    expect(actionCount({ lead: 5 }, "messaging")).toBe(0);
    expect(actionCount({ "onsite_conversion.messaging_conversation_started_7d": 7 }, "messaging")).toBe(7);
  });
});

describe("status", () => {
  it("status efetivo prevalece e término no passado vira encerrado", () => {
    expect(normalizeStatus("CAMPAIGN_PAUSED", "ACTIVE").key).toBe("paused");
    expect(normalizeStatus("CAMPAIGN_PAUSED", "ACTIVE").detail).toBe("Campanha pausada");
    expect(normalizeStatus("ACTIVE", "ACTIVE", "2020-01-01T00:00:00Z").key).toBe("ended");
    expect(normalizeStatus("ACTIVE", "ACTIVE", "2999-01-01T00:00:00Z").key).toBe("active");
    expect(normalizeStatus("PENDING_REVIEW", "ACTIVE").key).toBe("review");
    expect(normalizeStatus("DISAPPROVED", "ACTIVE").key).toBe("rejected");
  });
});

describe("criativos", () => {
  it("identifica imagem, vídeo e carrossel e extrai textos", () => {
    const img = describeCreative({
      object_story_spec: { link_data: { message: "Agende já", name: "Promo", picture: "https://x.fbcdn.net/a.jpg", call_to_action: { type: "WHATSAPP_MESSAGE" }, link: "https://wa.me/1" } },
    });
    expect(img).toMatchObject({ format: "IMAGE", primaryText: "Agende já", headline: "Promo", callToAction: "WHATSAPP_MESSAGE", imageUrl: "https://x.fbcdn.net/a.jpg" });
    expect(describeCreative({ video_id: "123", object_story_spec: { video_data: { message: "Veja", title: "Vídeo" } } })).toMatchObject({ format: "VIDEO", primaryText: "Veja" });
    const car = describeCreative({ object_story_spec: { link_data: { child_attachments: [{ picture: "a" }, { picture: "b" }] } } });
    expect(car.format).toBe("CAROUSEL");
    expect(car.carousel).toHaveLength(2);
    expect(describeCreative({}).format).toBe("OTHER");
  });
});

describe("períodos", () => {
  const now = new Date("2026-10-30T15:00:00Z"); // 12:00 em Brasília

  it("presets no fuso da conta, como no Gerenciador de Anúncios", () => {
    expect(resolvePeriod({ periodo: "today" }, "America/Sao_Paulo", now)).toMatchObject({ since: "2026-10-30", until: "2026-10-30", days: 1 });
    expect(resolvePeriod({ periodo: "yesterday" }, "America/Sao_Paulo", now)).toMatchObject({ since: "2026-10-29", until: "2026-10-29" });
    expect(resolvePeriod({}, "America/Sao_Paulo", now)).toMatchObject({ preset: "last_7d", since: "2026-10-23", until: "2026-10-29", days: 7 });
    expect(resolvePeriod({ periodo: "last_14d" }, "America/Sao_Paulo", now).days).toBe(14);
    expect(resolvePeriod({ periodo: "last_30d" }, "America/Sao_Paulo", now)).toMatchObject({ since: "2026-09-30", until: "2026-10-29", days: 30 });
    expect(resolvePeriod({ periodo: "this_month" }, "America/Sao_Paulo", now)).toMatchObject({ since: "2026-10-01", until: "2026-10-30" });
    expect(resolvePeriod({ periodo: "last_month" }, "America/Sao_Paulo", now)).toMatchObject({ since: "2026-09-01", until: "2026-09-30" });
  });

  it("o dia muda conforme o fuso da conta", () => {
    const late = new Date("2026-10-31T01:30:00Z"); // 22:30 em Brasília, já dia 31 em UTC
    expect(resolvePeriod({ periodo: "today" }, "America/Sao_Paulo", late).since).toBe("2026-10-30");
    expect(resolvePeriod({ periodo: "today" }, "UTC", late).since).toBe("2026-10-31");
  });

  it("intervalo personalizado é validado", () => {
    expect(resolvePeriod({ periodo: "custom", de: "2026-10-01", ate: "2026-10-15" }, "America/Sao_Paulo", now)).toMatchObject({ preset: "custom", days: 15 });
    expect(resolvePeriod({ periodo: "custom", de: "2026-10-15", ate: "2026-10-01" }, "America/Sao_Paulo", now).preset).toBe("last_7d");
    expect(resolvePeriod({ periodo: "custom", de: "2026-10-01", ate: "2026-12-01" }, "America/Sao_Paulo", now).preset).toBe("last_7d");
    expect(resolvePeriod({ periodo: "custom", de: "2026-02-30", ate: "2026-03-01" }, "America/Sao_Paulo", now).preset).toBe("last_7d");
  });

  it("período anterior equivalente", () => {
    expect(previousPeriod({ since: "2026-10-23", until: "2026-10-29" })).toEqual({ since: "2026-10-16", until: "2026-10-22", days: 7 });
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31);
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("erros da Graph API", () => {
  it("classifica autenticação, permissão, limite e falhas transitórias", () => {
    expect(classifyMetaError(400, 190, 463)).toBe("auth");
    expect(classifyMetaError(403, 200)).toBe("permission");
    expect(classifyMetaError(403, 10)).toBe("permission");
    expect(classifyMetaError(400, 17)).toBe("rate_limit");
    expect(classifyMetaError(400, 80004)).toBe("rate_limit");
    expect(classifyMetaError(500, 2)).toBe("transient");
    expect(classifyMetaError(503)).toBe("transient");
    expect(classifyMetaError(400, 100)).toBe("invalid");
    // A Meta às vezes devolve HTTP 500 com #100: é parâmetro inválido, não instabilidade.
    expect(classifyMetaError(500, 100)).toBe("invalid");
  });
});
