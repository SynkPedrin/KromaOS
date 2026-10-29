import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Token opaco de alta entropia (sessões e convites). */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Hash armazenado no banco — o token em claro nunca é persistido. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hmac(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

let dummyHash: Promise<string> | null = null;

/** Hash fictício para igualar o tempo de resposta quando o e-mail não existe. */
export function dummyPasswordHash() {
  dummyHash ??= bcrypt.hash(generateToken(), BCRYPT_ROUNDS);
  return dummyHash;
}
