# Deploy

Produção atual: **Vercel** (aplicação, região `gru1`) + **Neon** (PostgreSQL, integração do marketplace da Vercel, `gru1`) + **Vercel Blob privado** (arquivos) + **Resend** (e-mail, opcional). Alternativa para arquivos: **Cloudflare R2** ou qualquer S3. Qualquer infraestrutura que rode Node 24 funciona (`npm run build && npm start`).

## Como o projeto está publicado

| Item | Valor |
|---|---|
| Projeto Vercel | `kroma-os` (URL de produção `https://kroma-os.vercel.app`) |
| Repositório | `github.com/SynkPedrin/KromaOS` (push na `main` publica em produção) |
| Banco | Neon `kroma-os-db` — variáveis `DATABASE_URL` (com pooling) e `DATABASE_URL_UNPOOLED` criadas pela integração |
| Arquivos | Blob store privado `kroma-os-files` — `BLOB_READ_WRITE_TOKEN` criado pela integração, `STORAGE_DRIVER="vercel-blob"` |
| Segredos | `AUTH_SECRET`, `CRON_SECRET` gerados com `openssl` e gravados direto na Vercel (não existem no repositório) |
| E-mail | `RESEND_API_KEY` cadastrada; **sem domínio verificado**, `RESEND_FROM_EMAIL` fica vazio e os convites usam link (ver seção 3) |

**Migrations em produção** (a partir da sua máquina, usando a URL sem pooling):
```bash
vercel env pull /tmp/kroma-prod.env --environment production
set -a; . /tmp/kroma-prod.env; set +a
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:migrate
rm /tmp/kroma-prod.env
```
Rode antes de publicar um código que dependa da migration nova.

## 1. Banco de dados

