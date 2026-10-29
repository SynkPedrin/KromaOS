// Datas "só dia" (prazo, competência, vencimento) são gravadas ao meio-dia UTC.
// Assim o mesmo dia aparece em qualquer fuso entre UTC-11 e UTC+11, sem "voltar um dia".

export const APP_TIMEZONE = "America/Sao_Paulo";

export function dateOnly(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Data inválida: ${ymd}`);
  return new Date(`${ymd}T12:00:00.000Z`);
}

/** yyyy-MM-dd do instante informado no fuso da agência. */
export function ymdInTz(d: Date, tz = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function tzOffsetMinutes(d: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Início do dia (00:00) no fuso da agência, como instante UTC. */
export function startOfDayInTz(d = new Date(), tz = APP_TIMEZONE) {
  const ymd = ymdInTz(d, tz);
  const utcMidnight = new Date(`${ymd}T00:00:00.000Z`);
  return new Date(utcMidnight.getTime() - tzOffsetMinutes(utcMidnight, tz) * 60_000);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Primeiro dia do mês (meio-dia UTC), usado para competência e investimento em mídia. */
export function monthKey(d: Date | string) {
  const ymd = typeof d === "string" ? d.slice(0, 7) : ymdInTz(d).slice(0, 7);
  return dateOnly(`${ymd}-01`);
}
