import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadClient } from "@/components/clients/load-client";
import { ClientFinanceView } from "@/components/clients/client-finance";
import { clientFinance } from "@/server/services/finance";

export const metadata: Metadata = { title: "Financeiro do cliente" };

export default async function ClientFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, client } = await loadClient((await params).id);
  // Sem permissão financeira a aba nem existe; o serviço também recusaria.
  if (!client.canViewFinance) notFound();
  const finance = await clientFinance(user, client.id);
  return (
    <ClientFinanceView
      clientId={client.id}
      contract={JSON.parse(JSON.stringify(client.contract))}
      invoices={JSON.parse(JSON.stringify(finance.invoices))}
      media={JSON.parse(JSON.stringify(finance.media))}
      totals={finance.totals}
    />
  );
}
