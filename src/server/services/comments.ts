import "server-only";
import { db } from "@/server/db";
import type { Actor } from "@/server/auth/permissions";
import { forbidden, notFound } from "@/server/errors";
import { commentSchema } from "@/lib/schemas";
import { taskCode } from "@/lib/labels";
import { notify, usersWhoCanSeeTask } from "./notifications";
import { logActivity } from "./shared";
import { getVisibleTask } from "./tasks";

export async function addComment(actor: Actor, taskId: string, input: { body: string; mentionIds?: string[] }) {
  const data = commentSchema.parse(input);
  return db.$transaction(async (tx) => {
    const task = await getVisibleTask(actor, taskId, tx);
    // Só mantém menções a usuários que realmente conseguem abrir a tarefa.
    const mentionIds = await usersWhoCanSeeTask(tx, taskId, [...new Set(data.mentionIds)]);
    const comment = await tx.taskComment.create({
      data: { taskId, authorId: actor.id, body: data.body, mentionIds },
    });
    await logActivity(tx, taskId, actor.id, "commented");

    const preview = data.body.length > 140 ? `${data.body.slice(0, 137)}…` : data.body;
    const watchers = [task.assigneeId, task.creatorId].filter(
      (id): id is string => !!id && !mentionIds.includes(id),
    );
    await notify(tx, [
      ...mentionIds.map((userId) => ({
        userId,
        actorId: actor.id,
        type: "MENTION" as const,
        title: `Você foi mencionado em ${task.title}`,
        body: preview,
        taskId,
      })),
      ...watchers.map((userId) => ({
        userId,
        actorId: actor.id,
        type: "COMMENT" as const,
        title: `Novo comentário em ${taskCode(task.number)}`,
        body: preview,
        taskId,
      })),
    ]);
    return comment;
  });
}

async function ownComment(actor: Actor, commentId: string) {
  const comment = await db.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) throw notFound("Comentário");
  await getVisibleTask(actor, comment.taskId);
  if (comment.authorId !== actor.id) throw forbidden("Você só pode alterar seus próprios comentários.");
  return comment;
}

export async function editComment(actor: Actor, commentId: string, input: { body: string; mentionIds?: string[] }) {
  const data = commentSchema.parse(input);
  const c = await ownComment(actor, commentId);
  const mentionIds = await usersWhoCanSeeTask(db, c.taskId, [...new Set(data.mentionIds)]);
  return db.taskComment.update({
    where: { id: commentId },
    data: { body: data.body, mentionIds, editedAt: new Date() },
  });
}

export async function deleteComment(actor: Actor, commentId: string) {
  await ownComment(actor, commentId);
  await db.taskComment.delete({ where: { id: commentId } });
}
