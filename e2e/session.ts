import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// Reaproveita a sessão do administrador entre testes: logins repetidos esbarrariam
// (corretamente) no rate limit de 8 tentativas por e-mail a cada 15 minutos.
const FILE = "e2e/.auth/admin.json";
export const ADMIN = { name: "Pedro Almada", email: "pedro@kroma.test", password: "KromaE2E2026" };

export async function saveSession(page: Page) {
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(FILE, JSON.stringify(await page.context().cookies()));
}

export async function login(page: Page) {
  if (existsSync(FILE)) {
    await page.context().addCookies(JSON.parse(readFileSync(FILE, "utf8")));
    await page.goto("/dashboard");
    if (page.url().endsWith("/dashboard")) return;
  }
  await page.goto("/login");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await saveSession(page);
}
