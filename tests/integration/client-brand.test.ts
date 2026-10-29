import { beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { db } from "@/server/db";
import { createClient, updateClientBrand } from "@/server/services/clients";
import { createTask } from "@/server/services/tasks";
import { changeFileCategory, confirmUpload, deleteFile, listClientFiles, requestUpload, setClientMainLogo } from "@/server/services/files";
import { localWrite, verifyLocalToken } from "@/server/storage";
import type { UploadTarget } from "@/lib/schemas";
import { makeUser, resetDb } from "../helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

type Actor = Parameters<typeof requestUpload>[0];

async function upload(actor: Actor, target: UploadTarget, name: string, bytes: Uint8Array, opts: { asClientLogo?: boolean } = {}) {
  const r = await requestUpload(actor, { filename: name, sizeBytes: bytes.length, target });
  const payload = verifyLocalToken(new URL(r.uploadUrl, "http://x").searchParams.get("t")!)!;
  await localWrite(payload.k, bytes);
  return confirmUpload(actor, r.fileId, opts);
}

beforeEach(async () => {
  await resetDb();
  await rm(".storage-test", { recursive: true, force: true });
});

async function setup() {
  const admin = await makeUser("ADMIN", { name: "Pedro" });
  const member = await makeUser("MEMBER", { name: "Matheus" });
  const outsider = await makeUser("MEMBER", { name: "Visitante" });
  const client = await createClient(admin.actor, { name: "Aurora", status: "ACTIVE", memberIds: [member.id] });
  return { admin, member, outsider, client };
}

describe("Marca e arquivos do cliente", () => {
  it("grava a categoria do arquivo (documento por padrão; anexos de tarefa sem categoria)", async () => {
    const { admin, member, client } = await setup();
    const photo = await upload(member.actor, { type: "client", id: client.id, category: "PHOTO" }, "fachada.png", PNG);
    const doc = await upload(admin.actor, { type: "client", id: client.id }, "contrato.pdf", PDF);
    const task = await createTask(admin.actor, { title: "Post", clientId: client.id });
    const attach = await upload(admin.actor, { type: "task", id: task.id }, "capa.png", PNG);
    expect(photo.category).toBe("PHOTO");
    expect(doc.category).toBe("DOCUMENT");
    expect(attach.category).toBeNull();

    const files = await listClientFiles(member.actor, client.id);
    expect(files.map((f) => f.originalName).sort()).toEqual(["capa.png", "contrato.pdf", "fachada.png"]);
  });

  it("logo precisa ser imagem e só gestores enviam logos", async () => {
    const { admin, member, client } = await setup();
    await expect(
      requestUpload(admin.actor, { filename: "logo.pdf", sizeBytes: PDF.length, target: { type: "client", id: client.id, category: "LOGO" } }),
    ).rejects.toThrow(/imagem/);
    await expect(
      requestUpload(admin.actor, { filename: "logo.pdf", sizeBytes: PDF.length, target: { type: "clientLogo", id: client.id } }),
    ).rejects.toThrow(/imagem/);
    await expect(
      requestUpload(member.actor, { filename: "logo.png", sizeBytes: PNG.length, target: { type: "client", id: client.id, category: "LOGO" } }),
    ).rejects.toThrow();
    // Membro não promove a própria foto a logo principal via confirmação.
    const r = await requestUpload(member.actor, {
      filename: "foto.png",
      sizeBytes: PNG.length,
      target: { type: "client", id: client.id, category: "PHOTO" },
    });
    const payload = verifyLocalToken(new URL(r.uploadUrl, "http://x").searchParams.get("t")!)!;
    await localWrite(payload.k, PNG);
    await expect(confirmUpload(member.actor, r.fileId, { asClientLogo: true })).rejects.toThrow();
    expect((await db.client.findUnique({ where: { id: client.id } }))!.logoFileId).toBeNull();
  });

  it("novo logo principal mantém o anterior como variação; excluir o principal promove outro", async () => {
    const { admin, client } = await setup();
    // O primeiro logo enviado na seção Logos vira o principal automaticamente.
    const first = await upload(admin.actor, { type: "client", id: client.id, category: "LOGO" }, "logo-v1.png", PNG);
    expect((await db.client.findUnique({ where: { id: client.id } }))!.logoFileId).toBe(first.id);

    const second = await upload(admin.actor, { type: "clientLogo", id: client.id }, "logo-v2.png", PNG, { asClientLogo: true });
    expect(second.category).toBe("LOGO");
    let files = await listClientFiles(admin.actor, client.id);
    expect(files.find((f) => f.id === first.id)?.isMainLogo).toBe(false);
    expect(files.find((f) => f.id === second.id)?.isMainLogo).toBe(true);

    await setClientMainLogo(admin.actor, client.id, first.id);
    files = await listClientFiles(admin.actor, client.id);
    expect(files.find((f) => f.id === first.id)?.isMainLogo).toBe(true);
    expect(files).toHaveLength(2);

    await deleteFile(admin.actor, first.id);
    expect((await db.client.findUnique({ where: { id: client.id } }))!.logoFileId).toBe(second.id);
  });

  it("regras de reorganização: PDF não vira logo e o logo principal não sai de Logos", async () => {
    const { admin, client } = await setup();
    const doc = await upload(admin.actor, { type: "client", id: client.id }, "manual.pdf", PDF);
    const logo = await upload(admin.actor, { type: "client", id: client.id, category: "LOGO" }, "logo.png", PNG);
    await expect(changeFileCategory(admin.actor, doc.id, "LOGO")).rejects.toThrow();
    await expect(setClientMainLogo(admin.actor, client.id, doc.id)).rejects.toThrow(/imagem/);
    await expect(changeFileCategory(admin.actor, logo.id, "PHOTO")).rejects.toThrow(/logo principal/);
    await changeFileCategory(admin.actor, doc.id, "BRAND");
    expect((await db.fileAsset.findUnique({ where: { id: doc.id } }))!.category).toBe("BRAND");
    await expect(changeFileCategory(admin.actor, doc.id, "NOPE" as never)).rejects.toThrow();
  });

  it("paleta de cores: normaliza, remove duplicadas e valida", async () => {
    const { admin, client } = await setup();
    const saved = await updateClientBrand(admin.actor, client.id, {
      brandColors: ["7625f5", "#C6FF00", "#7625F5"],
      brandFonts: "  Montserrat e Inter ",
    });
    expect(saved.brandColors).toEqual(["#7625F5", "#C6FF00"]);
    expect(saved.brandFonts).toBe("Montserrat e Inter");
    await expect(updateClientBrand(admin.actor, client.id, { brandColors: ["#12"] })).rejects.toThrow();
    const many = Array.from({ length: 13 }, (_, i) => `#0000${(i + 16).toString(16).toUpperCase()}`);
    await expect(updateClientBrand(admin.actor, client.id, { brandColors: many })).rejects.toThrow();
  });

  it("membro não altera a marca nem o logo principal", async () => {
    const { admin, member, client } = await setup();
    const logo = await upload(admin.actor, { type: "client", id: client.id, category: "LOGO" }, "logo.png", PNG);
    const photo = await upload(admin.actor, { type: "client", id: client.id, category: "PHOTO" }, "foto.png", PNG);
    await expect(updateClientBrand(member.actor, client.id, { brandColors: ["#000000"] })).rejects.toThrow();
    await expect(setClientMainLogo(member.actor, client.id, photo.id)).rejects.toThrow();
    await expect(changeFileCategory(member.actor, photo.id, "DOCUMENT")).rejects.toThrow();
    expect((await db.client.findUnique({ where: { id: client.id } }))!.logoFileId).toBe(logo.id);
  });

  it("membro não vinculado não lista nem envia arquivos do cliente (IDOR)", async () => {
    const { admin, outsider, client } = await setup();
    const doc = await upload(admin.actor, { type: "client", id: client.id }, "contrato.pdf", PDF);
    await expect(listClientFiles(outsider.actor, client.id)).rejects.toThrow();
    await expect(
      requestUpload(outsider.actor, { filename: "a.png", sizeBytes: PNG.length, target: { type: "client", id: client.id, category: "PHOTO" } }),
    ).rejects.toThrow();
    await expect(changeFileCategory(outsider.actor, doc.id, "BRAND")).rejects.toThrow();
    await expect(updateClientBrand(outsider.actor, client.id, { brandColors: [] })).rejects.toThrow();
  });
});
