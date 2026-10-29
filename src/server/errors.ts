// Erros de domínio com mensagens seguras para exibir ao usuário.
// Qualquer outro erro é tratado como interno e nunca tem sua mensagem exposta.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" = "VALIDATION",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Registro") => new AppError(`${what} não encontrado.`, "NOT_FOUND");
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new AppError(msg, "FORBIDDEN");
export const unauthorized = () => new AppError("Sessão expirada. Entre novamente.", "UNAUTHORIZED");
export const invalid = (msg: string) => new AppError(msg, "VALIDATION");

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: AppError["code"]; fieldErrors?: Record<string, string> };
