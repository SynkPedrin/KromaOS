# Banco de dados

PostgreSQL 15+ (desenvolvimento usa 17). Esquema em `prisma/schema.prisma`, migrations em `prisma/migrations/`.

## Convenções

- **Dinheiro em centavos** (`Int`): `monthlyFeeCents`, `amountCents`… Nunca `Float`.
- **Datas "só dia"** (prazo, vencimento, competência) gravadas às **12:00 UTC**. Assim o dia é o mesmo em qualquer fuso entre UTC−11 e UTC+11. Use `dateOnly("2026-11-20")` de `src/lib/dates.ts`.
- **Competência e mês de mídia**: primeiro dia do mês (12:00 UTC).
- **Fuso da agência**: `America/Sao_Paulo` (`APP_TIMEZONE`) para "hoje", "atrasado" e gráficos.
- **IDs**: `cuid`. Tarefas também têm `number` sequencial (exibido como `KR-123`).

## Entidades

| Tabela | Papel |
|---|---|
| `User` | Pessoa da equipe. `role` (ADMIN/MANAGER/MEMBER), `canViewFinance`, `active` |
| `Session` | Sessões de login (apenas o hash do token) |
| `Invitation` | Convites com token de uso único (hash), validade e controle de reenvio |
| `RateLimit` | Contadores de janela fixa (login, convites, troca de senha) |
| `Client` | Cliente (dados cadastrais, status, logo, `archivedAt`) |
| `ClientService` | Serviços contratados (multi-seleção) |
| `ClientMember` | Quais membros (papel MEMBER) acessam o cliente |
| `ClientContract` | Dados comerciais: tipo, status, implantação, mensalidade, mídia planejada, vencimento |
| `Invoice` | Cobranças/recebimentos (PENDING, PAID, OVERDUE, CANCELED) |
| `MediaInvestment` | Mídia por cliente × plataforma × mês (planejado e realizado) |
| `CashEntry` | Fluxo de caixa: entradas (`INCOME`) e saídas (`EXPENSE`) da conta, com categoria (texto), data, cliente opcional e `settled` (realizado × previsto). `invoiceId` liga a entrada gerada por uma cobrança paga |
| `FinanceSettings` | Linha única (`id = "default"`) com o saldo inicial da conta |
| `Task` | Tarefas **e** subtarefas (`parentId`, um nível) |
| `ChecklistItem` | Checklist opcional (usado sobretudo em subtarefas) |
| `TaskComment` | Comentários com `mentionIds` |
| `TaskActivity` | Histórico de atividades (status, responsável, arquivos, aprovações…) |
| `TimeEntry` | Registros de tempo (timer ou manual). `endedAt` nulo = timer rodando |
| `ContentMetadata` | Metadados do Studio (legenda, hashtags, CTA, plataformas, `publishAt`, aprovação, publicação) |
| `ContentApproval` | Histórico de aprovações INTERNAL × CLIENT |
| `FileAsset` | Metadados de arquivos (objeto fica no S3). Ligado a tarefa ou cliente |
| `Notification` | Notificações internas (`dedupeKey` evita duplicatas da rotina diária) |

## Regras garantidas pelo banco

Além de chaves estrangeiras e índices, a migration inicial adiciona:

- `TimeEntry_one_active_timer_per_user` — índice **único parcial** em `userId WHERE endedAt IS NULL`: impossível ter dois timers ativos, mesmo com requisições concorrentes.
- `Task_parent_not_self` — `CHECK` que impede uma tarefa ser pai de si mesma.
- `pg_trgm` + índices GIN em `Task.title` e `Client.name` para a busca.
- `CashEntry_amount_positive` — `CHECK` de valor positivo nos lançamentos (o sinal vem do tipo).
- `CashEntry.invoiceId` único: no máximo uma entrada de caixa por cobrança.

### Saldo em conta

`saldo = FinanceSettings.openingBalanceCents + Σ entradas realizadas − Σ saídas realizadas` (todas as datas). Lançamentos com `settled = false` só entram no **saldo projetado**. Marcar uma cobrança como paga cria (ou atualiza) a entrada vinculada na mesma transação; desfazer o pagamento ou cancelar a cobrança a remove. Lançamentos vinculados não são editados pela aba de caixa.

## Arquivamento (sem exclusão destrutiva)

- **Clientes e tarefas** são arquivados (`archivedAt`), nunca apagados pela interface. Arquivar uma tarefa arquiva suas subtarefas. Comentários, arquivos e tempo continuam preservados e a tarefa pode ser restaurada.
- `Client → Task` e `Client → Invoice` usam `onDelete: Restrict`: o banco impede apagar um cliente com histórico operacional/financeiro.
- **Cobranças** são canceladas (`CANCELED`), não apagadas.
- **Usuários** são desativados (`active = false`), não apagados; suas sessões são encerradas.
- O que é apagado de verdade: comentários (pelo autor), itens de checklist, registros de tempo (pelo autor/admin), arquivos (objeto no S3 + registro), investimentos de mídia, lançamentos de caixa manuais.

## Migrations

```bash
npm run db:migrate:dev -- --name descricao   # desenvolvimento: cria e aplica
npm run db:migrate                            # produção/CI: aplica pendentes (prisma migrate deploy)
npm run db:test:prepare                       # aplica no banco de testes (.env.test)
```

Edite o SQL gerado com `--create-only` quando precisar de algo que o Prisma não expressa (índices parciais, `CHECK`). Nunca altere uma migration já aplicada em produção — crie uma nova.

## Backup

Ver [OPERATIONS.md](OPERATIONS.md#backup).
