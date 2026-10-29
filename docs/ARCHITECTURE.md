# Arquitetura

KROMA OS é um **monólito modular** em Next.js (App Router). Um único deploy contém interface, regras de negócio e acesso a dados. A meta é ser fácil de manter por uma pessoa.

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3 | Server Components + Server Actions eliminam uma API separada |
| Linguagem | TypeScript estrito | |
| Estilo | Tailwind CSS 4 + componentes no padrão shadcn/ui (Radix UI) | Acessibilidade dos primitivos Radix; visual próprio de vidro |
| Animação | Motion (`motion/react`) | Só `transform`/`opacity`; respeita `prefers-reduced-motion` |
| Gráficos | Recharts | |
| Pipeline/Calendário | dnd-kit | Arrastar com mouse, toque e teclado |
| Editor | TipTap 3 (JSON do ProseMirror) | Sem `innerHTML`: o documento é re-higienizado no servidor |
| Dados | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) | Migrations versionadas, tipos gerados |
| Validação | Zod 4 (schemas compartilhados cliente/servidor) | |
| Arquivos | Vercel Blob privado em produção (`@vercel/blob`); S3 compatível (R2, SeaweedFS local) via AWS SDK v3 | Upload direto do navegador com URL pré-assinada; leitura só por URL assinada após checar permissão |
| E-mail | Resend | Convites |
| Testes | Vitest (integração contra Postgres real) + Playwright (E2E) | |

## Decisões e justificativas

- **`cacheComponents` desligado.** O Next 16 ativa Cache Components por padrão. Todas as telas do KROMA OS dependem da sessão e de dados que mudam o tempo todo; com Cache Components cada leitura de sessão exigiria `Suspense`/`use cache: private`. Desligar é um modo oficialmente suportado e deixa o modelo mental simples: cada página renderiza no pedido.
- **Autenticação própria em vez de Auth.js.** O sistema usa apenas e-mail + senha por convite. Uma sessão em banco (token aleatório de 256 bits no cookie, apenas o hash SHA-256 no Postgres) é pequena, auditável e permite revogar sessões na hora (ex.: ao desativar um membro). Ver [SECURITY.md](SECURITY.md).
- **Subtarefas são `Task` com `parentId`.** Comentários, arquivos, tempo e histórico funcionam igual para tarefas e subtarefas sem tabelas duplicadas. O limite de um nível é garantido no serviço (`createTask`).
- **Studio = tarefas com `ContentMetadata`.** Um post/reel/criativo é uma tarefa com metadados (legenda, plataformas, data de publicação, aprovação). Não existe um sistema paralelo.
- **Dados comerciais em `ClientContract`.** Mensalidade, implantação e mídia ficam fora de `Client`, então consultas operacionais nunca os carregam. Os serviços só incluem contratos quando `canViewFinance(actor)` é verdadeiro.
- **Rate limiting no Postgres.** Um `UPSERT` atômico em `RateLimit` funciona entre instâncias serverless sem depender de Redis.

## Estrutura de pastas

```
prisma/
  schema.prisma            # modelo de dados (ver DATABASE.md)
  migrations/              # migrations versionadas (inclui índices parciais e pg_trgm)
src/
  app/
    (auth)/login, setup    # telas públicas
    convite/[token]        # aceite de convite
    (app)/...              # área autenticada (layout exige sessão)
    actions/*.ts           # Server Actions — finas: sessão → serviço → resultado
    api/                   # Route Handlers: detalhe da tarefa, arquivos, storage local, cron
  components/
    ui/                    # primitivos (botão, campos, diálogo, dropdown…)
    app/                   # shell: sidebar, topbar, busca ⌘K, contexto
    tasks/                 # painel da tarefa, pipeline, lista agrupada, filtros, comentários, Studio
    files/, dashboard/, clients/, finance/, team/, studio/, calendar/
  lib/                     # código compartilhado cliente/servidor (rótulos, formatação, schemas Zod)
  server/
    auth/                  # sessão, senhas, permissões
    services/              # REGRAS DE NEGÓCIO + autorização (testadas)
    storage/               # drivers Vercel Blob, S3 e local
    email.ts, env.ts, db.ts, rate-limit.ts, action.ts
  proxy.ts                 # checagem otimista de cookie (antigo middleware)
tests/
  integration/             # serviços contra Postgres real (banco kroma_test)
  unit/
e2e/                       # Playwright
```

## Fluxo de uma requisição

1. `src/proxy.ts` barra quem não tem cookie de sessão (otimização, não segurança).
2. Páginas chamam `requireUser()` → valida o token no banco.
3. Leitura e escrita passam **sempre** por `src/server/services/*`, que recebem o `actor` e aplicam o escopo (`taskScope`, `clientScope`, `assertFinance`…). Componentes nunca falam com o Prisma.
4. Server Actions (`src/app/actions`) usam `withUser()`: revalida a sessão, chama o serviço e converte erros em mensagens seguras (`ActionResult`). Erros inesperados são logados no servidor e o usuário recebe uma mensagem genérica.
5. Após mutações, `revalidatePath("/", "layout")` atualiza as telas renderizadas no servidor; o painel da tarefa usa React Query (`/api/tasks/[id]`) e é invalidado pelo cliente.

## Painel da tarefa

Abre por `?task=<id>` em qualquer rota (link compartilhável, "voltar" do navegador funciona). Desktop: painel lateral largo; mobile: tela cheia. Ver `src/components/tasks/task-panel.tsx`.

## Animação

- Entrada do app: sidebar desliza, cabeçalho desce levemente, cards entram em sequência (stagger de 60 ms), números contam até o valor, gráfico desenha em 700 ms.
- Hover: elevação de 2 px, sombra e borda luminosa roxo→limão (máscara CSS, sem layout shift).
- Modais: overlay com blur, escala 0.96→1 com mola; saída em ~150 ms.
- Sidebar: indicador ativo com `layoutId` (desliza entre itens).
- `MotionConfig reducedMotion="user"` + regra CSS global desligam movimento para quem prefere.

## Identidade visual

Tokens em `src/app/globals.css`. O fundo usa a referência de vidro (`public/brand/background.webp`) com véu branco de 80% no app.

- **Logo principal:** o "K" oficial em vidro roxo e lima (`public/brand/kroma-k.webp` para tamanhos pequenos, `kroma-k-hero.webp` para destaque, `kroma-k.png` no e-mail de convite), em `KromaMark`/`KromaLogo` (`src/components/brand/logo.tsx`). Os arquivos têm fundo transparente, gerados a partir do render oficial preservando o brilho.
- **Ícone do sistema:** a estrela cromada (`public/icon-64.png`, `public/apple-icon.png`, origem em `public/brand/kroma-star.png`), usada só como favicon e ícone de tela inicial.

> O vídeo de referência de animações não estava no material recebido; a linguagem de movimento seguiu a descrição da seção 7 do briefing.
