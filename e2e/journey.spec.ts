import { expect, test, type Browser } from "@playwright/test";
import { login } from "./session";

// Critérios de aceite entre módulos: cliente → tarefa → Studio → calendário → financeiro → convite → permissões.
// Roda depois de core.spec.ts (mesmo banco; o administrador já existe).
test.describe.configure({ mode: "serial" });

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const MP4 =Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(64)]);
let clientUrl = "";
let inviteUrl = "";

test("cadastra cliente com mensalidade e investimento", async ({ page }) => {
  await login(page);
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  // Cadastro enxuto: logo, nome, status, serviços e mensalidade; o resto em "Mais detalhes".
  await page.locator('input[type="file"][accept=".png,.jpg,.jpeg,.webp"]').setInputFiles({ name: "aurora.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByRole("img", { name: "Pré-visualização do logo" })).toBeVisible();
  await page.fill("#cf-name", "Padaria Aurora");
  await expect(page.locator("#cf-status")).toHaveValue("ACTIVE");
  await page.getByRole("button", { name: "Social Media" }).click();
  await page.fill("#cf-fee", "3.200,00");
  await expect(page.locator("#cf-contact")).toBeHidden();
  await page.getByRole("button", { name: "Mais detalhes (opcional)" }).click();
  await page.fill("#cf-contact", "Joana Lima");
  await page.fill("#cf-media", "1.500");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[a-z0-9]+$/);
  clientUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Padaria Aurora" })).toBeVisible();
  await expect(page.getByText("R$ 3.200,00").first()).toBeVisible();
  // Logo enviado junto com o cadastro aparece em "Marca e arquivos" como principal.
  await page.getByRole("link", { name: "Marca e arquivos" }).click();
  await expect(page.getByText("Logo principal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Visualizar aurora.png" })).toBeVisible();
});

test("Reel no Studio: vídeo, legenda, publicação, aprovação e calendário", async ({ page }) => {
  await login(page);
  await page.goto("/studio");
  await page.getByRole("button", { name: "Novo conteúdo" }).click();
  await page.fill("#qt-title", "Reel Black Friday Aurora");
  await page.selectOption("#qt-client", { label: "Padaria Aurora" });
  await page.selectOption("#qt-type", "REEL");
  await page.fill("#qt-due", "2030-11-20");
  await page.fill("#qt-publish", "2030-11-25");
  await page.getByRole("button", { name: "Criar", exact: true }).click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByText("KROMA Studio")).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles({ name: "reel.mp4", mimeType: "video/mp4", buffer: MP4 });
  await expect(panel.getByText("reel.mp4")).toBeVisible();

  await panel.getByLabel(/Legenda/).fill("Black Friday chegou! 🔥\n\nCorre que é por tempo limitado.");
  await panel.getByLabel(/Legenda/).blur();
  await panel.getByRole("button", { name: "Instagram" }).click();
  await expect(panel.getByRole("button", { name: "Instagram" })).toHaveAttribute("aria-pressed", "true");

  // Copiar legenda (área de transferência liberada no contexto)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel.getByRole("button", { name: "Copiar legenda" }).click();
  await expect(page.getByText("Legenda copiada.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Black Friday chegou! 🔥\n\nCorre");

  // Aprovação interna e do cliente
  await panel.getByRole("button", { name: "Registrar aprovação" }).click();
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText("Aprovação registrada.")).toBeVisible();
  await panel.getByRole("button", { name: "Registrar aprovação" }).click();
  await page.getByRole("button", { name: /Do cliente/ }).click();
  await page.getByLabel("Quem aprovou no cliente").fill("Joana Lima");
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(panel.getByText("por Joana Lima")).toBeVisible();

  // Calendário: prazo e publicação são eventos distintos
  await page.goto("/calendario?date=2030-11-01");
  await expect(page.locator('[title^="Prazo de entrega: Reel Black Friday Aurora"]:visible')).toHaveCount(1);
  await expect(page.locator('[title^="Publicação: Reel Black Friday Aurora"]:visible')).toHaveCount(1);
});

