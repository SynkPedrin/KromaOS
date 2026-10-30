import type { Metadata } from "next";
import { Lock } from "lucide-react";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/session";
import { canViewFinance, isAdmin } from "@/server/auth/permissions";
import { financeSummary, listInvoices, listMediaInvestments, revenueHistory } from "@/server/services/finance";
import { cashHistory, cashSummary, listCashEntries } from "@/server/services/cash";
import { listClientContracts } from "@/server/services/contracts";
import { db } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { FinanceTabs } from "@/components/finance/finance-ui";
import { FinanceOverview } from "@/components/finance/finance-overview";
import { InvoicesPanel, type InvoiceRow } from "@/components/finance/invoices-panel";
import { ContractsPanel, type ClientContractRow } from "@/components/finance/contracts-panel";
import { MediaPanel, type MediaRow } from "@/components/finance/media-panel";
import { CashPanel, type CashRow } from "@/components/finance/cash-panel";
import type { StatementFile } from "@/components/finance/statements-section";
import { listStatementFiles } from "@/server/services/files";
import { ymdInTz } from "@/lib/dates";
import { INVOICE_STATUS } from "@/lib/labels";

export const metadata: Metadata = { title: "Financeiro" };

const TABS = [
  { key: "geral", label: "Visão geral" },
  { key: "caixa", label: "Entradas e saídas" },
  { key: "recebimentos", label: "Recebimentos" },
  { key: "contratos", label: "Contratos" },
  { key: "midia", label: "Investimento em mídia" },
];

const json = <T,>(v: T) => JSON.parse(JSON.stringify(v));

type SP = { tab?: string; client?: string; status?: string; month?: string; type?: string; category?: string };

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();

  // Bloqueio no servidor: sem permissão, nenhum dado financeiro é consultado.
  if (!canViewFinance(user)) {
    return (
      <>
        <PageHeader title="Financeiro" />
        <div className="glass rounded-3xl">
          <EmptyState
            icon={<Lock />}
            title="Acesso restrito"
            description="Valores comerciais e financeiros são visíveis apenas para administradores e gestores autorizados. Peça acesso a um administrador."
          />
        </div>
      </>
    );
  }

  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "geral";
  // Todos os clientes não arquivados, inclusive prospects e pausados, podem ter cobranças.
  const clients = await db.client.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : ymdInTz(new Date()).slice(0, 7);

  let body: React.ReactNode;
  if (tab === "geral") {
    const [summary, history, cash] = await Promise.all([financeSummary(user), revenueHistory(user, 6), cashSummary(user)]);
    body = <FinanceOverview summary={summary} history={history} balanceCents={cash.balanceCents} />;
  } else if (tab === "caixa") {
    const type = sp.type === "INCOME" || sp.type === "EXPENSE" ? sp.type : undefined;
    const settled = sp.status === "realizado" ? true : sp.status === "previsto" ? false : undefined;
    const [entries, summary, history, statements] = await Promise.all([
      listCashEntries(user, { month, type, category: sp.category || undefined, settled }),
      cashSummary(user, month),
      cashHistory(user, 6, month),
      listStatementFiles(user, month),
    ]);
    body = (
      <CashPanel
        entries={json(entries) as CashRow[]}
        summary={summary}
        history={history}
        clients={clients}
        month={month}
        canEditOpening={isAdmin(user)}
        statements={json(statements) as StatementFile[]}
      />
    );
  } else if (tab === "recebimentos") {
    const status = sp.status && sp.status in INVOICE_STATUS ? (sp.status as InvoiceStatus) : undefined;
    const invoices = await listInvoices(user, { clientId: sp.client || undefined, status });
    body = <InvoicesPanel invoices={json(invoices) as InvoiceRow[]} clients={clients} />;
  } else if (tab === "contratos") {
    const rows = await listClientContracts(user);
    body = <ContractsPanel rows={json(rows) as ClientContractRow[]} />;
  } else {
    const rows = await listMediaInvestments(user, { month });
    body = <MediaPanel rows={json(rows) as MediaRow[]} clients={clients} month={month} />;
  }

  return (
    <>
      <PageHeader title="Financeiro" description="Saldo em conta, entradas e saídas, contratos, recebimentos e verba de mídia — simples, sem virar ERP." />
      <FinanceTabs tabs={TABS} active={tab} />
      {body}
    </>
  );
}
