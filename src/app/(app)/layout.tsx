import { Suspense } from "react";
import { AppBackground } from "@/components/brand/background";
import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/services/notifications";
import { getActiveTimer } from "@/server/services/time";
import { userOptions } from "@/server/services/team";
import { clientOptions } from "@/server/services/clients";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, timer, users, clients] = await Promise.all([
    unreadCount(user),
    getActiveTimer(user),
    userOptions(),
    clientOptions(user),
  ]);
  return (
    <>
      <AppBackground />
      <Suspense>
        <AppShell
          user={user}
          users={users}
          clients={clients}
          unread={unread}
          activeTimer={
            timer
              ? {
                  id: timer.id,
                  startedAt: timer.startedAt.toISOString(),
                  task: { id: timer.task.id, number: timer.task.number, title: timer.task.title, client: timer.task.client },
                }
              : null
          }
        >
          {children}
        </AppShell>
      </Suspense>
    </>
  );
}
