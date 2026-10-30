import { describe, expect, it } from "vitest";
import { parseDate, parseMoney, parseStatementRows, suggestCategory, type StatementRow } from "@/lib/statement-parser";

const row = (...cells: string[]): StatementRow => cells.map((text, i) => ({ x: i * 100, text }));

describe("Leitura de extrato", () => {
  it("valores com sinal, R$, D/C e milhar", () => {
    expect(parseMoney("+1.750,21")).toEqual({ cents: 175021, sign: 1 });
    expect(parseMoney("- 1.290,19")).toEqual({ cents: 129019, sign: -1 });
    expect(parseMoney("R$ 99,00 D")).toEqual({ cents: 9900, sign: -1 });
    expect(parseMoney("1.500,00 C")).toEqual({ cents: 150000, sign: 1 });
    expect(parseMoney("15,00-")).toEqual({ cents: 1500, sign: -1 });
    expect(parseMoney("45,90")).toEqual({ cents: 4590, sign: 0 });
    expect(parseMoney("Pix enviado")).toBeNull();
  });

  it("datas numéricas e por extenso", () => {
    expect(parseDate("19 Out, 2026", 2025)).toBe("2026-10-19");
    expect(parseDate("05/11/2026", 2025)).toBe("2026-11-05");
    expect(parseDate("05/11", 2030)).toBe("2030-11-05");
    expect(parseDate("3 DEZ", 2030)).toBe("2030-12-03");
    expect(parseDate("31/02/2026", 2026)).toBeNull();
    expect(parseDate("Data", 2026)).toBeNull();
  });

  it("formato com data valendo para várias linhas, saldo do dia e totais impressos", () => {
    const rows = [
      row("Total de entradas", "+ 1.755,49"),
      row("Total de saídas", "- 1.290,19"),
      row("Saldo final do período", "+ 465,30"),
      row("Data", "Hora", "Tipo de transação", "Nome", "Detalhe", "Valor (R$)"),
      row("19 Out, 2026", "15:08", "Depósito de vendas", "Venda Loja", "Depósito App", "+1.750,21"),
      row("15:22", "Cartão", "SOFTWARE LLC", "usuario", "-5,10"),
      row("Saldo do dia", "+ 1.745,11"),
      row("20 Out, 2026", "11:18", "Pix", "Pix Fulano de Tal", "Enviado", "-400,00"),
      row("17:33", "Cartão", "ADOBE", "usuario", "-99,00"),
      row("21 Out, 2026", "16:23", "Cartão", "Reembolso SOFTWARE LLC", "usuario", "+5,04"),
    ];
    const r = parseStatementRows(rows, 2026);
    expect(r.printedTotals).toEqual({ incomeCents: 175549, expenseCents: 129019, finalBalanceCents: 46530 });
    expect(r.transactions.map((t) => [t.date, t.type, t.amountCents, t.description])).toEqual([
      ["2026-10-19", "INCOME", 175021, "Depósito de vendas · Venda Loja · Depósito App"],
      ["2026-10-19", "EXPENSE", 510, "SOFTWARE LLC"],
      ["2026-10-20", "EXPENSE", 40000, "Pix Fulano de Tal · Enviado"],
      ["2026-10-20", "EXPENSE", 9900, "ADOBE"],
      ["2026-10-21", "INCOME", 504, "Reembolso SOFTWARE LLC"],
    ]);
    expect(r.transactions.every((t) => !t.uncertain)).toBe(true);
  });

  it("formato clássico dd/mm com D/C e sem sinal (palavra-chave marca como incerto)", () => {
    const r = parseStatementRows(
      [
        row("01/11", "SALDO ANTERIOR", "1.000,00"),
        row("03/11", "PIX RECEBIDO CLIENTE X", "2.000,00 C"),
        row("04/11", "PAGAMENTO BOLETO", "350,00 D"),
        row("05/11", "TARIFA PACOTE", "29,90"),
      ],
      2030,
    );
    expect(r.transactions.map((t) => [t.date, t.type, t.amountCents, t.uncertain])).toEqual([
      ["2030-11-03", "INCOME", 200000, false],
      ["2030-11-04", "EXPENSE", 35000, false],
      ["2030-11-05", "EXPENSE", 2990, true],
    ]);
  });

  it("sugere categorias", () => {
    expect(suggestCategory({ type: "EXPENSE", description: "ADOBE" })).toBe("Ferramentas e software");
    expect(suggestCategory({ type: "EXPENSE", description: "IOF HIGHLEVEL LLC" })).toBe("Impostos e taxas");
    expect(suggestCategory({ type: "EXPENSE", description: "TARIFA PACOTE" })).toBe("Tarifas bancárias");
    expect(suggestCategory({ type: "INCOME", description: "Depósito de vendas · Venda Loja" })).toBe("Recebimento de cliente");
    expect(suggestCategory({ type: "INCOME", description: "Reembolso SOFTWARE LLC" })).toBe("Outras entradas");
  });
});
