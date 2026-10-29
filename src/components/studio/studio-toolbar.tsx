"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, LayoutGrid, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import type { ApprovalStatus, ContentPlatform, TaskType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { APPROVAL_STATUS, APPROVAL_STATUS_ORDER, CONTENT_PLATFORM, CONTENT_TYPES, TASK_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";

function Chips<T extends string>({ label, values, options, onChange }: { label: string; values: T[]; options: { value: T; label: string }[]; onChange: (v: T[]) => void }) {
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

/** Filtros do Studio na URL: cliente, tipo, aprovação, plataforma e busca. */
export function StudioToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { clients } = useApp();
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
  const view = params.get("view") === "grid" ? "grid" : "board";
  const advanced = ["type", "approval", "platform"].reduce((n, k) => n + csv(k).length, 0);
  const anyFilter = [...params.keys()].some((k) => !["view", "task"].includes(k));

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
          placeholder="Buscar título, cliente ou legenda…"
          aria-label="Buscar conteúdos"
          className="h-10 w-full rounded-xl border border-hairline bg-white/75 pl-9 pr-3 text-sm outline-none transition focus:border-purple/50 focus:ring-4 focus:ring-purple/10"
        />
      </div>
      <Select value={params.get("client") ?? ""} onChange={(e) => set({ client: e.target.value || null })} aria-label="Cliente" className="w-[180px]">
        <option value="">Todos os clientes</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" className={cn(advanced > 0 && "ring-2 ring-purple/30")}>
            <SlidersHorizontal /> Filtros {advanced > 0 && <span className="rounded-full bg-purple px-1.5 text-[11px] text-white">{advanced}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,380px)] space-y-4 p-4">
          <Chips<TaskType> label="Tipo" values={csv("type") as TaskType[]} options={CONTENT_TYPES.map((t) => ({ value: t, label: TASK_TYPE[t].label }))} onChange={(v) => set({ type: v.join(",") || null })} />
          <Chips<ApprovalStatus>
            label="Aprovação"
            values={csv("approval") as ApprovalStatus[]}
            options={APPROVAL_STATUS_ORDER.map((s) => ({ value: s, label: APPROVAL_STATUS[s].label }))}
            onChange={(v) => set({ approval: v.join(",") || null })}
          />
          <Chips<ContentPlatform>
            label="Plataforma"
            values={csv("platform") as ContentPlatform[]}
            options={(Object.keys(CONTENT_PLATFORM) as ContentPlatform[]).map((p) => ({ value: p, label: CONTENT_PLATFORM[p].label }))}
            onChange={(v) => set({ platform: v.join(",") || null })}
          />
        </PopoverContent>
      </Popover>
      {anyFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            const keep = new URLSearchParams();
            if (params.get("view")) keep.set("view", params.get("view")!);
            start(() => router.replace(`${pathname}?${keep}`, { scroll: false }));
          }}
        >
          <X /> Limpar
        </Button>
      )}
      <div className="ml-auto flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Visualização">
        {(
          [
            ["board", "Aprovação", Columns3],
            ["grid", "Prévias", LayoutGrid],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            onClick={() => set({ view: v === "board" ? null : v })}
            aria-pressed={view === v}
            className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all", view === v ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
