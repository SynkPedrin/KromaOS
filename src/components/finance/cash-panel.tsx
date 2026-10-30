"use client";

import { useState, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Landmark, MoreHorizontal, Pencil, Receipt, Trash2, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { CashEntryType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch } from "@/components/ui/primitives";
import { CASH_CATEGORIES, CASH_ENTRY_TYPE } from "@/lib/labels";
import { centsToInput, formatDate, formatMoney, formatMoneyCompact, formatMonth, parseMoneyToCents, toDateInput } from "@/lib/format";
import { ymdInTz } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  createCashEntryAction,
  deleteCashEntryAction,
  setCashEntrySettledAction,
  setOpeningBalanceAction,
  updateCashEntryAction,
} from "@/app/actions/finance";
import { MoneyInput, PendingSpinner, Stat, useUrlParams } from "./finance-ui";
import { StatementsSection, type StatementFile } from "./statements-section";

export type CashRow = {
  id: string;
  type: CashEntryType;
  description: string;
  amountCents: number;
  date: string;
  category: string;
  settled: boolean;
  clientId: string | null;
  client: { id: string; name: string } | null;
  invoiceId: string | null;
  notes: string | null;
};
export type CashSummary = {
  openingBalanceCents: number;
  balanceCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  monthResultCents: number;
  receivableCents: number;
  receivableCount: number;
  payableCents: number;
  payableCount: number;
  projectedBalanceCents: number;
};
type HistoryPoint = { month: string; income: number; expense: number };
type ClientOpt = { id: string; name: string };

// Paleta validada (CVD/contraste) com o script do skill de dataviz — a mesma do dashboard.
const SERIES = [
  { key: "income", label: "Entradas", color: "#6E9400" },
  { key: "expense", label: "Saídas", color: "#C2185B" },
] as const;

const SETTLED_TONE = { true: { label: "Realizado", color: "#3E9B12" }, false: { label: "Previsto", color: "#E08A00" } };

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = (m: string) => format(new Date(`${m}-15T12:00:00`), "MMM/yy", { locale: ptBR });
const monthTitle = (m: string) => capitalizeFirst(formatMonth(`${m}-15T12:00:00Z`));

