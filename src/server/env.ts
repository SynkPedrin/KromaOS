import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3456"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa de pelo menos 32 caracteres"),
  CRON_SECRET: z.string().min(8).optional(),

  STORAGE_DRIVER: z.enum(["s3", "vercel-blob", "local"]).default("local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  // Criado automaticamente ao conectar um Blob store (privado) ao projeto na Vercel.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default(".storage"),

  UPLOAD_MAX_IMAGE_MB: z.coerce.number().positive().default(20),
  UPLOAD_MAX_DOCUMENT_MB: z.coerce.number().positive().default(30),
  UPLOAD_MAX_VIDEO_MB: z.coerce.number().positive().default(500),

  // E-mail: SMTP (ex.: Gmail com senha de app) tem prioridade; senão, Resend.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Lista apenas os nomes das variáveis inválidas, nunca os valores.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variáveis de ambiente inválidas: ${names}`);
  }
  if (parsed.data.STORAGE_DRIVER === "s3") {
    const missing = (["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const).filter(
      (k) => !parsed.data[k],
    );
    if (missing.length) throw new Error(`Storage S3 sem configuração: ${missing.join(", ")}`);
  }
  if (parsed.data.STORAGE_DRIVER === "vercel-blob" && !parsed.data.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Storage Vercel Blob sem configuração: BLOB_READ_WRITE_TOKEN");
  }
  cached = parsed.data;
  return cached;
}

export function emailProvider(): "smtp" | "resend" | null {
  const e = env();
  if (e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS) return "smtp";
  if (e.RESEND_API_KEY && e.RESEND_FROM_EMAIL) return "resend";
  return null;
}

export function isEmailConfigured() {
  return emailProvider() !== null;
}
