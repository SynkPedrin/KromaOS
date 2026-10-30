import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/auth/crypto";
import { syncAllAccounts } from "@/server/services/meta-sync";

export const maxDuration = 300;

/**
 * Sincronização agendada das contas de anúncios. Vercel Cron envia Bearer CRON_SECRET;
 * um agendador externo (a cada 30 min) pode usar Bearer META_SYNC_CRON_SECRET.
 * ?modo=reconciliar refaz os últimos 28 dias (resultados atribuídos mudam depois).
 */
export async function GET(req: Request) {
  const e = env();
  const auth = req.headers.get("authorization") ?? "";
  const allowed = [e.CRON_SECRET, e.META_SYNC_CRON_SECRET].filter((s): s is string => !!s);
  if (!allowed.some((s) => safeEqual(auth, `Bearer ${s}`))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const reconcile = new URL(req.url).searchParams.get("modo") === "reconciliar";
  const result = await syncAllAccounts(reconcile ? "RECONCILE" : "RECENT");
  return NextResponse.json({ mode: reconcile ? "reconcile" : "recent", ...result });
}
