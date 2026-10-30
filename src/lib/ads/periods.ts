/**
 * Períodos dos relatórios de anúncios em datas puras (yyyy-MM-dd) no fuso da conta.
 * "Últimos N dias" segue o Gerenciador de Anúncios: N dias completos terminando ontem.
 */

export const PERIOD_PRESETS = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last_7d", label: "Últimos 7 dias" },
  { key: "last_14d", label: "Últimos 14 dias" },
  { key: "last_30d", label: "Últimos 30 dias" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês anterior" },
  { key: "custom", label: "Personalizado" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];
export type Period = { preset: PeriodPreset; since: string; until: string; days: number; label: string };

export const DEFAULT_PRESET: PeriodPreset = "last_7d";
/** Limite de dados da Insights API (37 meses); usamos um teto mais conservador por consulta. */
export const MAX_CUSTOM_DAYS = 400;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function shiftDays(ymd: string, days: number) {
  return fromUtc(new Date(toUtc(ymd).getTime() + days * 86_400_000));
}

export function daysBetween(since: string, until: string) {
  return Math.round((toUtc(until).getTime() - toUtc(since).getTime()) / 86_400_000) + 1;
}

export function eachDay(since: string, until: string) {
  const out: string[] = [];
  for (let d = since; d <= until; d = shiftDays(d, 1)) out.push(d);
  return out;
}

export function todayInTz(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const isValidYmd = (s: string | undefined | null): s is string => !!s && YMD.test(s) && fromUtc(toUtc(s)) === s;

export function resolvePeriod(input: { periodo?: string | null; de?: string | null; ate?: string | null }, tz: string, now = new Date()): Period {
  const today = todayInTz(tz, now);
  const yesterday = shiftDays(today, -1);
  const preset = (PERIOD_PRESETS.some((p) => p.key === input.periodo) ? input.periodo : DEFAULT_PRESET) as PeriodPreset;
  const make = (p: PeriodPreset, since: string, until: string): Period => ({
    preset: p,
    since,
    until,
    days: daysBetween(since, until),
    label: PERIOD_PRESETS.find((x) => x.key === p)!.label,
  });

  switch (preset) {
    case "today":
      return make(preset, today, today);
    case "yesterday":
      return make(preset, yesterday, yesterday);
    case "last_14d":
      return make(preset, shiftDays(today, -14), yesterday);
    case "last_30d":
      return make(preset, shiftDays(today, -30), yesterday);
    case "this_month":
      return make(preset, `${today.slice(0, 8)}01`, today);
    case "last_month": {
      const lastOfPrev = shiftDays(`${today.slice(0, 8)}01`, -1);
      return make(preset, `${lastOfPrev.slice(0, 8)}01`, lastOfPrev);
    }
    case "custom": {
      const { de, ate } = input;
      if (isValidYmd(de) && isValidYmd(ate) && de <= ate && ate <= today && daysBetween(de, ate) <= MAX_CUSTOM_DAYS) {
        return { ...make(preset, de, ate), label: `${fmt(de)} a ${fmt(ate)}` };
      }
      return make("last_7d", shiftDays(today, -7), yesterday);
    }
    default:
      return make("last_7d", shiftDays(today, -7), yesterday);
  }
}

/** Período anterior equivalente: mesma quantidade de dias imediatamente antes. */
export function previousPeriod(p: { since: string; until: string }) {
  const days = daysBetween(p.since, p.until);
  return { since: shiftDays(p.since, -days), until: shiftDays(p.since, -1), days };
}

function fmt(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
