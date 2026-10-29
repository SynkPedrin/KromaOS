import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { forbidden } from "@/server/errors";

/** O mínimo necessário para decidir permissões (permite testar sem sessão HTTP). */
export type Actor = { id: string; role: Role; canViewFinance: boolean };

export const isAdmin = (a: Actor) => a.role === "ADMIN";
export const isManagerOrAdmin = (a: Actor) => a.role === "ADMIN" || a.role === "MANAGER";

/** Valores comerciais e financeiros: administradores ou gestores autorizados. */
export const canViewFinance = (a: Actor) => a.role === "ADMIN" || (a.role === "MANAGER" && a.canViewFinance);

export const canManageClients = isManagerOrAdmin;
export const canManageTeam = isManagerOrAdmin;

export function assertFinance(a: Actor) {
  if (!canViewFinance(a)) throw forbidden("Acesso restrito ao financeiro.");
}

export function assertManager(a: Actor) {
  if (!isManagerOrAdmin(a)) throw forbidden();
}

export function assertAdmin(a: Actor) {
  if (!isAdmin(a)) throw forbidden("Apenas administradores podem fazer isso.");
}

/**
 * Clientes visíveis: administradores e gestores veem todos;
 * membros veem apenas clientes aos quais foram vinculados.
 */
export function clientScope(a: Actor): Prisma.ClientWhereInput {
  if (isManagerOrAdmin(a)) return {};
  return { members: { some: { userId: a.id } } };
}

/**
 * Tarefas visíveis para membros: as atribuídas ou criadas por eles, as de clientes
 * vinculados e as tarefas internas (sem cliente). Subtarefas herdam a visibilidade
 * da tarefa principal.
 */
export function taskScope(a: Actor): Prisma.TaskWhereInput {
  if (isManagerOrAdmin(a)) return {};
  const own: Prisma.TaskWhereInput = {
    OR: [
      { assigneeId: a.id },
      { creatorId: a.id },
      { clientId: null },
      { client: { members: { some: { userId: a.id } } } },
    ],
  };
  return { OR: [own, { parent: own }] };
}
