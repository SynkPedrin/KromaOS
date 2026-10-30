"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import * as tasks from "@/server/services/tasks";
import * as comments from "@/server/services/comments";
import * as time from "@/server/services/time";
import * as content from "@/server/services/content";
import * as calendar from "@/server/services/calendar";
import type { AgendaEventInput, ContentPatch, QuickTaskInput, TaskPatch } from "@/lib/schemas";
import type { TaskStatus } from "@/generated/prisma/enums";

// Listas renderizadas no servidor dependem destas tarefas; o layout cobre todas as rotas do app.
const refresh = () => revalidatePath("/", "layout");

export async function createTaskAction(input: QuickTaskInput) {
  return withUser(async (u) => {
    const t = await tasks.createTask(u, input);
    refresh();
    return { id: t.id, number: t.number };
  });
}

export async function updateTaskAction(taskId: string, patch: TaskPatch) {
  return withUser(async (u) => {
    await tasks.updateTask(u, taskId, patch);
    refresh();
  });
}

export async function moveTaskAction(taskId: string, status: TaskStatus, position: number) {
  return withUser(async (u) => {
    await tasks.moveTask(u, taskId, { status, position });
    refresh();
  });
}

export async function archiveTaskAction(taskId: string, archived: boolean) {
  return withUser(async (u) => {
    await tasks.setTaskArchived(u, taskId, archived);
    refresh();
  });
}

export async function addChecklistItemAction(taskId: string, text: string) {
  return withUser((u) => tasks.addChecklistItem(u, taskId, { text }));
}
export async function toggleChecklistItemAction(itemId: string, done: boolean) {
  return withUser(async (u) => {
    await tasks.toggleChecklistItem(u, itemId, done);
  });
}
export async function deleteChecklistItemAction(itemId: string) {
  return withUser((u) => tasks.deleteChecklistItem(u, itemId));
}

export async function addCommentAction(taskId: string, body: string, mentionIds: string[]) {
  return withUser(async (u) => {
    await comments.addComment(u, taskId, { body, mentionIds });
  });
}
export async function editCommentAction(commentId: string, body: string, mentionIds: string[]) {
  return withUser(async (u) => {
    await comments.editComment(u, commentId, { body, mentionIds });
  });
}
export async function deleteCommentAction(commentId: string) {
  return withUser((u) => comments.deleteComment(u, commentId));
}

export async function startTimerAction(taskId: string) {
  return withUser(async (u) => {
    const e = await time.startTimer(u, taskId);
    refresh();
    return { id: e.id, startedAt: e.startedAt };
  });
}
export async function stopTimerAction() {
  return withUser(async (u) => {
    await time.stopTimer(u);
    refresh();
  });
}
export async function addManualTimeAction(taskId: string, minutes: number, date: string, note?: string) {
  return withUser(async (u) => {
    await time.addManualTime(u, taskId, { minutes, date, note });
  });
}
export async function deleteTimeEntryAction(entryId: string) {
  return withUser((u) => time.deleteTimeEntry(u, entryId));
}

export async function updateContentAction(taskId: string, patch: ContentPatch) {
  return withUser(async (u) => {
    await content.updateContent(u, taskId, patch);
    refresh();
  });
}
export async function recordApprovalAction(
  taskId: string,
  input: { kind: "INTERNAL" | "CLIENT"; decision: "APPROVED" | "CHANGES_REQUESTED"; note?: string; clientContact?: string },
) {
  return withUser(async (u) => {
    await content.recordApproval(u, taskId, input);
    refresh();
  });
}
export async function setPublishedAction(taskId: string, published: boolean) {
  return withUser(async (u) => {
    await content.setPublished(u, taskId, published);
    refresh();
  });
}

export async function rescheduleAction(taskId: string, input: calendar.RescheduleInput) {
  return withUser(async (u) => {
    await calendar.rescheduleEvent(u, taskId, input);
    refresh();
  });
}

export async function createAgendaEventAction(input: AgendaEventInput) {
  return withUser(async (u) => {
    const e = await calendar.createAgendaEvent(u, input);
    refresh();
    return { id: e.id };
  });
}

export async function updateAgendaEventAction(eventId: string, input: AgendaEventInput) {
  return withUser(async (u) => {
    await calendar.updateAgendaEvent(u, eventId, input);
    refresh();
  });
}

export async function deleteAgendaEventAction(eventId: string) {
  return withUser(async (u) => {
    await calendar.deleteAgendaEvent(u, eventId);
    refresh();
  });
}

export async function moveAgendaEventAction(eventId: string, startsAt: string) {
  return withUser(async (u) => {
    await calendar.moveAgendaEvent(u, eventId, startsAt);
    refresh();
  });
}

