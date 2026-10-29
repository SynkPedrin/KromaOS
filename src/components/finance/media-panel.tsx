"use client";

import { useState, useTransition } from "react";
import { Info, Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AdPlatform } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { EmptyState, Progress } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/primitives";
import { AD_PLATFORM } from "@/lib/labels";
import { centsToInput, formatMoney, formatMonth, parseMoneyToCents } from "@/lib/format";
import { deleteMediaInvestmentAction, saveMediaInvestmentAction } from "@/app/actions/finance";
import { MoneyInput, PendingSpinner, Stat, useUrlParams } from "./finance-ui";

export type MediaRow = {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  platform: AdPlatform;
  month: string;
  plannedCents: number;
  actualCents: number | null;
  notes: string | null;
};
type ClientOpt = { id: string; name: string };

function MediaDialog({
  open,
  onOpenChange,
  row,
  clients,
  month,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: MediaRow | null;
  clients: ClientOpt[];
  month: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={row ? "Editar investimento" : "Registrar investimento em mídia"}
      description="Verba do cliente nas plataformas de anúncio. O realizado é informado manualmente."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const planned = parseMoneyToCents(String(fd.get("planned") ?? "")) ?? 0;
          const actualRaw = String(fd.get("actual") ?? "").trim();
          const actual = actualRaw ? parseMoneyToCents(actualRaw) : null;
          if (actualRaw && actual === null) return setError("Valor realizado inválido.");
          start(async () => {
            const r = await saveMediaInvestmentAction({
              clientId: String(fd.get("clientId")),
              platform: String(fd.get("platform")) as AdPlatform,
              month: String(fd.get("month")),
              plannedCents: planned,
              actualCents: actual,
              notes: String(fd.get("notes") || "") || null,
            });
            if (!r.ok) return setError(r.error);
            toast.success("Investimento salvo.");
            onOpenChange(false);
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="md-client">
            <Select id="md-client" name="clientId" required defaultValue={row?.clientId ?? ""} disabled={!!row}>
              <option value="" disabled>
                Selecione…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {row && <input type="hidden" name="clientId" value={row.clientId} />}
          </Field>
          <Field label="Plataforma" htmlFor="md-platform">
            <Select id="md-platform" name="platform" defaultValue={row?.platform ?? "META"} disabled={!!row}>
              {(Object.keys(AD_PLATFORM) as AdPlatform[]).map((p) => (
                <option key={p} value={p}>
                  {AD_PLATFORM[p].label}
                </option>
              ))}
            </Select>
            {row && <input type="hidden" name="platform" value={row.platform} />}
          </Field>
          <Field label="Mês de referência" htmlFor="md-month">
            <Input id="md-month" name="month" type="month" required defaultValue={row ? row.month.slice(0, 7) : month} readOnly={!!row} />
          </Field>
          <div />
          <Field label="Orçamento planejado" htmlFor="md-planned">
            <MoneyInput id="md-planned" name="planned" defaultValue={row ? centsToInput(row.plannedCents) : ""} />
          </Field>
          <Field label="Investimento realizado" htmlFor="md-actual" hint="Deixe em branco se ainda não souber.">
            <MoneyInput id="md-actual" name="actual" defaultValue={row?.actualCents != null ? centsToInput(row.actualCents) : ""} />
          </Field>
        </div>
        <Field label="Observações" htmlFor="md-notes">
          <Textarea id="md-notes" name="notes" maxLength={500} defaultValue={row?.notes ?? ""} />
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

export function MediaPanel({ rows, clients, month }: { rows: MediaRow[]; clients: ClientOpt[]; month: string }) {
  const { set, pending } = useUrlParams();
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [creating, setCreating] = useState(0);
  const [toDelete, setToDelete] = useState<MediaRow | null>(null);
  const [deleting, startDelete] = useTransition();

  const planned = rows.reduce((s, r) => s + r.plannedCents, 0);
  const actual = rows.reduce((s, r) => s + (r.actualCents ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-2xl bg-lime-soft/50 px-3.5 py-2.5 text-xs text-lime-ink ring-1 ring-lime/40">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Investimento em mídia é a verba dos clientes nas plataformas de anúncio. Ele não é faturamento da KROMA e não entra no MRR.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" value={month} onChange={(e) => e.target.value && set({ month: e.target.value })} aria-label="Mês" className="w-[180px]" />
        <PendingSpinner show={pending} />
        <Button className="ml-auto" onClick={() => setCreating((k) => k + 1)} disabled={!clients.length}>
          <Plus /> Registrar investimento
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Planejado em ${formatMonth(`${month}-15T12:00:00Z`)}`} value={formatMoney(planned)} />
        <Stat label="Realizado" value={formatMoney(actual)} tone="purple" />
        <Stat label="Execução" value={planned ? `${Math.round((actual / planned) * 100)}%` : "—"} hint="Realizado ÷ planejado" />
      </div>
      {rows.length === 0 ? (
        <div className="glass rounded-3xl">
          <EmptyState icon={<Megaphone />} title="Nada registrado neste mês" description="Registre a verba planejada por cliente e plataforma." />
        </div>
      ) : (
        <ul className="glass divide-y divide-hairline overflow-hidden rounded-3xl">
          {rows.map((r) => {
            const pct = r.plannedCents && r.actualCents != null ? (r.actualCents / r.plannedCents) * 100 : null;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-semibold">{r.client.name}</p>
                  <p className="truncate text-xs text-ink-3">
                    {AD_PLATFORM[r.platform].label}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                <div className="w-36 text-sm">
                  <p className="text-[11px] text-ink-3">Planejado</p>
                  <p className="font-semibold tabular">{formatMoney(r.plannedCents)}</p>
                </div>
                <div className="w-44 text-sm">
                  <p className="text-[11px] text-ink-3">Realizado</p>
                  <p className="font-semibold tabular">{r.actualCents != null ? formatMoney(r.actualCents) : "—"}</p>
                  {pct !== null && <Progress value={pct} className="mt-1" />}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Ações">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(r)}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="danger" onSelect={() => setToDelete(r)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <MediaDialog key={`new-${creating}`} open={creating > 0} onOpenChange={(o) => !o && setCreating(0)} row={null} clients={clients} month={month} />
      {editing && <MediaDialog key={editing.id} open onOpenChange={(o) => !o && setEditing(null)} row={editing} clients={clients} month={month} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir registro de mídia?"
        description={`O registro de ${toDelete ? AD_PLATFORM[toDelete.platform].label : ""} de ${toDelete?.client.name} será removido.`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={() =>
          startDelete(async () => {
            const r = await deleteMediaInvestmentAction(toDelete!.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Registro excluído.");
            setToDelete(null);
          })
        }
      />
    </div>
  );
}
