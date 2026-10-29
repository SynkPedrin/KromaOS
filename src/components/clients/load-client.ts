import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getClient } from "@/server/services/clients";
import { AppError } from "@/server/errors";

/** Carrega o cliente uma vez por requisição (layout + página) respeitando o escopo do usuário. */
export const loadClient = cache(async (id: string) => {
  const user = await requireUser();
  try {
    return { user, client: await getClient(user, id) };
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
});
