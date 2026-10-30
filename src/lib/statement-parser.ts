/**
 * Leitura de extratos bancários em PDF a partir das linhas já remontadas pela posição na página
 * (cada linha é uma lista de células com a coordenada x). Funciona com o padrão comum dos bancos
 * brasileiros: uma data (que pode valer para várias linhas seguintes), descrição e um valor no fim
 * da linha com sinal (+/-) ou sufixo D/C. Linhas de saldo e totais são ignoradas, mas os totais
 * de entradas e saídas, quando impressos, servem para conferir a leitura.
 */

export type StatementCell = { x: number; text: string };
export type StatementRow = StatementCell[];

export type ParsedTransaction = {
  date: string; // yyyy-MM-dd
  time: string | null;
  description: string;
  amountCents: number;
  type: "INCOME" | "EXPENSE";
  /** Sinal deduzido por palavra-chave (sem +/-, D/C): vale revisar. */
  uncertain: boolean;
};

export type ParsedStatement = {
  transactions: ParsedTransaction[];
  printedTotals: { incomeCents: number | null; expenseCents: number | null; finalBalanceCents: number | null };
};

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

const MONEY = /^([+-])?\s*(?:R\$\s*)?([+-])?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*([DC-])?$/i;
const TIME = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const NUMERIC_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const TEXT_DATE = /^(\d{1,2})\s+(?:de\s+)?([A-Za-zçÇ]{3})[a-zç]*\.?,?(?:\s+(?:de\s+)?(\d{4}))?$/i;
const SKIP = /\b(saldo|total|subtotal|período|periodo|limite)\b/i;
const HEADER = /^(data|hora|histórico|historico|descrição|descricao|lançamento|lancamento|valor)\b/i;

const pad = (n: number) => String(n).padStart(2, "0");

/** Valor em centavos e sinal explícito (+1, -1 ou 0 quando não há sinal nem D/C). */
export function parseMoney(text: string): { cents: number; sign: -1 | 0 | 1 } | null {
  const m = MONEY.exec(text.trim().replace(/−/g, "-"));
  if (!m) return null;
  const cents = Number(m[3].replace(/\./g, "")) * 100 + Number(m[4]);
  const signChar = m[1] ?? m[2] ?? (m[5] === "-" ? "-" : null);
  const dc = m[5]?.toUpperCase();
  const sign = signChar === "-" || dc === "D" ? -1 : signChar === "+" || dc === "C" ? 1 : 0;
  return { cents, sign };
}

/** Data no início da célula: 19/10/2026, 19/10, "19 Out, 2026", "19 OUT". */
export function parseDate(text: string, fallbackYear: number): string | null {
  const t = text.trim();
  let m = NUMERIC_DATE.exec(t);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fallbackYear;
    return valid(year, Number(m[2]), Number(m[1]));
  }
  m = TEXT_DATE.exec(t);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3)];
    if (!month) return null;
    return valid(m[3] ? Number(m[3]) : fallbackYear, month, Number(m[1]));
  }
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

const OUT_WORDS = /\b(enviad[oa]|pagamento|pago|compra|débito|debito|saque|tarifa|iof|transferência enviada|pix enviado|boleto pago)\b/i;
const IN_WORDS = /\b(recebid[oa]|depósito|deposito|crédito|credito|reembolso|estorno|rendimento|venda)\b/i;

