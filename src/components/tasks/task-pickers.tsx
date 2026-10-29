"use client";

import { useState } from "react";
import { CalendarPlus, Check, ChevronDown, Flag } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/primitives";
import { TASK_PRIORITY, TASK_PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from "@/lib/labels";
import { toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp, type UserOption } from "@/components/app/app-context";
import { DueChip } from "./task-sections";

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  const c = TASK_STATUS[status].color;
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: status === "DONE" ? c : "transparent", boxShadow: `inset 0 0 0 2px ${c}` }}
      aria-hidden
    />
  );
}

export function StatusPicker({
  value,
  onChange,
  disabled,
  size = "md",
  label,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  disabled?: boolean;
  /** "dot": só o círculo do status, como nas linhas da lista. */
  size?: "sm" | "md" | "dot";
  /** Nome da tarefa para o rótulo acessível (linhas da lista). */
  label?: string;
}) {
  const s = TASK_STATUS[value];
  return (
    <DropdownMenu>
      {size === "dot" ? (
        <DropdownMenuTrigger
          disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-purple disabled:opacity-60"
          aria-label={`Status${label ? ` de ${label}` : ""}: ${s.label}`}
          title={s.label}
        >
          <StatusDot status={value} className="size-3.5" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple disabled:opacity-60",
            size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-[13px]",
          )}
          style={{ backgroundColor: `color-mix(in srgb, ${s.color} 12%, white)`, color: `color-mix(in srgb, ${s.color} 85%, black)` }}
          aria-label={`Status: ${s.label}`}
        >
          <StatusDot status={value} className="size-2" />
          {s.label}
          <ChevronDown className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {TASK_STATUS_ORDER.map((st) => (
          <DropdownMenuItem key={st} onSelect={() => st !== value && onChange(st)}>
            <StatusDot status={st} />
            <span className="flex-1">{TASK_STATUS[st].label}</span>
            {st === value && <Check className="!text-purple" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityFlag({ priority, className }: { priority: TaskPriority; className?: string }) {
  return <Flag className={cn("size-3.5", className)} style={{ color: TASK_PRIORITY[priority].color }} fill={priority === "URGENT" || priority === "HIGH" ? TASK_PRIORITY[priority].color : "none"} aria-label={`Prioridade ${TASK_PRIORITY[priority].label}`} />;
}

export function PriorityPicker({ value, onChange, compact }: { value: TaskPriority; onChange: (p: TaskPriority) => void; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple",
          compact ? "h-7 px-1.5 text-[12.5px] text-ink-2 hover:bg-white/70" : "h-8 bg-white/70 px-3 text-[13px] ring-1 ring-hairline hover:bg-white",
        )}
        aria-label={`Prioridade: ${TASK_PRIORITY[value].label}`}
      >
        <PriorityFlag priority={value} />
        {TASK_PRIORITY[value].label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Prioridade</DropdownMenuLabel>
        {[...TASK_PRIORITY_ORDER].reverse().map((p) => (
          <DropdownMenuItem key={p} onSelect={() => p !== value && onChange(p)}>
            <PriorityFlag priority={p} />
            <span className="flex-1">{TASK_PRIORITY[p].label}</span>
            {p === value && <Check className="!text-purple" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AssigneePicker({
  value,
  onChange,
  compact,
}: {
  value: UserOption | null;
  onChange: (userId: string | null) => void;
  compact?: boolean;
}) {
  const { users, user: me } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex min-w-0 items-center gap-2 rounded-xl text-left text-[13px] font-semibold transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-purple",
          compact ? "p-0.5" : "h-8 px-1.5 pr-2.5",
        )}
        aria-label={value ? `Responsável: ${value.name}` : "Atribuir responsável"}
      >
        <Avatar user={value} size={compact ? 24 : 24} />
        {!compact && <span className={cn("truncate", !value && "text-ink-3")}>{value?.name ?? "Sem responsável"}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Responsável</DropdownMenuLabel>
        {users.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => u.id !== value?.id && onChange(u.id)}>
            <Avatar user={u} size={22} />
            <span className="flex-1 truncate">
              {u.name}
              {u.id === me.id && <span className="text-ink-3"> (eu)</span>}
            </span>
            {u.id === value?.id && <Check className="!text-purple" />}
          </DropdownMenuItem>
        ))}
        {value && (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <Avatar user={null} size={22} />
            <span className="flex-1 text-ink-2">Remover responsável</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Prazo editável em linha: mostra o chip do prazo e abre um seletor de data. */
export function DueDatePicker({
  value,
  onChange,
  done,
  label,
}: {
  value: string | null;
  onChange: (ymd: string | null) => void;
  done?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="group/due inline-flex h-7 items-center rounded-xl px-1.5 transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-purple"
        aria-label={`Prazo${label ? ` de ${label}` : ""}: ${value ? toDateInput(value) : "sem prazo"}`}
      >
        {value ? (
          <DueChip due={value} done={done} />
        ) : (
          <CalendarPlus className="size-4 text-ink-3 opacity-50 transition-opacity group-hover/due:opacity-100" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-2 p-3">
        <input
          type="date"
          autoFocus
          defaultValue={toDateInput(value)}
          aria-label="Data de entrega"
          className="h-9 w-full rounded-xl border border-hairline bg-white/80 px-3 text-sm outline-none focus:border-purple/50 focus:ring-4 focus:ring-purple/10"
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(e.target.value);
            setOpen(false);
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => (onChange(null), setOpen(false))}
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink-2 hover:bg-black/[0.04]"
          >
            Remover prazo
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
