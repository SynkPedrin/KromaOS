import { beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { db } from "@/server/db";
import { confirmUpload, requestUpload } from "@/server/services/files";
import { cashSummary, createCashEntry } from "@/server/services/cash";
import { importStatement, previewStatementImport } from "@/server/services/statement-import";
import { localWrite, verifyLocalToken } from "@/server/storage";
import { makeUser, resetDb } from "../helpers";
import { pdfWithText } from "../fixtures/statement-pdf";

type Actor = Parameters<typeof requestUpload>[0];

const STATEMENT = pdfWithText([
  [420, 520, "Total de entradas"], [780, 520, "+ 2.000,00"],
  [420, 505, "Total de saidas"], [780, 505, "- 465,00"],
  [13, 470, "Data"], [97, 470, "Hora"], [164, 470, "Tipo"], [299, 470, "Nome"], [788, 470, "Valor (R$)"],
  [13, 450, "03 Nov, 2030"], [97, 450, "10:00"], [164, 450, "Pix"], [299, 450, "Pix Cliente Aurora"], [788, 450, "+2.000,00"],
  [97, 430, "11:00"], [164, 430, "Cartao"], [299, 430, "ADOBE"], [788, 430, "-99,00"],
  [164, 410, "Saldo do dia"], [788, 410, "+ 1.901,00"],
  [13, 390, "04 Nov, 2030"], [97, 390, "09:00"], [164, 390, "Pix"], [299, 390, "Pix Freelancer"], [788, 390, "-350,00"],
  [97, 370, "09:05"], [164, 370, "Cartao"], [299, 370, "IOF ADOBE"], [788, 370, "-16,00"],
]);

async function uploadStatement(actor: Actor, bytes: Buffer, name = "extrato.pdf") {
  const r = await requestUpload(actor, { filename: name, sizeBytes: bytes.length, target: { type: "statement", month: "2030-11" } });
  const payload = verifyLocalToken(new URL(r.uploadUrl, "http://x").searchParams.get("t")!)!;
  await localWrite(payload.k, bytes);
  return confirmUpload(actor, r.fileId);
}

beforeEach(async () => {
  await resetDb();
  await rm(".storage-test", { recursive: true, force: true });
});

describe("Importação de extrato em PDF", () => {
  it("lê as movimentações, confere com os totais e importa como lançamentos realizados", async () => {
    const admin = await makeUser("ADMIN");
    const f = await uploadStatement(admin.actor, STATEMENT);
    const p = await previewStatementImport(admin.actor, f.id);
    expect(p.rows.map((r) => [r.date, r.type, r.amountCents, r.description, r.category])).toEqual([
      ["2030-11-03", "INCOME", 200000, "Pix Cliente Aurora", "Outras entradas"],
      ["2030-11-03", "EXPENSE", 9900, "Cartao · ADOBE", "Ferramentas e software"],
      ["2030-11-04", "EXPENSE", 35000, "Pix Freelancer", "Outras saídas"],
      ["2030-11-04", "EXPENSE", 1600, "Cartao · IOF ADOBE", "Impostos e taxas"],
    ]);
    expect(p.totals).toEqual({ incomeCents: 200000, expenseCents: 46500 });
    expect(p.printedTotals).toMatchObject({ incomeCents: 200000, expenseCents: 46500 });

    const r = await importStatement(admin.actor, {
      fileId: f.id,
      rows: p.rows.map((x) => ({ key: x.key, description: x.description, category: x.description.startsWith("Pix Cliente") ? "Recebimento de cliente" : x.category })),
    });
    expect(r).toEqual({ created: 4, skipped: 0 });
    const s = await cashSummary(admin.actor, "2030-11");
    expect(s.balanceCents).toBe(200000 - 46500);
    const income = await db.cashEntry.findFirstOrThrow({ where: { type: "INCOME" } });
    expect(income).toMatchObject({ category: "Recebimento de cliente", settled: true, statementFileId: f.id, notes: "Importado do extrato (10:00)" });
  });

  it("não duplica: reimportar marca como já importado e é ignorado; manual igual é sinalizado", async () => {
    const admin = await makeUser("ADMIN");
    await createCashEntry(admin.actor, { type: "EXPENSE", description: "Adobe (manual)", amountCents: 9900, date: "2030-11-03", category: "Ferramentas e software" });
    const f = await uploadStatement(admin.actor, STATEMENT);
    const p = await previewStatementImport(admin.actor, f.id);
    expect(p.rows.find((r) => r.description === "Cartao · ADOBE")?.possibleDuplicate).toBe(true);
    await importStatement(admin.actor, { fileId: f.id, rows: p.rows.map(({ key, description, category }) => ({ key, description, category })) });

    // O mesmo extrato enviado de novo (outro arquivo) não cria lançamentos repetidos.
    const f2 = await uploadStatement(admin.actor, STATEMENT, "extrato-de-novo.pdf");
    const p2 = await previewStatementImport(admin.actor, f2.id);
    expect(p2.rows.every((r) => r.imported)).toBe(true);
    const r2 = await importStatement(admin.actor, { fileId: f2.id, rows: p2.rows.map(({ key, description, category }) => ({ key, description, category })) });
    expect(r2).toEqual({ created: 0, skipped: 4 });
    expect(await db.cashEntry.count()).toBe(5);
  });

  it("valor e data vêm do PDF, não do navegador; categoria fora da lista vira 'Outras'", async () => {
    const admin = await makeUser("ADMIN");
    const f = await uploadStatement(admin.actor, STATEMENT);
    const p = await previewStatementImport(admin.actor, f.id);
    await expect(importStatement(admin.actor, { fileId: f.id, rows: [{ key: "x".repeat(40), description: "Falso", category: "Outras saídas" }] })).rejects.toThrow(
      /mudou/,
    );
    await importStatement(admin.actor, { fileId: f.id, rows: [{ key: p.rows[2].key, description: "Freela design", category: "Categoria inventada" }] });
    const e = await db.cashEntry.findFirstOrThrow();
    expect(e).toMatchObject({ amountCents: 35000, type: "EXPENSE", description: "Freela design", category: "Outras saídas" });
  });

  it("só quem acessa o financeiro lê ou importa", async () => {
    const admin = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    const f = await uploadStatement(admin.actor, STATEMENT);
    await expect(previewStatementImport(manager.actor, f.id)).rejects.toThrow(/financeiro/);
    await expect(importStatement(manager.actor, { fileId: f.id, rows: [{ key: "x".repeat(40), description: "x", category: "Outras saídas" }] })).rejects.toThrow(
      /financeiro/,
    );
  });

  it("PDF sem movimentações reconhecíveis devolve prévia vazia", async () => {
    const admin = await makeUser("ADMIN");
    const f = await uploadStatement(admin.actor, pdfWithText([[50, 500, "Documento qualquer"]]));
    const p = await previewStatementImport(admin.actor, f.id);
    expect(p.rows).toEqual([]);
  });
});
