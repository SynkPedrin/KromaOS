import "server-only";
import { db } from "@/server/db";
import { clientScope, taskScope, type Actor } from "@/server/auth/permissions";

/** Busca global (tarefas, clientes e conteúdos), sempre dentro do escopo do usuário. */
export async function globalSearch(actor: Actor, raw: string) {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return { tasks: [], clients: [], content: [] };
  const n = Number(q.replace(/^kr-?/i, ""));
  const byNumber = Number.isInteger(n) && n > 0 ? [{ number: n }] : [];

  const [tasks, clients, content] = await Promise.all([
    db.task.findMany({
      where: {
        AND: [
          taskScope(actor),
          { archivedAt: null, content: { is: null } },
          { OR: [{ title: { contains: q, mode: "insensitive" } }, ...byNumber] },
        ],
      },
      select: { id: true, number: true, title: true, status: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.client.findMany({
      where: { AND: [clientScope(actor), { archivedAt: null }, { name: { contains: q, mode: "insensitive" } }] },
      select: { id: true, name: true, status: true, segment: true },
      take: 5,
    }),
    db.task.findMany({
      where: {
        AND: [
          taskScope(actor),
          { archivedAt: null, content: { isNot: null } },
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { caption: { contains: q, mode: "insensitive" } } },
              ...byNumber,
            ],
          },
        ],
      },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        client: { select: { name: true } },
        content: { select: { approvalStatus: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);
  return { tasks, clients, content };
}
