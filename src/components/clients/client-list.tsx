"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Archive, Building2, Loader2, Plus, Search } from "lucide-react";
import type { ClientStatus, ServiceType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Select } from "@/components/ui/form-controls";
import { useApp } from "@/components/app/app-context";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { CLIENT_STATUS, SERVICE_TYPE } from "@/lib/labels";
import { formatDueLabel, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientFormDialog } from "./client-form-dialog";

export type ClientCardData = {
  id: string;
  name: string;
  segment: string | null;
  status: ClientStatus;
  contactName: string | null;
  logoFileId: string | null;
  archivedAt: string | null;
  services: ServiceType[];
  openTasks: number;
  overdueTasks: number;
  nextDueDate: string | null;
  finance: { monthlyFeeCents: number; mediaBudgetCents: number } | null;
};

export function NewClientButton() {
  const { isManager } = useApp();
  const [open, setOpen] = useState(false);
  if (!isManager) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Novo cliente
      </Button>
      <ClientFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ClientFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        {pending ? (
          <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3" />
        ) : (
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          aria-label="Buscar cliente"
          className="h-10 w-full rounded-xl border border-hairline bg-white/75 pl-9 pr-3 text-sm outline-none transition focus:border-purple/50 focus:ring-4 focus:ring-purple/10"
        />
      </div>
      <Select value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value || null })} aria-label="Status" className="w-[170px]">
        <option value="">Todos os status</option>
        {(Object.keys(CLIENT_STATUS) as ClientStatus[]).map((s) => (
          <option key={s} value={s}>
            {CLIENT_STATUS[s].label}
          </option>
        ))}
      </Select>
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm text-ink-2 hover:bg-white/50">
        <input type="checkbox" className="accent-purple" checked={params.get("archived") === "1"} onChange={(e) => set({ archived: e.target.checked ? "1" : null })} />
        <Archive className="size-4" /> Arquivados
      </label>
    </div>
  );
}

export function ClientGrid({ clients, archived }: { clients: ClientCardData[]; archived: boolean }) {
  if (!clients.length) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState
          icon={<Building2 />}
          title={archived ? "Nenhum cliente arquivado" : "Nenhum cliente encontrado"}
          description={archived ? "Clientes arquivados aparecem aqui." : "Ajuste os filtros ou cadastre um novo cliente."}
          action={!archived ? <NewClientButton /> : undefined}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {clients.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          <Link href={`/clientes/${c.id}`} className="glass glow-border card-hover flex h-full flex-col rounded-[22px] p-4">
            <div className="flex items-start gap-3">
              <ClientLogo name={c.name} logoFileId={c.logoFileId} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.name}</p>
                <p className="truncate text-xs text-ink-3">{[c.segment, c.contactName].filter(Boolean).join(" · ") || "Sem segmento"}</p>
              </div>
              <Badge color={CLIENT_STATUS[c.status].color}>{CLIENT_STATUS[c.status].label}</Badge>
            </div>
            {c.services.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {c.services.map((s) => (
                  <Badge key={s}>{SERVICE_TYPE[s].label}</Badge>
                ))}
              </div>
            )}
            <dl className={cn("mt-auto grid gap-2 pt-4 text-xs", c.finance ? "grid-cols-2" : "grid-cols-3")}>
              <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                <dt className="text-ink-3">Abertas</dt>
                <dd className="font-display text-[15px] font-medium tabular">{c.openTasks}</dd>
              </div>
              <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                <dt className="text-ink-3">Atrasadas</dt>
                <dd className={cn("font-display text-[15px] font-medium tabular", c.overdueTasks > 0 && "text-danger")}>{c.overdueTasks}</dd>
              </div>
              {c.finance ? (
                <>
                  <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                    <dt className="text-ink-3">Mensalidade</dt>
                    <dd className="truncate font-semibold tabular">{formatMoney(c.finance.monthlyFeeCents)}</dd>
                  </div>
                  <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                    <dt className="text-ink-3">Mídia/mês</dt>
                    <dd className="truncate font-semibold tabular">{formatMoney(c.finance.mediaBudgetCents)}</dd>
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                  <dt className="text-ink-3">Próx. prazo</dt>
                  <dd className="truncate font-semibold">{c.nextDueDate ? formatDueLabel(c.nextDueDate) : "—"}</dd>
                </div>
              )}
            </dl>
            {c.finance && <p className="mt-2 text-[11.5px] text-ink-3">{c.nextDueDate ? `Próximo prazo: ${formatDueLabel(c.nextDueDate)}` : "Sem prazos futuros"}</p>}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
