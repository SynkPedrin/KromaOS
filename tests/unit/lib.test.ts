import { describe, expect, it } from "vitest";
import { matchesSignature, extensionOf } from "@/lib/file-types";
import { formatDuration, parseDurationToMinutes, parseMoneyToCents } from "@/lib/format";
import { dateOnly, startOfDayInTz } from "@/lib/dates";
import { canViewFinance, taskScope } from "@/server/auth/permissions";

const bytes = (...v: (number | string)[]) =>
  new Uint8Array(v.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("assinatura de arquivos", () => {
  it("reconhece formatos válidos", () => {
    expect(matchesSignature("png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(matchesSignature("jpg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature("webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(matchesSignature("mp4", bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe(true);
    expect(matchesSignature("mov", bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe(true);
    expect(matchesSignature("pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(matchesSignature("docx", bytes(0x50, 0x4b, 0x03, 0x04, "....[Content_Types].xml"))).toBe(true);
  });
  it("rejeita conteúdo divergente", () => {
    expect(matchesSignature("png", bytes("MZ", 0x90))).toBe(false);
    expect(matchesSignature("pdf", bytes("<html>"))).toBe(false);
    expect(matchesSignature("docx", bytes(0x50, 0x4b, 0x03, 0x04, "evil.exe"))).toBe(false);
  });
  it("extensões permitidas", () => {
    expect(extensionOf("Foto.JPEG")).toBe("jpeg");
    expect(extensionOf("script.sh")).toBeNull();
    expect(extensionOf("arquivo.png.exe")).toBeNull();
  });
});

describe("formatação", () => {
  it("duração", () => {
    expect(formatDuration(95 * 60)).toBe("1h35min");
    expect(formatDuration(120 * 60)).toBe("2h");
    expect(parseDurationToMinutes("1h35")).toBe(95);
    expect(parseDurationToMinutes("1:30")).toBe(90);
    expect(parseDurationToMinutes("45")).toBe(45);
    expect(parseDurationToMinutes("2h")).toBe(120);
    expect(parseDurationToMinutes("abc")).toBeNull();
  });
  it("dinheiro", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 2.500")).toBe(250000);
    expect(parseMoneyToCents("99.9")).toBe(9990);
    expect(parseMoneyToCents("-5")).toBeNull();
  });
  it("datas só-dia não mudam de dia em São Paulo", () => {
    const d = dateOnly("2030-03-01");
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)).toBe("2030-03-01");
    const start = startOfDayInTz(new Date("2030-03-01T02:00:00Z")); // ainda 28/02 em SP
    expect(start.toISOString()).toBe("2030-02-28T03:00:00.000Z");
  });
});

describe("permissões", () => {
  it("financeiro", () => {
    expect(canViewFinance({ id: "a", role: "ADMIN", canViewFinance: false })).toBe(true);
    expect(canViewFinance({ id: "a", role: "MANAGER", canViewFinance: false })).toBe(false);
    expect(canViewFinance({ id: "a", role: "MANAGER", canViewFinance: true })).toBe(true);
    expect(canViewFinance({ id: "a", role: "MEMBER", canViewFinance: true })).toBe(false);
  });
  it("escopo de tarefas", () => {
    expect(taskScope({ id: "a", role: "MANAGER", canViewFinance: false })).toEqual({});
    expect(JSON.stringify(taskScope({ id: "u1", role: "MEMBER", canViewFinance: false }))).toContain("u1");
  });
});
