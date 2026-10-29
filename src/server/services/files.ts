import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { canManageClients, clientScope, type Actor } from "@/server/auth/permissions";
import { forbidden, invalid, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { extensionOf, FILE_TYPES, matchesSignature } from "@/lib/file-types";
import { uploadRequestSchema, type UploadTarget } from "@/lib/schemas";
import { formatBytes } from "@/lib/format";
import { z } from "zod";
import { ClientFileCategory, type FileKind } from "@/generated/prisma/enums";
import { logActivity, toNumber, userPublic } from "./shared";
import { getVisibleTask } from "./tasks";

const HEAD_BYTES = 8192;

export function uploadLimits(): Record<FileKind, number> {
  const e = env();
  return {
    IMAGE: e.UPLOAD_MAX_IMAGE_MB * 1024 * 1024,
    DOCUMENT: e.UPLOAD_MAX_DOCUMENT_MB * 1024 * 1024,
    VIDEO: e.UPLOAD_MAX_VIDEO_MB * 1024 * 1024,
  };
}

async function assertTargetAccess(actor: Actor, target: UploadTarget) {
  if (target.type === "task") {
    const t = await getVisibleTask(actor, target.id);
    if (t.archivedAt) throw invalid("A tarefa está arquivada.");
    return;
  }
  const client = await db.client.findFirst({ where: { AND: [{ id: target.id }, clientScope(actor)] } });
  if (!client) throw notFound("Cliente");
  if (targetCategory(target) === "LOGO" && !canManageClients(actor)) throw forbidden("Apenas gestores podem enviar logos.");
}

function targetCategory(target: UploadTarget): ClientFileCategory | null {
  if (target.type === "clientLogo") return "LOGO";
  if (target.type === "client") return target.category ?? "DOCUMENT";
  return null;
}

/**
 * Passo 1 do upload: valida extensão/tamanho/permissão, cria o registro PENDING
 * e devolve uma URL assinada para envio direto ao storage.
 */
export async function requestUpload(actor: Actor, input: { filename: string; sizeBytes: number; target: UploadTarget }) {
  const data = uploadRequestSchema.parse(input);
  const ext = extensionOf(data.filename);
  if (!ext) throw invalid("Formato não permitido. Use PNG, JPG, WEBP, MP4, MOV, PDF ou DOCX.");
  const { mime, kind } = FILE_TYPES[ext];
  const category = targetCategory(data.target);
  if (category === "LOGO" && kind !== "IMAGE") throw invalid("O logo precisa ser uma imagem (PNG, JPG ou WEBP).");
  const max = uploadLimits()[kind];
  if (data.sizeBytes > max) throw invalid(`Arquivo acima do limite de ${formatBytes(max)} para este tipo.`);

  await assertTargetAccess(actor, data.target);

  // O nome legível no fim da chave vira o nome do download nos storages que o derivam da chave.
  const storageKey = `${data.target.type === "task" ? "tasks" : "clients"}/${data.target.id}/${randomUUID()}/${safeBaseName(data.filename)}.${ext}`;
  const file = await db.fileAsset.create({
    data: {
      storageKey,
      originalName: data.filename,
      mimeType: mime,
      extension: ext,
      sizeBytes: BigInt(data.sizeBytes),
      kind,
      category,
      status: "PENDING",
      uploadedById: actor.id,
      taskId: data.target.type === "task" ? data.target.id : null,
      clientId: data.target.type !== "task" ? data.target.id : null,
    },
  });
  const uploadUrl = await storage().uploadUrl(storageKey, mime, data.sizeBytes);
  return { fileId: file.id, uploadUrl, contentType: mime };
}

/**
 * Passo 2: confirma o envio conferindo tamanho real e assinatura binária.
 * Arquivos inválidos (ex.: executável renomeado) são apagados do storage e do banco.
 */
export async function confirmUpload(actor: Actor, fileId: string, opts: { asClientLogo?: boolean } = {}) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file || file.uploadedById !== actor.id) throw notFound("Arquivo");
  if (file.status === "READY") return serialize(file);
  // Definir o logo principal é ação de gestor e exige imagem.
  if (opts.asClientLogo && (!file.clientId || file.kind !== "IMAGE" || !canManageClients(actor))) {
    throw forbidden("Apenas gestores podem definir o logo do cliente.");
  }

  const reject = async (msg: string) => {
    await storage()
      .delete(file.storageKey)
      .catch(() => undefined);
    await db.fileAsset.delete({ where: { id: file.id } });
    throw invalid(msg);
  };

  const size = await storage().size(file.storageKey);
  if (size === null) return reject("O envio não foi concluído. Tente novamente.");
  if (size !== toNumber(file.sizeBytes) || size > uploadLimits()[file.kind]) return reject("Tamanho do arquivo inválido.");
  const head = await storage().head(file.storageKey, HEAD_BYTES);
  if (!matchesSignature(file.extension as keyof typeof FILE_TYPES, head)) {
    return reject("O conteúdo do arquivo não corresponde à extensão informada.");
  }

  const ready = await db.$transaction(async (tx) => {
    const f = await tx.fileAsset.update({ where: { id: file.id }, data: { status: "READY" } });
    if (f.taskId) await logActivity(tx, f.taskId, actor.id, "file_added", { name: f.originalName });
    if (f.clientId && f.category === "LOGO") {
      // O logo anterior não é apagado: continua como variação na seção Logos.
      // Sem logo principal, a primeira imagem de logo enviada assume o posto.
      if (opts.asClientLogo) await tx.client.update({ where: { id: f.clientId }, data: { logoFileId: f.id } });
      else if (canManageClients(actor)) await tx.client.updateMany({ where: { id: f.clientId, logoFileId: null }, data: { logoFileId: f.id } });
    }
    return f;
  });
  return serialize(ready);
}

