"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ListChecks, MessageSquare, Paperclip, Pause, Play, Plus, Timer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Progress } from "@/components/ui/display";
import { Checkbox, Input } from "@/components/ui/form-controls";
import { Tooltip } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { useElapsed } from "@/components/app/topbar";
import { formatDateTime, formatDueLabel, formatDuration, formatRelative, parseDurationToMinutes, toDateInput } from "@/lib/format";
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE, APPROVAL_STATUS, taskCode } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  addChecklistItemAction,
  addManualTimeAction,
  createTaskAction,
  deleteChecklistItemAction,
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
  toggleChecklistItemAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import type { PanelTask } from "./task-panel";
import { StatusDot } from "./task-pickers";
import { useTaskMutation } from "./use-task-mutation";

export function SectionTitle({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-ink-3 [&_svg]:size-4">{icon}</span>
      <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">{children}</h3>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

// ───────────────────────────── Subtarefas ─────────────────────────────

export function SubtasksSection({ task }: { task: PanelTask }) {
  const { openTask, openQuickTask } = useApp();
  const { run } = useTaskMutation(task.id);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const done = task.subtasks.filter((s) => s.status === "DONE").length;
  const total = task.subtasks.length;

  return (
    <section>
      <SectionTitle
        icon={<ListChecks />}
        aside={
          <Button variant="ghost" size="sm" onClick={() => openQuickTask({ parentId: task.id })}>
            <Plus /> Detalhada
          </Button>
        }
      >
        Subtarefas
      </SectionTitle>
      {total > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <Progress value={(done / total) * 100} className="flex-1" />
          <span className="shrink-0 text-xs font-semibold text-ink-2 tabular">
            {done} de {total} concluídas
          </span>
        </div>
      )}
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {task.subtasks.map((s) => (
            <motion.li key={s.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="group flex items-center gap-2.5 rounded-xl bg-white/55 px-2.5 py-2 ring-1 ring-hairline transition-colors hover:bg-white">
                <Tooltip content={s.status === "DONE" ? "Reabrir" : "Concluir"}>
                  <button
                    onClick={() => run(() => updateTaskAction(s.id, { status: s.status === "DONE" ? "TODO" : "DONE" }))}
                    className="flex size-5 items-center justify-center rounded-full"
                    aria-label={s.status === "DONE" ? `Reabrir ${s.title}` : `Concluir ${s.title}`}
                  >
                    <StatusDot status={s.status} className="size-4" />
                  </button>
                </Tooltip>
                <button onClick={() => openTask(s.id)} className="min-w-0 flex-1 text-left">
                  <span className={cn("block truncate text-[13.5px] font-semibold", s.status === "DONE" && "text-ink-3 line-through")}>{s.title}</span>
                  <span className="flex flex-wrap gap-x-2 text-[11.5px] text-ink-3">
                    <span>{TASK_STATUS[s.status].label}</span>
                    {s.dueDate && <span>· {formatDueLabel(s.dueDate)}</span>}
                    {s.trackedSeconds > 0 && <span>· {formatDuration(s.trackedSeconds)}</span>}
                    {s._count.comments > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        · <MessageSquare className="size-3" /> {s._count.comments}
                      </span>
                    )}
                    {s._count.files > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        · <Paperclip className="size-3" /> {s._count.files}
                      </span>
                    )}
                  </span>
                </button>
                <Avatar user={s.assignee} size={24} />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {adding ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const ok = await run(() => createTaskAction({ title, parentId: task.id }));
            if (ok) setTitle("");
          }}
        >
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da subtarefa e Enter" maxLength={200} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
          <Button type="button" variant="ghost" size="icon" onClick={() => setAdding(false)} aria-label="Cancelar">
            <X />
          </Button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-ink-3 transition-colors hover:bg-white/60 hover:text-purple">
          <Plus className="size-4" /> Adicionar subtarefa
        </button>
      )}
    </section>
  );
}

// ────────────────────────────── Checklist ──────────────────────────────

