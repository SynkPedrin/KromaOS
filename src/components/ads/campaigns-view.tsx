"use client";

import { useMemo, useState } from "react";
import { Dialog as D } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form-controls";
import { formatCurrency, formatInt, formatPct, objectiveLabel, OPTIMIZATION_LABEL } from "@/lib/ads/metrics";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientAdsData } from "@/server/services/ads";
import { SpendTrend } from "./ads-charts";
import { StatusBadge } from "./ads-ui";

type Campaign = ClientAdsData["campaigns"][number];
type AdSet = ClientAdsData["adSets"][number];
type Ad = ClientAdsData["ads"][number];

const STATUS_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "paused", label: "Pausadas" },
  { key: "ended", label: "Encerradas" },
] as const;

export function budgetLabel(x: { dailyBudgetCents: number | null; lifetimeBudgetCents: number | null; budgetOnAdSets?: boolean }, currency: string) {
  if (x.dailyBudgetCents) return `${formatCurrency(x.dailyBudgetCents, currency)}/dia`;
  if (x.lifetimeBudgetCents) return `${formatCurrency(x.lifetimeBudgetCents, currency)} total`;
  return x.budgetOnAdSets ? "Nos conjuntos" : "Não informado";
}

const na = <span className="text-ink-3">Não disponível</span>;

