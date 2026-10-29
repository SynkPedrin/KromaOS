import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ApprovalStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isManagerOrAdmin, type Actor } from "@/server/auth/permissions";
import { forbidden, invalid, notFound } from "@/server/errors";
import { approvalSchema, contentPatchSchema, type ContentPatch } from "@/lib/schemas";
import { APPROVAL_STATUS, taskCode } from "@/lib/labels";
import { notify } from "./notifications";
import { logActivity } from "./shared";
import { getVisibleTask } from "./tasks";

async function getContent(actor: Actor, taskId: string, tx: Prisma.TransactionClient | typeof db = db) {
  const task = await getVisibleTask(actor, taskId, tx);
  const content = await tx.contentMetadata.findUnique({ where: { taskId } });
  if (!content) throw notFound("Conteúdo");
  return { task, content };
}

const needsCaption = (c: { requiresCaption: boolean; caption: string | null }) => c.requiresCaption && !c.caption?.trim();

export async function updateContent(actor: Actor, taskId: string, patch: ContentPatch) {
  const data = contentPatchSchema.parse(patch);
  return db.$transaction(async (tx) => {
    const { task, content } = await getContent(actor, taskId, tx);
    const update: Prisma.ContentMetadataUpdateInput = {};
    if (data.objective !== undefined) update.objective = data.objective;
    if (data.platforms !== undefined) update.platforms = [...new Set(data.platforms)];
    if (data.caption !== undefined) update.caption = data.caption;
    if (data.hashtags !== undefined) update.hashtags = data.hashtags;
    if (data.cta !== undefined) update.cta = data.cta;
    if (data.requiresCaption !== undefined) update.requiresCaption = data.requiresCaption;
    if (data.publishAt !== undefined) {
      update.publishAt = data.publishAt ? new Date(data.publishAt) : null;
      await logActivity(tx, taskId, actor.id, "publish_date_changed", { to: data.publishAt });
    }

    if (data.approvalStatus !== undefined && data.approvalStatus !== content.approvalStatus) {
      if (data.approvalStatus === "PUBLISHED") throw invalid("Use “Marcar como publicado” para registrar a publicação.");
      update.approvalStatus = data.approvalStatus;
      if (content.approvalStatus === "PUBLISHED") {
        update.publishedAt = null;
        update.publishedBy = { disconnect: true };
      }
      await logActivity(tx, taskId, actor.id, "approval_status_changed", {
        from: content.approvalStatus,
        to: data.approvalStatus,
      });
      await notifyApprovalChange(tx, actor, task, data.approvalStatus);
    }

    const next = { ...content, ...data };
    if (content.approvalStatus === "PUBLISHED" && data.caption !== undefined && needsCaption(next as typeof content)) {
      throw invalid("Um conteúdo publicado precisa manter a legenda.");
    }
    return tx.contentMetadata.update({ where: { taskId }, data: update });
  });
}

async function notifyApprovalChange(
  tx: Prisma.TransactionClient,
  actor: Actor,
  task: { id: string; number: number; title: string; assigneeId: string | null; creatorId: string },
  status: ApprovalStatus,
) {
  if (status === "AWAITING_APPROVAL" || status === "INTERNAL_REVIEW") {
    const approvers = await tx.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true } });
    await notify(
      tx,
      approvers.map((a) => ({
        userId: a.id,
        actorId: actor.id,
        type: "APPROVAL_REQUESTED" as const,
        title: `${APPROVAL_STATUS[status].label}: ${task.title}`,
        body: `${taskCode(task.number)} precisa de aprovação.`,
        taskId: task.id,
      })),
    );
  }
  if (status === "CHANGES_REQUESTED") {
    const to = [task.assigneeId, task.creatorId].filter((x): x is string => !!x);
    await notify(
      tx,
      to.map((userId) => ({
        userId,
        actorId: actor.id,
        type: "CHANGES_REQUESTED" as const,
        title: `Ajustes solicitados: ${task.title}`,
        body: `${taskCode(task.number)} voltou para ajustes.`,
        taskId: task.id,
      })),
    );
  }
}

/**
 * Registra uma decisão de aprovação. Aprovação interna (equipe) e do cliente
 * ficam separadas no histórico; a do cliente é registrada manualmente pela equipe.
 */
export async function recordApproval(
  actor: Actor,
  taskId: string,
  input: { kind: "INTERNAL" | "CLIENT"; decision: "APPROVED" | "CHANGES_REQUESTED"; note?: string | null; clientContact?: string | null },
) {
  const data = approvalSchema.parse(input);
  if (data.kind === "INTERNAL" && !isManagerOrAdmin(actor)) {
    throw forbidden("Apenas gestores registram aprovação interna.");
  }
  return db.$transaction(async (tx) => {
    const { task, content } = await getContent(actor, taskId, tx);
    if (content.approvalStatus === "PUBLISHED") throw invalid("Este conteúdo já foi publicado.");
    const approval = await tx.contentApproval.create({
      data: {
        taskId,
        kind: data.kind,
        decision: data.decision,
        note: data.note,
        clientContact: data.kind === "CLIENT" ? data.clientContact : null,
        recordedById: actor.id,
      },
    });

    // Aprovação interna leva para "aguardando aprovação" do cliente; a do cliente aprova de vez.
    let next: ApprovalStatus;
    if (data.decision === "CHANGES_REQUESTED") next = "CHANGES_REQUESTED";
    else next = data.kind === "INTERNAL" ? "AWAITING_APPROVAL" : "APPROVED";

    if (next === "APPROVED" && needsCaption(content)) {
      throw invalid("Preencha a legenda antes de registrar a aprovação do cliente.");
    }
    await tx.contentMetadata.update({ where: { taskId }, data: { approvalStatus: next } });
    await logActivity(tx, taskId, actor.id, "approval_recorded", { kind: data.kind, decision: data.decision });
    if (next === "CHANGES_REQUESTED") await notifyApprovalChange(tx, actor, task, next);
    return approval;
  });
}

/** "Publicado?" — registra data real e responsável e conclui a tarefa. */
export async function setPublished(actor: Actor, taskId: string, published: boolean) {
  return db.$transaction(async (tx) => {
    const { content, task } = await getContent(actor, taskId, tx);
    if (published) {
      if (needsCaption(content)) throw invalid("Preencha a legenda antes de marcar como publicado.");
      await tx.contentMetadata.update({
        where: { taskId },
        data: { approvalStatus: "PUBLISHED", publishedAt: new Date(), publishedById: actor.id },
      });
      if (task.status !== "DONE") {
        await tx.task.update({ where: { id: taskId }, data: { status: "DONE", completedAt: new Date() } });
      }
      await logActivity(tx, taskId, actor.id, "published");
    } else {
      await tx.contentMetadata.update({
        where: { taskId },
        data: { approvalStatus: "APPROVED", publishedAt: null, publishedById: null },
      });
      await logActivity(tx, taskId, actor.id, "unpublished");
    }
  });
}