/** Apaga objeto e registro de forma consistente (objeto primeiro; registro só se der certo). */
async function removeFileRecord(tx: Pick<typeof db, "fileAsset">, fileId: string) {
  const f = await tx.fileAsset.findUnique({ where: { id: fileId } });
  if (!f) return;
  await storage().delete(f.storageKey);
  await tx.fileAsset.delete({ where: { id: fileId } });
}

async function visibleFile(actor: Actor, fileId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "READY") throw notFound("Arquivo");
  if (file.taskId) await getVisibleTask(actor, file.taskId);
  else if (file.clientId) {
    const ok = await db.client.count({ where: { AND: [{ id: file.clientId }, clientScope(actor)] } });
    if (!ok) throw notFound("Arquivo");
  }
  return file;
}

/** Nome seguro para a chave: sem acentos, só [A-Za-z0-9_-], até 60 caracteres. */
function safeBaseName(filename: string) {
  const base = filename.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "arquivo";
}

/** Registro do arquivo após checar permissão (usado pela rota que entrega o PDF inline). */
export async function getVisibleFile(actor: Actor, fileId: string) {
  return visibleFile(actor, fileId);
}

export async function getFileUrl(actor: Actor, fileId: string, inline: boolean) {
  const file = await visibleFile(actor, fileId);
  return storage().downloadUrl(file.storageKey, {
    filename: file.originalName,
    // DOCX nunca é exibido inline (download seguro); imagens, vídeos e PDF sim.
    inline: inline && file.extension !== "docx",
    contentType: file.mimeType,
  });
}

export async function deleteFile(actor: Actor, fileId: string) {
  const file = await visibleFile(actor, fileId);
  if (file.uploadedById !== actor.id && !canManageClients(actor)) {
    throw forbidden("Apenas quem enviou ou um gestor pode excluir o arquivo.");
  }
  await db.$transaction(async (tx) => {
    if (file.taskId) await logActivity(tx, file.taskId, actor.id, "file_removed", { name: file.originalName });
    const wasMain = await tx.client.updateMany({ where: { logoFileId: file.id }, data: { logoFileId: null } });
    await removeFileRecord(tx, file.id);
    // Excluído o logo principal, a variação de logo mais recente assume.
    if (wasMain.count && file.clientId) {
      const next = await tx.fileAsset.findFirst({
        where: { clientId: file.clientId, taskId: null, category: "LOGO", kind: "IMAGE", status: "READY" },
        orderBy: { createdAt: "desc" },
      });
      if (next) await tx.client.update({ where: { id: file.clientId }, data: { logoFileId: next.id } });
    }
  });
}

/** Marca e arquivos do cliente: arquivos enviados direto (com categoria) e anexos das tarefas. */
export async function listClientFiles(actor: Actor, clientId: string) {
  const client = await db.client.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] }, select: { logoFileId: true } });
  if (!client) throw notFound("Cliente");
  const files = await db.fileAsset.findMany({
    where: {
      status: "READY",
      OR: [{ clientId }, { task: { clientId, archivedAt: null } }],
    },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: userPublic }, task: { select: { id: true, number: true, title: true } } },
  });
  return files.map((f) => ({ ...serialize(f), isMainLogo: f.id === client.logoFileId }));
}

/** Arquivo enviado direto ao cliente (anexos de tarefas não entram na organização da marca). */
async function clientOwnFile(clientId: string, fileId: string) {
  const file = await db.fileAsset.findFirst({ where: { id: fileId, clientId, taskId: null, status: "READY" } });
  if (!file) throw notFound("Arquivo");
  return file;
}

export async function setClientMainLogo(actor: Actor, clientId: string, fileId: string) {
  if (!canManageClients(actor)) throw forbidden("Apenas gestores podem definir o logo do cliente.");
  const file = await clientOwnFile(clientId, fileId);
  if (file.kind !== "IMAGE") throw invalid("O logo precisa ser uma imagem.");
  await db.$transaction([
    db.fileAsset.update({ where: { id: file.id }, data: { category: "LOGO" } }),
    db.client.update({ where: { id: clientId }, data: { logoFileId: file.id } }),
  ]);
}

/** Move um arquivo do cliente entre as seções (logos, identidade visual, fotos, documentos). */
export async function changeFileCategory(actor: Actor, fileId: string, input: ClientFileCategory) {
  const category = z.enum(ClientFileCategory).parse(input);
  const file = await visibleFile(actor, fileId);
  if (!file.clientId || file.taskId) throw invalid("Apenas arquivos do cliente podem ser reorganizados.");
  if (file.uploadedById !== actor.id && !canManageClients(actor)) throw forbidden();
  if (category === "LOGO" && (file.kind !== "IMAGE" || !canManageClients(actor))) {
    throw invalid("Apenas gestores movem imagens para Logos.");
  }
  const isMain = await db.client.count({ where: { logoFileId: file.id } });
  if (isMain && category !== "LOGO") throw invalid("Este é o logo principal. Defina outro logo principal antes de movê-lo.");
  await db.fileAsset.update({ where: { id: file.id }, data: { category } });
}

/** Limpeza de envios abandonados (registros PENDING com mais de 1 dia). */
export async function cleanupPendingUploads() {
  const stale = await db.fileAsset.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 86_400_000) } },
    take: 200,
  });
  for (const f of stale) {
    await storage()
      .delete(f.storageKey)
      .catch(() => undefined);
    await db.fileAsset.delete({ where: { id: f.id } });
  }
  return stale.length;
}

function serialize<T extends { sizeBytes: bigint }>(f: T) {
  return { ...f, sizeBytes: toNumber(f.sizeBytes) };
}
