import "server-only";
import { ZodError } from "zod";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { AppError, type ActionResult } from "@/server/errors";

/**
 * Envolve uma Server Action: exige sessão válida (sempre revalidada no servidor),
 * converte erros de domínio/validação em mensagens seguras e esconde erros internos.
 */
export async function withUser<T>(fn: (user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente.", code: "UNAUTHORIZED" };
  return runSafe(() => fn(user));
}

export async function runSafe<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return toErrorResult(e);
  }
}

export function toErrorResult(e: unknown): Extract<ActionResult, { ok: false }> {
  if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = e.issues[0];
    return { ok: false, error: first?.message ?? "Dados inválidos.", code: "VALIDATION", fieldErrors };
  }
  // Erros inesperados: registra apenas no servidor; o usuário recebe mensagem genérica.
  console.error("[action] erro inesperado:", e instanceof Error ? `${e.name}: ${e.message}` : e);
  return { ok: false, error: "Algo deu errado. Tente novamente em instantes." };
}
