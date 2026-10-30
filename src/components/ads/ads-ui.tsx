"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarRange, Check, ChevronDown, Info, Loader2, Plug, RefreshCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input } from "@/components/ui/form-controls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/primitives";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { useUrlParams } from "@/components/finance/finance-ui";
import { PERIOD_PRESETS, type Period } from "@/lib/ads/periods";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountSyncInfo } from "@/server/services/ads";

export const ease = [0.22, 1, 0.36, 1] as const;

// ─────────────────────────── Navegação ───────────────────────────

type NavClient = { id: string; name: string; logoFileId: string | null };

export function AdsSubnav({ clients, isAdmin, hideOnRoot }: { clients: NavClient[]; isAdmin: boolean; hideOnRoot?: boolean }) {
  const pathname = usePathname();
  // Na visão geral a navegação fica abaixo do título da página (renderizada pela própria página).
  if (hideOnRoot && pathname === "/anuncios") return null;
  const current = clients.find((c) => pathname.startsWith(`/anuncios/clientes/${c.id}`));
  const item = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-ink-2 transition-all hover:text-ink",
      active && "bg-white text-ink shadow-[0_2px_10px_rgba(30,20,50,0.08)]",
    );
  return (
    <nav className="mb-5 flex max-w-full flex-wrap items-center gap-1 rounded-2xl bg-white/55 p-1 ring-1 ring-hairline sm:inline-flex" aria-label="Seções de anúncios">
      <Link href="/anuncios" className={item(pathname === "/anuncios")} aria-current={pathname === "/anuncios" ? "page" : undefined}>
        Visão geral
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(item(!!current), "max-w-[240px]")} aria-label="Escolher cliente">
            <span className="truncate">{current?.name ?? "Clientes"}</span>
            <ChevronDown className="size-3.5 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-y-auto">
          <DropdownMenuLabel>Clientes com conta de anúncios</DropdownMenuLabel>
          {clients.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-3">Nenhum cliente vinculado ainda.</p>}
          {clients.map((c) => (
            <DropdownMenuItem key={c.id} asChild>
              <Link href={`/anuncios/clientes/${c.id}`}>
                <ClientLogo name={c.name} logoFileId={c.logoFileId} size={22} />
                <span className="truncate">{c.name}</span>
                {current?.id === c.id && <Check className="ml-auto" />}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isAdmin && (
        <Link href="/configuracoes/integracoes/meta" className={item(false)}>
          <Plug className="size-3.5" /> Integrações
        </Link>
      )}
    </nav>
  );
}

// ─────────────────────────── Período ───────────────────────────

export function PeriodPicker({ period }: { period: Pick<Period, "preset" | "since" | "until" | "label"> }) {
  const { set, pending } = useUrlParams();
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(period.since);
  const [ate, setAte] = useState(period.until);
  const choose = (key: string) => {
    if (key === "custom") return;
    set({ periodo: key === "last_7d" ? null : key, de: null, ate: null });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Período: ${period.label}`}>
          {pending ? <Loader2 className="animate-spin" /> : <CalendarRange />}
          {period.label}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <ul className="grid grid-cols-2 gap-1" aria-label="Períodos">
          {PERIOD_PRESETS.filter((p) => p.key !== "custom").map((p) => (
            <li key={p.key}>
              <button
                onClick={() => choose(p.key)}
                aria-pressed={period.preset === p.key}
                className={cn(
                  "h-8 w-full rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink-2 transition-colors hover:bg-white hover:text-ink",
                  period.preset === p.key && "bg-white text-ink shadow-sm",
                )}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 space-y-2 border-t border-hairline px-1 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!de || !ate || de > ate) return void toast.error("Escolha um intervalo válido.");
            set({ periodo: "custom", de, ate });
            setOpen(false);
          }}
        >
          <p className="text-xs font-bold text-ink-2">Intervalo personalizado</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 text-[13px]" />
            <Input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 text-[13px]" />
          </div>
          <Button type="submit" size="sm" className="w-full">
            Aplicar intervalo
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function AccountSwitcher({ accounts, selectedIds, mixedCurrency }: { accounts: AccountSyncInfo[]; selectedIds: string[]; mixedCurrency: boolean }) {
  const { set } = useUrlParams();
  if (accounts.length < 2) return null;
  const all = selectedIds.length === accounts.length;
  const label = all ? "Todas as contas" : (accounts.find((a) => a.id === selectedIds[0])?.name ?? "Conta");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {!mixedCurrency && <DropdownMenuItem onSelect={() => set({ conta: null })}>Todas as contas {all && <Check className="ml-auto" />}</DropdownMenuItem>}
        {mixedCurrency && <p className="px-2.5 py-1.5 text-xs text-ink-3">Contas em moedas diferentes não são somadas.</p>}
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => set({ conta: a.id })}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{a.name}</span>
              <span className="block text-[11px] text-ink-3">
                {a.externalId} · {a.currency}
              </span>
            </span>
            {!all && selectedIds[0] === a.id && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────── Sincronização ───────────────────────────

export function SyncButton({ clientId, accountId, since, label = "Atualizar dados", variant = "primary" }: { clientId: string; accountId?: string; since?: string; label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ads/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, accountId, since }) });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string; data?: { skipped: number } } | null;
      if (!body?.ok) toast.error(body?.error ?? "Não foi possível atualizar os dados.");
      else if (body.data?.skipped) toast.info("Uma atualização já estava em andamento. Os dados aparecem em instantes.");
      else toast.success("Dados atualizados com a Meta.");
    } catch {
      toast.error("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  };
  return (
    <Button size="sm" variant={variant} onClick={run} loading={busy} aria-live="polite">
      {!busy && <RefreshCw />}
      {busy ? "Sincronizando…" : label}
    </Button>
  );
}

const CONNECTION_LABEL: Record<string, { label: string; color: string }> = {
  CONNECTED: { label: "Conectado", color: "#3E9B12" },
  EXPIRED: { label: "Autorização expirada", color: "#E5484D" },
  REVOKED: { label: "Autorização revogada", color: "#E5484D" },
  PERMISSION_DENIED: { label: "Permissões insuficientes", color: "#E08A00" },
  ERROR: { label: "Erro na conexão", color: "#E5484D" },
  DISCONNECTED: { label: "Desconectado", color: "#6E6A75" },
};

export function ConnectionBadge({ status }: { status: string }) {
  const s = CONNECTION_LABEL[status] ?? CONNECTION_LABEL.DISCONNECTED;
  return <Badge color={s.color}>{s.label}</Badge>;
}

/** "Atualizado há X min" + avisos de dados desatualizados ou falha, sem esconder a última sincronização. */
export function SyncStatus({ accounts, className }: { accounts: AccountSyncInfo[]; className?: string }) {
  if (!accounts.length) return null;
  const oldest = accounts.reduce<string | null>((m, a) => (!a.lastSyncedAt ? m : !m || a.lastSyncedAt < m ? a.lastSyncedAt : m), null);
  const failed = accounts.find((a) => a.lastSyncOk === false);
  const syncing = accounts.some((a) => a.syncing);
  const neverSynced = accounts.some((a) => !a.lastSyncedAt);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3", className)} aria-live="polite">
      {syncing ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-purple">
          <Loader2 className="size-3.5 animate-spin" /> Sincronizando com a Meta…
        </span>
      ) : neverSynced && !oldest ? (
        <span>Aguardando a primeira sincronização.</span>
      ) : (
        oldest && <span>Atualizado {formatRelative(oldest)}</span>
      )}
      {failed && (
        <Tooltip content={failed.lastSyncError ?? "Falha na última sincronização"}>
          <span className="inline-flex items-center gap-1 font-semibold text-danger">
            <AlertTriangle className="size-3.5" /> Última sincronização falhou
          </span>
        </Tooltip>
      )}
    </p>
  );
}

export function StaleBanner({ accounts, clientId, canSync }: { accounts: AccountSyncInfo[]; clientId: string; canSync: boolean }) {
  const failed = accounts.find((a) => a.lastSyncOk === false);
  const disconnected = accounts.find((a) => a.connectionStatus !== "CONNECTED");
  if (!failed && !disconnected) return null;
  return (
    <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-danger/[0.07] px-4 py-3 ring-1 ring-danger/15">
      <AlertTriangle className="size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">{disconnected ? "Conexão com a Meta precisa de atenção" : "Falha na sincronização"}</p>
        <p className="text-ink-2">
          {disconnected
            ? `${CONNECTION_LABEL[disconnected.connectionStatus]?.label ?? "Desconectado"}. Você está vendo a última sincronização disponível.`
            : `Não foi possível atualizar os dados. Você está visualizando a última sincronização disponível. ${failed?.lastSyncError ?? ""}`}
        </p>
      </div>
      {disconnected && canSync ? (
        <Button size="sm" variant="secondary" asChild>
          <Link href="/configuracoes/integracoes/meta">Reconectar</Link>
        </Button>
      ) : (
        canSync && <SyncButton clientId={clientId} label="Tentar novamente" variant="secondary" />
      )}
    </div>
  );
}

// ─────────────────────────── Indicadores ───────────────────────────

export function Delta({ value, inverse }: { value: number | null; inverse?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-[11px] text-ink-3">sem base de comparação</span>;
  const up = value > 0;
  const good = Math.abs(value) < 0.05 ? null : inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11.5px] font-bold tabular", good === null ? "text-ink-3" : good ? "text-[#4d6b00]" : "text-danger")}>
      <Icon className="size-3.5" />
      {Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  inverse,
  hint,
  definition,
  icon: Icon,
  index = 0,
  accent,
}: {
  label: string;
  value: string;
  delta?: number | null;
  inverse?: boolean;
  hint?: React.ReactNode;
  definition?: string;
  icon?: LucideIcon;
  index?: number;
  accent?: "lime" | "purple";
}) {
  const reduce = useReducedMotion();
  const unavailable = value === "Não disponível";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.45, ease }}
      className="glass glow-border card-hover relative flex min-h-[118px] min-w-0 flex-col rounded-[22px] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-ink-2">{label}</p>
        {definition ? (
          <Tooltip content={<span className="block max-w-[240px] text-xs">{definition}</span>}>
            <button className="text-ink-3 hover:text-ink" aria-label={`Como calculamos: ${label}`}>
              {Icon ? <Icon className="size-4" /> : <Info className="size-3.5" />}
            </button>
          </Tooltip>
        ) : (
          Icon && <Icon className="size-4 text-ink-3" />
        )}
      </div>
      <p className={cn("mt-1.5 font-display font-medium leading-tight tracking-tight tabular", unavailable ? "text-[15px] text-ink-3" : "truncate text-[19px] sm:text-[22px]", accent === "purple" && !unavailable && "text-purple")}>
        {value}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 pt-1.5 text-[11.5px] text-ink-3">
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
        {hint && <span className="min-w-0 truncate">{hint}</span>}
      </div>
      {accent === "lime" && <span className="absolute bottom-0 left-4 h-1 w-10 rounded-t-full bg-lime" aria-hidden />}
    </motion.div>
  );
}

export function StatusBadge({ status }: { status: { label: string; color: string; detail: string | null } }) {
  const badge = <Badge color={status.color}>{status.label}</Badge>;
  return status.detail ? <Tooltip content={status.detail}>{badge}</Tooltip> : badge;
}

export function SectionCard({ title, description, actions, children, className, id }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn("glass min-w-0 rounded-[26px] p-5", className)} aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-[15px] font-bold">
            {title}
          </h2>
          {description && <p className="text-xs text-ink-3">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
