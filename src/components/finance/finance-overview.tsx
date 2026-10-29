"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { ArrowRight, Info, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/display";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { Stat } from "./finance-ui";

type Summary = {
  mrrCents: number;
  setupCents: number;
  plannedMediaCents: number;
  activeClients: number;
  avgTicketCents: number;
  receivableCents: number;
  receivableCount: number;
  overdueCents: number;
  overdueCount: number;
  receivedThisMonthCents: number;
  mediaMonth: { plannedCents: number; actualCents: number };
};
type HistoryPoint = { month: string; billed: number; received: number };

// Paleta validada (CVD/contraste) com o script do skill de dataviz.
const SERIES = [
  { key: "billed", label: "Faturado (competência)", color: "#7625F5" },
  { key: "received", label: "Recebido", color: "#6E9400" },
] as const;

const monthLabel = (m: string) => format(new Date(`${m}-15T12:00:00`), "MMM/yy", { locale: ptBR });

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="mb-1 font-bold capitalize">{format(new Date(`${label}-15T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR })}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="flex-1">{s.label}</span>
          <span className="font-bold text-ink tabular">{formatMoney(payload.find((p) => p.dataKey === s.key)?.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

export function FinanceOverview({ summary: s, history, balanceCents }: { summary: Summary; history: HistoryPoint[]; balanceCents: number }) {
  const empty = history.every((h) => !h.billed && !h.received);
  return (
    <div className="space-y-5">
      <Link
        href="/financeiro?tab=caixa"
        className="glass card-hover group flex flex-wrap items-center gap-4 rounded-[22px] bg-gradient-to-br from-purple-50/70 to-lime-soft/30 p-4 sm:px-5"
      >
        <span className="grid size-10 place-items-center rounded-2xl bg-white/80 text-purple ring-1 ring-hairline">
          <Wallet className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-ink-2">Saldo em conta</span>
          <span className={`block font-display text-[26px] font-medium leading-tight tracking-tight tabular ${balanceCents < 0 ? "text-danger" : ""}`}>
            {formatMoney(balanceCents)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-purple">
          Entradas e saídas <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita recorrente mensal (MRR)" value={formatMoney(s.mrrCents)} hint="Contratado em mensalidades ativas — não é dinheiro recebido" tone="lime" />
        <Stat label="Recebido neste mês" value={formatMoney(s.receivedThisMonthCents)} hint="Soma das cobranças pagas no mês" />
        <Stat label="A receber" value={formatMoney(s.receivableCents)} hint={`${s.receivableCount} cobrança(s) em aberto`} tone="purple" />
        <Stat
          label="Em atraso"
          value={formatMoney(s.overdueCents)}
          hint={s.overdueCount ? `${s.overdueCount} cobrança(s) vencida(s)` : "Nenhuma cobrança vencida"}
          tone={s.overdueCount ? "danger" : undefined}
        />
        <Stat label="Receita de implantação" value={formatMoney(s.setupCents)} hint="Implantação em contratos vigentes" />
        <Stat label="Clientes ativos" value={s.activeClients} hint="Status ativo, não arquivados" />
        <Stat label="Ticket médio mensal" value={formatMoney(s.avgTicketCents)} hint="MRR ÷ contratos recorrentes com mensalidade" />
        <Stat label="Investimento em mídia planejado" value={formatMoney(s.plannedMediaCents)} hint="Verba dos clientes — não é receita da agência" />
      </div>

      <section className="glass rounded-[26px] p-5" aria-labelledby="rev-title">
        <div className="mb-3">
          <h2 id="rev-title" className="text-[15px] font-bold">
            Faturado x recebido
          </h2>
          <p className="text-xs text-ink-3">Últimos 6 meses, por competência. Cobranças canceladas não entram.</p>
        </div>
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Legenda">
          {SERIES.map((x) => (
            <li key={x.key} className="flex items-center gap-2 text-xs text-ink-2">
              <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: x.color }} aria-hidden />
              {x.label}
            </li>
          ))}
        </ul>
        {empty ? (
          <EmptyState className="h-[240px]" title="Sem cobranças no período" description="Registre recebimentos na aba Recebimentos para acompanhar aqui." />
        ) : (
          <div className="h-[260px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 6, right: 6, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="rgba(23,20,29,0.06)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} tickFormatter={monthLabel} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} width={64} tickFormatter={(v: number) => formatMoneyCompact(v)} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(118,37,245,0.05)" }} />
                {SERIES.map((x) => (
                  <Bar key={x.key} dataKey={x.key} fill={x.color} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <table className="sr-only">
          <caption>Faturado e recebido por mês</caption>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Faturado</th>
              <th>Recebido</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.month}>
                <td>{h.month}</td>
                <td>{formatMoney(h.billed)}</td>
                <td>{formatMoney(h.received)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="flex items-start gap-2 px-1 text-xs text-ink-3">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        MRR considera apenas contratos recorrentes ativos de clientes com status ativo; prospects e clientes pausados não entram. A receita efetivamente
        recebida vem das cobranças marcadas como pagas.
      </p>
    </div>
  );
}