export function CampaignsView({ campaigns, adSets, ads, currency }: { campaigns: Campaign[]; adSets: AdSet[]; ads: Ad[]; currency: string }) {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["key"]>("all");
  const [objective, setObjective] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const objectives = useMemo(() => [...new Set(campaigns.map((c) => c.objective).filter((o): o is string => !!o))], [campaigns]);
  const money = (c: number | null) => (c === null ? na : formatCurrency(Math.round(c), currency));

  const list = campaigns.filter(
    (c) =>
      (status === "all" || (status === "ended" ? c.status.key === "ended" || c.status.key === "archived" : c.status.key === status)) &&
      (!objective || c.objective === objective) &&
      (!q || c.name.toLowerCase().includes(q.toLowerCase())),
  );
  const open = campaigns.find((c) => c.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={cn("h-7 rounded-lg px-3 text-xs font-bold transition-all", status === f.key ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Select value={objective} onChange={(e) => setObjective(e.target.value)} aria-label="Objetivo" className="h-9 w-auto min-w-[170px] text-[13px]">
          <option value="">Todos os objetivos</option>
          {objectives.map((o) => (
            <option key={o} value={o}>
              {objectiveLabel(o)}
            </option>
          ))}
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha" aria-label="Buscar campanha" className="h-9 pl-9 text-[13px]" />
        </div>
      </div>

      <div className="glass overflow-hidden rounded-[26px]">
        {list.length === 0 ? (
          <EmptyState title="Nenhuma campanha encontrada" description={campaigns.length ? "Ajuste os filtros para ver outras campanhas." : "Esta conta ainda não tem campanhas."} />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                <tr className="border-b border-hairline">
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Orçamento</th>
                  <th className="px-3 py-3 text-right">Investimento</th>
                  <th className="px-3 py-3 text-right">Alcance</th>
                  <th className="px-3 py-3 text-right">Impressões</th>
                  <th className="px-3 py-3 text-right">Cliques no link</th>
                  <th className="px-3 py-3 text-right">CTR</th>
                  <th className="px-3 py-3 text-right">CPC</th>
                  <th className="px-3 py-3 text-right">Resultados</th>
                  <th className="px-4 py-3 text-right">Custo/resultado</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 12) * 0.025 }}
                    onClick={() => setOpenId(c.id)}
                    className="cursor-pointer border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/60"
                  >
                    <td className="max-w-[280px] px-4 py-3">
                      <button className="block max-w-full truncate text-left font-semibold hover:text-purple" onClick={() => setOpenId(c.id)}>
                        {c.name}
                      </button>
                      <span className="text-[11.5px] text-ink-3">{objectiveLabel(c.objective)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{budgetLabel(c, currency)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular">{formatCurrency(c.spendCents, currency)}</td>
                    <td className="px-3 py-3 text-right tabular">{c.reach === null ? na : formatInt(c.reach)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatInt(c.impressions)}</td>
                    <td className="px-3 py-3 text-right tabular">{c.linkClicks === null ? na : formatInt(c.linkClicks)}</td>
                    <td className="px-3 py-3 text-right tabular">{c.ctr === null ? na : formatPct(c.ctr)}</td>
                    <td className="px-3 py-3 text-right tabular">{money(c.cpc)}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {c.results === null ? <span className="text-ink-3">{c.resultLabel === "Misto" ? "Tipos mistos" : "Não disponível"}</span> : formatInt(c.results)}
                      {c.resultLabel && c.results !== null && <span className="block text-[11px] text-ink-3">{c.resultLabel}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{money(c.costPerResult)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="px-1 text-xs text-ink-3">
        Status efetivo da Meta (uma campanha ativa sem entrega por data de término aparece como encerrada). Resultados só quando todos os conjuntos da campanha otimizam para o mesmo tipo.
      </p>

      <CampaignPanel campaign={open} adSets={adSets.filter((s) => s.campaignId === open?.id)} ads={ads.filter((a) => a.campaignId === open?.id)} currency={currency} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-hairline">
      <p className="text-[11.5px] font-semibold text-ink-3">{label}</p>
      <p className="mt-0.5 font-display text-[17px] font-medium tracking-tight tabular">{children}</p>
    </div>
  );
}

/** Painel lateral somente leitura com os dados da campanha, gráfico, conjuntos e anúncios. */
function CampaignPanel({ campaign: c, adSets, ads, currency, onClose }: { campaign: Campaign | null; adSets: AdSet[]; ads: Ad[]; currency: string; onClose: () => void }) {
  const money = (v: number | null) => (v === null ? "Não disponível" : formatCurrency(Math.round(v), currency));
  return (
    <D.Root open={!!c} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {c && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-[#1b1424]/20 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </D.Overlay>
            <D.Content asChild forceMount>
              <motion.aside
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1, transition: { type: "spring", stiffness: 360, damping: 36 } }}
                exit={{ x: 40, opacity: 0, transition: { duration: 0.15 } }}
                className="glass-strong fixed inset-0 z-50 flex flex-col overflow-hidden md:inset-y-3 md:left-auto md:right-3 md:w-[min(760px,calc(100vw-120px))] md:rounded-3xl"
              >
                <header className="flex items-start gap-3 border-b border-hairline px-6 py-5">
                  <div className="min-w-0 flex-1">
                    <D.Title className="text-lg font-bold tracking-tight">{c.name}</D.Title>
                    <D.Description className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                      <StatusBadge status={c.status} />
                      <span>{objectiveLabel(c.objective)}</span>
                      <span className="text-ink-3">· ID {c.externalId}</span>
                    </D.Description>
                  </div>
                  <D.Close asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                      <X />
                    </Button>
                  </D.Close>
                </header>
                <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Fact label="Investimento">{formatCurrency(c.spendCents, currency)}</Fact>
                    <Fact label={c.resultLabel && c.resultLabel !== "Misto" ? c.resultLabel : "Resultados"}>{c.results === null ? "Não disponível" : formatInt(c.results)}</Fact>
                    <Fact label="Custo por resultado">{money(c.costPerResult)}</Fact>
                    <Fact label="Alcance">{formatInt(c.reach)}</Fact>
                    <Fact label="Impressões">{formatInt(c.impressions)}</Fact>
                    <Fact label="Cliques no link">{formatInt(c.linkClicks)}</Fact>
                    <Fact label="CTR (link)">{formatPct(c.ctr)}</Fact>
                    <Fact label="CPC (link)">{money(c.cpc)}</Fact>
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold text-ink-3">Orçamento</dt>
                      <dd>{budgetLabel(c, currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-ink-3">Veiculação</dt>
                      <dd>
                        {c.startTime ? formatDate(c.startTime) : "Início não informado"}
                        {c.stopTime ? ` até ${formatDate(c.stopTime)}` : " · sem data de término"}
                      </dd>
                    </div>
                  </dl>
                  <section>
                    <h3 className="mb-2 text-sm font-bold">Investimento diário</h3>
                    <SpendTrend series={c.series} currency={currency} />
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-bold">Conjuntos de anúncios ({adSets.length})</h3>
                    {adSets.length === 0 ? (
                      <p className="text-sm text-ink-3">Nenhum conjunto sincronizado.</p>
                    ) : (
                      <ul className="divide-y divide-hairline rounded-2xl bg-white/50 ring-1 ring-hairline">
                        {adSets.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                            <StatusBadge status={s.status} />
                            <span className="text-ink-3">{s.optimizationGoal ? (OPTIMIZATION_LABEL[s.optimizationGoal] ?? s.optimizationGoal) : ""}</span>
                            <span className="w-24 text-right font-semibold tabular">{formatCurrency(s.spendCents, currency)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-bold">Anúncios ({ads.length})</h3>
                    {ads.length === 0 ? (
                      <p className="text-sm text-ink-3">Nenhum anúncio sincronizado.</p>
                    ) : (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {ads.map((a) => (
                          <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white/50 p-2 ring-1 ring-hairline">
                            {a.creative?.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.creative.thumbnailUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className="size-12 shrink-0 rounded-xl bg-black/[0.05]" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                              <span className="text-[11.5px] text-ink-3 tabular">
                                {formatCurrency(a.spendCents, currency)} · {a.results === null ? "sem resultado" : `${formatInt(a.results)} ${a.resultLabel?.toLowerCase() ?? ""}`}
                              </span>
                            </span>
                            <StatusBadge status={a.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </motion.aside>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
