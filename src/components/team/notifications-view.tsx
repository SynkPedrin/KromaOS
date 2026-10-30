"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, isToday } from "date-fns";
import { motion } from "motion/react";
import { AlarmClock, AtSign, BadgeCheck, Bell, CalendarClock, CheckCheck, ClipboardList, MessageSquare, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { NotificationType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/display";
import { useApp } from "@/components/app/app-context";
import { NOTIFICATION_TYPE, taskCode } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/misc";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  taskId: string | null;
  event: { id: string; startsAt: string; allDay: boolean } | null;
  actor: { id: string; name: string; avatarColor: string } | null;
  task: { id: string; number: number; title: string; client: { name: string } | null } | null;
};

const ICON: Record<NotificationType, React.ElementType> = {
  TASK_ASSIGNED: ClipboardList,
  COMMENT: MessageSquare,
  MENTION: AtSign,
  DUE_SOON: AlarmClock,
  OVERDUE: AlarmClock,
  APPROVAL_REQUESTED: BadgeCheck,
  CHANGES_REQUESTED: RotateCcw,
  EVENT_INVITE: CalendarClock,
};

function Item({ n, index }: { n: NotificationRow; index: number }) {
  const { openTask } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  const Icon = ICON[n.type];
  const unread = !n.readAt;
  const urgent = n.type === "OVERDUE" || n.type === "CHANGES_REQUESTED";
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.025 }}>
      <button
        onClick={() =>
          start(async () => {
            if (unread) {
              const r = await markNotificationReadAction(n.id);
              if (!r.ok) toast.error(r.error);
            }
            if (n.taskId) openTask(n.taskId);
            // Evento: abre o calendário no dia (dia inteiro guarda a data às 12:00 UTC).
            else if (n.event) router.push(`/calendario?date=${n.event.allDay ? n.event.startsAt.slice(0, 10) : format(new Date(n.event.startsAt), "yyyy-MM-dd")}`);
          })
        }
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/70",
          unread && "bg-purple-50/50",
        )}
      >
        <span className="relative mt-0.5">
          {n.actor ? (
            <Avatar user={n.actor} size={34} />
          ) : (
            <span className={cn("flex size-[34px] items-center justify-center rounded-full", urgent ? "bg-danger/10 text-danger" : "bg-purple-50 text-purple")}>
              <Icon className="size-4" />
            </span>
          )}
          {n.actor && (
            <span className={cn("absolute -bottom-1 -right-1 flex size-[18px] items-center justify-center rounded-full ring-2 ring-white", urgent ? "bg-danger text-white" : "bg-purple text-white")}>
              <Icon className="size-2.5" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate text-[13.5px]", unread ? "font-bold" : "font-semibold text-ink-2")}>{n.title}</span>
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{n.body}</span>}
          <span className="mt-1 block text-[11.5px] text-ink-3" title={formatDateTime(n.createdAt)}>
            {NOTIFICATION_TYPE[n.type].label}
            {n.task && ` · ${taskCode(n.task.number)}${n.task.client ? ` · ${n.task.client.name}` : ""}`} · {formatRelative(n.createdAt)}
          </span>
        </span>
        {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-purple" aria-label="Não lida" />}
      </button>
    </motion.li>
  );
}

export function NotificationsView({ items }: { items: NotificationRow[] }) {
  const [pending, start] = useTransition();
  const unread = items.filter((n) => !n.readAt).length;
  const today = items.filter((n) => isToday(new Date(n.createdAt)));
  const older = items.filter((n) => !isToday(new Date(n.createdAt)));

  if (!items.length) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState icon={<Bell />} title="Tudo em dia" description="Você será avisado sobre atribuições, comentários, menções, prazos e aprovações." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{unread ? `${unread} não lida(s)` : "Nenhuma notificação não lida."}</p>
        <Button
          variant="secondary"
          disabled={!unread}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await markAllNotificationsReadAction();
              if (!r.ok) toast.error(r.error);
              else toast.success("Todas marcadas como lidas.");
            })
          }
        >
          <CheckCheck /> Marcar todas como lidas
        </Button>
      </div>
      {[
        ["Hoje", today],
        ["Anteriores", older],
      ].map(([label, list]) =>
        (list as NotificationRow[]).length ? (
          <section key={label as string}>
            <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">{label as string}</h2>
            <ul className="glass divide-y divide-hairline overflow-hidden rounded-3xl">
              {(list as NotificationRow[]).map((n, i) => (
                <Item key={n.id} n={n} index={i} />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
