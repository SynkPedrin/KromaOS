import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { enforceRateLimit } from "@/server/rate-limit";
import { toErrorResult } from "@/server/action";
import { adsClientContext } from "@/server/services/ads";
import { syncAdAccount } from "@/server/services/meta-sync";

// Sincronização manual pode levar alguns minutos em contas grandes.
export const maxDuration = 300;

const schema = z.object({
  clientId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  // Busca histórico anterior ao já sincronizado (período personalizado mais antigo).
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** "Atualizar dados": só administradores; valida o acesso ao cliente antes de tocar na Meta. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ ok: false, error: "Apenas administradores atualizam os dados de anúncios." }, { status: 403 });
  try {
    const body = schema.parse(await req.json());
    await enforceRateLimit(`ads-sync:${user.id}`, 12, 600, "Muitas atualizações seguidas. Aguarde alguns minutos.");
    const ctx = await adsClientContext(user, body.clientId);
    const accounts = ctx.accounts.filter((a) => !body.accountId || a.id === body.accountId);
    const results = [];
    for (const a of accounts) results.push(await syncAdAccount(a.id, { kind: "MANUAL", since: body.since, triggeredById: user.id }));
    const failed = results.find((r) => r.status === "ERROR");
    if (failed) return NextResponse.json({ ok: false, error: failed.error ?? "Falha na sincronização." }, { status: 502 });
    return NextResponse.json({ ok: true, data: { accounts: results.length, skipped: results.filter((r) => r.status === "SKIPPED").length } });
  } catch (e) {
    const r = toErrorResult(e);
    return NextResponse.json(r, { status: r.code === "NOT_FOUND" ? 404 : r.code === "RATE_LIMITED" ? 429 : 400 });
  }
}