function shiftMonth(month: string, delta: number) {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** Valor com sinal: "+ R$ 10,00" para entradas e "− R$ 10,00" para saídas. */
const signed = (type: CashEntryType, cents: number) => `${type === "INCOME" ? "+" : "−"} ${formatMoney(cents)}`;

/** Aceita "-1.500,00" para saldo inicial negativo. */
function parseSignedMoney(raw: string) {
  const negative = raw.trim().startsWith("-");
  const cents = parseMoneyToCents(raw.replace("-", ""));
  return cents === null ? null : negative ? -cents : cents;
}

// ─────────────────────────────── Diálogos ───────────────────────────────

function EntryDialog({
  open,
  onOpenChange,
  entry,
  initialType,
  clients,
  month,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry: CashRow | null;
  initialType: CashEntryType;
  clients: ClientOpt[];
  month: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<CashEntryType>(entry?.type ?? initialType);
  const [settled, setSettled] = useState(entry?.settled ?? true);
  const categories = CASH_CATEGORIES[type];
  // Categoria fora das sugestões (texto livre antigo) continua selecionável na edição.
  const options = entry && entry.type === type && !categories.includes(entry.category) ? [entry.category, ...categories] : categories;
  const today = ymdInTz(new Date());
  // Lançando em outro mês, sugere o primeiro dia dele em vez de hoje.
  const defaultDate = entry ? toDateInput(entry.date) : today.startsWith(month) ? today : `${month}-01`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? "Editar lançamento" : type === "INCOME" ? "Nova entrada" : "Nova saída"}
      description="Só lançamentos realizados alteram o saldo em conta. Os previstos aparecem como contas a receber ou a pagar."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const amountCents = parseMoneyToCents(String(fd.get("amount") ?? ""));
          if (!amountCents) return setError("Informe um valor válido.");
          const input = {
            type,
            description: String(fd.get("description") ?? ""),
            amountCents,
            date: String(fd.get("date") ?? ""),
            category: String(fd.get("category") ?? ""),
            settled,
            clientId: String(fd.get("clientId") || "") || null,
            notes: String(fd.get("notes") || "") || null,
          };
          start(async () => {
            const r = entry ? await updateCashEntryAction(entry.id, input) : await createCashEntryAction(input);
            if (!r.ok) return setError(r.error);
            toast.success(entry ? "Lançamento atualizado." : type === "INCOME" ? "Entrada registrada." : "Saída registrada.");
            onOpenChange(false);
          });
        }}
      >
        <div className="inline-flex rounded-xl bg-white/55 p-1 ring-1 ring-hairline" role="radiogroup" aria-label="Tipo de lançamento">
          {(["INCOME", "EXPENSE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink-2 transition-all",
                type === t && "bg-white text-ink shadow-[0_2px_10px_rgba(30,20,50,0.08)]",
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: CASH_ENTRY_TYPE[t].color }} aria-hidden />
              {CASH_ENTRY_TYPE[t].label}
            </button>
          ))}
        </div>
        <Field label="Descrição" htmlFor="cash-desc">
          <Input
            id="cash-desc"
            name="description"
            required
            maxLength={200}
            defaultValue={entry?.description ?? ""}
            placeholder={type === "INCOME" ? "Ex.: Projeto de landing page" : "Ex.: Assinatura do Adobe"}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" htmlFor="cash-amount">
            <MoneyInput id="cash-amount" name="amount" required defaultValue={entry ? centsToInput(entry.amountCents) : ""} />
          </Field>
          <Field label="Data" htmlFor="cash-date">
            <Input id="cash-date" name="date" type="date" required defaultValue={defaultDate} />
          </Field>
          <Field label="Categoria" htmlFor="cash-category">
            {/* key: ao trocar o tipo, volta para a primeira categoria do novo tipo. */}
            <Select key={type} id="cash-category" name="category" defaultValue={entry?.type === type ? entry.category : options[0]}>
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente (opcional)" htmlFor="cash-client">
            <Select id="cash-client" name="clientId" defaultValue={entry?.clientId ?? ""}>
              <option value="">Sem cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3.5 py-3 ring-1 ring-hairline">
          <span>
            <span className="block text-[13px] font-semibold">{type === "INCOME" ? "Já foi recebido?" : "Já foi pago?"}</span>
            <span className="block text-xs text-ink-3">Desligado, fica como previsto e não altera o saldo.</span>
          </span>
          <Switch checked={settled} onCheckedChange={setSettled} aria-label={type === "INCOME" ? "Já foi recebido" : "Já foi pago"} />
        </label>
        <Field label="Observações" htmlFor="cash-notes">
          <Textarea id="cash-notes" name="notes" maxLength={1000} defaultValue={entry?.notes ?? ""} />
        </Field>
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
            {entry ? "Salvar" : "Registrar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OpeningBalanceDialog({ open, onOpenChange, cents }: { open: boolean; onOpenChange: (o: boolean) => void; cents: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Saldo inicial da conta"
      description="Quanto havia na conta antes do primeiro lançamento registrado aqui. Use um valor negativo se a conta estava no vermelho."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = String(new FormData(e.currentTarget).get("opening") ?? "");
          const value = raw.trim() ? parseSignedMoney(raw) : 0;
          if (value === null) return setError("Valor inválido. Use o formato 1.500,00.");
          start(async () => {
            const r = await setOpeningBalanceAction(value);
            if (!r.ok) return setError(r.error);
            toast.success("Saldo inicial atualizado.");
            onOpenChange(false);
          });
        }}
      >
        <Field label="Saldo inicial" htmlFor="cash-opening">
          <MoneyInput id="cash-opening" name="opening" defaultValue={cents ? `${cents < 0 ? "-" : ""}${centsToInput(Math.abs(cents))}` : ""} autoFocus />
        </Field>
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
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─────────────────────────────── Gráfico ───────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const value = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const result = value("income") - value("expense");
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="mb-1 font-bold">{monthTitle(label)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="flex-1">{s.label}</span>
          <span className="font-bold text-ink tabular">{formatMoney(value(s.key))}</span>
        </p>
      ))}
      <p className="mt-1 flex gap-2 border-t border-hairline pt-1 text-ink-2">
        <span className="flex-1">Resultado</span>
        <span className={cn("font-bold tabular", result < 0 ? "text-danger" : "text-ink")}>{formatMoney(result)}</span>
      </p>
    </div>
  );
}

