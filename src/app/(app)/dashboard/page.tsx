import type { Metadata } from "next";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { requireUser } from "@/server/auth/session";
import { canViewFinance } from "@/server/auth/permissions";
import { dashboardMetrics, featuredClients, operationSeries, upcomingDeliveries } from "@/server/services/dashboard";
import { APP_TIMEZONE } from "@/lib/dates";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FeaturedClients, KpiGrid, OperationChart, UpcomingDeliveries, type Kpi } from "@/components/dashboard/dashboard-widgets";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIMEZONE }).format(new Date()));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const { range: rawRange } = await searchParams;
  const range = rawRange === "7" ? 7 : rawRange === "90" ? 90 : 30;
  const finance = canViewFinance(user);

  const [m, series, upcoming, featured] = await Promise.all([
    dashboardMetrics(user),
    operationSeries(user, range),
    upcomingDeliveries(user),
    featuredClients(user),
  ]);

  // Indicadores sem comparativos inventados: só o que os dados atuais sustentam.
  const kpis: Kpi[] = [
    { key: "clients", label: "Clientes ativos", value: m.activeClients, hint: "Com status ativo", href: "/clientes?status=ACTIVE" },
    ...(finance
      ? ([
          { key: "mrr", label: "Receita mensal recorrente", value: m.mrrCents ?? 0, money: true, hint: "Mensalidades de contratos ativos", href: "/financeiro", tone: "lime" },
          { key: "media", label: "Investimento em mídia", value: m.mediaCents ?? 0, money: true, hint: "Orçamento mensal planejado dos clientes", href: "/financeiro?tab=midia" },
        ] satisfies Kpi[])
      : []),
    { key: "pending", label: "Tarefas pendentes", value: m.pending, hint: "Abertas, de backlog a aprovação", href: "/tarefas" },
    { key: "overdue", label: "Entregas atrasadas", value: m.overdue, hint: m.overdue ? "Prazo vencido sem conclusão" : "Nenhuma entrega atrasada", href: "/tarefas?due=overdue&view=list", tone: "danger" },
    { key: "week", label: "Entregas da semana", value: m.week, hint: "Prazo nos próximos 7 dias", href: "/tarefas?due=week&view=list" },
  ];

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const json = <T,>(v: T) => JSON.parse(JSON.stringify(v));

  return (
    <div className="space-y-5">
      <DashboardHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}.`}
        subtitle="Veja o que está acontecendo na KROMA hoje."
        date={today}
      />
      <KpiGrid items={kpis} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <OperationChart data={series} range={range} />
        <UpcomingDeliveries items={json(upcoming)} />
      </div>
      <FeaturedClients items={json(featured)} finance={finance} />
    </div>
  );
}
