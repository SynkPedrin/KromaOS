import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDocumentProxy } from "unpdf";
import { db } from "@/server/db";
import { assertFinance, type Actor } from "@/server/auth/permissions";
import { invalid, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { CASH_CATEGORIES } from "@/lib/labels";
import { dateOnly } from "@/lib/dates";
import { parseStatementRows, suggestCategory, type ParsedTransaction, type StatementRow } from "@/lib/statement-parser";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

/** Linhas da página remontadas pela posição do texto (o texto corrido do PDF vem fora de ordem). */
async function extractRows(pdfBytes: Uint8Array): Promise<StatementRow[]> {
  const pdf = await getDocumentProxy(pdfBytes);
  const rows: StatementRow[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    type Item = { text: string; x: number; y: number; w: number };
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ text: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    const lines: Item[][] = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l[0].y - it.y) <= 3);
      if (line) line.push(it);
      else lines.push([it]);
    }
    for (const line of lines.sort((a, b) => b[0].y - a[0].y)) {
      const cells: StatementRow = [];
      let prev: Item | null = null;
      for (const it of line.sort((a, b) => a.x - b.x)) {
        // Pedaços colados (ligaduras como "fi" separadas pelo PDF) voltam a ser uma palavra só.
        if (prev && it.x - (prev.x + prev.w) < 1.5) cells[cells.length - 1].text += it.text;
        else cells.push({ x: it.x, text: it.text });
        prev = it;
      }
      rows.push(cells);
    }
  }
  return rows;
}

/** Lê um PDF de extrato (usado pela importação e pelos testes). */
export async function parseStatementPdf(pdfBytes: Uint8Array, fallbackYear: number) {
  return parseStatementRows(await extractRows(pdfBytes), fallbackYear);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Chave estável da movimentação: data, tipo, valor, texto e ordem entre iguais (dois Pix iguais no mesmo dia). */
function withKeys(txs: ParsedTransaction[]) {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const base = `${t.date}|${t.type}|${t.amountCents}|${norm(t.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...t, key: createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 40) };
  });
}

async function statementFile(fileId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "READY" || !file.statementMonth) throw notFound("Extrato");
  return file;
}

async function readStatement(fileId: string) {
  const file = await statementFile(fileId);
  if (Number(file.sizeBytes) > MAX_PDF_BYTES) throw invalid("Extrato grande demais para leitura automática.");
  // "head" com o tamanho total lê o arquivo inteiro em qualquer driver de storage.
  const bytes = await storage().head(file.storageKey, Number(file.sizeBytes));
  let rows: StatementRow[];
  try {
    rows = await extractRows(new Uint8Array(bytes));
  } catch {
    throw invalid("Não foi possível ler este PDF. Se for um extrato escaneado (imagem), lance as movimentações manualmente.");
  }
  const parsed = parseStatementRows(rows, file.statementMonth!.getUTCFullYear());
  return { file, ...parsed, transactions: withKeys(parsed.transactions) };
}

export type StatementPreviewRow = ParsedTransaction & {
  key: string;
  category: string;
  /** Já importada antes (mesma chave). */
  imported: boolean;
  /** Existe lançamento manual com mesma data, tipo e valor: provável duplicado. */
  possibleDuplicate: boolean;
};

/** Prévia da importação: movimentações lidas, categoria sugerida e conferência com os totais do extrato. */
export async function previewStatementImport(actor: Actor, fileId: string) {
  assertFinance(actor);
  const { file, transactions, printedTotals } = await readStatement(fileId);
  const keys = transactions.map((t) => t.key);
  const imported = new Set(
    (await db.cashEntry.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } })).map((e) => e.importKey),
  );
  const manual = transactions.length
    ? await db.cashEntry.findMany({
        where: {
          importKey: null,
          OR: transactions.map((t) => ({ date: dateOnly(t.date), type: t.type, amountCents: t.amountCents })),
        },
        select: { date: true, type: true, amountCents: true },
      })
    : [];
  const manualKey = new Set(manual.map((m) => `${m.date.toISOString().slice(0, 10)}|${m.type}|${m.amountCents}`));

  const rows: StatementPreviewRow[] = transactions.map((t) => ({
    ...t,
    category: suggestCategory(t),
    imported: imported.has(t.key),
    possibleDuplicate: manualKey.has(`${t.date}|${t.type}|${t.amountCents}`),
  }));
  const sum = (type: "INCOME" | "EXPENSE") => transactions.filter((t) => t.type === type).reduce((s, t) => s + t.amountCents, 0);
  return {
    fileName: file.originalName,
    rows,
    totals: { incomeCents: sum("INCOME"), expenseCents: sum("EXPENSE") },
    printedTotals,
  };
}

const importSchema = z.object({
  fileId: z.string().min(1),
  rows: z
    .array(
      z.object({
        key: z.string().length(40),
        description: z.string().trim().min(1).max(200),
        category: z.string().trim().min(2).max(60),
      }),
    )
    .min(1, "Selecione ao menos uma movimentação")
    .max(2000),
});
export type StatementImportInput = z.input<typeof importSchema>;

/**
 * Importa as movimentações escolhidas como lançamentos realizados. Data, valor e tipo vêm sempre
 * da releitura do PDF no servidor; do navegador só aceitamos descrição e categoria.
 */
export async function importStatement(actor: Actor, input: StatementImportInput) {
  assertFinance(actor);
  const d = importSchema.parse(input);
  const { file, transactions } = await readStatement(d.fileId);
  const byKey = new Map(transactions.map((t) => [t.key, t]));
  const allowed = new Set([...CASH_CATEGORIES.INCOME, ...CASH_CATEGORIES.EXPENSE]);
  const data = d.rows.map((r) => {
    const t = byKey.get(r.key);
    if (!t) throw invalid("O extrato mudou desde a prévia. Abra a importação de novo.");
    return {
      type: t.type,
      description: r.description,
      amountCents: t.amountCents,
      date: dateOnly(t.date),
      category: allowed.has(r.category) ? r.category : t.type === "INCOME" ? "Outras entradas" : "Outras saídas",
      settled: true,
      notes: t.time ? `Importado do extrato (${t.time})` : "Importado do extrato",
      importKey: r.key,
      statementFileId: file.id,
      createdById: actor.id,
    };
  });
  // Chave única: reimportar o mesmo extrato (ou outro com período sobreposto) não duplica.
  const r = await db.cashEntry.createMany({ data, skipDuplicates: true });
  return { created: r.count, skipped: data.length - r.count };
}
