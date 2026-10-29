import "server-only";
import { db } from "@/server/db";
import { assertFinance, type Actor } from "@/server/auth/permissions";

/** Clientes não arquivados com o contrato vigente (ativo mais recente ou, na falta, o mais recente). */
export async function listClientContracts(actor: Actor) {
  assertFinance(actor);
  const clients = await db.client.findMany({
    where: { archivedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      logoFileId: true,
      contracts: { orderBy: { createdAt: "desc" } },
    },
  });
  return clients.map(({ contracts, ...c }) => ({
    ...c,
    contract: contracts.find((k) => k.status === "ACTIVE") ?? contracts[0] ?? null,
    contractCount: contracts.length,
  }));
}
