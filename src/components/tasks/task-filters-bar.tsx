"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Columns3, List, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { TASK_PRIORITY, TASK_PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER, TASK_TYPE, TASK_TYPE_ORDER } from "@/lib/labels";
import { TASK_GROUP_BY, TASKS_VIEW_COOKIE, type TaskGroupBy, type TaskView } from "@/lib/task-filters";
import { cn } from "@/lib/utils";

function MultiToggle<T extends string>({ label, values, options, onChange }: { label: string; values: T[]; options: { value: T; label: string; color?: string }[]; onChange: (v: T[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
              className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors", on ? "bg-purple text-white ring-purple" : "bg-white/70 text-ink-2 ring-hairline hover:ring-purple/40")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Guarda a visualização escolhida para as próximas visitas (lida no servidor). */
function rememberView(v: TaskView) {
  document.cookie = `${TASKS_VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Filtros na URL: combináveis, compartilháveis e preservados ao recarregar.
 * `hide` remove controles irrelevantes (ex.: responsável em "Minhas tarefas").
 * `view` é a visualização efetiva (URL ou preferência salva).
 */
export function TaskFiltersBar({
  hide = [],
  showView = true,
  view = "list",
  group = "status",
}: {
  hide?: ("client" | "assignee" | "type")[];
  showView?: boolean;
  view?: TaskView;
  group?: TaskGroupBy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { clients, users } = useApp();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("task");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const csv = (k: string) => params.get(k)?.split(",").filter(Boolean) ?? [];
  const advanced = ["status", "type", "priority"].reduce((n, k) => n + csv(k).length, 0);
  const anyFilter = [...params.keys()].some((k) => !["view", "group", "task", "sort", "dir"].includes(k));

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
          placeholder="Filtrar por título ou KR-…"
          aria-label="Filtrar tarefas"
          className="h-10 w-full rounded-xl border border-hairline bg-white/75 pl-9 pr-3 text-sm outline-none transition focus:border-purple/50 focus:ring-4 focus:ring-purple/10"
        />
      </div>
      {!hide.includes("client") && (
        <Select value={params.get("client") ?? ""} onChange={(e) => set({ client: e.target.value || null })} aria-label="Cliente" className="w-[170px]">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      {!hide.includes("assignee") && (
        <Select value={params.get("assignee") ?? ""} onChange={(e) => set({ assignee: e.target.value || null })} aria-label="Responsável" className="w-[170px]">
          <option value="">Todos os responsáveis</option>
          <option value="me">Atribuídas a mim</option>
          <option value="none">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      )}
      <Select value={params.get("due") ?? ""} onChange={(e) => set({ due: e.target.value || null })} aria-label="Prazo" className="w-[150px]">
        <option value="">Qualquer prazo</option>
        <option value="overdue">Atrasadas</option>
        <option value="week">Próximos 7 dias</option>
        <option value="none">Sem prazo</option>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" className={cn(advanced > 0 && "ring-2 ring-purple/30")}>
            <SlidersHorizontal /> Filtros {advanced > 0 && <span className="rounded-full bg-purple px-1.5 text-[11px] text-white">{advanced}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,380px)] space-y-4 p-4">
          <MultiToggle label="Status" values={csv("status")} options={TASK_STATUS_ORDER.map((s) => ({ value: s, label: TASK_STATUS[s].label }))} onChange={(v) => set({ status: v.join(",") || null })} />
          <MultiToggle label="Prioridade" values={csv("priority")} options={[...TASK_PRIORITY_ORDER].reverse().map((p) => ({ value: p, label: TASK_PRIORITY[p].label }))} onChange={(v) => set({ priority: v.join(",") || null })} />
          {!hide.includes("type") && (
            <MultiToggle label="Tipo" values={csv("type")} options={TASK_TYPE_ORDER.map((t) => ({ value: t, label: TASK_TYPE[t].label }))} onChange={(v) => set({ type: v.join(",") || null })} />
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="accent-purple" checked={params.get("archived") === "1"} onChange={(e) => set({ archived: e.target.checked ? "1" : null })} />
            <Archive className="size-4" /> Mostrar arquivadas
          </label>
        </PopoverContent>
      </Popover>
      {anyFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            const keep = new URLSearchParams();
            for (const k of ["view", "group"]) if (params.get(k)) keep.set(k, params.get(k)!);
            start(() => router.replace(`${pathname}?${keep}`, { scroll: false }));
          }}
        >
          <X /> Limpar
        </Button>
      )}
      {view === "list" && (
        <Select
          value={group}
          onChange={(e) => set({ group: e.target.value === "status" ? null : e.target.value })}
          aria-label="Agrupar por"
          className="w-[190px]"
        >
          {(Object.keys(TASK_GROUP_BY) as TaskGroupBy[]).map((g) => (
            <option key={g} value={g}>
              Agrupar: {TASK_GROUP_BY[g]}
            </option>
          ))}
        </Select>
      )}
      {showView && (
        <div className="ml-auto flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Visualização">
          {(
            [
              ["list", "Lista", List],
              ["pipeline", "Pipeline", Columns3],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => {
                rememberView(v);
                set({ view: v });
              }}
              aria-pressed={view === v}
              aria-label={label}
              className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all", view === v ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
