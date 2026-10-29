import { loadClient } from "@/components/clients/load-client";
import { ClientHeader } from "@/components/clients/client-header";
import type { ClientFormInitial } from "@/components/clients/client-form-dialog";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await loadClient(id);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  // O contrato só vem preenchido pelo serviço quando o usuário pode ver o financeiro.
  const form: ClientFormInitial = {
    id: client.id,
    name: client.name,
    contactName: client.contactName,
    email: client.email,
    whatsapp: client.whatsapp,
    segment: client.segment,
    status: client.status,
    startDate: iso(client.startDate),
    endDate: iso(client.endDate),
    notes: client.notes,
    services: client.services,
    memberIds: client.members.map((m) => m.id),
    contract: client.contract
      ? {
          id: client.contract.id,
          type: client.contract.type,
          status: client.contract.status,
          setupFeeCents: client.contract.setupFeeCents,
          monthlyFeeCents: client.contract.monthlyFeeCents,
          mediaBudgetCents: client.contract.mediaBudgetCents,
          billingDay: client.contract.billingDay,
        }
      : null,
  };

  return (
    <>
      <ClientHeader
        client={{
          id: client.id,
          name: client.name,
          status: client.status,
          segment: client.segment,
          logoFileId: client.logoFileId,
          archivedAt: iso(client.archivedAt),
        }}
        form={form}
        canFinance={client.canViewFinance}
      />
      {children}
    </>
  );
}
