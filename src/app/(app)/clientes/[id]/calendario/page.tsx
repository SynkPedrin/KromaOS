import type { Metadata } from "next";
import { loadClient } from "@/components/clients/load-client";
import { ClientAgenda } from "@/components/clients/client-agenda";
import { listCalendarEvents } from "@/server/services/calendar";
import { addDays, startOfDayInTz } from "@/lib/dates";

export const metadata: Metadata = { title: "Calendário do cliente" };

const DAYS = 60;

export default async function ClientCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, client } = await loadClient((await params).id);
  const from = startOfDayInTz();
  const events = await listCalendarEvents(user, from, addDays(from, DAYS), client.id);
  return <ClientAgenda clientId={client.id} days={DAYS} events={events} />;
}
