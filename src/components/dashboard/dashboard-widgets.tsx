"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, Building2, CalendarRange, ListTodo, Megaphone, TrendingUp, type LucideIcon } from "lucide-react";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { useApp } from "@/components/app/app-context";
import { DueChip } from "@/components/tasks/task-sections";
import { formatDueLabel, formatMoney } from "@/lib/format";
import { TASK_STATUS, TASK_TYPE } from "@/lib/labels";
import { cn, fileUrl } from "@/lib/utils";
import type { TaskStatus, TaskType } from "@/generated/prisma/enums";

const ease = [0.22, 1, 0.36, 1] as const;

/** Contagem progressiva do número (desligada com prefers-reduced-motion). */
function CountUp({ value, format: fmt = (n) => Math.round(n).toLocaleString("pt-BR") }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, { duration: 0.9, ease, onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className="tabular">
      {fmt(reduce ? value : shown)}
    </span>
  );
}

export type Kpi = {
  key: string;
  label: string;
  value: number;
  money?: boolean;
  hint: string;
  href?: string;
  tone?: "default" | "danger" | "lime";
};

const ICONS: Record<string, LucideIcon> = {
  clients: Building2,
  mrr: TrendingUp,
  media: Megaphone,
  pending: ListTodo,
  overdue: AlarmClock,
  week: CalendarRange,
};

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {items.map((k, i) => {
        const Icon = ICONS[k.key] ?? ListTodo;
        const body = (
          <>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl ring-1",
                  k.tone === "danger" && k.value > 0
                    ? "bg-danger/10 text-danger ring-danger/15"
                    : k.tone === "lime"
                      ? "bg-lime/35 text-lime-ink ring-lime/40"
                      : "bg-purple-50 text-purple ring-purple/10",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
            </div>
            <p className="mt-4 text-[12.5px] font-semibold text-ink-2">{k.label}</p>
            <p className={cn("mt-0.5 font-display text-[26px] font-medium leading-tight tracking-tight", k.tone === "danger" && k.value > 0 && "text-danger")}>
              <CountUp value={k.money ? k.value / 100 : k.value} format={k.money ? (n) => formatMoney(Math.round(n * 100)) : undefined} />
            </p>
            <p className="mt-1 truncate text-xs text-ink-3">{k.hint}</p>
          </>
        );
        return (
          <motion.div key={k.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.06, duration: 0.5, ease }}>
            {k.href ? (
              <Link href={k.href} className="glass glow-border card-hover block h-full rounded-[22px] p-4 focus-visible:outline-2 focus-visible:outline-purple">
                {body}
              </Link>
            ) : (
              <div className="glass h-full rounded-[22px] p-4">{body}</div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Gráfico de operação ───────────────────────────

const SERIES = [
  { key: "created", label: "Criadas", color: "#7625F5" },
  { key: "completed", label: "Concluídas", color: "#6E9400" },
  { key: "overdue", label: "Atrasos", color: "#C2185B" },
] as const;

type Point = { date: string; created: number; completed: number; overdue: number };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="mb-1 font-bold">{format(new Date(`${label}T12:00:00`), "EEEE, dd 'de' MMM", { locale: ptBR })}</p>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <p key={s.key} className="flex items-center gap-2 text-ink-2">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-bold text-ink tabular">{v}</span>
          </p>
        );
      })}
    </div>
  );
}

