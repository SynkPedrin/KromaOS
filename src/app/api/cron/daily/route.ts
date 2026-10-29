import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/auth/crypto";
import { runDeadlineSweep } from "@/server/services/notifications";
import { cleanupPendingUploads } from "@/server/services/files";
import { db } from "@/server/db";

/**
 * Rotina agendada (Vercel Cron ou qualquer agendador): avisos de prazo/atraso,
 * cobranças vencidas, limpeza de uploads abandonados e sessões expiradas.
 * Protegida por Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const deadlines = await runDeadlineSweep();
  const uploadsRemoved = await cleanupPendingUploads();
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return NextResponse.json({ ok: true, ...deadlines, uploadsRemoved, sessionsRemoved: sessions.count });
}
