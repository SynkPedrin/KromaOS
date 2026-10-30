import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getClientAds } from "@/server/services/ads";

export type AdsSearchParams = { periodo?: string; de?: string; ate?: string; conta?: string };

/** Carrega os anúncios do cliente respeitando o escopo do usuário (404 fora do escopo). */
export async function loadClientAds(params: Promise<{ clientId: string }>, searchParams: Promise<AdsSearchParams>, parts: Parameters<typeof getClientAds>[3]) {
  const user = await requireUser();
  const [{ clientId }, sp] = await Promise.all([params, searchParams]);
  try {
    return await getClientAds(user, clientId, sp, parts);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}
