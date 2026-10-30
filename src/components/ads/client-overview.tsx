"use client";

import { Activity, Eye, Gauge, MousePointerClick, Percent, Repeat, Target, Users, Wallet, type LucideIcon } from "lucide-react";
import { formatCurrency, formatDecimal, formatInt, formatPct, pctChange } from "@/lib/ads/metrics";
import type { ClientAdsData } from "@/server/services/ads";
import { CampaignPerformance, PerformanceChart, ShareBars } from "./ads-charts";
import { MetricCard, SectionCard } from "./ads-ui";

type Props = Pick<ClientAdsData, "summary" | "previousSummary" | "series" | "previousSeries" | "currency" | "campaigns" | "period" | "activeCampaigns"> & {
  multipleAccounts: boolean;
};

export function ClientOverview({ summary: s, previousSummary: p, series, previousSeries, currency, campaigns, period, activeCampaigns, multipleAccounts }: Props) {
  const money = (c: number | null) => (c === null ? "Não disponível" : formatCurrency(Math.round(c), currency));
  const r = s.result;
  const reachHint = multipleAccounts ? "Não somamos alcance entre contas" : s.reachStale ? "Último valor guardado" : "Pessoas únicas no período";

  const cards: { label: string; value: string; delta?: number | null; inverse?: boolean; hint?: string; definition?: string; icon: LucideIcon; accent?: "lime" | "purple" }[] = [
    { label: "Valor investido", value: money(s.spendCents), delta: pctChange(s.spendCents, p.spendCents), hint: "vs. período anterior", icon: Wallet, accent: "lime" },
    { label: "Alcance", value: formatInt(s.reach), hint: reachHint, definition: "Pessoas únicas que viram os anúncios no período, como a Meta calcula para o intervalo inteiro (não é a soma dos dias).", icon: Users },
    { label: "Impressões", value: formatInt(s.impressions), delta: pctChange(s.impressions, p.impressions), icon: Eye },
    { label: "CPM", value: money(s.cpm), delta: pctChange(s.cpm, p.cpm), inverse: true, definition: "Custo por mil impressões: investimento ÷ impressões × 1.000.", icon: Gauge },
    { label: "CPC (link)", value: money(s.cpc), delta: pctChange(s.cpc, p.cpc), inverse: true, definition: "Custo por clique no link: investimento ÷ cliques no link (não usa cliques totais).", icon: MousePointerClick },
    { label: "CTR (link)", value: formatPct(s.ctr), delta: pctChange(s.ctr, p.ctr), definition: "Cliques no link ÷ impressões.", icon: Percent },
    { label: "Cliques no link", value: formatInt(s.linkClicks), delta: pctChange(s.linkClicks, p.linkClicks), definition: "Cliques que levam ao destino do anúncio (inline_link_clicks). Cliques totais incluem curtidas, comentários e expansões.", icon: MousePointerClick },
    {
      label: r ? r.label : "Resultados",
      value: r ? formatInt(r.count) : "Não disponível",
      delta: r ? pctChange(r.count, p.resultCount) : undefined,
      hint: r ? (r.mixed && r.spendShare !== null ? `Tipo principal · ${Math.round(r.spendShare * 100)}% do investimento` : "Resultado das campanhas") : "Sem conjuntos com resultado por ação",
      definition: r
        ? `Resultado definido pela meta de otimização de cada conjunto. Contamos apenas “${r.label}”, nos conjuntos otimizados para isso.`
        : "Campanhas de reconhecimento e alcance não têm resultado por ação.",
      icon: Target,
      accent: "purple",
    },
    {
      label: "Custo por resultado",
      value: r ? money(r.costPerResult) : "Não disponível",
      delta: r ? pctChange(r.costPerResult, p.costPerResult) : undefined,
      inverse: true,
      hint: r ? `Por ${r.label.toLowerCase().replace(/s$/, "")}` : undefined,
      definition: "Investimento dos conjuntos com esse tipo de resultado ÷ quantidade de resultados. Fica indisponível sem resultados.",
      icon: Activity,
    },
    { label: "Frequência", value: formatDecimal(s.frequency), hint: "Impressões ÷ alcance", definition: "Média de vezes que cada pessoa viu os anúncios no período.", icon: Repeat },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c, i) => (
          <MetricCard key={c.label} index={i} {...c} />
        ))}
      </div>
      <p className="-mt-2 px-1 text-xs text-ink-3">
        {period.label} · comparado aos {period.days} dias anteriores · {activeCampaigns} campanha(s) ativa(s)
        {s.roas !== null && ` · ROAS ${formatDecimal(s.roas)} (valor de compras atribuído pela Meta)`}
      </p>

      <PerformanceChart series={series} previousSeries={previousSeries} currency={currency} resultLabel={r?.label ?? null} hasReach={!multipleAccounts} />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        <SectionCard id="spend-dist" title="Distribuição do investimento" description="Participação de cada campanha no valor investido do período.">
          <ShareBars currency={currency} items={campaigns.map((c) => ({ id: c.id, label: c.name, valueCents: c.spendCents }))} />
        </SectionCard>
        <SectionCard id="camp-perf" title="Desempenho por campanha" description="Investimento, resultados e custo por resultado de cada campanha.">
          <CampaignPerformance
            currency={currency}
            rows={campaigns.map((c) => ({ id: c.id, name: c.name, spendCents: c.spendCents, results: c.results, resultLabel: c.resultLabel, costPerResult: c.costPerResult }))}
          />
        </SectionCard>
      </div>
    </div>
  );
}

