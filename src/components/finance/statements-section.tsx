"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { StatementPreviewRow } from "@/server/services/statement-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { FileList, type FileItem } from "@/components/files/file-list";
import { FileUploader } from "@/components/files/file-uploader";
import { CASH_CATEGORIES } from "@/lib/labels";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { importStatementAction, previewStatementImportAction } from "@/app/actions/finance";

export type StatementFile = FileItem & { _count: { statementEntries: number } };

type Preview = {
  fileName: string;
  rows: StatementPreviewRow[];
  totals: { incomeCents: number; expenseCents: number };
  printedTotals: { incomeCents: number | null; expenseCents: number | null; finalBalanceCents: number | null };
};

const signed = (r: { type: string; amountCents: number }) => `${r.type === "INCOME" ? "+" : "−"} ${formatMoney(r.amountCents)}`;

/** Prévia da leitura do extrato: o usuário confere, ajusta descrição/categoria e escolhe o que importar. */
function ImportDialog({ fileId, onClose }: { fileId: string | null; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { description: string; category: string }>>({});
  const [loading, startLoad] = useTransition();
  const [importing, startImport] = useTransition();

  useEffect(() => {
    if (!fileId) return;
    startLoad(async () => {
      setPreview(null);
      setError(null);
      const r = await previewStatementImportAction(fileId);
      if (!r.ok) return setError(r.error);
      setPreview(r.data);
      // Já importadas e prováveis duplicadas começam desmarcadas.
      setSelected(new Set(r.data.rows.filter((x) => !x.imported && !x.possibleDuplicate).map((x) => x.key)));
      setEdits(Object.fromEntries(r.data.rows.map((x) => [x.key, { description: x.description, category: x.category }])));
    });
  }, [fileId]);

  const p = preview;
  const matches =
    p && p.printedTotals.incomeCents !== null && p.printedTotals.expenseCents !== null
      ? p.printedTotals.incomeCents === p.totals.incomeCents && p.printedTotals.expenseCents === p.totals.expenseCents
      : null;
  const chosen = p?.rows.filter((r) => selected.has(r.key)) ?? [];
  const toggle = (key: string) => setSelected((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));

  return (
    <Dialog
      open={!!fileId}
      onOpenChange={(o) => !o && onClose()}
      title="Importar lançamentos do extrato"
      description={p ? p.fileName : "Lendo as movimentações do PDF…"}
      className="sm:max-w-4xl"
    >
      {loading && (
        <p className="flex items-center gap-2 py-8 text-sm text-ink-2">
          <Loader2 className="size-4 animate-spin" /> Lendo o extrato…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {p && !p.rows.length && (
        <p className="rounded-xl bg-warning/10 px-3 py-3 text-sm text-[#8a5300]">
          Não encontramos movimentações neste PDF. Se for um extrato escaneado (imagem) ou um formato diferente, lance as entradas e saídas manualmente.
        </p>
      )}
      {p && p.rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span>
              Entradas: <strong className="tabular text-[#6E9400]">{formatMoney(p.totals.incomeCents)}</strong>
            </span>
            <span>
              Saídas: <strong className="tabular text-[#C2185B]">{formatMoney(p.totals.expenseCents)}</strong>
            </span>
            {matches === true && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#4d6b00]">
                <CheckCircle2 className="size-4" /> Confere com os totais do extrato
              </span>
            )}
            {matches === false && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#8a5300]">
                <AlertTriangle className="size-4" /> Não bate com os totais do extrato ({formatMoney(p.printedTotals.incomeCents!)} /{" "}
                {formatMoney(p.printedTotals.expenseCents!)}). Revise antes de importar.
              </span>
            )}
            {p.printedTotals.finalBalanceCents !== null && (
              <span className="text-ink-3">Saldo final no extrato: {formatMoney(p.printedTotals.finalBalanceCents)}</span>
            )}
          </div>

          <div className="max-h-[52vh] overflow-auto rounded-2xl ring-1 ring-hairline">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-white/95 text-[11px] font-bold uppercase tracking-wider text-ink-3 backdrop-blur">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      checked={chosen.length === p.rows.filter((r) => !r.imported).length}
                      onChange={(e) => setSelected(new Set(e.target.checked ? p.rows.filter((r) => !r.imported).map((r) => r.key) : []))}
                    />
                  </th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => {
                  const ed = edits[r.key];
                  return (
                    <tr key={r.key} className={cn("border-t border-hairline/70", r.imported && "opacity-50")}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Importar ${r.description}`}
                          disabled={r.imported}
                          checked={selected.has(r.key)}
                          onChange={() => toggle(r.key)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular text-ink-2">
                        {formatDate(`${r.date}T12:00:00Z`)}
                        {r.time && <span className="ml-1 text-ink-3">{r.time}</span>}
                      </td>
                      <td className="min-w-[220px] px-2 py-1.5">
                        <Input
                          value={ed?.description ?? r.description}
                          maxLength={200}
                          disabled={r.imported}
                          aria-label="Descrição"
                          className="h-8 text-[13px]"
                          onChange={(e) => setEdits((x) => ({ ...x, [r.key]: { ...x[r.key], description: e.target.value } }))}
                        />
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {r.imported && <Badge color="#6E6A75">Já importado</Badge>}
                          {r.possibleDuplicate && !r.imported && <Badge color="#E08A00">Possível duplicado de um lançamento manual</Badge>}
                          {r.uncertain && <Badge color="#E08A00">Confira se é entrada ou saída</Badge>}
                        </span>
                      </td>
                      <td className="min-w-[190px] px-2 py-1.5">
                        <Select
                          value={ed?.category ?? r.category}
                          disabled={r.imported}
                          aria-label="Categoria"
                          className="h-8 text-[13px]"
                          onChange={(e) => setEdits((x) => ({ ...x, [r.key]: { ...x[r.key], category: e.target.value } }))}
                        >
                          {CASH_CATEGORIES[r.type].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular", r.type === "INCOME" ? "text-[#4d6b00]" : "text-[#C2185B]")}>
                        {signed(r)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-xs text-ink-3">Entram como lançamentos realizados, na data de cada movimentação. Importar de novo não duplica.</p>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!chosen.length}
              loading={importing}
              onClick={() =>
                startImport(async () => {
                  const r = await importStatementAction({
                    fileId: fileId!,
                    rows: chosen.map((x) => ({ key: x.key, description: (edits[x.key]?.description ?? x.description).trim() || x.description, category: edits[x.key]?.category ?? x.category })),
                  });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(
                    `${r.data.created} lançamento(s) importado(s)${r.data.skipped ? `; ${r.data.skipped} já existia(m)` : ""}. Saldo atualizado.`,
                  );
                  onClose();
                })
              }
            >
              Importar {chosen.length} lançamento(s)
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Extratos bancários (PDF) do mês: guarda o arquivo e importa as movimentações para o caixa. */
export function StatementsSection({ month, files }: { month: string; files: StatementFile[] }) {
  const router = useRouter();
  const [importing, setImporting] = useState<string | null>(null);
  const refresh = () => router.refresh();
  return (
    <section className="glass space-y-4 rounded-[26px] p-5" aria-labelledby="statements-title">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple">
          <FileText className="size-4" />
        </span>
        <div>
          <h2 id="statements-title" className="text-[15px] font-bold">
            Extratos de {formatMonth(`${month}-15T12:00:00Z`)}
          </h2>
          <p className="text-xs text-ink-3">
            Anexe o extrato do banco em PDF: o sistema lê as movimentações e você confere antes de importar para as entradas e saídas. Só quem acessa o
            financeiro vê.
          </p>
        </div>
      </div>
      {files.map((f) => (
        <div key={f.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <FileList files={[f]} onChanged={refresh} canDelete={() => true} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {f._count.statementEntries > 0 && <Badge color="#6E9400">{f._count.statementEntries} importado(s)</Badge>}
            <Button size="sm" variant={f._count.statementEntries ? "secondary" : "primary"} onClick={() => setImporting(f.id)}>
              <Sparkles /> Importar lançamentos
            </Button>
          </div>
        </div>
      ))}
      <FileUploader
        target={{ type: "statement", month }}
        accept=".pdf,application/pdf"
        label="Arraste o extrato (PDF) ou clique para enviar"
        hint="PDF do banco: as movimentações são lidas automaticamente"
        onUploaded={(id) => {
          refresh();
          setImporting(id);
        }}
      />
      <ImportDialog
        fileId={importing}
        onClose={() => {
          setImporting(null);
          refresh();
        }}
      />
    </section>
  );
}