test("registra recebimento e vê no financeiro", async ({ page }) => {
  await login(page);
  await page.goto("/financeiro?tab=recebimentos");
  await page.getByRole("button", { name: "Nova cobrança" }).click();
  await page.selectOption("#inv-client", { label: "Padaria Aurora" });
  await page.fill("#inv-desc", "Mensalidade de novembro");
  await page.fill("#inv-amount", "3.200,00");
  await page.fill("#inv-due", "2020-01-10");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Mensalidade de novembro").first()).toBeVisible();
  await expect(page.getByText("Atrasado").first()).toBeVisible();
  await page.getByRole("button", { name: /Marcar como pago/ }).first().click();
  await expect(page.getByText("Pago").first()).toBeVisible();

  await page.goto("/financeiro");
  await expect(page.getByText("R$ 3.200,00").first()).toBeVisible();
});

test("entradas e saídas: cobrança paga entra no caixa e o saldo fecha", async ({ page }) => {
  await login(page);
  await page.goto("/financeiro?tab=caixa");
  const balance = page.getByRole("region", { name: "Saldo em conta" });
  // A cobrança paga no teste anterior virou entrada automaticamente.
  await expect(balance).toContainText("R$ 3.200,00");
  await expect(page.getByText("Mensalidade de novembro · Padaria Aurora").first()).toBeVisible();

  await page.getByRole("button", { name: "Saída" }).click();
  await page.fill("#cash-desc", "Assinatura de ferramentas");
  await page.fill("#cash-amount", "1.000,00");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Saída registrada.")).toBeVisible();
  await expect(balance).toContainText("R$ 2.200,00");

  // Saída prevista (ainda não paga) não mexe no saldo, só no projetado.
  await page.getByRole("button", { name: "Saída" }).click();
  await page.fill("#cash-desc", "Pró-labore");
  await page.fill("#cash-amount", "500");
  await page.getByRole("switch", { name: "Já foi pago" }).click();
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Saída registrada.")).toBeVisible();
  await expect(balance).toContainText("R$ 2.200,00");
  await expect(balance).toContainText("R$ 1.700,00");
});

test("convida membro e aceita o convite", async ({ page }) => {
  await login(page);
  await page.goto("/membros");
  await page.getByRole("button", { name: "Convidar membro" }).click();
  await page.fill("#iv-name", "Matheus Designer");
  await page.fill("#iv-email", "matheus@kroma.test");
  await page.fill("#iv-job", "Designer");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  // Sem Resend no ambiente de teste: o link aparece para envio manual.
  const link = page.getByLabel("Link do convite");
  await expect(link).toBeVisible();
  inviteUrl = (await link.inputValue()) || (await link.textContent()) || "";
  expect(inviteUrl).toContain("/convite/");
});

async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3457", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  return ctx.newPage();
}

test("membro aceita convite e permissões são aplicadas", async ({ browser }) => {
  const page = await freshPage(browser);
  await page.goto(new URL(inviteUrl).pathname);
  await page.fill("#password", "Matheus2026kroma");
  await page.getByRole("button", { name: "Aceitar convite e entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Sem acesso financeiro: nada de MRR no dashboard, menu sem Financeiro, página bloqueada.
  await expect(page.getByText("Receita mensal recorrente")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Financeiro" })).toHaveCount(0);
  await page.goto("/financeiro");
  await expect(page.getByText(/Acesso restrito/)).toBeVisible();
  await expect(page.getByText("R$ 3.200,00")).toHaveCount(0);

  // Não vinculado ao cliente: não vê o cliente nem suas tarefas (IDOR).
  await page.goto(clientUrl);
  await expect(page.getByText(/não encontrado/i).first()).toBeVisible();

  // Link de convite é de uso único.
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByText("Convite já utilizado")).toBeVisible();
  await page.context().close();
});
