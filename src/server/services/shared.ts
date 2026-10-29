import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "@/server/db";

export type DbLike = Db | Tx;

/** Campos públicos de usuário que podem ir para qualquer tela. */
export const userPublic = {
  id: true,
  name: true,
  avatarColor: true,
  jobTitle: true,
} satisfies Prisma.UserSelect;

export type UserPublic = { id: string; name: string; avatarColor: string; jobTitle: string | null };

export async function logActivity(
  tx: DbLike,
  taskId: string,
  actorId: string,
  action: string,
  data?: Prisma.InputJsonValue,
) {
  await tx.taskActivity.create({ data: { taskId, actorId, action, data } });
}

/** Converte BigInt (tamanho de arquivo) para número ao serializar para o cliente. */
export const toNumber = (v: bigint | number) => (typeof v === "bigint" ? Number(v) : v);
