import { expect, test } from "@playwright/test";
import { ADMIN, login, saveSession } from "./session";

// Jornada principal executada em série no mesmo banco (estado acumulado entre os testes).
test.describe.configure({ mode: "serial" });

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("1. cria a conta administrativa no primeiro acesso", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/setup/);
  await page.fill("#name", ADMIN.name);
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "Criar conta de administrador" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Pedro\./ })).toBeVisible();
  await saveSession(page);
  // Setup se bloqueia depois do primeiro usuário.
  await page.goto("/setup");
  await expect(page).not.toHaveURL(/\/setup/);
});

test("2. login, logout e senha errada", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", "senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Menu da conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("3. tarefa: criação rápida, subtarefa, comentário, upload, tempo e status", async ({ page }) => {
  await login(page);
  await page.goto("/tarefas");
  await page.getByRole("button", { name: "Nova tarefa" }).first().click();
  await page.fill("#qt-title", "Criar carrossel de lançamento");
  await page.selectOption("#qt-type", "CAROUSEL");
  await page.fill("#qt-due", "2030-11-20");
  await page.getByRole("button", { name: "Criar", exact: true }).click();

  // Painel abre direto na tarefa criada.
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel("Título da tarefa")).toHaveValue("Criar carrossel de lançamento");
  await expect(panel.getByText("KROMA Studio")).toBeVisible();

  // Subtarefa e progresso
  await panel.getByRole("button", { name: "Adicionar subtarefa" }).click();
  await panel.getByPlaceholder("Título da subtarefa e Enter").fill("Escrever legenda");
  await page.keyboard.press("Enter");
  await expect(panel.getByText("0 de 1 concluídas")).toBeVisible();
  await panel.getByRole("button", { name: "Concluir Escrever legenda" }).click();
  await expect(panel.getByText("1 de 1 concluídas")).toBeVisible();

  // Comentário
  await panel.getByPlaceholder(/Escreva um comentário/).fill("Consegue ajustar a capa?");
  await panel.getByRole("button", { name: "Enviar comentário" }).click();
  await expect(panel.getByText("Consegue ajustar a capa?")).toBeVisible();

  // Upload válido + arquivo disfarçado rejeitado
  await panel.locator('input[type="file"]').setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(panel.getByRole("button", { name: "Visualizar capa.png" })).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles({ name: "falso.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00 executavel") });
  await expect(page.getByText(/não corresponde à extensão/).first()).toBeVisible();

  // Abre o arquivo (preview protegido por permissão)
  await panel.getByRole("button", { name: "Visualizar capa.png" }).click();
  const preview = page.getByRole("dialog", { name: "capa.png" });
  await expect(preview.getByRole("img", { name: "capa.png" })).toBeAttached();
  await preview.getByRole("button", { name: "Fechar" }).click();
  await expect(preview).toBeHidden();

  // Tempo manual
  await panel.getByRole("button", { name: "Manual" }).click();
  await panel.getByLabel("Duração").fill("1h35");
  await panel.getByRole("button", { name: "Salvar" }).click();
  await expect(panel.getByText("1h35min").first()).toBeVisible();

  // Timer no servidor (aparece na barra superior)
  await panel.getByRole("button", { name: "Iniciar timer" }).click();
  const stop = panel.getByRole("button", { name: /Parar/ });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(1200);
  await stop.click();
  await expect(page.getByText("Tempo registrado.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Iniciar timer" })).toBeVisible();

  // Concluir sem legenda é bloqueado pela regra do Studio
  await panel.getByRole("button", { name: /Status:/ }).click();
  await page.getByRole("menuitem", { name: "Concluído" }).click();
  await expect(page.getByText("Preencha a legenda antes de concluir esta entrega.")).toBeVisible();

  // Com legenda, conclui
  await panel.getByLabel(/Legenda/).fill("Lançamento chegou! 🚀\n\nConfira.");
  await panel.getByLabel(/Legenda/).blur();
  await page.waitForTimeout(600);
  await panel.getByRole("button", { name: /Status:/ }).click();
  await page.getByRole("menuitem", { name: "Concluído" }).click();
  await expect(panel.getByRole("button", { name: "Status: Concluído" })).toBeVisible();
});

