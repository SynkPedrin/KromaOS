import "server-only";
import { mkdir, readFile, rm, stat, writeFile, open } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BlobNotFoundError, del as blobDel, get as blobGet, head as blobHead, issueSignedToken, presignUrl } from "@vercel/blob";
import { env } from "@/server/env";
import { hmac, safeEqual } from "@/server/auth/crypto";

/**
 * Abstração de armazenamento de objetos.
 * - "s3": qualquer serviço compatível (Cloudflare R2, AWS S3, SeaweedFS/MinIO local).
 *   Upload direto do navegador via URL pré-assinada.
 * - "vercel-blob": Blob store **privado** da Vercel. Upload direto com URL pré-assinada
 *   (tipo e tamanho máximo assinados) e leitura com URL assinada de curta duração.
 * - "local": disco do servidor, para desenvolvimento. URLs assinadas com HMAC servidas
 *   por /api/storage. Não use em produção serverless (disco efêmero).
 */
export interface Storage {
  /** URL para o navegador enviar o arquivo diretamente (PUT) com tamanho exato. */
  uploadUrl(key: string, contentType: string, sizeBytes: number): Promise<string>;
  /** URL temporária de leitura. */
  downloadUrl(key: string, opts: { filename: string; inline: boolean; contentType: string }): Promise<string>;
  /** Tamanho real gravado, ou null se o objeto não existe. */
  size(key: string): Promise<number | null>;
  /** Primeiros bytes do objeto (validação de assinatura). */
  head(key: string, bytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  /** false quando o storage sempre entrega como anexo (o PDF inline passa por /api/files). */
  inlineDisposition: boolean;
}

const UPLOAD_TTL = 15 * 60; // segundos
const DOWNLOAD_TTL = 10 * 60;

// ─────────────────────────────────── S3 ────────────────────────────────────

let s3Client: S3Client | null = null;
function s3() {
  const e = env();
  s3Client ??= new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT || undefined,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    // R2 e SeaweedFS não aceitam os checksums CRC32 padrão em URLs pré-assinadas.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3Client;
}

const s3Storage: Storage = {
  async uploadUrl(key, contentType, sizeBytes) {
    // ContentLength entra na assinatura: o envio precisa ter exatamente o tamanho declarado.
    return getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
      { expiresIn: UPLOAD_TTL, signableHeaders: new Set(["content-type", "content-length"]) },
    );
  },
  async downloadUrl(key, { filename, inline, contentType }) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: contentDisposition(filename, inline),
        ResponseContentType: contentType,
      }),
      { expiresIn: DOWNLOAD_TTL },
    );
  },
  async size(key) {
    try {
      const r = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return r.ContentLength ?? 0;
    } catch {
      return null;
    }
  },
  async head(key, bytes) {
    const r = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return new Uint8Array(await r.Body!.transformToByteArray());
  },
  async delete(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  },
  inlineDisposition: true,
};

// ─────────────────────────────── Vercel Blob ───────────────────────────────

// O SDK lê BLOB_READ_WRITE_TOKEN do ambiente; o token nunca chega ao navegador, só URLs assinadas.
async function blobPresign(key: string, op: "put" | "get", ttl: number, put?: { contentType: string; sizeBytes: number }) {
  const validUntil = Date.now() + ttl * 1000;
  const constraints = put ? { allowedContentTypes: [put.contentType], maximumSizeInBytes: put.sizeBytes } : {};
  const token = await issueSignedToken({ pathname: key, operations: [op], validUntil, ...constraints });
  const { presignedUrl } =
    op === "put"
      ? await presignUrl(token, { operation: "put", pathname: key, access: "private", addRandomSuffix: false, validUntil, ...constraints })
      : await presignUrl(token, { operation: "get", pathname: key, access: "private", validUntil });
  return presignedUrl;
}

const blobStorage: Storage = {
  uploadUrl: (key, contentType, sizeBytes) => blobPresign(key, "put", UPLOAD_TTL, { contentType, sizeBytes }),
  // O Blob responde sempre com Content-Disposition "attachment" e o nome do arquivo na chave.
  downloadUrl: (key) => blobPresign(key, "get", DOWNLOAD_TTL),
  async size(key) {
    try {
      return (await blobHead(key)).size;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  },
  async head(key, bytes) {
    const r = await blobGet(key, { access: "private" });
    if (!r?.stream) return new Uint8Array();
    const reader = r.stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < bytes) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel();
    return new Uint8Array(Buffer.concat(chunks).subarray(0, bytes));
  },
  async delete(key) {
    try {
      await blobDel(key);
    } catch (e) {
      if (!(e instanceof BlobNotFoundError)) throw e;
    }
  },
  inlineDisposition: false,
};

/** Cria o bucket se não existir (útil no ambiente local). */
export async function ensureBucket() {
  if (env().STORAGE_DRIVER !== "s3") return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: env().S3_BUCKET }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: env().S3_BUCKET }));
  }
}

// ────────────────────────────────── Local ──────────────────────────────────

// turbopackIgnore: o diretório é decidido em tempo de execução; não rastrear o projeto inteiro no build.
const localRoot = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), env().LOCAL_STORAGE_DIR);

function localPath(key: string) {
  const full = path.resolve(/* turbopackIgnore: true */ localRoot(), key);
  if (!full.startsWith(localRoot() + path.sep)) throw new Error("Chave de armazenamento inválida");
  return full;
}

export type LocalTokenPayload = { k: string; op: "put" | "get"; exp: number; max?: number; fn?: string; ct?: string; inl?: 1 };

export function signLocalToken(payload: LocalTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(env().AUTH_SECRET, `storage:${body}`)}`;
}

export function verifyLocalToken(token: string): LocalTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(env().AUTH_SECRET, `storage:${body}`))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as LocalTokenPayload;
  return payload.exp > Date.now() ? payload : null;
}

const localStorage: Storage = {
  async uploadUrl(key, contentType, sizeBytes) {
    const t = signLocalToken({ k: key, op: "put", exp: Date.now() + UPLOAD_TTL * 1000, max: sizeBytes, ct: contentType });
    return `/api/storage?t=${t}`;
  },
  async downloadUrl(key, { filename, inline, contentType }) {
    const t = signLocalToken({
      k: key,
      op: "get",
      exp: Date.now() + DOWNLOAD_TTL * 1000,
      fn: filename,
      ct: contentType,
      ...(inline ? { inl: 1 as const } : {}),
    });
    return `/api/storage?t=${t}`;
  },
  async size(key) {
    try {
      return (await stat(localPath(key))).size;
    } catch {
      return null;
    }
  },
  async head(key, bytes) {
    const fh = await open(localPath(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally {
      await fh.close();
    }
  },
  async delete(key) {
    await rm(localPath(key), { force: true });
  },
  inlineDisposition: true,
};

export async function localWrite(key: string, data: Uint8Array) {
  const full = localPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function localRead(key: string) {
  return readFile(localPath(key));
}

export function contentDisposition(filename: string, inline: boolean) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function storage(): Storage {
  const driver = env().STORAGE_DRIVER;
  return driver === "s3" ? s3Storage : driver === "vercel-blob" ? blobStorage : localStorage;
}
