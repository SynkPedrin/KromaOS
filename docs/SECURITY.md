# Segurança

## Autenticação e sessões

- Senhas com **bcrypt (12 rounds)**. Política: mínimo de 10 caracteres com letras e números.
- Login por convite apenas; o primeiro administrador é criado em `/setup`, que **só funciona enquanto não há nenhum usuário** (verificado em transação `SERIALIZABLE`).
- Sessão: token aleatório de 256 bits em cookie `kroma_session` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). O banco guarda **apenas o SHA-256** do token. Validade de 30 dias com renovação deslizante.
- Desativar um membro ou trocar a senha encerra as outras sessões imediatamente.
- Mensagem de erro de login genérica e comparação contra um hash fictício quando o e-mail não existe (sem enumeração de contas por tempo de resposta).

## Autorização

Toda regra vive em `src/server/services` e recebe o usuário (`actor`). Nada depende de esconder botões.

| Papel | Pode |
|---|---|
| Administrador | Tudo, inclusive financeiro e gestão de administradores |
| Gestor | Clientes, tarefas, equipe (convida e edita **membros**), aprovação interna. Financeiro **somente** com `canViewFinance` concedido por um administrador |
| Membro | Tarefas atribuídas/criadas por ele, tarefas internas (sem cliente) e tarefas de clientes aos quais foi vinculado. Nunca vê valores comerciais |

- **IDOR:** toda leitura/escrita por ID filtra pelo escopo (`taskScope`, `clientScope`). Um ID de outro cliente retorna "não encontrado". Coberto por testes em `tests/integration`.
- **Financeiro:** `assertFinance()` em todos os serviços financeiros; contratos só são incluídos nas consultas quando `canViewFinance` é verdadeiro — o dado nem sai do servidor.
- Menções a quem não pode ver a tarefa são descartadas (não vazam título por notificação).

## Entrada e XSS

- Zod valida toda entrada no servidor (schemas em `src/lib/schemas.ts`).
- Descrições ricas são JSON do ProseMirror **re-higienizado no servidor** (`src/server/rich-text.ts`): só nós/marcas conhecidos, links apenas `http(s)`/`mailto`, limite de tamanho. Renderizadas pelo editor, nunca via `innerHTML`.
- Comentários e legendas são texto puro renderizado pelo React (escapado).
- E-mails escapam todos os valores interpolados.

## CSRF

- Server Actions do Next comparam `Origin` e `Host` automaticamente.
- Cookie `SameSite=Lax`.
- Route Handlers que alteram estado: apenas `PUT /api/storage`, protegido por token HMAC de uso específico; `/api/cron/daily` exige `Authorization: Bearer CRON_SECRET` (comparação em tempo constante).

## Arquivos

- Extensões permitidas: PNG, JPG/JPEG, WEBP, MP4, MOV, PDF, DOCX. Limites configuráveis (20/30/500 MB).
- **Tipo real conferido** após o envio pelos primeiros bytes ("magic bytes"); divergência (ex.: `.exe` renomeado para `.png`) apaga o objeto e o registro.
- Upload direto ao storage com **URL pré-assinada que fixa `Content-Type` e `Content-Length`** — não dá para enviar mais bytes que o declarado; o tamanho real é conferido novamente.
- Bucket **privado**. Todo acesso passa por `/api/files/:id`, que checa sessão e permissão e redireciona para uma URL assinada de 10 minutos.
- DOCX nunca é exibido inline (download com `Content-Disposition: attachment`). PDFs abrem em `iframe` com `sandbox`.
- Exclusão consistente: objeto no storage primeiro, registro depois. Uploads abandonados (`PENDING` > 24 h) são limpos pela rotina diária.

## Rate limiting

Persistido no Postgres (funciona em serverless): login (20/15 min por IP, 8/15 min por e-mail), aceite de convite (10/15 min por IP), convites (20/h por usuário), reenvio (3/h por convite), troca de senha (5/15 min).

## Cabeçalhos HTTP

Definidos em `next.config.ts`: `Content-Security-Policy` (origens do storage liberadas apenas para mídia/upload; `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS em produção.

> Limitação conhecida: o CSP usa `'unsafe-inline'` em scripts porque o Next injeta scripts de hidratação inline. Endurecer com nonce exige renderização dinâmica com middleware de nonce — avaliar se o sistema for exposto além da equipe.

## Segredos

- Nenhuma credencial no código. `.env*` está no `.gitignore`; use `.env.example` como modelo.
- `RESEND_API_KEY` só é lida no servidor e nunca é logada; a tela de Configurações mostra apenas "configurado: sim/não".
- Erros inesperados são logados no servidor com nome e mensagem, sem dados de requisição; o usuário recebe mensagem genérica.
- Os testes usam um banco separado (`kroma_test`) e segredos fictícios em `.env.test`; `tests/setup.ts` recusa rodar contra outro banco.
