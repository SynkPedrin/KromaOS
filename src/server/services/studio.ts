import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ApprovalStatus, ContentPlatform, TaskType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { taskScope, type Actor } from "@/server/auth/permissions";
import { CONTENT_TYPES } from "@/lib/labels";
import { userPublic } from "./shared";

export type StudioFilters = {
  clientId?: string;
  type?: TaskType[];
  approval?: ApprovalStatus[];
  platform?: ContentPlatform[];
  q?: string;
};

/**
 * Conteúdos do Studio: tarefas principais com metadados de conteúdo, dentro do escopo
 * do usuário. Inclui a primeira mídia pronta (miniatura) e se a legenda já foi escrita.
 */
export async function listStudio(actor: Actor, f: StudioFilters = {}) {
  const and: Prisma.TaskWhereInput[] = [
    taskScope(actor),
    { archivedAt: null, parentId: null, content: { isNot: null } },
  ];
  if (f.clientId) and.push({ clientId: f.clientId });
  const types = f.type?.filter((t) => CONTENT_TYPES.includes(t));
  if (types?.length) and.push({ type: { in: types } });
  if (f.approval?.length) and.push({ content: { approvalStatus: { in: f.approval } } });
  if (f.platform?.length) and.push({ content: { platforms: { hasSome: f.platform } } });
  if (f.q) {
    const q = f.q.trim().slice(0, 100);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
        { content: { caption: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const tasks = await db.task.findMany({
    where: { AND: and },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: 400,
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      dueDate: true,
      client: { select: { id: true, name: true } },
      assignee: { select: userPublic },
      content: {
        select: {
          approvalStatus: true,
          platforms: true,
          publishAt: true,
          publishedAt: true,
          caption: true,
          requiresCaption: true,
        },
      },
      files: {
        where: { status: "READY", kind: { in: ["IMAGE", "VIDEO"] } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, kind: true },
      },
      _count: { select: { comments: true, files: true } },
    },
  });

  return tasks.map(({ content, files, ...t }) => ({
    ...t,
    content: {
      approvalStatus: content!.approvalStatus,
      platforms: content!.platforms,
      publishAt: content!.publishAt,
      publishedAt: content!.publishedAt,
      requiresCaption: content!.requiresCaption,
      // A legenda completa não é necessária na listagem; só o estado.
      hasCaption: !!content!.caption?.trim(),
    },
    thumbnail: files[0] ?? null,
  }));
}
export type StudioItem = Awaited<ReturnType<typeof listStudio>>[number];
