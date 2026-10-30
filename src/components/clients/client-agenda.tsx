"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CalendarDays, CalendarHeart, PackageCheck, Plus } from "lucide-react";
import type { CalendarEvent } from "@/server/services/calendar";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { EventDialog, type EventDialogState } from "@/components/calendar/event-dialog";
import { useApp } from "@/components/app/app-context";
import { APPROVAL_STATUS, TASK_STATUS, TASK_TYPE } from "@/lib/labels";
import type { ApprovalStatus, TaskStatus, TaskType } from "@/generated/prisma/enums";

const KIND = {
  event: { label: "Evento", icon: CalendarClock, color: "#1B1525" },
  due: { label: "Prazo de entrega", icon: PackageCheck, color: "#7625F5" },
  publish: { label: "Publicação", icon: CalendarHeart, color: "#D946A8" },
} as const;

function dayLabel(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
}

/** Agenda dos próximos dias: prazos de entrega e publicações aparecem como eventos distintos. */
export function ClientAgenda({ clientId, days, events }: { clientId: string; days: number; events: CalendarEvent[] }) {
  const { openTask } = useApp();
  const [dialog, setDialog] = useState<EventDialogState>(null);

  // Agrupa por dia no fuso do navegador.
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = format(new Date(e.date), "yyyy-MM-dd");
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <section className="glass rounded-[26px] p-5" aria-labelledby="agenda">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="agenda" className="text-[15px] font-bold">
            Próximos {days} dias
          </h2>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legenda">
            {Object.values(KIND).map((k) => (
              <li key={k.label} className="flex items-center gap-1.5">
                <k.icon className="size-3.5" style={{ color: k.color }} />
                {k.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/calendario?client=${clientId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline">
            <CalendarDays className="size-4" /> Abrir no calendário
          </Link>
          <Button size="sm" onClick={() => setDialog({ mode: "new", clientId })}>
            <Plus /> Novo evento
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Nada agendado" description="Eventos, prazos e datas de publicação deste cliente aparecem aqui." />
      ) : (
        <ol className="space-y-5">
          {[...groups.entries()].map(([day, list]) => (
            <li key={day}>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-3 first-letter:uppercase">{dayLabel(new Date(`${day}T12:00:00`))}</p>
              <ul className="space-y-1.5">
                {list.map((e) => {
                  const k = KIND[e.kind];
                  const icon = (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${k.color} 12%, white)`, color: k.color }}>
                      <k.icon className="size-4" />
                    </span>
                  );
                  if (e.kind === "event") {
                    const time = e.allDay ? "Dia todo" : `${format(new Date(e.date), "HH:mm")}${e.endsAt ? `–${format(new Date(e.endsAt), "HH:mm")}` : ""}`;
                    return (
                      <li key={e.key}>
                        <button
                          onClick={() => setDialog({ mode: "edit", event: e })}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 text-left ring-1 ring-hairline transition-colors hover:bg-white"
                        >
                          {icon}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold">{e.title}</span>
                            <span className="block truncate text-xs text-ink-3">{[k.label, time, e.location].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="flex -space-x-1.5">
                            {e.attendees.slice(0, 3).map((a) => (
                              <Avatar key={a.id} user={a} size={24} />
                            ))}
                          </span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={e.key}>
                      <button
                        onClick={() => openTask(e.taskId)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 text-left ring-1 ring-hairline transition-colors hover:bg-white"
                      >
                        {icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">{e.title}</span>
                          <span className="block truncate text-xs text-ink-3">
                            {k.label}
                            {e.kind === "publish" && ` · ${format(new Date(e.date), "HH:mm")}`} · {TASK_TYPE[e.type as TaskType].label}
                          </span>
                        </span>
                        {e.approvalStatus ? (
                          <Badge color={APPROVAL_STATUS[e.approvalStatus as ApprovalStatus].color} className="hidden sm:inline-flex">
                            {APPROVAL_STATUS[e.approvalStatus as ApprovalStatus].label}
                          </Badge>
                        ) : (
                          <Badge color={TASK_STATUS[e.status as TaskStatus].color} className="hidden sm:inline-flex">
                            {TASK_STATUS[e.status as TaskStatus].label}
                          </Badge>
                        )}
                        {e.assignee && <Avatar user={e.assignee} size={24} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <EventDialog state={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}
