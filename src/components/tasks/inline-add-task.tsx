"use client";

import { useRef, useState, useTransition } from "react";
import { CornerDownLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { TaskStatus } from "@/generated/prisma/enums";
import type { QuickTaskInput } from "@/lib/schemas";
import { TASK_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createTaskAction } from "@/app/actions/tasks";

/**
 * "+ Adicionar tarefa" no fim de um grupo/coluna, como no ClickUp: digite o nome e Enter.
 * O campo continua aberto para criar várias em sequência; Esc fecha.
 */
export function InlineAddTask({
  status,
  defaults,
  className,
  variant = "row",
  initialOpen = false,
}: {
  status: TaskStatus;
  defaults?: Record<string, string>;
  className?: string;
  variant?: "row" | "card";
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const where = TASK_STATUS[status].label;

  const submit = () => {
    const t = title.trim();
    if (!t || pending) return;
    start(async () => {
      const r = await createTaskAction({ ...defaults, title: t, status } as QuickTaskInput);
      if (!r.ok) return void toast.error(r.error);
      setTitle("");
      input.current?.focus();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-2 text-left text-[13px] font-semibold text-ink-3 transition-colors hover:text-purple",
          variant === "row" ? "px-4 py-2.5 hover:bg-white/50" : "rounded-2xl px-3 py-2 hover:bg-white/60",
          className,
        )}
        aria-label={`Adicionar tarefa em ${where}`}
      >
        <Plus className="size-4" /> Adicionar tarefa
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", variant === "row" ? "px-4 py-2" : "rounded-2xl bg-white/80 p-2 ring-1 ring-purple/30", className)}>
      {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" /> : <Plus className="size-4 shrink-0 text-purple" />}
      <input
        ref={input}
        autoFocus
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            // Não deixa o Esc fechar diálogos/painéis por trás.
            e.stopPropagation();
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => !title.trim() && !pending && setOpen(false)}
        placeholder="Nome da tarefa e Enter"
        aria-label={`Nome da nova tarefa em ${where}`}
        className="h-8 min-w-0 flex-1 rounded-lg bg-transparent text-[13.5px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-3"
      />
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-ink-3 sm:inline-flex">
        <CornerDownLeft className="size-3" /> Enter
      </span>
    </div>
  );
}
