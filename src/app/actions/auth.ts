"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, clientIp } from "@/server/auth/session";
import { runSafe } from "@/server/action";
import { acceptInvitation, authenticate, createFirstAdmin } from "@/server/services/team";
import { ensureBucket } from "@/server/storage";

export async function loginAction(input: { email: string; password: string }) {
  const ip = clientIp(await headers());
  const r = await runSafe(async () => {
    const user = await authenticate(input, ip);
    await createSession(user.id);
  });
  if (!r.ok) return r;
  redirect("/dashboard");
}

export async function setupAction(input: { name: string; email: string; password: string; jobTitle?: string }) {
  const r = await runSafe(async () => {
    const user = await createFirstAdmin(input);
    await createSession(user.id);
    await ensureBucket().catch(() => undefined);
  });
  if (!r.ok) return r;
  redirect("/dashboard");
}

export async function acceptInviteAction(input: { token: string; name: string; password: string }) {
  const ip = clientIp(await headers());
  const r = await runSafe(async () => {
    const user = await acceptInvitation(input, ip);
    await createSession(user.id);
  });
  if (!r.ok) return r;
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
