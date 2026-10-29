import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatMoney = (cents: number) => brl.format(cents / 100);
export const formatMoneyCompact = (cents: number) => brlCompact.format(cents / 100);

/** "1.234,56" ou "1234.56" → centavos. Retorna null quando inválido. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;
  // pt-BR: vírgula é decimal; pontos seguidos de grupos de 3 dígitos são milhar ("2.500" = 2500).
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** 5700 → "1h35min"; 0 → "0min". */
export function formatDuration(seconds: number) {
  const totalMin = Math.floor(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}min`;
}

/** Para timers ao vivo: 00:12:05. */
export function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** "1h30", "90m", "1:30", "2h" → minutos. */
export function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:m|min)?)?$/);
  if (m && (m[1] || m[2])) {
    const hours = m[1] ? Number(m[1].replace(",", ".")) : 0;
    const mins = m[2] ? Number(m[2]) : 0;
    // "90" sem unidade = minutos
    return Math.round(hours * 60 + mins);
  }
  return null;
}

export const formatDate = (d: Date | string) => format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
export const formatDateShort = (d: Date | string) => format(new Date(d), "dd MMM", { locale: ptBR });
export const formatDateTime = (d: Date | string) => format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
export const formatMonth = (d: Date | string) => format(new Date(d), "MMMM 'de' yyyy", { locale: ptBR });
export const formatRelative = (d: Date | string) =>
  formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true });

export function formatDueLabel(d: Date | string) {
  const date = new Date(d);
  if (isToday(date)) return "Hoje";
  if (isTomorrow(date)) return "Amanhã";
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd MMM", { locale: ptBR });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Data (yyyy-MM-dd) para inputs type=date, sem deslocar fuso. */
export const toDateInput = (d: Date | string | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd") : "");
