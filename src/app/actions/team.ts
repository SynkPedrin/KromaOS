"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import { SESSION_COOKIE } from "@/server/auth/session";
import { hashToken } from "@/server/auth/crypto";
import * as team from "@/server/services/team";
import type { InviteInput } from "@/lib/schemas";

const refresh = () => revalidatePath("/", "layout");

export async function inviteMemberAction(input: InviteInput) {
  return withUser(async (u) => {
    const r = await team.createInvitation(u, input);
    refresh();
    return r;
  });
}

export async function resendInvitationAction(invitationId: string) {
  return withUser(async (u) => {
    const r = await team.resendInvitation(u, invitationId);
    refresh();
    return r;
  });
}

export async function revokeInvitationAction(invitationId: string) {
  return withUser(async (u) => {
    await team.revokeInvitation(u, invitationId);
    refresh();
  });
}

export async function updateMemberAction(
  userId: string,
  input: { role: string; jobTitle?: string | null; canViewFinance: boolean; active: boolean },
) {
  return withUser(async (u) => {
    await team.updateMember(u, userId, input);
    refresh();
  });
}

export async function updateProfileAction(input: { name: string; jobTitle?: string | null; avatarColor: string }) {
  return withUser(async (u) => {
    await team.updateProfile(u, input);
    refresh();
  });
}

export async function changePasswordAction(input: { current: string; next: string }) {
  return withUser(async (u) => {
    // Mantém a sessão atual e encerra as demais.
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await team.changePassword(u, input, token ? hashToken(token) : undefined);
  });
}
