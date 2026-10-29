import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { listClients } from "@/server/services/clients";
import { CLIENT_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/display";
import { ClientFilters, ClientGrid, NewClientButton, type ClientCardData } from "@/components/clients/client-list";

export const metadata: Metadata = { title: "Clientes" };

type SP = { status?: string; q?: string; archived?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const status = sp.status && sp.status in CLIENT_STATUS ? sp.status : undefined;
  const clients = await listClients(user, { status, q: sp.q?.slice(0, 100), archived });
  // Datas serializadas; dados financeiros só existem aqui se o serviço os retornou.
  const data = JSON.parse(JSON.stringify(clients)) as ClientCardData[];

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${data.length} ${data.length === 1 ? "cliente" : "clientes"}${archived ? " arquivados" : ""}. Clique para ver tarefas, conteúdos e arquivos.`}
        actions={<NewClientButton />}
      />
      <ClientFilters />
      <ClientGrid clients={data} archived={archived} />
    </>
  );
}
