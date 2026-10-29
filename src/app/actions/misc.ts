"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/server/action";
import * as files from "@/server/services/files";
import * as notifications from "@/server/services/notifications";
import { globalSearch } from "@/server/services/search";
import type { UploadTarget } from "@/lib/schemas";
import type { ClientFileCategory } from "@/generated/prisma/enums";

export async function requestUploadAction(input: { filename: string; sizeBytes: number; target: UploadTarget }) {
  return withUser((u) => files.requestUpload(u, input));
}

export async function confirmUploadAction(fileId: string, opts: { asClientLogo?: boolean } = {}) {
  return withUser(async (u) => {
    const f = await files.confirmUpload(u, fileId, opts);
    revalidatePath("/", "layout");
    return { id: f.id };
  });
}

export async function deleteFileAction(fileId: string) {
  return withUser(async (u) => {
    await files.deleteFile(u, fileId);
    revalidatePath("/", "layout");
  });
}

export async function changeFileCategoryAction(fileId: string, category: ClientFileCategory) {
  return withUser(async (u) => {
    await files.changeFileCategory(u, fileId, category);
    revalidatePath("/", "layout");
  });
}

export async function markNotificationReadAction(id: string) {
  return withUser(async (u) => {
    await notifications.markRead(u, id);
    revalidatePath("/", "layout");
  });
}

export async function markAllNotificationsReadAction() {
  return withUser(async (u) => {
    await notifications.markAllRead(u);
    revalidatePath("/", "layout");
  });
}

export async function searchAction(q: string) {
  return withUser((u) => globalSearch(u, q));
}
