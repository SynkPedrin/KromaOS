/**
 * Prepara o bucket S3: cria se não existir e aplica a regra de CORS que permite
 * ao navegador enviar arquivos direto ao storage (PUT) a partir do APP_URL.
 * Uso: npm run storage:init
 */
import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const { S3_ENDPOINT, S3_REGION = "auto", S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE, APP_URL } = process.env;
if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.error("Configure S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY no .env");
  process.exit(1);
}

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT || undefined,
  forcePathStyle: S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  console.log(`Bucket "${S3_BUCKET}" já existe.`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  console.log(`Bucket "${S3_BUCKET}" criado.`);
}

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [APP_URL ?? "http://localhost:3456"],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["content-type", "content-length"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`CORS liberado para ${APP_URL}.`);
} catch (e) {
  console.warn("Não foi possível aplicar CORS automaticamente (configure no painel do provedor):", (e as Error).message);
}
