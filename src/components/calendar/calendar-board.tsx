"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEvent } from "@/server/services/calendar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Select } from "@/components/ui/form-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { APPROVAL_STATUS, TASK_STATUS, TASK_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { rescheduleAction } from "@/app/actions/tasks";
import type { ApprovalStatus, TaskStatus, TaskType } from "@/generated/prisma/enums";
import { WEEKDAYS, movePublishInstant, parseAnchor, rangeTitle, shiftAnchor, visibleDays, ymd, type CalendarView } from "./calendar-utils";

const MAX_IN_CELL = 3;
const noopSubscribe = () => () => {};

/** Status exibido: para publicações, o status de aprovação; para prazos, o da tarefa. */
function statusOf(e: CalendarEvent) {
  if (e.kind === "publish" && e.approvalStatus) return APPROVAL_STATUS[e.approvalStatus as ApprovalStatus];
  return TASK_STATUS[e.status as TaskStatus];
}

function EventChip({ event, compact, dragging }: { event: CalendarEvent; compact?: boolean; dragging?: boolean }) {
  const publish = event.kind === "publish";
  const published = publish && event.approvalStatus === "PUBLISHED";
  const done = !publish && event.status === "DONE";
  const status = statusOf(event);
  const time = publish ? format(new Date(event.date), "HH:mm") : null;
  const Icon = published ? CheckCircle2 : publish ? Send : Clock;
  const label = `${publish ? "Publicação" : "Prazo de entrega"}: ${event.title}${event.client ? ` — ${event.client.name}` : ""} — ${TASK_TYPE[event.type as TaskType]?.label ?? event.type} — ${status.label}`;
  return (
    <div
      className={cn(
        "w-full rounded-lg px-2 py-1 text-left text-[11.5px] leading-tight transition-shadow",
        publish
          ? published
            ? "bg-lime text-lime-ink shadow-[0_2px_8px_rgba(198,255,0,0.35)]"
            : "bg-gradient-to-br from-purple to-purple-light text-white shadow-[0_2px_10px_rgba(118,37,245,0.25)]"
          : "border border-dashed border-ink-3/50 bg-white/85 text-ink",
        done && "opacity-60",
        dragging && "rotate-[1.5deg] shadow-[var(--shadow-lift)]",
      )}
      title={label}
    >
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="size-3 shrink-0" aria-hidden />
        {time && <span className="shrink-0 tabular opacity-80">{time}</span>}
        <span className={cn("truncate", done && "line-through")}>{event.title}</span>
      </span>
      {!compact && (
        <span className={cn("mt-0.5 flex items-center gap-1 truncate text-[10.5px]", publish ? "opacity-85" : "text-ink-3")}>
          {!publish && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />}
          <span className="truncate">
            {event.client?.name ?? "Interno"} · {TASK_TYPE[event.type as TaskType]?.label ?? event.type} · {status.label}
          </span>
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function DraggableEvent({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const { openTask } = useApp();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: event.key, data: { event } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-manipulation cursor-pointer", isDragging && "opacity-30")}
      onClick={() => openTask(event.taskId)}
      onKeyDown={(e) => e.key === "Enter" && openTask(event.taskId)}
      {...attributes}
      {...listeners}
    >
      <EventChip event={event} compact={compact} />
    </div>
  );
}

function DayCell({ day, events, inMonth, today, view, index }: { day: Date; events: CalendarEvent[]; inMonth: boolean; today: string; view: CalendarView; index: number }) {
  const key = ymd(day);
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const { openTask } = useApp();
  const isToday = key === today;
  const shown = view === "month" ? events.slice(0, MAX_IN_CELL) : events;
  const extra = events.length - shown.length;
  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 34) * 0.008, duration: 0.3 }}
      className={cn(
        "flex min-w-0 flex-col gap-1 border-b border-r border-hairline p-1.5 transition-colors",
        view === "month" ? "min-h-[118px]" : "min-h-[420px]",
        !inMonth && "bg-black/[0.015]",
        isOver && "bg-purple-50/80 ring-2 ring-inset ring-purple/25",
      )}
      aria-label={format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
    >
      <div className="flex items-center justify-between px-0.5">
        {view === "week" && <span className="text-[11px] font-bold uppercase text-ink-3">{WEEKDAYS[day.getDay()]}</span>}
        <span
          className={cn(
            "ml-auto flex size-6 items-center justify-center rounded-full text-xs font-bold tabular",
            isToday ? "bg-purple text-white shadow-[0_2px_8px_rgba(118,37,245,0.35)]" : inMonth ? "text-ink-2" : "text-ink-3/60",
          )}
        >
          {day.getDate()}
        </span>
      </div>
      {shown.map((e) => (
        <DraggableEvent key={e.key} event={e} />
      ))}
      {extra > 0 && (
        <Popover>
          <PopoverTrigger className="rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-purple hover:bg-purple-50">+{extra} mais</PopoverTrigger>
          <PopoverContent className="w-64 space-y-1 p-2">
            <p className="px-1 pb-1 text-xs font-bold text-ink-2">{format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
            {events.map((e) => (
              <button key={e.key} onClick={() => openTask(e.taskId)} className="block w-full">
                <EventChip event={e} />
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </motion.div>
  );
}

/** Lista por dia — usada no celular (mês e semana) para evitar rolagem horizontal. */
function AgendaList({ days, byDay, today, view }: { days: Date[]; byDay: Map<string, CalendarEvent[]>; today: string; view: CalendarView }) {
  const visible = view === "week" ? days : days.filter((d) => (byDay.get(ymd(d))?.length ?? 0) > 0);
  if (!visible.length) return <EmptyState icon={<CalendarDays />} title="Nada agendado neste período" description="Prazos e publicações aparecem aqui." />;
  return (
    <ol className="divide-y divide-hairline">
      {visible.map((d) => (
        <AgendaDay key={ymd(d)} day={d} events={byDay.get(ymd(d)) ?? []} today={today} />
      ))}
    </ol>
  );
}

function AgendaDay({ day, events, today }: { day: Date; events: CalendarEvent[]; today: string }) {
  const key = ymd(day);
  const { setNodeRef, isOver } = useDroppable({ id: `agenda:${key}` });
  return (
    <li ref={setNodeRef} className={cn("flex gap-3 px-3 py-3", isOver && "bg-purple-50/70")}>
      <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-xl py-1", key === today ? "bg-purple text-white" : "bg-white/70 ring-1 ring-hairline")}>
        <span className="text-[10px] font-bold uppercase opacity-80">{WEEKDAYS[day.getDay()]}</span>
        <span className="text-base font-bold tabular">{day.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {events.length ? events.map((e) => <DraggableEvent key={e.key} event={e} />) : <p className="py-2 text-xs text-ink-3">Sem eventos</p>}
      </div>
    </li>
  );
}

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2" aria-label="Legenda">
      <li className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-3/50 bg-white px-1.5 py-0.5 font-semibold text-ink">
          <Clock className="size-3" /> Prazo
        </span>
        quando o trabalho precisa estar pronto
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-br from-purple to-purple-light px-1.5 py-0.5 font-semibold text-white">
          <Send className="size-3" /> Publicação
        </span>
        quando o conteúdo vai ao ar
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-lime px-1.5 py-0.5 font-semibold text-lime-ink">
          <CheckCircle2 className="size-3" /> Publicado
        </span>
      </li>
    </ul>
  );
}

export function CalendarBoard({ events: initial, view, anchor, clientId }: { events: CalendarEvent[]; view: CalendarView; anchor: string; clientId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { clients } = useApp();
  const [pending, start] = useTransition();
  const [events, setEvents] = useState(initial);
  const [source, setSource] = useState(initial);
  const [active, setActive] = useState<CalendarEvent | null>(null);
  // Novos dados do servidor substituem o estado otimista local.
  if (source !== initial) {
    setSource(initial);
    setEvents(initial);
  }
  // "Hoje" no fuso do navegador (o servidor pode estar em UTC); vazio durante o SSR.
  const today = useSyncExternalStore(noopSubscribe, () => ymd(new Date()), () => "");

  const anchorDate = parseAnchor(anchor);
  const days = useMemo(() => visibleDays(parseAnchor(anchor), view), [anchor, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = ymd(new Date(e.date));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    // Publicações por horário; prazos depois.
    for (const list of map.values()) list.sort((a, b) => (a.kind === b.kind ? a.date.localeCompare(b.date) : a.kind === "publish" ? -1 : 1));
    return map;
  }, [events]);

  const nav = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("task");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const ev = e.active.data.current?.event as CalendarEvent | undefined;
    const over = e.over?.id ? String(e.over.id).replace(/^agenda:/, "") : null;
    if (!ev || !over || ymd(new Date(ev.date)) === over) return;
    const before = events;
    const input = ev.kind === "due" ? ({ kind: "due", date: over } as const) : ({ kind: "publish", at: movePublishInstant(ev.date, over) } as const);
    const newDate = input.kind === "due" ? `${over}T12:00:00.000Z` : input.at;
    setEvents((prev) => prev.map((x) => (x.key === ev.key ? { ...x, date: newDate } : x)));
    const r = await rescheduleAction(ev.taskId, input);
    if (!r.ok) {
      setEvents(before);
      toast.error(r.error);
    } else {
      toast.success(`${ev.kind === "due" ? "Prazo movido" : "Publicação movida"} para ${format(parseAnchor(over), "d 'de' MMM", { locale: ptBR })}.`);
    }
  };

  const hasEvents = events.length > 0;

  return (
    <DndContext
      id="calendar-board"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActive((e.active.data.current?.event as CalendarEvent) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para pegar o evento, use as setas para mover e espaço para soltar em outro dia." } }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" onClick={() => nav({ date: ymd(shiftAnchor(anchorDate, view, -1)) })} aria-label="Período anterior">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => nav({ date: ymd(shiftAnchor(anchorDate, view, 1)) })} aria-label="Próximo período">
            <ChevronRight />
          </Button>
          <Button variant="secondary" onClick={() => nav({ date: null })}>
            Hoje
          </Button>
        </div>
        <h2 className="flex items-center gap-2 px-1 font-display text-lg font-medium tracking-tight">
          {rangeTitle(anchorDate, view)}
          {pending && <Loader2 className="size-4 animate-spin text-ink-3" />}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={clientId} onChange={(e) => nav({ client: e.target.value || null })} aria-label="Filtrar por cliente" className="w-[180px]">
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="flex rounded-xl bg-white/60 p-1 ring-1 ring-hairline" role="group" aria-label="Visualização">
            {(
              [
                ["month", "Mês"],
                ["week", "Semana"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => nav({ view: v === "month" ? null : v })}
                aria-pressed={view === v}
                className={cn("h-8 rounded-lg px-3 text-[13px] font-semibold transition-all", view === v ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-4">
        <CalendarLegend />
      </div>

      {/* Desktop/tablet: grade */}
      <div className="glass hidden overflow-hidden rounded-3xl md:block">
        <div className="grid grid-cols-7 border-b border-hairline bg-white/40">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-ink-3">
              {view === "week" ? "" : d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
          {days.map((d, i) => (
            <DayCell key={ymd(d)} day={d} events={byDay.get(ymd(d)) ?? []} inMonth={view === "week" || isSameMonth(d, anchorDate)} today={today} view={view} index={i} />
          ))}
        </div>
        {!hasEvents && <p className="border-t border-hairline px-4 py-3 text-center text-xs text-ink-3">Nenhum prazo ou publicação neste período.</p>}
      </div>

      {/* Celular: agenda */}
      <div className="glass overflow-hidden rounded-3xl md:hidden">
        <AgendaList days={days.filter((d) => view === "week" || isSameMonth(d, anchorDate))} byDay={byDay} today={today} view={view} />
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22,1,0.36,1)" }}>{active ? <div className="w-48"><EventChip event={active} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
