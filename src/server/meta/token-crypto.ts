import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/server/env";

// Tokens da Meta ficam cifrados no banco (AES-256-GCM). A chave vem só do ambiente do servidor.
const AAD = Buffer.from("kroma-os:meta-access-token");

function key() {
  const secret = env().META_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("META_TOKEN_ENCRYPTION_KEY não configurada");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptToken(stored: string) {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Token cifrado em formato desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
