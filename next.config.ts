import type { NextConfig } from "next";

// Origem do storage liberada no CSP para upload direto e exibição de mídia.
// Vercel Blob: leitura em *.private.blob.vercel-storage.com; upload pré-assinado em vercel.com/api/blob.
function storageOrigin() {
  if (process.env.STORAGE_DRIVER === "vercel-blob") return "https://*.private.blob.vercel-storage.com https://vercel.com";
  if (process.env.STORAGE_DRIVER !== "s3") return "";
  try {
    const url = new URL(process.env.S3_ENDPOINT ?? "");
    // Endpoints com path-style servem do próprio host; virtual-hosted usam subdomínio do bucket.
    return process.env.S3_FORCE_PATH_STYLE === "true" ? url.origin : `${url.protocol}//*.${url.host} ${url.origin}`;
  } catch {
    return "https://*.amazonaws.com";
  }
}

const s3 = storageOrigin();
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next injeta scripts inline de hidratação; sem nonce, 'unsafe-inline' é necessário.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${s3}`,
  `media-src 'self' blob: ${s3}`,
  `connect-src 'self' ${s3}${isDev ? " ws:" : ""}`,
  `frame-src 'self' ${s3}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // O KROMA OS é 100% autenticado e dinâmico por usuário: sem Cache Components,
  // cada página renderiza no pedido com dados atualizados (modelo mais simples de manter).
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
