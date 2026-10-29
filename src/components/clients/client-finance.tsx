"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileSignature, Megaphone, Pencil, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { AdPlatform, ContractStatus, ContractType, InvoiceStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { AD_PLATFORM, CONTRACT_STATUS, CONTRACT_TYPE, INVOICE_STATUS } from "@/lib/labels";
import { centsToInput, formatDate, formatMoney, formatMonth, parseMoneyToCents, toDateInput } from "@/lib/format";
import { saveContractAction } from "@/app/actions/clients";

type Contract = {
  id: string;
  type: ContractType;
  status: ContractStatus;
  setupFeeCents: number;
  monthlyFeeCents: number;
  mediaBudgetCents: number;
  billingDay: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
} | null;

type Invoice = {
  id: string;
  competence: string;
  description: string;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  effectiveStatus: InvoiceStatus;
};

type Media = { id: string; platform: AdPlatform; month: string; plannedCents: number; actualCents: number | null; notes: string | null };

function ContractDialog({ open, onOpenChange, clientId, contract }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: string; contract: Contract }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={contract ? "Editar contrato" : "Novo contrato"} description="Mensalidade, implantação e verba de mídia planejada.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const s = (k: string) => String(fd.get(k) ?? "").trim();
          const money = (k: string) => (s(k) ? parseMoneyToCents(s(k)) : 0);
          const setupFeeCents = money("setupFee");
          const monthlyFeeCents = money("monthlyFee");
          const mediaBudgetCents = money("mediaBudget");
          if (setupFeeCents === null || monthlyFeeCents === null || mediaBudgetCents === null) return setError("Valores inválidos. Use o formato 1.500,00.");
          start(async () => {
            const r = await saveContractAction(
              clientId,
              {
                type: s("type") as ContractType,
                status: s("status") as ContractStatus,
                setupFeeCents,
                monthlyFeeCents,
                mediaBudgetCents,
                billingDay: s("billingDay") ? Number(s("billingDay")) : null,
                startDate: s("startDate") || null,
                endDate: s("endDate") || null,
                notes: s("notes") || null,
              },
              contract?.id,
            );
            if (!r.ok) return setError(r.error);
            toast.success("Contrato salvo.");
            onOpenChange(false);
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Implantação (R$)" htmlFor="ct-setup">
            <Input id="ct-setup" name="setupFee" inputMode="decimal" defaultValue={centsToInput(contract?.setupFeeCents)} placeholder="0,00" />
          </Field>
          <Field label="Mensalidade (R$)" htmlFor="ct-fee">
            <Input id="ct-fee" name="monthlyFee" inputMode="decimal" defaultValue={centsToInput(contract?.monthlyFeeCents)} placeholder="0,00" />
          </Field>
          <Field label="Mídia mensal (R$)" htmlFor="ct-media">
            <Input id="ct-media" name="mediaBudget" inputMode="decimal" defaultValue={centsToInput(contract?.mediaBudgetCents)} placeholder="0,00" />
          </Field>
          <Field label="Tipo" htmlFor="ct-type">
            <Select id="ct-type" name="type" defaultValue={contract?.type ?? "MONTHLY"}>
              {(Object.keys(CONTRACT_TYPE) as ContractType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="ct-status">
            <Select id="ct-status" name="status" defaultValue={contract?.status ?? "ACTIVE"}>
              {(Object.keys(CONTRACT_STATUS) as ContractStatus[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_STATUS[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dia de vencimento" htmlFor="ct-day">
            <Input id="ct-day" name="billingDay" type="number" min={1} max={31} defaultValue={contract?.billingDay ?? ""} />
          </Field>
          <Field label="Início" htmlFor="ct-start">
            <Input id="ct-start" name="startDate" type="date" defaultValue={toDateInput(contract?.startDate)} />
          </Field>
          <Field label="Término" htmlFor="ct-end">
            <Input id="ct-end" name="endDate" type="date" defaultValue={toDateInput(contract?.endDate)} />
          </Field>
          <Field label="Observações" htmlFor="ct-notes">
            <Input id="ct-notes" name="notes" maxLength={2000} defaultValue={contract?.notes ?? ""} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar contrato
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ClientFinanceView({
  clientId,
  contract,
  invoices,
  media,
  totals,
}: {
  clientId: string;
  contract: Contract;
  invoices: Invoice[];
  media: Media[];
  totals: { paidCents: number; openCents: number };
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="glass rounded-[26px] p-5" aria-labelledby="contrato">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id="contrato" className="flex items-center gap-2 text-[15px] font-bold">
              <FileSignature className="size-4 text-purple" /> Contrato vigente
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil /> {contract ? "Editar" : "Criar contrato"}
            </Button>
          </div>
          {contract ? (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {[
                ["Mensalidade", formatMoney(contract.monthlyFeeCents)],
                ["Implantação", formatMoney(contract.setupFeeCents)],
                ["Mídia/mês", formatMoney(contract.mediaBudgetCents)],
                ["Tipo", CONTRACT_TYPE[contract.type].label],
                ["Vencimento", contract.billingDay ? `Dia ${contract.billingDay}` : "—"],
                ["Início", contract.startDate ? formatDate(contract.startDate) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/60 px-3 py-2 ring-1 ring-hairline">
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="truncate font-semibold tabular">{v}</dd>
                </div>
              ))}
              <div className="col-span-full flex items-center gap-2 pt-1 text-xs text-ink-3">
                Status: <Badge color={CONTRACT_STATUS[contract.status].color}>{CONTRACT_STATUS[contract.status].label}</Badge>
                {contract.notes && <span className="truncate">· {contract.notes}</span>}
              </div>
            </dl>
          ) : (
            <EmptyState icon={<FileSignature />} title="Sem contrato" description="Cadastre mensalidade e implantação para compor a receita." />
          )}
        </section>
        <section className="grid grid-cols-2 gap-3" aria-label="Totais">
          <div className="glass rounded-[22px] p-4">
            <Wallet className="size-5 text-success" />
            <p className="mt-3 text-[12.5px] font-semibold text-ink-2">Recebido (histórico)</p>
            <p className="font-display text-[22px] font-medium tabular">{formatMoney(totals.paidCents)}</p>
          </div>
          <div className="glass rounded-[22px] p-4">
            <Receipt className="size-5 text-warning" />
            <p className="mt-3 text-[12.5px] font-semibold text-ink-2">Em aberto</p>
            <p className="font-display text-[22px] font-medium tabular">{formatMoney(totals.openCents)}</p>
          </div>
          <p className="col-span-2 text-xs text-ink-3">
            Recebimentos e investimentos são lançados no{" "}
            <Link href="/financeiro" className="font-semibold text-purple hover:underline">
              módulo Financeiro
            </Link>
            .
          </p>
        </section>
      </div>

      <section className="glass overflow-hidden rounded-[26px]" aria-labelledby="cobrancas">
        <h2 id="cobrancas" className="flex items-center gap-2 px-5 pb-2 pt-5 text-[15px] font-bold">
          <Receipt className="size-4 text-purple" /> Cobranças
        </h2>
        {invoices.length ? (
          <ul className="divide-y divide-hairline">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.description}</span>
                  <span className="block text-xs text-ink-3 first-letter:uppercase">
                    {formatMonth(i.competence)} · vence {formatDate(i.dueDate)}
                    {i.paidAt && ` · pago em ${formatDate(i.paidAt)}`}
                  </span>
                </span>
                <span className="font-semibold tabular">{formatMoney(i.amountCents)}</span>
                <Badge color={INVOICE_STATUS[i.effectiveStatus].color}>{INVOICE_STATUS[i.effectiveStatus].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma cobrança registrada" />
        )}
      </section>

      <section className="glass overflow-hidden rounded-[26px]" aria-labelledby="midia">
        <h2 id="midia" className="flex items-center gap-2 px-5 pb-2 pt-5 text-[15px] font-bold">
          <Megaphone className="size-4 text-purple" /> Investimento em mídia
        </h2>
        {media.length ? (
          <ul className="divide-y divide-hairline">
            {media.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{AD_PLATFORM[m.platform].label}</span>
                  <span className="block text-xs text-ink-3 first-letter:uppercase">{formatMonth(m.month)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xs text-ink-3">Planejado</span>
                  <span className="font-semibold tabular">{formatMoney(m.plannedCents)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xs text-ink-3">Realizado</span>
                  <span className="font-semibold tabular">{m.actualCents != null ? formatMoney(m.actualCents) : "—"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhum investimento registrado" />
        )}
      </section>

      <ContractDialog open={editOpen} onOpenChange={setEditOpen} clientId={clientId} contract={contract} />
    </div>
  );
}
