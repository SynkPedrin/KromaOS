import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { parseAnchor, visibleDays, ymd, type CalendarView } from "@/components/calendar/calendar-utils";
import { requireUser } from "@/server/auth/session";
import { listCalendarEvents } from "@/server/services/calendar";
import type { SearchParams } from "@/lib/task-filters";

export const metadata: Metadata = { title: "Calendário" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const HOUR = 3_600_000;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: CalendarView = one(sp.view) === "week" ? "week" : "month";
  const anchor = parseAnchor(one(sp.date));
  const clientId = one(sp.client);
  const days = visibleDays(anchor, view);

  // Busca com folga de ±14h: o navegador distribui os eventos pelos dias no fuso local dele.
  const first = ymd(days[0]);
  const last = ymd(days[days.length - 1]);
  const from = new Date(new Date(`${first}T00:00:00.000Z`).getTime() - 14 * HOUR);
  const to = new Date(new Date(`${last}T00:00:00.000Z`).getTime() + 38 * HOUR);
  const events = await listCalendarEvents(user, from, to, clientId);

  return (
    <>
      <PageHeader title="Calendário" description="Prazos de entrega e datas de publicação. Arraste para reagendar." />
      <CalendarBoard events={events} view={view} anchor={ymd(anchor)} clientId={clientId ?? ""} />
    </>
  );
}
