// Tipos de arquivo aceitos pelo KROMA OS. Compartilhado entre cliente (pré-validação) e servidor.
import type { FileKind } from "@/generated/prisma/enums";

export type AllowedExt = "png" | "jpg" | "jpeg" | "webp" | "mp4" | "mov" | "pdf" | "docx";

export const FILE_TYPES: Record<AllowedExt, { mime: string; kind: FileKind }> = {
  png: { mime: "image/png", kind: "IMAGE" },
  jpg: { mime: "image/jpeg", kind: "IMAGE" },
  jpeg: { mime: "image/jpeg", kind: "IMAGE" },
  webp: { mime: "image/webp", kind: "IMAGE" },
  mp4: { mime: "video/mp4", kind: "VIDEO" },
  mov: { mime: "video/quicktime", kind: "VIDEO" },
  pdf: { mime: "application/pdf", kind: "DOCUMENT" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "DOCUMENT" },
};

export const ACCEPT_ATTR = Object.keys(FILE_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function extensionOf(name: string): AllowedExt | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext in FILE_TYPES ? (ext as AllowedExt) : null;
}

/**
 * Confere a assinatura binária ("magic bytes") com a extensão declarada.
 * Impede, por exemplo, um executável renomeado para .png.
 */
export function matchesSignature(ext: AllowedExt, head: Uint8Array): boolean {
  const b = head;
  const at = (offset: number, bytes: number[]) => bytes.every((v, i) => b[offset + i] === v);
  const ascii = (offset: number, s: string) => at(offset, [...s].map((c) => c.charCodeAt(0)));
  switch (ext) {
    case "png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "mp4":
    case "mov":
      // Contêiner ISO BMFF / QuickTime: caixa "ftyp" (ou átomos clássicos do QuickTime).
      return ascii(4, "ftyp") || (ext === "mov" && ["moov", "mdat", "wide", "free", "skip"].some((t) => ascii(4, t)));
    case "pdf":
      return ascii(0, "%PDF-");
    case "docx":
      // ZIP + presença de "word/" ou "[Content_Types].xml" nos primeiros bytes.
      return at(0, [0x50, 0x4b, 0x03, 0x04]) && (includesAscii(b, "word/") || includesAscii(b, "[Content_Types].xml"));
  }
}

function includesAscii(b: Uint8Array, s: string) {
  const text = new TextDecoder("latin1").decode(b);
  return text.includes(s);
}

/** Navegadores reproduzem MP4 (H.264) de forma confiável; MOV depende do codec. */
export const isBrowserPlayableVideo = (mime: string) => mime === "video/mp4";
