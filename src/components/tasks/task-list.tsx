"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Loader2, MessageSquare, Paperclip, Plus } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/display";
import { useApp, type UserOption } from "@/components/app/app-context";
import { TASK_PRIORITY, taskCode } from "@/lib/labels";
import { groupTasks, topLevelRows, type TaskGroup } from "@/lib/task-groups";
import type { TaskGroupBy } from "@/lib/task-filters";
import { cn } from "@/lib/utils";
import { updateTaskAction } from "@/app/actions/tasks";
import type { BoardTask } from "./task-card";
import { fetchTask } from "./task-panel";
import { AssigneePicker, DueDatePicker, PriorityFlag, PriorityPicker, StatusDot, StatusPicker } from "./task-pickers";
import { DueChip } from "./task-sections";
import { InlineAddTask } from "./inline-add-task";
import { useTaskMutation } from "./use-task-mutation";

/** Forma comum às linhas de tarefas e às subtarefas carregadas sob demanda. */
type RowTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  parentId: string | null;
  assignee: UserOption | null;
  client: { id: string; name: string } | null;
  parent?: { title: string } | null;
  subtaskTotal: number;
  subtaskDone: number;
  _count: { comments: number; files: number };
};

const COLUMNS = [
  { key: "assignee", label: "Responsável" },
  { key: "dueDate", label: "Prazo" },
  { key: "priority", label: "Prioridade" },
  { key: "client", label: "Cliente" },
] as const;

const grid = (hideClient: boolean) =>
  hideClient ? "md:grid-cols-[minmax(0,1fr)_170px_120px_120px]" : "md:grid-cols-[minmax(0,1fr)_170px_120px_120px_160px]";

function SortHeader({ col, label }: { col: string; label: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const active = params.get("sort") === col;
  const dir = active && params.get("dir") === "desc" ? "desc" : "asc";
  const next = new URLSearchParams(params.toString());
  next.set("sort", col);
  next.set("dir", active && dir === "asc" ? "desc" : "asc");
  next.delete("task");
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={`${pathname}?${next}`}
      scroll={false}
      className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-purple")}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <Icon className="size-3" />
    </Link>
  );
}

function GroupLabel({ group }: { group: TaskGroup<BoardTask> }) {
  if (group.assignee !== undefined) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-bold">
        <Avatar user={group.assignee} size={22} />
        <span className="truncate">{group.label}</span>
      </span>
    );
  }
  const color = group.color ?? "#7625F5";
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-lg px-2 py-1 text-[11.5px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }}
    >
      {group.status && <StatusDot status={group.status} className="size-2" />}
      {group.label}
    </span>
  );
}

