"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { formatCurrency, formatInt, formatPct, OPTIMIZATION_LABEL } from "@/lib/ads/metrics";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientAdsData } from "@/server/services/ads";
import { budgetLabel } from "./campaigns-view";
import { StatusBadge } from "./ads-ui";

type AdSet = ClientAdsData["adSets"][number];

const na = <span className="text-ink-3">Não disponível</span>;
const goalLabel = (g: string | null) => (g ? (OPTIMIZATION_LABEL[g] ?? g) : "Não informado");

export function AdSetsView({ adSets, currency }: { adSets: AdSet[]; currency: string }) {
  const [status, setStatus] = useState("all");
  const [campaign, setCampaign] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const campaigns = [...new Map(adSets.map((s) => [s.campaignId, s.campaignName])).entries()];
  const list = adSets.filter(
    (s) => (status === "all" || s.status.key === status) && (!campaign || s.campaignId === campaign) && (!q || s.name.toLowerCase().includes(q.toLowerCase())),
  );
  const open = adSets.find((s) => s.id === openId) ?? null;
  const money = (v: number | null) => (v === null ? na : formatCurrency(Math.round(v), currency));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Status">
          {[
            ["all", "Todos"],
            ["active", "Ativos"],
            ["paused", "Pausados"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              aria-pressed={status === k}
              className={cn("h-7 rounded-lg px-3 text-xs font-bold transition-all", status === k ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
            >
              {l}
            </button>
          ))}
        </div>
        <Select value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campanha" className="h-9 w-auto min-w-[200px] max-w-[280px] text-[13px]">
          <option value="">Todas as campanhas</option>
          {campaigns.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conjunto" aria-label="Buscar conjunto" className="h-9 pl-9 text-[13px]" />
        </div>
      </div>

      <div className="glass overflow-hidden rounded-[26px]">
        {list.length === 0 ? (
          <EmptyState title="Nenhum conjunto encontrado" description={adSets.length ? "Ajuste os filtros para ver outros conjuntos." : "Esta conta ainda não tem conjuntos de anúncios."} />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                <tr className="border-b border-hairline">
                  <th className="px-4 py-3">Conjunto</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Orçamento</th>
                  <th className="px-3 py-3">Otimização</th>
                  <th className="px-3 py-3 text-right">Investimento</th>
                  <th className="px-3 py-3 text-right">CTR</th>
                  <th className="px-3 py-3 text-right">Resultados</th>
                  <th className="px-4 py-3 text-right">Custo/resultado</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 12) * 0.025 }}
                    onClick={() => setOpenId(s.id)}
                    className="cursor-pointer border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/60"
                  >
                    <td className="max-w-[280px] px-4 py-3">
                      <button className="block max-w-full truncate text-left font-semibold hover:text-purple" onClick={() => setOpenId(s.id)}>
                        {s.name}
                      </button>
                      <span className="block truncate text-[11.5px] text-ink-3">{s.campaignName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{budgetLabel(s, currency)}</td>
                    <td className="px-3 py-3 text-ink-2">{goalLabel(s.optimizationGoal)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular">{formatCurrency(s.spendCents, currency)}</td>
                    <td className="px-3 py-3 text-right tabular">{s.ctr === null ? na : formatPct(s.ctr)}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {s.results === null ? na : formatInt(s.results)}
                      {s.resultLabel && <span className="block text-[11px] text-ink-3">{s.resultLabel}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{money(s.costPerResult)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""} description={open?.campaignName} className="sm:max-w-2xl">
        {open && <AdSetDetails s={open} currency={currency} />}
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function AdSetDetails({ s, currency }: { s: AdSet; currency: string }) {
  const t = s.targeting;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={s.status} />
        <Badge>{goalLabel(s.optimizationGoal)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Investimento", formatCurrency(s.spendCents, currency)],
          [s.resultLabel ?? "Resultados", s.results === null ? "Não disponível" : formatInt(s.results)],
          ["Custo/resultado", s.costPerResult === null ? "Não disponível" : formatCurrency(Math.round(s.costPerResult), currency)],
          ["CTR (link)", formatPct(s.ctr)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white/60 p-3 ring-1 ring-hairline">
            <p className="text-[11.5px] font-semibold text-ink-3">{l}</p>
            <p className="mt-0.5 font-display text-[16px] font-medium tabular">{v}</p>
          </div>
        ))}
      </div>
      <dl className="divide-y divide-hairline">
        <Row label="Orçamento">{budgetLabel(s, currency)}</Row>
        <Row label="Veiculação">
          {s.startTime ? formatDate(s.startTime) : "Início não informado"}
          {s.endTime ? ` até ${formatDate(s.endTime)}` : " · sem data de término"}
        </Row>
        <Row label="Evento de cobrança">{s.billingEvent ?? "Não informado"}</Row>
        <Row label="Estratégia de lance">{s.bidStrategy ?? "Não informado"}</Row>
        {s.destinationType && <Row label="Destino">{s.destinationType}</Row>}
      </dl>
      <section>
        <h3 className="mb-1 text-sm font-bold">Segmentação</h3>
        {!t ? (
          <p className="text-sm text-ink-3">A Meta não retornou a segmentação deste conjunto para o usuário conectado.</p>
        ) : (
          <dl className="divide-y divide-hairline">
            {t.advantage && <Row label="Público">Público Advantage+ (a Meta pode expandir além das sugestões)</Row>}
            <Row label="Idade e gênero">{[t.age, t.genders].filter(Boolean).join(" · ") || "Não informado"}</Row>
            {t.places.length > 0 && <Row label="Localização">{t.places.join(", ")}</Row>}
            {t.interests.length > 0 && <Row label="Interesses">{t.interests.join(", ")}</Row>}
            {t.audiences.length > 0 && <Row label="Públicos personalizados">{t.audiences.join(", ")}</Row>}
            {t.excluded.length > 0 && <Row label="Exclusões">{t.excluded.join(", ")}</Row>}
            {t.platforms.length > 0 && <Row label="Plataformas">{t.platforms.join(", ")}</Row>}
          </dl>
        )}
      </section>
    </div>
  );
}
