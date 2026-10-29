"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { ApprovalStatus } from "@/generated/prisma/enums";
import { APPROVAL_STATUS, APPROVAL_STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app/app-context";
import { setPublishedAction, updateContentAction } from "@/app/actions/tasks";
import { StudioBoardCard, type StudioCardItem } from "./studio-card";

function DraggableCard({ item }: { item: StudioCardItem }) {
  const { openTask } = useApp();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={cn("touch-manipulation", isDragging && "opacity-30")} {...attributes} {...listeners}>
      <StudioBoardCard item={item} onOpen={() => openTask(item.id)} />
    </div>
  );
}

function Column({ status, items, index }: { status: ApprovalStatus; items: StudioCardItem[]; index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const s = APPROVAL_STATUS[status];
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-[272px] shrink-0 flex-col"
      aria-label={`Coluna ${s.label}`}
    >
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
        <h2 className="text-[13px] font-bold">{s.label}</h2>
        <span className="rounded-full bg-black/[0.05] px-2 text-[11px] font-bold leading-5 text-ink-2 tabular">{items.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[160px] flex-1 flex-col gap-2.5 rounded-3xl p-2 transition-colors",
          isOver ? "bg-purple-50/70 ring-2 ring-purple/20" : "bg-white/25 ring-1 ring-white/50",
        )}
        style={{ boxShadow: `inset 0 3px 0 -1px color-mix(in srgb, ${s.color} 35%, transparent)` }}
      >
        {items.map((it) => (
          <DraggableCard key={it.id} item={it} />
        ))}
        {items.length === 0 && <p className="py-6 text-center text-xs text-ink-3">Arraste conteúdos para cá</p>}
      </div>
    </motion.section>
  );
}

/**
 * Quadro de aprovação do Studio. Mudar de coluna altera o status de aprovação;
 * soltar em "Publicado" registra a publicação (data real + responsável) e exige legenda.
 * Atualização otimista com rollback quando o servidor recusa.
 */
export function StudioBoard({ items: initial }: { items: StudioCardItem[] }) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Novos dados do servidor substituem o estado otimista local.
  if (source !== initial) {
    setSource(initial);
    setItems(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const map = new Map<ApprovalStatus, StudioCardItem[]>(APPROVAL_STATUS_ORDER.map((s) => [s, []]));
    for (const it of items) map.get(it.content.approvalStatus)!.push(it);
    return map;
  }, [items]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as ApprovalStatus | undefined;
    const item = items.find((i) => i.id === id);
    if (!to || !item || item.content.approvalStatus === to) return;
    const before = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, content: { ...i.content, approvalStatus: to } } : i)));
    const r = to === "PUBLISHED" ? await setPublishedAction(id, true) : await updateContentAction(id, { approvalStatus: to });
    if (!r.ok) {
      setItems(before);
      toast.error(r.error);
    } else {
      toast.success(to === "PUBLISHED" ? "Marcado como publicado." : `Movido para ${APPROVAL_STATUS[to].label}.`);
    }
  };

  const active = activeId ? items.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      id="studio-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para pegar o conteúdo, use as setas para mover e espaço para soltar." } }}
    >
      <div className="scrollbar-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {APPROVAL_STATUS_ORDER.map((s, i) => (
          <Column key={s} status={s} items={columns.get(s)!} index={i} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
        {active ? <StudioBoardCard item={active} onOpen={() => {}} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
