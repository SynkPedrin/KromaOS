import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/display";
import { NotificationsView, type NotificationRow } from "@/components/team/notifications-view";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user, { take: 100 });
  return (
    <>
      <PageHeader title="Notificações" description="Atribuições, comentários, menções, prazos e aprovações." />
      <NotificationsView items={JSON.parse(JSON.stringify(items)) as NotificationRow[]} />
    </>
  );
}
