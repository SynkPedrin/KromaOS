"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { resolvePeriod } from "@/lib/ads/periods";
import { cn } from "@/lib/utils";
import type { AccountSyncInfo } from "@/server/services/ads";
import { AccountSwitcher, ConnectionBadge, ease, PeriodPicker, SyncButton, SyncStatus } from "./ads-ui";

const TABS = [
  { slug: "", label: "Visão geral" },
  { slug: "/campanhas", label: "Campanhas" },
  { slug: "/conjuntos", label: "Conjuntos" },
  { slug: "/criativos", label: "Criativos" },
];

export function ClientAdsHeader({
  client,
  accounts,
  canSync,
  mixedCurrency,
}: {
  client: { id: string; name: string; logoFileId: string | null };
  accounts: AccountSyncInfo[];
  canSync: boolean;
  mixedCurrency: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const conta = params.get("conta");
  const selected = accounts.filter((a) => (conta && conta !== "todas" ? a.id === conta : true));
  const chosen = selected.length ? (mixedCurrency ? selected.slice(0, 1) : selected) : accounts.slice(0, 1);
  const tz = chosen[0]?.timezone ?? "America/Sao_Paulo";
  const period = resolvePeriod({ periodo: params.get("periodo"), de: params.get("de"), ate: params.get("ate") }, tz);
  const base = `/anuncios/clientes/${client.id}`;
  const qs = params.toString() ? `?${params}` : "";
  const connection = chosen.find((a) => a.connectionStatus !== "CONNECTED")?.connectionStatus ?? (chosen.length ? "CONNECTED" : null);

  return (
    <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }} className="glass mb-5 rounded-[28px] px-5 pb-3 pt-5 sm:px-7">
      <Link href="/anuncios" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-purple">
        <ArrowLeft className="size-3.5" /> Anúncios
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ClientLogo name={client.name} logoFileId={client.logoFileId} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
              {connection && <ConnectionBadge status={connection} />}
            </div>
            <p className="text-sm text-ink-2">Desempenho das campanhas de mídia paga.</p>
            <SyncStatus accounts={chosen} className="mt-1" />
          </div>
        </div>
        {accounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <AccountSwitcher accounts={accounts} selectedIds={chosen.map((a) => a.id)} mixedCurrency={mixedCurrency} />
            <PeriodPicker key={`${period.since}-${period.until}`} period={period} />
            {canSync && <SyncButton clientId={client.id} accountId={conta && conta !== "todas" ? conta : undefined} />}
          </div>
        )}
      </div>
      <nav className="scrollbar-thin -mx-1 mt-4 flex gap-1 overflow-x-auto px-1" aria-label="Seções do cliente">
        {TABS.map((t) => {
          const href = `${base}${t.slug}`;
          const active = t.slug ? pathname.startsWith(href) : pathname === base;
          return (
            <Link
              key={t.slug}
              href={`${href}${qs}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn("relative shrink-0 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors", active ? "text-ink" : "text-ink-2 hover:text-ink")}
            >
              {active && <motion.span layoutId="ads-tab" className="absolute inset-x-2 -bottom-0.5 h-[3px] rounded-full bg-gradient-to-r from-purple to-lime" />}
              {t.label}
            </Link>
          );
        })}
      </nav>
    </motion.header>
  );
}