export function ChecklistSection({ task }: { task: PanelTask }) {
  const { run } = useTaskMutation(task.id, task.parentId);
  const [text, setText] = useState("");
  const done = task.checklist.filter((c) => c.done).length;
  return (
    <section>
      <SectionTitle icon={<ListChecks />} aside={task.checklist.length > 0 && <span className="text-xs font-semibold text-ink-3 tabular">{done}/{task.checklist.length}</span>}>
        Checklist
      </SectionTitle>
      <ul className="space-y-0.5">
        {task.checklist.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/60">
            <Checkbox checked={item.done} onChange={(e) => run(() => toggleChecklistItemAction(item.id, e.target.checked))} aria-label={item.text} />
            <span className={cn("flex-1 text-[13.5px]", item.done && "text-ink-3 line-through")}>{item.text}</span>
            <button onClick={() => run(() => deleteChecklistItemAction(item.id))} className="text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Remover item">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (await run(() => addChecklistItemAction(task.id, text))) setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ Novo item e Enter" className="h-9 bg-transparent" maxLength={300} />
      </form>
    </section>
  );
}

// ──────────────────────────────── Tempo ────────────────────────────────

export function TimeSection({ task }: { task: PanelTask }) {
  const { activeTimer, user } = useApp();
  const { run, pending } = useTaskMutation(task.id, task.parentId);
  const running = activeTimer?.task.id === task.id;
  const elapsed = useElapsed(running ? activeTimer?.startedAt : null);
  const [manual, setManual] = useState(false);
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [estimate, setEstimate] = useState(task.estimateMinutes ? formatDuration(task.estimateMinutes * 60) : "");

  const total = task.time.totalSeconds + elapsed;
  const estimateSec = (task.estimateMinutes ?? 0) * 60;

  return (
    <section>
      <SectionTitle icon={<Timer />}>Tempo</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/60 p-3 ring-1 ring-hairline">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Registrado</p>
          <p className="mt-0.5 font-display text-lg font-medium tabular">{formatDuration(total)}</p>
          {task.subtasks.length > 0 && task.time.subtaskSeconds > 0 && (
            <p className="text-[11px] text-ink-3">inclui {formatDuration(task.time.subtaskSeconds)} de subtarefas</p>
          )}
        </div>
        <div className="rounded-xl bg-white/60 p-3 ring-1 ring-hairline">
          <label htmlFor={`est-${task.id}`} className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Estimativa
          </label>
          <input
            id={`est-${task.id}`}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            onBlur={() => {
              const m = estimate.trim() ? parseDurationToMinutes(estimate) : null;
              if (estimate.trim() && m === null) return setEstimate(task.estimateMinutes ? formatDuration(task.estimateMinutes * 60) : "");
              if (m !== task.estimateMinutes) run(() => updateTaskAction(task.id, { estimateMinutes: m }));
              setEstimate(m ? formatDuration(m * 60) : "");
            }}
            placeholder="ex.: 2h30"
            className="mt-0.5 w-full bg-transparent font-display text-lg font-medium outline-none placeholder:text-sm placeholder:font-sans placeholder:text-ink-3"
          />
          {estimateSec > 0 && <Progress value={(total / estimateSec) * 100} className={cn("mt-1", total > estimateSec && "[&>div]:from-warning [&>div]:to-danger")} />}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {running ? (
          <Button variant="dark" className="flex-1" loading={pending} onClick={() => run(() => stopTimerAction(), { success: "Tempo registrado." })}>
            <Pause /> <span className="font-mono tabular">{formatDuration(elapsed)}</span> · Parar
          </Button>
        ) : (
          <Button variant="secondary" className="flex-1" loading={pending} disabled={!!task.archivedAt} onClick={() => run(() => startTimerAction(task.id))}>
            <Play className="!text-purple" /> Iniciar timer
          </Button>
        )}
        <Button variant="secondary" onClick={() => setManual((m) => !m)} aria-expanded={manual}>
          <Plus /> Manual
        </Button>
      </div>
      {activeTimer && !running && (
        <p className="mt-1.5 text-[11.5px] text-ink-3">Iniciar aqui encerra o timer de {taskCode(activeTimer.task.number)}.</p>
      )}
      {manual && (
        <form
          className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const m = parseDurationToMinutes(duration);
            if (!m) return;
            if (await run(() => addManualTimeAction(task.id, m, date), { success: "Tempo adicionado." })) {
              setDuration("");
              setManual(false);
            }
          }}
        >
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1h35" aria-label="Duração" autoFocus />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" />
          <Button type="submit">Salvar</Button>
        </form>
      )}
      {task.timeEntries.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-ink-2 hover:text-ink">Histórico ({task.timeEntries.length})</summary>
          <ul className="mt-2 space-y-1">
            {task.timeEntries.map((e) => (
              <li key={e.id} className="group/item flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-white/60">
                <Avatar user={e.user} size={20} />
                <span className="flex-1 truncate text-ink-2">
                  {e.endedAt ? formatDuration(e.durationSeconds ?? 0) : "em andamento"} · {formatDateTime(e.startedAt)}
                  {e.source === "MANUAL" && " · manual"}
                </span>
                {e.endedAt && (e.user.id === user.id || user.role === "ADMIN") && (
                  <button onClick={() => run(() => deleteTimeEntryAction(e.id))} className="text-ink-3 opacity-0 hover:text-danger group-hover/item:opacity-100 focus:opacity-100" aria-label="Excluir registro">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ────────────────────────────── Atividade ──────────────────────────────

const actionLabel = (a: PanelTask["activities"][number]): string => {
  const d = (a.data ?? {}) as Record<string, string>;
  switch (a.action) {
    case "created":
      return "criou a tarefa";
    case "status_changed":
      return `moveu de ${TASK_STATUS[d.from as keyof typeof TASK_STATUS]?.label ?? d.from} para ${TASK_STATUS[d.to as keyof typeof TASK_STATUS]?.label ?? d.to}`;
    case "priority_changed":
      return `mudou a prioridade para ${TASK_PRIORITY[d.to as keyof typeof TASK_PRIORITY]?.label ?? d.to}`;
    case "type_changed":
      return `mudou o tipo para ${TASK_TYPE[d.to as keyof typeof TASK_TYPE]?.label ?? d.to}`;
    case "title_changed":
      return "renomeou a tarefa";
    case "assignee_changed":
      return d.to ? "alterou o responsável" : "removeu o responsável";
    case "client_changed":
      return "alterou o cliente";
    case "due_changed":
      return d.to ? `definiu o prazo para ${formatDueLabel(`${d.to}T12:00:00Z`)}` : "removeu o prazo";
    case "subtask_added":
      return `adicionou a subtarefa “${d.title}”`;
    case "commented":
      return "comentou";
    case "file_added":
      return `anexou ${d.name}`;
    case "file_removed":
      return `removeu ${d.name}`;
    case "timer_started":
      return "iniciou o timer";
    case "time_logged":
      return `registrou ${formatDuration(Number(d.seconds ?? 0))}`;
    case "approval_status_changed":
      return `mudou a aprovação para ${APPROVAL_STATUS[d.to as keyof typeof APPROVAL_STATUS]?.label ?? d.to}`;
    case "approval_recorded":
      return `registrou ${d.decision === "APPROVED" ? "aprovação" : "pedido de ajustes"} ${d.kind === "CLIENT" ? "do cliente" : "interna"}`;
    case "publish_date_changed":
      return "alterou a data de publicação";
    case "published":
      return "marcou como publicado";
    case "unpublished":
      return "desfez a publicação";
    case "archived":
      return "arquivou a tarefa";
    case "unarchived":
      return "restaurou a tarefa";
    default:
      return a.action;
  }
};

export function ActivityList({ task }: { task: PanelTask }) {
  if (!task.activities.length) return <p className="py-6 text-center text-sm text-ink-3">Sem atividades ainda.</p>;
  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-hairline">
      {task.activities.map((a) => (
        <li key={a.id} className="relative text-[13px]">
          <span className="absolute -left-5 top-1.5 size-[9px] rounded-full bg-white ring-2 ring-purple/40" aria-hidden />
          <span className="font-semibold">{a.actor.name}</span> <span className="text-ink-2">{actionLabel(a)}</span>
          <span className="ml-1.5 text-xs text-ink-3" title={formatDateTime(a.createdAt)}>
            {formatRelative(a.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DueChip({ due, done }: { due: string | Date | null; done?: boolean }) {
  if (!due) return null;
  const overdue = !done && new Date(due).getTime() < new Date().setHours(0, 0, 0, 0);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-semibold", overdue ? "text-danger" : "text-ink-2")}>
      <CalendarClock className="size-3.5" />
      {formatDueLabel(due)}
    </span>
  );
}
