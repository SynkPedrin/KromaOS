import { APP_TIMEZONE } from "@/lib/dates";

/**
 * Roda uma vez ao iniciar o servidor. A Vercel executa em UTC; fixar o fuso da agência faz
 * os horários formatados no servidor (comentários, uploads, convites) baterem com os do navegador.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") process.env.TZ = APP_TIMEZONE;
}