/** Lê as transações a partir das linhas (na ordem da página). */
export function parseStatementRows(rows: StatementRow[], fallbackYear: number): ParsedStatement {
  const printedTotals: ParsedStatement["printedTotals"] = { incomeCents: null, expenseCents: null, finalBalanceCents: null };
  const raw: (Omit<ParsedTransaction, "description"> & { cells: string[] })[] = [];
  let currentDate: string | null = null;

  for (const row of rows) {
    const cells = row.map((c) => c.text.trim()).filter(Boolean);
    if (!cells.length) continue;
    const line = cells.join(" ");

    // Totais impressos (para conferência): "Total de entradas + 1.755,49", "Total de saídas - 1.290,19".
    const lastMoney = [...cells].reverse().map(parseMoney).find(Boolean) ?? null;
    if (lastMoney && /total\s+de\s+(entradas|créditos|creditos)/i.test(line)) printedTotals.incomeCents = lastMoney.cents;
    if (lastMoney && /total\s+de\s+(saídas|saidas|débitos|debitos)/i.test(line)) printedTotals.expenseCents = lastMoney.cents;
    if (lastMoney && /saldo\s+final/i.test(line)) printedTotals.finalBalanceCents = lastMoney.sign === -1 ? -lastMoney.cents : lastMoney.cents;

    const dateIdx = cells.findIndex((c) => parseDate(c, fallbackYear));
    if (dateIdx === 0) currentDate = parseDate(cells[0], fallbackYear);
    if (HEADER.test(cells[0]) || SKIP.test(line)) continue;

    // Valor: a célula mais à direita com formato monetário.
    let moneyIdx = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (parseMoney(cells[i])) {
        moneyIdx = i;
        break;
      }
    }
    if (moneyIdx <= 0 || !currentDate) continue;
    const money = parseMoney(cells[moneyIdx])!;
    if (!money.cents) continue;

    const time = cells.find((c) => TIME.test(c)) ?? null;
    const rest = cells.filter((c, i) => i !== moneyIdx && i !== (dateIdx === 0 ? 0 : -1) && !TIME.test(c));
    if (!rest.length) continue;
    const text = rest.join(" ");
    const sign = money.sign || (OUT_WORDS.test(text) ? -1 : IN_WORDS.test(text) ? 1 : -1);
    raw.push({
      date: currentDate,
      time,
      cells: rest,
      amountCents: money.cents,
      type: sign < 0 ? "EXPENSE" : "INCOME",
      uncertain: money.sign === 0,
    });
  }

  // Células que se repetem na maioria das linhas (tipo da conta, nome de usuário) não ajudam a descrever.
  const freq = new Map<string, number>();
  for (const r of raw) for (const c of new Set(r.cells)) freq.set(c, (freq.get(c) ?? 0) + 1);
  const noise = (c: string) => raw.length >= 5 && (freq.get(c) ?? 0) / raw.length >= 0.4;

  const transactions = raw.map(({ cells, ...t }) => {
    // "Pix" seguido de "Pix Fulano": a primeira só repete o começo da seguinte.
    const useful = cells.filter((c, i) => !noise(c) && !cells.some((o, j) => j !== i && o.startsWith(`${c} `)));
    return { ...t, description: (useful.length ? useful : cells).join(" · ").slice(0, 200) };
  });
  return { transactions, printedTotals };
}

/** Categoria sugerida pelo texto da movimentação (o usuário revisa antes de importar). */
export function suggestCategory(t: Pick<ParsedTransaction, "description" | "type">): string {
  const d = t.description.toLowerCase();
  if (t.type === "INCOME") {
    if (/reembolso|estorno/.test(d)) return "Outras entradas";
    if (/venda|recebid|depósito de vendas|deposito de vendas|pix recebido|ted recebida/.test(d)) return "Recebimento de cliente";
    return "Outras entradas";
  }
  if (/\biof\b|imposto|das\b|darf|simples nacional|iss\b/.test(d)) return "Impostos e taxas";
  if (/tarifa|anuidade|manutenção de conta|manutencao de conta/.test(d)) return "Tarifas bancárias";
  if (/meta|facebook|google ads|tiktok ads|facebk|fb\.me/.test(d)) return "Mídia paga (clientes)";
  if (/adobe|canva|highlevel|figma|notion|google|microsoft|openai|chatgpt|clickup|stevo|sthub|capcut|envato|freepik|vercel|hostinger|zoom|slack/.test(d)) return "Ferramentas e software";
  if (/aluguel|energia|internet|condom/.test(d)) return "Escritório e estrutura";
  return "Outras saídas";
}