function CashChart({ history }: { history: HistoryPoint[] }) {
  const empty = history.every((h) => !h.income && !h.expense);
  return (
    <section className="glass rounded-[26px] p-5" aria-labelledby="cash-chart-title">
      <div className="mb-3">
        <h2 id="cash-chart-title" className="text-[15px] font-bold">
          Entradas x saídas
        </h2>
        <p className="text-xs text-ink-3">Lançamentos realizados nos últimos 6 meses.</p>
      </div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Legenda">
        {SERIES.map((x) => (
          <li key={x.key} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: x.color }} aria-hidden />
            {x.label}
          </li>
        ))}
      </ul>
      {empty ? (
        <EmptyState className="h-[220px]" title="Sem movimentação no período" description="Registre entradas e saídas para acompanhar o caixa aqui." />
      ) : (
        <div className="h-[240px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 6, right: 6, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="rgba(23,20,29,0.06)" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} tickFormatter={monthLabel} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9A94A3" }} width={64} tickFormatter={(v: number) => formatMoneyCompact(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(118,37,245,0.05)" }} />
              {SERIES.map((x) => (
                <Bar key={x.key} dataKey={x.key} fill={x.color} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="sr-only">
        <caption>Entradas e saídas realizadas por mês</caption>
        <thead>
          <tr>
            <th>Mês</th>
            <th>Entradas</th>
            <th>Saídas</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.month}>
              <td>{h.month}</td>
              <td>{formatMoney(h.income)}</td>
              <td>{formatMoney(h.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─────────────────────────────── Lista ───────────────────────────────

function RowActions({ entry, onEdit, onDelete }: { entry: CashRow; onEdit: () => void; onDelete: () => void }) {
  const [pending, start] = useTransition();
  if (entry.invoiceId) {
    return (
      <div className="flex justify-end">
        <Badge color="#7625F5" dot={false}>
          <Receipt className="mr-1 inline size-3" aria-hidden />
          Cobrança
        </Badge>
      </div>
    );
  }
  const setSettled = (settled: boolean) =>
    start(async () => {
      const r = await setCashEntrySettledAction(entry.id, settled);
      if (!r.ok) toast.error(r.error);
      else toast.success(settled ? "Marcado como realizado." : "Voltou para previsto.");
    });
  return (
    <div className="flex items-center justify-end gap-1">
      {!entry.settled && (
        <Button variant="secondary" size="sm" loading={pending} onClick={() => setSettled(true)}>
          <CheckCircle2 className="!text-success" /> {entry.type === "INCOME" ? "Recebido" : "Pago"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${entry.description}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Editar
          </DropdownMenuItem>
          {entry.settled && (
            <DropdownMenuItem onSelect={() => setSettled(false)}>
              <Undo2 /> Voltar para previsto
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="danger" onSelect={onDelete}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TypeMark({ type }: { type: CashEntryType }) {
  const Icon = type === "INCOME" ? ArrowDownLeft : ArrowUpRight;
  const color = CASH_ENTRY_TYPE[type].color;
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-xl"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, white)`, color }}
      title={CASH_ENTRY_TYPE[type].label}
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{CASH_ENTRY_TYPE[type].label}</span>
    </span>
  );
}

// ─────────────────────────────── Painel ───────────────────────────────

export function CashPanel({
  entries,
  summary: s,
  history,
  clients,
  month,
  canEditOpening,
  statements,
}: {
  entries: CashRow[];
  summary: CashSummary;
  history: HistoryPoint[];
  clients: ClientOpt[];
  month: string;
  canEditOpening: boolean;
  statements: StatementFile[];
}) {
  const { params, set, pending } = useUrlParams();
  const [creating, setCreating] = useState<{ type: CashEntryType; key: number } | null>(null);
  const [editing, setEditing] = useState<CashRow | null>(null);
  const [toDelete, setToDelete] = useState<CashRow | null>(null);
  const [deleting, startDelete] = useTransition();
  const [openingOpen, setOpeningOpen] = useState(false);

  const type = params.get("type") ?? "";
  const categories = type === "INCOME" || type === "EXPENSE" ? CASH_CATEGORIES[type] : [...CASH_CATEGORIES.INCOME, ...CASH_CATEGORIES.EXPENSE];
  const listedIn = entries.filter((e) => e.type === "INCOME").reduce((t, e) => t + e.amountCents, 0);
  const listedOut = entries.filter((e) => e.type === "EXPENSE").reduce((t, e) => t + e.amountCents, 0);
  const filtered = !!(params.get("type") || params.get("category") || params.get("status"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-white/55 p-1 ring-1 ring-hairline">
          <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => set({ month: shiftMonth(month, -1) })}>
            <ChevronLeft />
          </Button>
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && set({ month: e.target.value })}
            aria-label="Mês"
            className="h-8 w-[150px] border-0 bg-transparent text-center shadow-none"
          />
          <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => set({ month: shiftMonth(month, 1) })}>
            <ChevronRight />
          </Button>
        </div>
        <PendingSpinner show={pending} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setCreating({ type: "INCOME", key: Date.now() })}>
            <ArrowDownLeft className="!text-[#6E9400]" /> Entrada
          </Button>
          <Button onClick={() => setCreating({ type: "EXPENSE", key: Date.now() })}>
            <ArrowUpRight /> Saída
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <section
          className="glass relative col-span-full flex flex-col justify-between overflow-hidden rounded-[26px] p-5 lg:col-span-2 lg:row-span-2"
          aria-labelledby="cash-balance"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-50/80 via-transparent to-lime-soft/40" aria-hidden />
          <div className="relative">
            <p id="cash-balance" className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
              <Wallet className="size-4 text-purple" /> Saldo em conta
            </p>
            <p className={cn("mt-2 font-display text-[40px] font-medium leading-none tracking-tight tabular", s.balanceCents < 0 && "text-danger")}>
              {formatMoney(s.balanceCents)}
            </p>
            <p className="mt-2 text-xs text-ink-3">Saldo inicial + entradas realizadas − saídas realizadas, de todo o período.</p>
          </div>
          <div className="relative mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-4">
            <div>
              <p className="text-xs font-semibold text-ink-2">Saldo projetado</p>
              <p className={cn("font-display text-xl font-medium tabular", s.projectedBalanceCents < 0 && "text-danger")}>{formatMoney(s.projectedBalanceCents)}</p>
              <p className="text-[11px] text-ink-3">Contando o que ainda está previsto</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-ink-3">
                Saldo inicial: <span className="font-semibold tabular text-ink-2">{formatMoney(s.openingBalanceCents)}</span>
              </p>
              {canEditOpening && (
                <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => setOpeningOpen(true)}>
                  <Landmark className="size-3.5" /> Ajustar saldo inicial
                </Button>
              )}
            </div>
          </div>
        </section>
        <Stat label={`Entradas em ${formatMonth(`${month}-15T12:00:00Z`)}`} value={formatMoney(s.monthIncomeCents)} hint="Realizadas no mês" tone="lime" />
        <Stat label="Saídas no mês" value={formatMoney(s.monthExpenseCents)} hint="Realizadas no mês" />
        <Stat
          label="Resultado do mês"
          value={formatMoney(s.monthResultCents)}
          hint="Entradas − saídas realizadas"
          tone={s.monthResultCents < 0 ? "danger" : "purple"}
        />
        <div className="glass rounded-[22px] p-4">
          <p className="text-[12.5px] font-semibold text-ink-2">Previstos</p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-2">A receber</dt>
              <dd className="font-semibold tabular">{formatMoney(s.receivableCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-2">A pagar</dt>
              <dd className="font-semibold tabular">{formatMoney(s.payableCents)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-ink-3">
            {s.receivableCount + s.payableCount ? `${s.receivableCount + s.payableCount} lançamento(s) não realizado(s)` : "Nada previsto em aberto"}
          </p>
        </div>
      </div>

      <CashChart history={history} />

      <section aria-labelledby="cash-list-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="cash-list-title" className="mr-2 text-[15px] font-bold">
            Lançamentos de {formatMonth(`${month}-15T12:00:00Z`)}
          </h2>
          <Select value={type} onChange={(e) => set({ type: e.target.value || null, category: null })} aria-label="Tipo" className="w-[150px]">
            <option value="">Entradas e saídas</option>
            <option value="INCOME">Só entradas</option>
            <option value="EXPENSE">Só saídas</option>
          </Select>
          <Select value={params.get("category") ?? ""} onChange={(e) => set({ category: e.target.value || null })} aria-label="Categoria" className="w-[220px]">
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value || null })} aria-label="Situação" className="w-[160px]">
            <option value="">Todas as situações</option>
            <option value="realizado">Realizados</option>
            <option value="previsto">Previstos</option>
          </Select>
        </div>

        {entries.length > 0 && (
          <p className="mb-3 px-1 text-xs text-ink-2">
            {entries.length} lançamento(s) · entradas <strong className="tabular">{formatMoney(listedIn)}</strong> · saídas{" "}
            <strong className="tabular">{formatMoney(listedOut)}</strong>
          </p>
        )}

        {entries.length === 0 ? (
          <div className="glass rounded-3xl">
            <EmptyState
              icon={<Wallet />}
              title={filtered ? "Nenhum lançamento com esses filtros" : "Nenhum lançamento neste mês"}
              description="Registre entradas e saídas da conta. Cobranças marcadas como pagas entram aqui automaticamente."
            />
          </div>
        ) : (
          <div className="glass overflow-hidden rounded-3xl">
            <table className="hidden w-full text-left text-[13.5px] md:table">
              <thead>
                <tr className="border-b border-hairline text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const st = SETTLED_TONE[`${e.settled}`];
                  return (
                    <tr key={e.id} className="border-b border-hairline/70 last:border-0 hover:bg-white/50">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(e.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <TypeMark type={e.type} />
                          <div className="min-w-0">
                            <p className="font-semibold">{e.description}</p>
                            {(e.client || e.notes) && <p className="truncate text-xs text-ink-3">{[e.client?.name, e.notes].filter(Boolean).join(" · ")}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-2">{e.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular">{signed(e.type, e.amountCents)}</td>
                      <td className="px-4 py-3">
                        <Badge color={st.color}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <RowActions entry={e} onEdit={() => setEditing(e)} onDelete={() => setToDelete(e)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="divide-y divide-hairline md:hidden">
              {entries.map((e) => {
                const st = SETTLED_TONE[`${e.settled}`];
                return (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <TypeMark type={e.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.description}</p>
                        <p className="truncate text-xs text-ink-3">
                          {formatDate(e.date)} · {e.category}
                          {e.client ? ` · ${e.client.name}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="whitespace-nowrap font-semibold tabular">{signed(e.type, e.amountCents)}</p>
                        <Badge color={st.color}>{st.label}</Badge>
                      </div>
                    </div>
                    <div className="mt-2">
                      <RowActions entry={e} onEdit={() => setEditing(e)} onDelete={() => setToDelete(e)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <StatementsSection month={month} files={statements} />

      {creating && (
        <EntryDialog
          key={creating.key}
          open
          onOpenChange={(o) => !o && setCreating(null)}
          entry={null}
          initialType={creating.type}
          clients={clients}
          month={month}
        />
      )}
      {editing && (
        <EntryDialog key={editing.id} open onOpenChange={(o) => !o && setEditing(null)} entry={editing} initialType={editing.type} clients={clients} month={month} />
      )}
      {openingOpen && <OpeningBalanceDialog open onOpenChange={setOpeningOpen} cents={s.openingBalanceCents} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir lançamento?"
        description={`“${toDelete?.description}” (${toDelete ? signed(toDelete.type, toDelete.amountCents) : ""}) será removido e o saldo recalculado.`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={() =>
          startDelete(async () => {
            const r = await deleteCashEntryAction(toDelete!.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Lançamento excluído.");
            setToDelete(null);
          })
        }
      />
    </div>
  );
}