test("4. Pipeline: arrastar persiste o status", async ({ page }) => {
  await login(page);
  await page.goto("/tarefas?view=pipeline");
  await page.getByRole("button", { name: "Nova tarefa" }).first().click();
  await page.fill("#qt-title", "Reunião de alinhamento");
  await page.selectOption("#qt-type", "MEETING");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Título da tarefa")).toHaveValue("Reunião de alinhamento");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const card = page.getByRole("button", { name: /Reunião de alinhamento/ }).first();
  const target = page.getByRole("region", { name: "Coluna Em andamento" });
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("Movida para Em andamento.")).toBeVisible();

  await page.reload();
  await expect(target.getByText("Reunião de alinhamento")).toBeVisible();
});

test("5. dashboard mostra indicadores reais", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Tarefas pendentes")).toBeVisible();
  // Uma tarefa aberta (a reunião); a do carrossel foi concluída.
  const pending = page.locator("a", { hasText: "Tarefas pendentes" });
  await expect(pending).toContainText("1");
});

test("6. uso no celular: menu, lista e painel em tela cheia", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Todas as tarefas" }).click();
  await expect(page).toHaveURL(/\/tarefas$/);
  await page.goto("/tarefas?view=list");
  // Na linha, status e prazo também citam a tarefa; o nome abre o painel.
  await page.getByRole("button", { name: /^KR-\d+\s?Reunião de alinhamento$/ }).click();
  const panel = page.getByRole("dialog");
  await page.waitForTimeout(700); // fim da animação de entrada
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(388);
  await panel.getByPlaceholder(/Escreva um comentário/).fill("Comentando pelo celular");
  await panel.getByRole("button", { name: "Enviar comentário" }).click();
  await expect(panel.getByText("Comentando pelo celular")).toBeVisible();
});

test("7. lista estilo ClickUp: cria no grupo, muda status na linha e lembra a visualização", async ({ page }) => {
  await login(page);
  await page.goto("/tarefas?view=list");

  // Criação direto no grupo "A fazer" (vazio, por isso começa recolhido; o "+" do cabeçalho abre e foca o campo)
  const todo = page.getByRole("region", { name: "Grupo A fazer" });
  await expect(todo.getByRole("button", { name: "Expandir grupo A fazer" })).toBeVisible();
  await todo.getByRole("button", { name: "Nova tarefa em A fazer" }).click();
  await todo.getByLabel("Nome da nova tarefa em A fazer").fill("Revisar briefing do cliente");
  await page.keyboard.press("Enter");
  const title = /^KR-\d+\s?Revisar briefing do cliente$/;
  await expect(todo.getByRole("button", { name: title })).toBeVisible();
  await page.keyboard.press("Escape");

  // Status alterado na própria linha, sem abrir o painel
  await todo.getByRole("button", { name: "Status de Revisar briefing do cliente: A fazer" }).click();
  await page.getByRole("menuitem", { name: "Em andamento" }).click();
  await expect(page.getByRole("region", { name: "Grupo Em andamento" }).getByRole("button", { name: title })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Grupo recolhível
  await todo.getByRole("button", { name: "Recolher grupo A fazer" }).click();
  await expect(todo.getByRole("button", { name: "Adicionar tarefa em A fazer" })).toBeHidden();

  // A escolha de visualização vale para as próximas visitas
  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await expect(page.getByRole("region", { name: "Coluna Em andamento" })).toBeVisible();
  await page.goto("/tarefas");
  await expect(page.getByRole("button", { name: "Pipeline", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Coluna Em andamento" }).getByText("Revisar briefing do cliente")).toBeVisible();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("region", { name: "Grupo A fazer" })).toBeVisible();
  await page.goto("/tarefas");
  await expect(page.getByRole("region", { name: "Grupo Em andamento" })).toBeVisible();
});
