"use client";

import { extensionOf } from "@/lib/file-types";
import type { UploadTarget } from "@/lib/schemas";
import { confirmUploadAction, requestUploadAction } from "@/app/actions/misc";

/** PUT direto ao storage com progresso (fetch não expõe progresso de envio; XHR sim). */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha no envio (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Falha de conexão durante o envio"));
    xhr.send(file);
  });
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Envio completo de um arquivo: pede a URL assinada, envia direto ao storage
 * e confirma no servidor (que confere tamanho e assinatura binária).
 */
export async function uploadFile(
  file: File,
  target: UploadTarget,
  opts: { asClientLogo?: boolean; onProgress?: (p: number) => void; onVerifying?: () => void } = {},
): Promise<UploadResult> {
  if (!extensionOf(file.name)) return { ok: false, error: "formato não permitido" };
  const req = await requestUploadAction({ filename: file.name, sizeBytes: file.size, target });
  if (!req.ok) return { ok: false, error: req.error };
  try {
    await putWithProgress(req.data.uploadUrl, file, req.data.contentType, (p) => opts.onProgress?.(p));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha no envio" };
  }
  opts.onVerifying?.();
  const conf = await confirmUploadAction(req.data.fileId, { asClientLogo: opts.asClientLogo });
  if (!conf.ok) return { ok: false, error: conf.error };
  return { ok: true, id: conf.data.id };
}
