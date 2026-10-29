import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

export type CalendarView = "month" | "week";

const WEEK = { weekStartsOn: 0 as const, locale: ptBR };

/** yyyy-MM-dd no fuso local do navegador/servidor. */
export const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Data-âncora interpretada como dia local (meio-dia evita bordas de horário de verão). */
export const parseAnchor = (s: string | undefined) => {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return parseISO(`${s}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return now;
};

/** Dias visíveis: semanas completas do mês, ou os 7 dias da semana. */
export function visibleDays(anchor: Date, view: CalendarView) {
  const start = view === "month" ? startOfWeek(startOfMonth(anchor), WEEK) : startOfWeek(anchor, WEEK);
  const end = view === "month" ? endOfWeek(endOfMonth(anchor), WEEK) : endOfWeek(anchor, WEEK);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export const shiftAnchor = (anchor: Date, view: CalendarView, dir: 1 | -1) => (view === "month" ? addMonths(anchor, dir) : addWeeks(anchor, dir));

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function rangeTitle(anchor: Date, view: CalendarView) {
  if (view === "month") return capitalize(format(anchor, "MMMM 'de' yyyy", { locale: ptBR }));
  const days = visibleDays(anchor, "week");
  const a = days[0];
  const b = days[6];
  return a.getMonth() === b.getMonth()
    ? `${format(a, "d")} – ${format(b, "d 'de' MMMM yyyy", { locale: ptBR })}`
    : `${format(a, "d MMM", { locale: ptBR })} – ${format(b, "d MMM yyyy", { locale: ptBR })}`;
}

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Novo instante de publicação no dia escolhido, preservando o horário local original. */
export function movePublishInstant(originalIso: string, targetYmd: string) {
  const o = new Date(originalIso);
  const [y, m, d] = targetYmd.split("-").map(Number);
  return new Date(y, m - 1, d, o.getHours(), o.getMinutes(), 0, 0).toISOString();
}
