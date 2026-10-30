"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/ui/display";
import { formatCompact, formatCurrency, formatInt } from "@/lib/ads/metrics";
import { cn } from "@/lib/utils";
import { ease } from "./ads-ui";

const PURPLE = "#7625F5";
const PREVIOUS = "#9A94A3";

export type SeriesPoint = {
  date: string;
  spendCents: number | null;
  impressions: number | null;
  reach: number | null;
  linkClicks: number | null;
  results: number | null;
  costPerResult: number | null;
};

type MetricKey = Exclude<keyof SeriesPoint, "date">;

const dayLabel = (d: string, long = false) => format(new Date(`${d}T12:00:00`), long ? "EEE, dd 'de' MMM" : "dd/MM", { locale: ptBR });

/** Evolução diária com seletor de métrica e comparação com o período anterior equivalente. */
export function PerformanceChart({
  series,
  previousSeries,
  currency,
  resultLabel,
  hasReach,
}: {
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  currency: string;
  resultLabel: string | null;
  hasReach: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const metrics: { key: MetricKey; label: string; money?: boolean; hidden?: boolean }[] = [
    { key: "spendCents", label: "Investimento", money: true },
    { key: "impressions", label: "Impressões" },
    { key: "reach", label: "Alcance diário", hidden: !hasReach },
    { key: "linkClicks", label: "Cliques no link" },
    { key: "results", label: resultLabel ?? "Resultados", hidden: !resultLabel },
    { key: "costPerResult", label: "Custo por resultado", money: true, hidden: !resultLabel },
  ];
  const visible = metrics.filter((m) => !m.hidden);
  const [metric, setMetric] = useState<MetricKey>("spendCents");
  const [compare, setCompare] = useState(true);
  const m = visible.find((x) => x.key === metric) ?? visible[0];
  const fmt = (v: number | null) => (v === null ? "Não disponível" : m.money ? formatCurrency(Math.round(v), currency) : formatInt(v));

  const data = series.map((p, i) => ({ date: p.date, cur: p[m.key], prev: previousSeries[i]?.[m.key] ?? null, prevDate: previousSeries[i]?.date ?? null }));
  const total = (pts: SeriesPoint[]) => (m.key === "costPerResult" ? null : pts.reduce<number | null>((n, p) => (p[m.key] === null ? n : (n ?? 0) + (p[m.key] as number)), null));
  const empty = data.every((d) => !d.cur);

  return (
    <section className="glass min-w-0 rounded-[26px] p-5" aria-labelledby={`${gid}-title`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${gid}-title`} className="text-[15px] font-bold">
            Evolução das campanhas
          </h2>
          <p className="text-xs text-ink-3">Dados diários da Marketing API no fuso da conta de anúncios.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-2">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-4 accent-[#7625F5]" />
          Comparar com o período anterior
        </label>
      </div>
      <div className="scrollbar-thin mb-3 flex gap-1 overflow-x-auto rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Métrica do gráfico">
        {visible.map((x) => (
          <button
            key={x.key}
            onClick={() => setMetric(x.key)}
            aria-pressed={m.key === x.key}
            className={cn("h-7 shrink-0 rounded-lg px-3 text-xs font-bold transition-all", m.key === x.key ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            {x.label}
          </button>
        ))}
      </div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1" aria-label="Legenda">
        <li className="flex items-center gap-2 text-xs text-ink-2">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: PURPLE }} aria-hidden />
          Período atual {total(series) !== null && <strong className="text-ink tabular">{fmt(total(series))}</strong>}
        </li>
        {compare && (
          <li className="flex items-center gap-2 text-xs text-ink-2">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} aria-hidden />
            Período anterior {total(previousSeries) !== null && <strong className="text-ink tabular">{fmt(total(previousSeries))}</strong>}
          </li>
        )}
      </ul>
      {empty ? (
        <EmptyState className="h-[260px]" title="Sem dados neste período" description="Não houve entrega no período ou os dados ainda não foram sincronizados." />
      ) : (
        <div className="h-[260px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PURPLE} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(23,20,29,0.06)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} tickFormatter={(d: string) => dayLabel(d)} minTickGap={18} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9A94A3" }}
                width={56}
                tickFormatter={(v: number) => (m.money ? formatCurrency(v, currency, true) : formatCompact(v))}
              />
              <Tooltip
                cursor={{ stroke: "rgba(118,37,245,0.25)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !p) return null;
                  return (
                    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                      <p className="mb-1 font-bold">{m.label}</p>
                      <p className="flex items-center gap-2 text-ink-2">
                        <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: PURPLE }} />
                        <span className="flex-1 capitalize">{dayLabel(p.date, true)}</span>
                        <span className="font-bold text-ink tabular">{fmt(p.cur)}</span>
                      </p>
                      {compare && p.prevDate && (
                        <p className="flex items-center gap-2 text-ink-2">
                          <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} />
                          <span className="flex-1 capitalize">{dayLabel(p.prevDate, true)}</span>
                          <span className="font-bold text-ink tabular">{fmt(p.prev)}</span>
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              {compare && <Line type="monotone" dataKey="prev" stroke={PREVIOUS} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} animationDuration={600} />}
              <Area type="monotone" dataKey="cur" stroke={PURPLE} strokeWidth={2} fill={`url(#${gid}-fill)`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="sr-only">
        <caption>{m.label} por dia</caption>
        <thead>
          <tr>
            <th>Data</th>
            <th>Período atual</th>
            <th>Período anterior</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{fmt(d.cur)}</td>
              <td>{fmt(d.prev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Barras horizontais de participação (uma série, um tom): rótulo, barra, valor e %. */
export function ShareBars({
  items,
  currency,
  empty = "Sem investimento no período.",
  limit = 8,
}: {
  items: { id: string; label: string; valueCents: number; sub?: string; href?: string }[];
  currency: string;
  empty?: string;
  limit?: number;
}) {
  const reduce = useReducedMotion();
  const total = items.reduce((n, i) => n + i.valueCents, 0);
  const sorted = [...items].filter((i) => i.valueCents > 0).sort((a, b) => b.valueCents - a.valueCents);
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((n, i) => n + i.valueCents, 0);
  if (!total) return <p className="py-8 text-center text-sm text-ink-3">{empty}</p>;
  const max = shown[0]?.valueCents ?? 1;
  const rows = rest ? [...shown, { id: "_other", label: `Outras (${sorted.length - limit})`, valueCents: rest }] : shown;
  return (
    <ul className="space-y-3">
      {rows.map((i, idx) => {
        const pct = (i.valueCents / total) * 100;
        return (
          <li key={i.id} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-semibold" title={i.label}>
                {"href" in i && i.href ? (
                  <a href={i.href} className="hover:text-purple">
                    {i.label}
                  </a>
                ) : (
                  i.label
                )}
                {"sub" in i && i.sub && <span className="ml-2 text-[11.5px] font-medium text-ink-3">{i.sub}</span>}
              </span>
              <span className="shrink-0 tabular text-ink-2">
                <strong className="text-ink">{formatCurrency(i.valueCents, currency)}</strong> · {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/[0.05]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: i.id === "_other" ? PREVIOUS : `linear-gradient(90deg, ${PURPLE}, #A855F7)` }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, (i.valueCents / max) * 100)}%` }}
                transition={{ delay: 0.05 * idx, duration: 0.6, ease }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Investimento diário de uma moeda (visão geral). */
export function SpendTrend({ series, currency }: { series: { date: string; spendCents: number }[]; currency: string }) {
  const gid = useId().replace(/:/g, "");
  if (series.every((p) => !p.spendCents)) return <EmptyState className="h-[220px]" title="Sem investimento no período" />;
  return (
    <div className="h-[220px]" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.18} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(23,20,29,0.06)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} tickFormatter={(d: string) => dayLabel(d)} minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} width={56} tickFormatter={(v: number) => formatCurrency(v, currency, true)} />
          <Tooltip
            cursor={{ stroke: "rgba(118,37,245,0.25)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { date: string; spendCents: number } | undefined;
              if (!active || !p) return null;
              return (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                  <p className="font-bold capitalize">{dayLabel(p.date, true)}</p>
                  <p className="text-ink-2">
                    Investimento <strong className="text-ink tabular">{formatCurrency(p.spendCents, currency)}</strong>
                  </p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="spendCents" stroke={PURPLE} strokeWidth={2} fill={`url(#${gid}-fill)`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Desempenho por campanha: barra de investimento + resultados e custo por resultado em texto. */
export function CampaignPerformance({
  rows,
  currency,
}: {
  rows: { id: string; name: string; spendCents: number; results: number | null; resultLabel: string | null; costPerResult: number | null }[];
  currency: string;
}) {
  const reduce = useReducedMotion();
  const list = rows.filter((r) => r.spendCents > 0).slice(0, 8);
  if (!list.length) return <p className="py-8 text-center text-sm text-ink-3">Nenhuma campanha com investimento no período.</p>;
  const max = list[0].spendCents;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
          <tr>
            <th className="pb-2 pr-3">Campanha</th>
            <th className="w-[38%] pb-2 pr-3">Investimento</th>
            <th className="pb-2 pr-3 text-right">Resultados</th>
            <th className="pb-2 text-right">Custo/resultado</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, idx) => (
            <tr key={r.id} className="border-t border-hairline/70">
              <td className="max-w-[220px] truncate py-2 pr-3 font-semibold" title={r.name}>
                {r.name}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-purple to-purple-light"
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${Math.max(2, (r.spendCents / max) * 100)}%` }}
                      transition={{ delay: 0.05 * idx, duration: 0.6, ease }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular">{formatCurrency(r.spendCents, currency)}</span>
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular">
                {r.results === null ? <span className="text-ink-3">{r.resultLabel === "Misto" ? "Tipos mistos" : "Não disponível"}</span> : formatInt(r.results)}
                {r.resultLabel && r.results !== null && <span className="block text-[11px] text-ink-3">{r.resultLabel}</span>}
              </td>
              <td className="py-2 text-right tabular">{r.costPerResult === null ? <span className="text-ink-3">Não disponível</span> : formatCurrency(Math.round(r.costPerResult), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
