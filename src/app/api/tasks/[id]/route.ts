import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getTaskDetail } from "@/server/services/tasks";
import { toErrorResult } from "@/server/action";

// Detalhe completo da tarefa para o painel lateral (lido via React Query no cliente).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const task = await getTaskDetail(user, id);
    return NextResponse.json(task, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const r = toErrorResult(e);
    const status = r.code === "NOT_FOUND" ? 404 : r.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: r.error }, { status });
  }
}