export function OperationChart({ data, range }: { data: Point[]; range: 7 | 30 | 90 }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const setRange = (r: number) => {
    const next = new URLSearchParams(params.toString());
    if (r === 30) next.delete("range");
    else next.set("range", String(r));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const totals = Object.fromEntries(SERIES.map((s) => [s.key, data.reduce((n, d) => n + d[s.key], 0)]));
  const empty = data.every((d) => !d.created && !d.completed && !d.overdue);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.5, ease }}
      className="glass rounded-[26px] p-5"
      aria-labelledby="chart-title"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="chart-title" className="text-[15px] font-bold">
            Operação
          </h2>
          <p className="text-xs text-ink-3">Tarefas criadas, concluídas e que venceram sem conclusão, por dia.</p>
        </div>
        <div className="flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Período">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn("h-7 rounded-lg px-3 text-xs font-bold transition-all", range === r ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
            >
              {r} dias
            </button>
          ))}
        </div>
      </div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Legenda">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label} <span className="font-bold text-ink tabular">{totals[s.key]}</span>
          </li>
        ))}
      </ul>
      {empty ? (
        <EmptyState className="h-[240px]" title="Sem movimentação no período" description="O gráfico aparece assim que tarefas forem criadas ou concluídas." />
      ) : (
        <div className="h-[240px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7625F5" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#7625F5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(23,20,29,0.06)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9A94A3" }}
                tickFormatter={(d: string) => format(new Date(`${d}T12:00:00`), range === 7 ? "EEE" : "dd/MM", { locale: ptBR })}
                minTickGap={18}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(118,37,245,0.25)", strokeWidth: 1 }} />
              <Area type="monotone" dataKey="created" stroke="#7625F5" strokeWidth={2} fill="url(#createdFill)" animationDuration={700} />
              <Line type="monotone" dataKey="completed" stroke="#6E9400" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
              <Line type="monotone" dataKey="overdue" stroke="#C2185B" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Visão em tabela para leitores de tela. */}
      <table className="sr-only">
        <caption>Operação por dia</caption>
        <thead>
          <tr>
            <th>Data</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.created}</td>
              <td>{d.completed}</td>
              <td>{d.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

// ───────────────────────────── Próximas entregas ─────────────────────────────

type Delivery = {
  id: string;
  number: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  dueDate: string | null;
  client: { id: string; name: string } | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
};

export function UpcomingDeliveries({ items }: { items: Delivery[] }) {
  const { openTask, openQuickTask } = useApp();
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease }} className="glass rounded-[26px] p-5" aria-labelledby="up-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="up-title" className="text-[15px] font-bold">
          Próximas entregas
        </h2>
        <Link href="/tarefas?view=list&sort=dueDate" className="text-xs font-semibold text-purple hover:underline">
          Ver todas
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nenhuma entrega com prazo" description="Defina prazos nas tarefas para acompanhar aqui." action={<button onClick={() => openQuickTask()} className="text-sm font-semibold text-purple hover:underline">Criar tarefa</button>} />
      ) : (
        <ul className="-mx-2 divide-y divide-hairline/70">
          {items.map((t) => (
            <li key={t.id}>
              <button onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/60">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white/70 py-1 ring-1 ring-hairline">
                  <span className="text-[10px] font-bold uppercase text-ink-3">{t.dueDate ? formatDueLabel(t.dueDate).slice(0, 6) : "—"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{t.title}</p>
                  <p className="truncate text-xs text-ink-3">
                    {t.client?.name ?? "Interno"} · {TASK_TYPE[t.type].label}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <DueChip due={t.dueDate} />
                </div>
                <Badge color={TASK_STATUS[t.status].color} className="hidden shrink-0 md:inline-flex">
                  {TASK_STATUS[t.status].label}
                </Badge>
                <Avatar user={t.assignee} size={26} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

// ───────────────────────────── Clientes em destaque ─────────────────────────────

type Featured = {
  id: string;
  name: string;
  logoFileId: string | null;
  pending: number;
  overdue: number;
  nextDueDate: string | null;
  monthlyFeeCents: number | null;
  mediaBudgetCents: number | null;
};

export function ClientLogo({ name, logoFileId, size = 40 }: { name: string; logoFileId: string | null; size?: number }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-display text-[13px] font-semibold text-purple ring-1 ring-hairline",
        logoFileId ? "bg-white" : "bg-gradient-to-br from-purple-50 to-white",
      )}
      style={{ width: size, height: size }}
    >
      {logoFileId ? (
        // Logos não são cortados: cabem inteiros sobre fundo branco.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(logoFileId)} alt="" className="size-full object-contain p-[8%]" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

export function FeaturedClients({ items, finance }: { items: Featured[]; finance: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.5, ease }} aria-labelledby="fc-title">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 id="fc-title" className="text-[15px] font-bold">
          Clientes em destaque
        </h2>
        <Link href="/clientes" className="text-xs font-semibold text-purple hover:underline">
          Todos os clientes
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="glass rounded-[26px]">
          <EmptyState icon={<Building2 />} title="Nenhum cliente ativo" description="Cadastre clientes e marque-os como ativos para vê-los aqui." />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="glass glow-border card-hover block rounded-[22px] p-4">
              <div className="flex items-center gap-3">
                <ClientLogo name={c.name} logoFileId={c.logoFileId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{c.name}</p>
                  <p className="text-xs text-ink-3">{c.nextDueDate ? `Próximo prazo: ${formatDueLabel(c.nextDueDate)}` : "Sem prazos futuros"}</p>
                </div>
                {c.overdue > 0 && (
                  <Badge color="#E5484D">
                    {c.overdue} atrasada{c.overdue > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <dl className={cn("mt-4 grid gap-2 text-xs", finance ? "grid-cols-3" : "grid-cols-1")}>
                <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                  <dt className="text-ink-3">Pendentes</dt>
                  <dd className="font-display text-[15px] font-medium tabular">{c.pending}</dd>
                </div>
                {finance && (
                  <>
                    <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                      <dt className="text-ink-3">Mensalidade</dt>
                      <dd className="truncate font-semibold tabular">{c.monthlyFeeCents != null ? formatMoney(c.monthlyFeeCents) : "—"}</dd>
                    </div>
                    <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                      <dt className="text-ink-3">Mídia/mês</dt>
                      <dd className="truncate font-semibold tabular">{c.mediaBudgetCents != null ? formatMoney(c.mediaBudgetCents) : "—"}</dd>
                    </div>
                  </>
                )}
              </dl>
            </Link>
          ))}
        </div>
      )}
    </motion.section>
  );
}
