# KROMA OS

**KROMA — Sua marca em outra frequência.**

Central de operações da agência KROMA: clientes com kit de marca, tarefas no estilo ClickUp (Lista agrupada ou Pipeline), subtarefas, comentários com menções, arquivos, controle de tempo, KROMA Studio (posts, carrosséis, reels e criativos com legenda, prévia, aprovação e publicação), calendário editorial, financeiro operacional com entradas, saídas e saldo em conta, equipe com convites e notificações.

Uso interno. Monólito Next.js + PostgreSQL, pensado para ser mantido por uma pessoa.

**Produção:** https://kroma-os.vercel.app — cada push na `main` deste repositório publica uma nova versão.

## Requisitos

- Node.js 20+ (desenvolvido com 24)
- Docker (para Postgres e S3 locais) — ou um Postgres e um bucket S3 próprios

## Rodando localmente

```bash
cd kroma-os
cp .env.example .env              # preencha AUTH_SECRET e CRON_SECRET (comandos no arquivo)
docker compose up -d              # Postgres :5434 (+ banco kroma_test) e S3 local (SeaweedFS) :9100
npm install                       # também gera o Prisma Client
npm run db:migrate                # aplica as migrations
npm run storage:init              # cria o bucket e libera CORS para o upload direto
npm run dev                       # http://localhost:3456
```

No `.env.example`, as credenciais S3 locais são `kroma-dev-access` / `kroma-dev-secret-key` (definidas em `docker/s3.json`). Para não usar S3 no desenvolvimento, troque para `STORAGE_DRIVER="local"` (arquivos em `.storage/`).

### Primeiro administrador

Na primeira visita, `/login` redireciona para **`/setup`**, onde você cria a conta de administrador. A tela se bloqueia assim que existe um usuário. O restante da equipe entra por convite (**Membros → Convidar membro**).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 3456) |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários e de integração (Vitest, banco `kroma_test`) |
| `npm run e2e` | Testes ponta a ponta (Playwright; build próprio na porta 3457, banco `kroma_test`). Usa o Google Chrome instalado; sem Chrome, rode `npx playwright install chromium` e `PW_CHANNEL=chromium npm run e2e` |
| `npm run db:migrate` | Aplica migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev -- --name x` | Cria uma nova migration em desenvolvimento |
| `npm run db:test:prepare` | Aplica migrations no banco de testes |
| `npm run storage:init` | Cria o bucket S3 e aplica CORS |
| `npm run db:studio` | Prisma Studio |

## Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example). Obrigatórias: `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`. Para produção: `CRON_SECRET`, o storage (`STORAGE_DRIVER="vercel-blob"` + `BLOB_READ_WRITE_TOKEN`, ou as variáveis S3) e, para enviar convites por e-mail, `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (sem elas, o convite é compartilhado por link).

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) — stack, decisões, estrutura de pastas, animações
- [Banco de dados](docs/DATABASE.md) — entidades, convenções, migrations, arquivamento
- [Deploy](docs/DEPLOYMENT.md) — produção em https://kroma-os.vercel.app: Vercel + Neon + Vercel Blob privado + Resend, cron
- [Operação](docs/OPERATIONS.md) — rotina diária, permissões, backup, diagnóstico
- [Segurança](docs/SECURITY.md) — sessões, autorização, uploads, cabeçalhos

## Limitações conhecidas

- Sem publicação automática, integrações com Meta/Google Ads, portal do cliente ou WhatsApp (fora do escopo da v1).
- Investimento em mídia **realizado** é informado manualmente.
- Notificações são internas (sem e-mail/push) e atualizadas ao navegar ou recarregar (sem tempo real).
- Pré-visualização de MOV depende do codec suportado pelo navegador; DOCX é apenas para download.
- O vídeo de referência de animações não estava no material recebido — ver [ARCHITECTURE.md](docs/ARCHITECTURE.md#identidade-visual).