1. Crie um PostgreSQL 15+ gerenciado e copie a connection string (`DATABASE_URL`). Em provedores com pooler (Neon, Supabase), use a URL **com pooling** para a aplicação.
2. Aplique as migrations a partir da sua máquina ou do CI:
   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate
   ```
   O usuário do banco precisa de permissão para `CREATE EXTENSION pg_trgm` na primeira migration (padrão nos provedores citados).

## 2a. Vercel Blob (produção atual)

1. `vercel blob create-store kroma-os-files --access private --region gru1` (ou *Storage → Blob* no painel, acesso **Private**) e conecte ao projeto.
2. Defina `STORAGE_DRIVER="vercel-blob"`. O `BLOB_READ_WRITE_TOKEN` fica só no servidor; o navegador recebe apenas URLs pré-assinadas de 15 min (envio, com tipo e tamanho máximo assinados) e de 10 min (leitura).
3. O Blob sempre entrega arquivos como anexo; por isso o PDF é repassado por `/api/files/[id]` para abrir na pré-visualização. Imagens e vídeos são lidos direto do Blob.
4. Limitação do SDK: caminhos com acento quebram a assinatura. O app já grava as chaves sem acentos (`…/<uuid>/<nome-seguro>.<ext>`), e o download usa esse nome.
5. CSP: com `STORAGE_DRIVER="vercel-blob"` no build, o `next.config.ts` libera `*.private.blob.vercel-storage.com` e `vercel.com` (envio).

## 2b. Cloudflare R2 (alternativa S3)

1. Crie um bucket privado (ex.: `kroma-files`). **Não** habilite acesso público.
2. Em *R2 → Manage API tokens*, crie um token com **Object Read & Write** restrito ao bucket. Anote Access Key ID e Secret.
3. Variáveis:
   ```env
   STORAGE_DRIVER="s3"
   S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
   S3_REGION="auto"
   S3_BUCKET="kroma-files"
   S3_ACCESS_KEY_ID="…"
   S3_SECRET_ACCESS_KEY="…"
   S3_FORCE_PATH_STYLE="true"
   ```
4. **CORS** (obrigatório para o upload direto do navegador). Rode `npm run storage:init` com o `.env` de produção **ou** configure no painel do R2 (*Settings → CORS policy*):
   ```json
   [{ "AllowedOrigins": ["https://os.suaagencia.com.br"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type", "content-length"], "MaxAgeSeconds": 3600 }]
   ```
5. O `next.config.ts` libera a origem do `S3_ENDPOINT` no Content-Security-Policy automaticamente. As variáveis de storage precisam existir **no build** também.

> Supabase Storage, AWS S3, Backblaze B2 e MinIO funcionam do mesmo jeito (API S3). Na AWS, deixe `S3_ENDPOINT` vazio e `S3_FORCE_PATH_STYLE="false"`.

## 3. Resend (convites)

1. Verifique o domínio de envio em *resend.com → Domains* (registros SPF/DKIM no DNS).
2. Crie uma API key com permissão **Sending access**.
3. Variáveis: `RESEND_API_KEY="re_…"` e `RESEND_FROM_EMAIL="KROMA OS <os@seudominio.com.br>"`.
4. Sem `RESEND_FROM_EMAIL` o sistema continua funcionando: o convite é criado e a tela mostra o link com os botões **Copiar** e **Enviar pelo WhatsApp**. A pessoa abre, cria a senha e entra.
5. Sem domínio verificado o Resend só entrega para o e-mail do dono da conta (remetente `onboarding@resend.dev`), por isso a produção está em modo link. Quando houver domínio: verifique-o no Resend, rode `printf 'KROMA OS <convites@dominio>' | vercel env add RESEND_FROM_EMAIL production` e publique de novo.

## 3b. Gmail (SMTP) — envio sem domínio próprio

Com `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS` definidos, os e-mails (convites e avisos de evento com o `.ics`) saem por SMTP e o Resend é ignorado.

1. Na conta Google remetente, ative a verificação em 2 etapas e crie uma **senha de app** em https://myaccount.google.com/apppasswords.
2. Variáveis de produção: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail>`, `SMTP_PASS=<senha de app>`, `SMTP_FROM="KROMA OS <gmail>"`.
3. Limite do Gmail: cerca de 500 destinatários por dia. Para volume maior ou remetente profissional, verifique um domínio no Resend e remova as variáveis SMTP.

## 4. Vercel

1. Importe o repositório (a raiz do repositório já é o app; **Root Directory** = `.`).
2. Cadastre as variáveis do `.env.example` em *Settings → Environment Variables* (Production e Preview):
   - `DATABASE_URL`, `APP_URL` (ex.: `https://os.suaagencia.com.br`)
   - `AUTH_SECRET` (`openssl rand -base64 32`), `CRON_SECRET` (`openssl rand -hex 24`)
   - storage (seção 2) e Resend (seção 3); limites de upload se quiser alterar
3. Build command padrão (`npm run build`); o script `postinstall` roda `prisma generate` (o cliente gerado não é versionado). Node fixado em `24.x` (`engines`).
4. **Cron:** `vercel.json` agenda `GET /api/cron/daily` às 10:00 UTC (07:00 em Brasília). Com `CRON_SECRET` definido, a Vercel envia `Authorization: Bearer <CRON_SECRET>` automaticamente. A rotina gera avisos de prazo/atraso, marca cobranças vencidas, limpa uploads abandonados e sessões expiradas.
5. Uploads grandes vão **direto ao storage** (Blob ou R2, sem passar pela função), então o limite de corpo da Vercel não se aplica a vídeos.
6. `.vercelignore` impede que `.env*` locais e dados de teste sejam enviados em `vercel deploy`.

Fora da Vercel, agende a rotina com qualquer cron:
```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://os.suaagencia.com.br/api/cron/daily
```

## 5. Primeiro acesso

Abra `APP_URL/setup` (o login redireciona sozinho quando não há usuários) e crie a conta de administrador. Depois disso `/setup` fica bloqueado. Convide a equipe em **Membros**.

## Checklist de produção

- [ ] `APP_URL` com https e o domínio final (vai nos e-mails)
- [ ] `STORAGE_DRIVER="vercel-blob"` ou `"s3"` (o driver `local` grava em disco e **não** funciona em serverless)
- [ ] Blob store / bucket **privado** (R2: CORS só para o domínio do app)
- [ ] `CRON_SECRET` definido e cron ativo
- [ ] Domínio do Resend verificado (ou convites por link)
- [ ] Backup do banco habilitado (ver OPERATIONS.md)
