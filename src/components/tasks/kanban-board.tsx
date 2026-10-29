"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { TaskStatus } from "@/generated/prisma/enums";
import { TASK_STATUS, TASK_STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app/app-context";
import { moveTaskAction } from "@/app/actions/tasks";
import { TaskCard, type BoardTask } from "./task-card";
import { StatusDot } from "./task-pickers";
import { InlineAddTask } from "./inline-add-task";

function SortableCard({ task }: { task: BoardTask }) {
  const { openTask } = useApp();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { status: task.status } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onOpen={() => openTask(task.id)} />
    </div>
  );
}

function Column({ status, tasks, index, defaults }: { status: TaskStatus; tasks: BoardTask[]; index: number; defaults?: Record<string, string> }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { status } });
  const { openQuickTask } = useApp();
  const s = TASK_STATUS[status];
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-[290px] shrink-0 flex-col"
      aria-label={`Coluna ${s.label}`}
    >
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <StatusDot status={status} />
        <h2 className="text-[13px] font-bold">{s.label}</h2>
        <span className="rounded-full bg-black/[0.05] px-2 text-[11px] font-bold leading-5 text-ink-2 tabular">{tasks.length}</span>
        <button
          onClick={() => openQuickTask({ status, ...defaults })}
          className="ml-auto rounded-lg p-1 text-ink-3 transition-colors hover:bg-white/70 hover:text-purple"
          aria-label={`Nova tarefa em ${s.label}`}
        >
          <Plus className="size-4" />
        </button>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[140px] flex-1 flex-col gap-2.5 rounded-3xl p-2 transition-colors",
          isOver ? "bg-purple-50/70 ring-2 ring-purple/20" : "bg-white/25 ring-1 ring-white/50",
        )}
        style={{ boxShadow: `inset 0 3px 0 -1px color-mix(in srgb, ${s.color} 35%, transparent)` }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="py-4 text-center text-xs text-ink-3">Arraste tarefas para cá</p>}
        <InlineAddTask status={status} defaults={defaults} variant="card" className="mt-auto" />
      </div>
    </motion.section>
  );
}

/**
 * Pipeline (quadro por status). A atualização é otimista: o card muda de coluna na hora e,
 * se o servidor recusar (ex.: legenda obrigatória), volta ao lugar original com aviso.
 */
export function KanbanBoard({ tasks: initial, defaults }: { tasks: BoardTask[]; defaults?: Record<string, string> }) {
  const [tasks, setTasks] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<BoardTask[] | null>(null);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setTasks(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const map = new Map<TaskStatus, BoardTask[]>(TASK_STATUS_ORDER.map((s) => [s, []]));
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) map.get(t.status)!.push(t);
    return map;
  }, [tasks]);

  const statusOf = (id: string): TaskStatus | null => {
    if (id.startsWith("col:")) return id.slice(4) as TaskStatus;
    return tasks.find((t) => t.id === id)?.status ?? null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOrigin(tasks);
  };

  // Ao cruzar colunas, move o card provisoriamente para a nova coluna.
  const onDragOver = (e: DragOverEvent) => {
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const to = statusOf(over);
    const id = String(e.active.id);
    setTasks((prev) => prev.map((t) => (t.id === id && to && t.status !== to ? { ...t, status: to } : t)));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    const before = origin;
    if (!overId || !before) return;
    const status = statusOf(overId) ?? statusOf(id)!;

    // Calcula a nova posição entre os vizinhos da coluna de destino.
    const col = tasks.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.position - b.position);
    let index = overId.startsWith("col:") ? col.length : col.findIndex((t) => t.id === overId);
    if (index < 0) index = col.length;
    const prev = col[index - 1]?.position;
    const next = col[index]?.position;
    const position = prev === undefined && next === undefined ? 1000 : prev === undefined ? next! - 1000 : next === undefined ? prev + 1000 : (prev + next) / 2;

    const original = before.find((t) => t.id === id)!;
    if (original.status === status && original.position === position) return;
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, status, position } : t)));
    const r = await moveTaskAction(id, status, position);
    if (!r.ok) {
      setTasks(before);
      toast.error(r.error);
    } else if (original.status !== status) {
      toast.success(`Movida para ${TASK_STATUS[status].label}.`);
    }
  };

  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      // id estável: evita divergência de hidratação nos ids de acessibilidade do dnd-kit.
      id="task-kanban"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (origin) setTasks(origin);
        setActiveId(null);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: "Pressione espaço para pegar a tarefa, use as setas para mover e espaço para soltar." },
      }}
    >
      <div className="scrollbar-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {TASK_STATUS_ORDER.map((s, i) => (
          <Column key={s} status={s} tasks={columns.get(s)!} index={i} defaults={defaults} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
        {active ? <TaskCard task={active} onOpen={() => {}} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