function TaskRow({ task, depth = 0, hideClient, readOnly }: { task: RowTask; depth?: number; hideClient: boolean; readOnly: boolean }) {
  const { openTask } = useApp();
  const { run, pending } = useTaskMutation(task.id, task.parentId);
  const [expanded, setExpanded] = useState(false);
  const done = task.status === "DONE";
  const label = task.title;

  return (
    <>
      <li
        className={cn(
          "group/row border-b border-hairline/70 px-4 py-2 transition-colors hover:bg-white/60 md:grid md:items-center md:gap-3 md:py-1.5",
          grid(hideClient),
          pending && "opacity-70",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 26 }}>
          {task.subtaskTotal > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Recolher" : "Mostrar"} subtarefas de ${label}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-black/[0.05] hover:text-ink"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
          {readOnly ? (
            <span className="flex size-6 items-center justify-center">
              <StatusDot status={task.status} className="size-3.5" />
            </span>
          ) : (
            <StatusPicker size="dot" label={label} value={task.status} onChange={(status) => run(() => updateTaskAction(task.id, { status }))} />
          )}
          <button type="button" onClick={() => openTask(task.id)} className="min-w-0 flex-1 py-1 text-left">
            <span className="mr-1.5 font-mono text-[11px] text-ink-3">{taskCode(task.number)}</span>
            <span className={cn("text-[13.5px] font-semibold", done && "text-ink-3 line-through decoration-ink-3/50")}>{task.title}</span>
            {task.parent && depth === 0 && <span className="block truncate text-xs text-ink-3">↳ {task.parent.title}</span>}
          </button>
          <span className="flex shrink-0 items-center gap-2 text-[11.5px] font-semibold text-ink-3">
            {task.subtaskTotal > 0 && (
              <span className="rounded-md bg-black/[0.05] px-1.5 tabular" title="Subtarefas concluídas">
                {task.subtaskDone}/{task.subtaskTotal}
              </span>
            )}
            {task._count.comments > 0 && (
              <span className="hidden items-center gap-0.5 sm:inline-flex">
                <MessageSquare className="size-3.5" /> {task._count.comments}
              </span>
            )}
            {task._count.files > 0 && (
              <span className="hidden items-center gap-0.5 sm:inline-flex">
                <Paperclip className="size-3.5" /> {task._count.files}
              </span>
            )}
          </span>
        </div>

        {/* No celular os campos ficam numa linha abaixo do título; no desktop viram colunas. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1 pl-[46px] md:contents">
          <div className="min-w-0">
            {readOnly ? (
              <span className="flex items-center gap-2 text-[13px] text-ink-2">
                <Avatar user={task.assignee} size={22} />
                <span className="truncate">{task.assignee?.name ?? "—"}</span>
              </span>
            ) : (
              <AssigneePicker value={task.assignee} onChange={(assigneeId) => run(() => updateTaskAction(task.id, { assigneeId }))} />
            )}
          </div>
          <div>
            {readOnly ? (
              <DueChip due={task.dueDate} done={done} />
            ) : (
              <DueDatePicker value={task.dueDate} done={done} label={label} onChange={(dueDate) => run(() => updateTaskAction(task.id, { dueDate }))} />
            )}
          </div>
          <div>
            {readOnly ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <PriorityFlag priority={task.priority} /> {TASK_PRIORITY[task.priority].label}
              </span>
            ) : (
              <PriorityPicker compact value={task.priority} onChange={(priority) => run(() => updateTaskAction(task.id, { priority }))} />
            )}
          </div>
          {!hideClient && <div className="truncate px-1.5 text-[12.5px] text-ink-2">{task.client?.name ?? <span className="text-ink-3">Interno</span>}</div>}
        </div>
      </li>
      {expanded && <SubtaskRows parent={task} depth={depth + 1} hideClient={hideClient} readOnly={readOnly} />}
    </>
  );
}

/** Subtarefas carregadas sob demanda do detalhe da tarefa (mesmo cache do painel lateral). */
function SubtaskRows({ parent, depth, hideClient, readOnly }: { parent: RowTask; depth: number; hideClient: boolean; readOnly: boolean }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["task", parent.id], queryFn: () => fetchTask(parent.id) });
  if (isLoading) {
    return (
      <li className="flex items-center gap-2 border-b border-hairline/70 px-4 py-2 text-xs text-ink-3" style={{ paddingLeft: 16 + depth * 26 + 26 }}>
        <Loader2 className="size-3.5 animate-spin" /> Carregando subtarefas…
      </li>
    );
  }
  if (error || !data) {
    return <li className="border-b border-hairline/70 px-4 py-2 text-xs text-danger">Não foi possível carregar as subtarefas.</li>;
  }
  return (
    <>
      {data.subtasks.map((s) => (
        <TaskRow
          key={s.id}
          depth={depth}
          hideClient={hideClient}
          readOnly={readOnly}
          task={{
            ...s,
            parentId: parent.id,
            client: parent.client,
            subtaskTotal: 0,
            subtaskDone: 0,
            _count: { comments: s._count.comments, files: s._count.files },
          }}
        />
      ))}
    </>
  );
}

/**
 * Lista no estilo ClickUp: grupos recolhíveis (por status, responsável, prioridade ou cliente),
 * campos editáveis na própria linha, subtarefas expansíveis e criação rápida no fim de cada grupo.
 */
export function TaskList({
  tasks,
  groupBy,
  statuses,
  defaults,
  hideClient = false,
  readOnly = false,
  emptyText,
}: {
  tasks: BoardTask[];
  groupBy: TaskGroupBy;
  statuses?: TaskStatus[];
  defaults?: Record<string, string>;
  hideClient?: boolean;
  readOnly?: boolean;
  emptyText?: string;
}) {
  // Como no ClickUp, grupos vazios começam recolhidos; a escolha manual de abrir/recolher prevalece.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<{ key: string; n: number } | null>(null);
  const groups = groupTasks(topLevelRows(tasks), groupBy, statuses);
  const isOpen = (g: TaskGroup<BoardTask>) => manual[g.key] ?? (g.tasks.length > 0 || !tasks.length);
  const toggle = (g: TaskGroup<BoardTask>) => setManual((m) => ({ ...m, [g.key]: !isOpen(g) }));
  const addIn = (g: TaskGroup<BoardTask>) => {
    setManual((m) => ({ ...m, [g.key]: true }));
    setAdding((a) => ({ key: g.key, n: (a?.n ?? 0) + 1 }));
  };

  return (
    <div className="space-y-4">
      {emptyText && !tasks.length && <p className="px-1 text-sm text-ink-3">{emptyText} Crie a primeira direto em um grupo abaixo.</p>}
      {groups.map((g) => {
        const open = isOpen(g);
        return (
          <section key={g.key} aria-label={`Grupo ${g.label}`} className="glass overflow-hidden rounded-3xl">
            <header className={cn("flex items-center gap-3 px-4 py-2.5 md:grid", grid(hideClient), open && "border-b border-hairline")}>
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(g)}
                  aria-expanded={open}
                  aria-label={`${open ? "Recolher" : "Expandir"} grupo ${g.label}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-black/[0.05]"
                >
                  <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                </button>
                <GroupLabel group={g} />
                <span className="text-xs font-bold text-ink-3 tabular">{g.tasks.length}</span>
                {g.status && !readOnly && (
                  <button
                    type="button"
                    onClick={() => addIn(g)}
                    aria-label={`Nova tarefa em ${g.label}`}
                    title="Nova tarefa neste grupo"
                    className="flex size-6 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-black/[0.05] hover:text-purple"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </div>
              {open &&
                COLUMNS.filter((c) => !(hideClient && c.key === "client")).map((c) => (
                  <span key={c.key} className="hidden px-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3 md:block">
                    <SortHeader col={c.key} label={c.label} />
                  </span>
                ))}
            </header>
            {open && (
              <ul>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} hideClient={hideClient} readOnly={readOnly} />
                ))}
                {g.status && !readOnly ? (
                  <li>
                    <InlineAddTask
                      key={adding?.key === g.key ? adding.n : 0}
                      status={g.status}
                      defaults={defaults}
                      initialOpen={adding?.key === g.key}
                    />
                  </li>
                ) : (
                  !g.tasks.length && <li className="px-4 py-3 text-xs text-ink-3">Nenhuma tarefa.</li>
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
