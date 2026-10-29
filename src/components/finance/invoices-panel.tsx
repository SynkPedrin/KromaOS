"use client";

import { useState, useTransition } from "react";
import { Ban, CheckCircle2, MoreHorizontal, Pencil, Plus, Receipt, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/primitives";
import { INVOICE_STATUS } from "@/lib/labels";
import { centsToInput, formatDate, formatMoney, formatMonth, parseMoneyToCents, toDateInput } from "@/lib/format";
import { cancelInvoiceAction, createInvoiceAction, setInvoicePaidAction, updateInvoiceAction } from "@/app/actions/finance";
import { MoneyInput, PendingSpinner, useUrlParams } from "./finance-ui";

export type InvoiceRow = {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  competence: string;
  description: string;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  effectiveStatus: InvoiceStatus;
  paidAt: string | null;
};
type ClientOpt = { id: string; name: string };

const STATUS_FILTERS: { value: InvoiceStatus; label: string }[] = [
  { value: "PENDING", label: "A vencer" },
  { value: "OVERDUE", label: "Atrasadas" },
  { value: "PAID", label: "Pagas" },
  { value: "CANCELED", label: "Canceladas" },
];

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const thisMonth = () => new Date().toISOString().slice(0, 7);

function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  clients,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: InvoiceRow | null;
  clients: ClientOpt[];
  defaultClientId?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "PENDING");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={invoice ? "Editar cobrança" : "Nova cobrança"}
      description="Registre uma cobrança. O recebido só conta quando ela for marcada como paga — e aí entra automaticamente em Entradas e saídas."
    >
      <form
        key={invoice?.id ?? "new"}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const amountCents = parseMoneyToCents(String(fd.get("amount") ?? ""));
          if (!amountCents) return setError("Informe um valor válido.");
          const input = {
            clientId: String(fd.get("clientId") ?? ""),
            competence: String(fd.get("competence") ?? ""),
            description: String(fd.get("description") ?? ""),
            amountCents,
            dueDate: String(fd.get("dueDate") ?? ""),
            status,
            paidAt: status === "PAID" ? String(fd.get("paidAt") || "") || null : null,
          };
          start(async () => {
            const r = invoice ? await updateInvoiceAction(invoice.id, input) : await createInvoiceAction(input);
            if (!r.ok) return setError(r.error);
            toast.success(invoice ? "Cobrança atualizada." : "Cobrança registrada.");
            onOpenChange(false);
          });
        }}
      >
        <Field label="Cliente" htmlFor="inv-client">
          <Select id="inv-client" name="clientId" required defaultValue={invoice?.clientId ?? defaultClientId ?? ""}>
            <option value="" disabled>
              Selecione…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição" htmlFor="inv-desc">
          <Input id="inv-desc" name="description" required maxLength={200} defaultValue={invoice?.description ?? ""} placeholder="Ex.: Mensalidade de novembro" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Competência" htmlFor="inv-comp">
            <Input id="inv-comp" name="competence" type="month" required defaultValue={invoice ? invoice.competence.slice(0, 7) : thisMonth()} />
          </Field>
          <Field label="Valor" htmlFor="inv-amount">
            <MoneyInput id="inv-amount" name="amount" required defaultValue={invoice ? centsToInput(invoice.amountCents) : ""} />
          </Field>
          <Field label="Vencimento" htmlFor="inv-due">
            <Input id="inv-due" name="dueDate" type="date" required defaultValue={invoice ? toDateInput(invoice.dueDate) : ""} />
          </Field>
          <Field label="Status" htmlFor="inv-status">
            <Select id="inv-status" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
              <option value="PENDING">Pendente</option>
              <option value="PAID">Pago</option>
              <option value="OVERDUE">Atrasado</option>
              <option value="CANCELED">Cancelado</option>
            </Select>
          </Field>
          {status === "PAID" && (
            <Field label="Data de pagamento" htmlFor="inv-paid" hint="Em branco = hoje.">
              <Input id="inv-paid" name="paidAt" type="date" defaultValue={invoice?.paidAt ? toDateInput(invoice.paidAt) : ""} />
            </Field>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {invoice ? "Salvar" : "Registrar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RowActions({ inv, onEdit, onCancel }: { inv: InvoiceRow; onEdit: () => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const togglePaid = (paid: boolean) =>
    start(async () => {
      const r = await setInvoicePaidAction(inv.id, paid);
      if (!r.ok) toast.error(r.error);
      else toast.success(paid ? "Marcada como paga." : "Pagamento desfeito.");
    });
  const canceled = inv.status === "CANCELED";
  return (
    <div className="flex items-center justify-end gap-1">
      {!canceled &&
        (inv.status === "PAID" ? (
          <Button variant="ghost" size="sm" loading={pending} onClick={() => togglePaid(false)}>
            <Undo2 /> Desfazer
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={pending} onClick={() => togglePaid(true)}>
            <CheckCircle2 className="!text-success" /> Marcar como pago
          </Button>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Editar
          </DropdownMenuItem>
          {!canceled && (
            <DropdownMenuItem variant="danger" onSelect={onCancel}>
              <Ban /> Cancelar cobrança
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function InvoicesPanel({ invoices, clients }: { invoices: InvoiceRow[]; clients: ClientOpt[] }) {
  const { params, set, pending } = useUrlParams();
  const [editing, setEditing] = useState<InvoiceRow | null>(null);
  const [creating, setCreating] = useState(false);
  // Remonta o diálogo de criação a cada abertura (estado limpo).
  const [createKey, setCreateKey] = useState(0);
  const [toCancel, setToCancel] = useState<InvoiceRow | null>(null);
  const [canceling, startCancel] = useTransition();

  const openTotal = invoices.filter((i) => i.effectiveStatus === "PENDING" || i.effectiveStatus === "OVERDUE").reduce((s, i) => s + i.amountCents, 0);
  const paidTotal = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amountCents, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={params.get("client") ?? ""} onChange={(e) => set({ client: e.target.value || null })} aria-label="Cliente" className="w-[190px]">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value || null })} aria-label="Status" className="w-[160px]">
          <option value="">Todos os status</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <PendingSpinner show={pending} />
        <Button
          className="ml-auto"
          onClick={() => {
            setCreateKey((k) => k + 1);
            setCreating(true);
          }}
          disabled={!clients.length}
        >
          <Plus /> Nova cobrança
        </Button>
      </div>

      {invoices.length > 0 && (
        <p className="mb-3 px-1 text-xs text-ink-2">
          {invoices.length} cobrança(s) · em aberto <strong className="tabular">{formatMoney(openTotal)}</strong> · pagas{" "}
          <strong className="tabular">{formatMoney(paidTotal)}</strong>
        </p>
      )}

      {invoices.length === 0 ? (
        <div className="glass rounded-3xl">
          <EmptyState
            icon={<Receipt />}
            title={clients.length ? "Nenhuma cobrança encontrada" : "Cadastre um cliente primeiro"}
            description={clients.length ? "Registre mensalidades, implantações e outras cobranças." : "Cobranças são sempre vinculadas a um cliente."}
          />
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <table className="hidden w-full text-left text-[13.5px] md:table">
            <thead>
              <tr className="border-b border-hairline text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
                <th className="px-4 py-3">Cliente / descrição</th>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const st = INVOICE_STATUS[i.effectiveStatus];
                return (
                  <tr key={i.id} className="border-b border-hairline/70 last:border-0 hover:bg-white/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{i.client.name}</p>
                      <p className="text-xs text-ink-3">{i.description}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{capitalizeFirst(formatMonth(i.competence))}</td>
                    <td className="px-4 py-3 text-ink-2">{formatDate(i.dueDate)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular ${i.status === "CANCELED" ? "text-ink-3 line-through" : ""}`}>{formatMoney(i.amountCents)}</td>
                    <td className="px-4 py-3">
                      <Badge color={st.color}>{st.label}</Badge>
                      {i.paidAt && <p className="mt-0.5 text-[11px] text-ink-3">em {formatDate(i.paidAt)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions inv={i} onEdit={() => setEditing(i)} onCancel={() => setToCancel(i)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="divide-y divide-hairline md:hidden">
            {invoices.map((i) => {
              const st = INVOICE_STATUS[i.effectiveStatus];
              return (
                <li key={i.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{i.client.name}</p>
                      <p className="truncate text-xs text-ink-3">
                        {i.description} · vence {formatDate(i.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular">{formatMoney(i.amountCents)}</p>
                      <Badge color={st.color}>{st.label}</Badge>
                    </div>
                  </div>
                  <div className="mt-2">
                    <RowActions inv={i} onEdit={() => setEditing(i)} onCancel={() => setToCancel(i)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <InvoiceDialog key={`new-${createKey}`} open={creating} onOpenChange={setCreating} invoice={null} clients={clients} defaultClientId={params.get("client") ?? undefined} />
      <InvoiceDialog key={editing?.id} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} invoice={editing} clients={clients} />
      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title="Cancelar cobrança?"
        description={`“${toCancel?.description}” de ${toCancel?.client.name} será marcada como cancelada. Ela continua no histórico, mas deixa de contar como a receber.`}
        confirmLabel="Cancelar cobrança"
        danger
        loading={canceling}
        onConfirm={() =>
          startCancel(async () => {
            const r = await cancelInvoiceAction(toCancel!.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Cobrança cancelada.");
            setToCancel(null);
          })
        }
      />
    </div>
  );
}
