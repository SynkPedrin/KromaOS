"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Eye, Megaphone, MessageCircle, MousePointerClick, Rocket, UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { formatCurrency, formatInt, pctChange } from "@/lib/ads/metrics";
import type { AdsOverview } from "@/server/services/ads";
import { ShareBars, SpendTrend } from "./ads-charts";
import { Delta, ease, MetricCard, PeriodPicker, SectionCard, SyncStatus } from "./ads-ui";

export function AdsOverviewView({ data, isAdmin }: { data: AdsOverview; isAdmin: boolean }) {
  const reduce = useReducedMotion();
  if (!data.hasAccounts) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState
          icon={<Megaphone />}
          title="Nenhuma conta conectada"
          description="Conecte uma conta de anúncios para visualizar campanhas e resultados."
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/configuracoes/integracoes/meta">Conectar Meta Ads</Link>
              </Button>
            ) : (
              <p className="text-xs text-ink-3">Peça a um administrador para conectar e vincular as contas dos clientes.</p>
            )
          }
        />
      </div>
    );
  }

  const c = data.current;
  const p = data.previousMetrics;
  const main = data.totalsByCurrency[0];
  const multiCurrency = data.totalsByCurrency.length > 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SyncStatus accounts={data.accounts} />
        <PeriodPicker key={`${data.period.since}-${data.period.until}`} period={data.period} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          index={0}
          icon={Wallet}
          accent="lime"
          label="Investimento total"
          value={data.totalsByCurrency.map((t) => formatCurrency(t.spendCents, t.currency)).join(" + ")}
          delta={multiCurrency ? undefined : pctChange(main.spendCents, main.previousSpendCents)}
          hint={multiCurrency ? "Moedas diferentes não são somadas" : "vs. período anterior"}
        />
        <MetricCard index={1} icon={Rocket} label="Campanhas ativas" value={formatInt(data.activeCampaigns)} hint="Status efetivo ativo" />
        <MetricCard index={2} icon={Eye} label="Impressões" value={formatInt(c.impressions)} delta={pctChange(c.impressions, p.impressions)} />
        <MetricCard
          index={3}
          icon={MousePointerClick}
          label="Cliques no link"
          value={formatInt(c.linkClicks)}
          delta={pctChange(c.linkClicks, p.linkClicks)}
          definition="Cliques que levam ao destino do anúncio. Não inclui curtidas, comentários ou expansões."
        />
        <MetricCard index={4} icon={UserPlus} label="Leads" value={formatInt(c.leads)} delta={pctChange(c.leads, p.leads)} definition="Ação “lead” atribuída pela Meta (formulários e pixel). Não inclui conversas." />
        <MetricCard
          index={5}
          icon={MessageCircle}
          label="Conversas iniciadas"
          value={formatInt(c.conversations)}
          delta={pctChange(c.conversations, p.conversations)}
          definition="Conversas por mensagem iniciadas em até 7 dias após o clique (messaging_conversation_started_7d). Não são vendas."
        />
      </div>
      <p className="-mt-2 px-1 text-xs text-ink-3">
        {data.period.label} · comparado aos {data.period.days} dias anteriores · datas no fuso de Brasília
      </p>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard id="spend-trend" title="Evolução do investimento" description={multiCurrency ? `Valores em ${main.currency}. Outras moedas aparecem por cliente.` : "Investimento diário somado de todas as contas."}>
          <SpendTrend series={main.series} currency={main.currency} />
        </SectionCard>
        <SectionCard id="by-client" title="Investimento por cliente" description="Participação de cada cliente no investimento do período.">
          <ShareBars
            currency={main.currency}
            items={data.clients
              .filter((x) => x.currency === main.currency && !x.mixedCurrency)
              .map((x) => ({ id: x.id, label: x.name, valueCents: x.current.spendCents, href: `/anuncios/clientes/${x.id}` }))}
          />
        </SectionCard>
      </div>

      <section aria-labelledby="clients-title">
        <h2 id="clients-title" className="mb-3 px-1 text-[15px] font-bold">
          Clientes
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {data.clients.map((x, i) => (
            <motion.li key={x.id} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.45, ease }}>
              <Link href={`/anuncios/clientes/${x.id}`} className="glass glow-border card-hover group block rounded-[24px] p-4 focus-visible:outline-2 focus-visible:outline-purple">
                <div className="flex items-center gap-3">
                  <ClientLogo name={x.name} logoFileId={x.logoFileId} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{x.name}</p>
                    <SyncStatus accounts={x.accounts} />
                  </div>
                  <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-purple" />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-3">Investimento</dt>
                    <dd className="font-display text-[15px] font-medium tabular">{x.mixedCurrency ? "Várias moedas" : formatCurrency(x.current.spendCents, x.currency)}</dd>
                    {!x.mixedCurrency && <Delta value={pctChange(x.current.spendCents, x.previous.spendCents)} />}
                  </div>
                  <div>
                    <dt className="text-ink-3">Campanhas ativas</dt>
                    <dd className="font-display text-[15px] font-medium tabular">{x.activeCampaigns}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Cliques no link</dt>
                    <dd className="font-display text-[15px] font-medium tabular">{formatInt(x.current.linkClicks)}</dd>
                  </div>
                </dl>
              </Link>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
