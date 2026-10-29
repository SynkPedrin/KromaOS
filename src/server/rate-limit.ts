import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * Rate limiting de janela fixa persistido no Postgres — funciona entre instâncias
 * serverless sem depender de Redis. Usa um único UPSERT atômico.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return { allowed: rows[0].count <= limit, count: rows[0].count };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const { allowed } = await rateLimit(key, limit, windowSeconds);
  if (!allowed) throw new AppError(message ?? "Muitas tentativas. Aguarde alguns minutos.", "RATE_LIMITED");
}
