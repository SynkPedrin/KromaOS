"use client";

import { MessageSquare, Paperclip, Sparkles } from "lucide-react";
import type { TaskListItem } from "@/server/services/tasks";
import type { Serialized } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui/display";
import { APPROVAL_STATUS, TASK_TYPE, taskCode } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PriorityFlag } from "./task-pickers";
import { DueChip } from "./task-sections";

export type BoardTask = Serialized<TaskListItem>;

export function TaskCard({ task, onOpen, dragging }: { task: BoardTask; onOpen: () => void; dragging?: boolean }) {
  const progress = task.subtaskTotal ? task.subtaskDone / task.subtaskTotal : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={cn(
        "glass glow-border card-hover group block w-full cursor-pointer rounded-2xl p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-purple/40",
        dragging && "rotate-[1.5deg] shadow-[var(--shadow-lift)] ring-2 ring-purple/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-ink-3">
        <span className="font-mono">{taskCode(task.number)}</span>
        {task.client && <span className="truncate">· {task.client.name}</span>}
        <PriorityFlag priority={task.priority} className="ml-auto shrink-0" />
      </div>
      {task.parent && <p className="mb-0.5 truncate text-[11px] text-ink-3">↳ {task.parent.title}</p>}
      <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge>{TASK_TYPE[task.type].label}</Badge>
        {task.content && (
          <Badge color={APPROVAL_STATUS[task.content.approvalStatus].color}>
            <Sparkles className="mr-0.5 inline size-3" />
            {APPROVAL_STATUS[task.content.approvalStatus].label}
          </Badge>
        )}
      </div>
      {task.subtaskTotal > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-purple to-lime" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-ink-3 tabular">
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <DueChip due={task.dueDate} done={task.status === "DONE"} />
        {task._count.comments > 0 && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
            <MessageSquare className="size-3.5" /> {task._count.comments}
          </span>
        )}
        {task._count.files > 0 && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
            <Paperclip className="size-3.5" /> {task._count.files}
          </span>
        )}
        <Avatar user={task.assignee} size={24} className="ml-auto" />
      </div>
    </div>
  );
}
