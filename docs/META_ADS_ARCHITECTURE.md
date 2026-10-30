# Meta Ads: arquitetura

```
Meta Graph API (v26.0)
      │  OAuth (ads_read) · appsecret_proof · paginação por cursor · retry/backoff
      ▼
src/server/meta/            graph.ts (cliente HTTP), oauth.ts, token-crypto.ts (AES-256-GCM)
src/server/services/
  meta-connection.ts        OAuth, descoberta de contas, vínculo com clientes, desconexão
  meta-sync.ts              sincronização → banco, trava por conta, alcance do período (cache)
  ads.ts                    leitura para as telas, escopo de clientes do usuário
src/lib/ads/                metrics.ts (normalização e indicadores), periods.ts (períodos) — puros, testados
src/components/ads/         UI (cards, gráficos, tabelas, galeria, integração)
src/app/(app)/anuncios/     páginas
src/app/api/…               connect, callback, ads/sync, cron/meta-sync
```

As telas **nunca** recebem respostas brutas da Meta: tudo passa por `lib/ads/metrics.ts` e é lido do banco.

## Modelo de dados (Prisma)

| Modelo | Conteúdo |
|---|---|
| `MetaConnection` | Usuário Meta autorizado, token cifrado, expiração, permissões, status |
| `MetaAdAccount` | Conta `act_…`, moeda, fuso, status, **`clientId`** (vínculo explícito, uma conta → um cliente), trava e estado da sincronização |
| `MetaCampaign`, `MetaAdSet`, `MetaAd`, `MetaCreative` | Entidades com status configurado e efetivo, orçamentos (centavos), segmentação, textos e mídia do criativo |
| `MetaInsight` | Métricas **diárias** por nível (`ACCOUNT`, `CAMPAIGN`, `ADSET`, `AD`). Chave única `(conta, nível, id externo, data)` |
| `MetaInsightPeriod` | Alcance de um período fechado (granularidade separada, não se mistura com a diária) |
| `MetaSyncJob` | Registro de cada sincronização: tipo, período, status, registros, erro |

O vínculo cliente ↔ conta é uma coluna (`MetaAdAccount.clientId`) e não uma tabela de junção: isso garante, no próprio banco, que uma conta não fique associada a dois clientes. Um cliente pode ter várias contas.

## Métricas

- Somáveis entre dias: investimento, impressões, cliques, cliques no link, ações.
- **Não somáveis**: alcance e frequência (consultados por período).
- CPM = investimento ÷ impressões × 1000 · CPC (link) = investimento ÷ cliques no link · CTR (link) = cliques no link ÷ impressões.
- **Resultados**: o tipo vem da meta de otimização do conjunto (`LEAD_GENERATION` → leads, `CONVERSATIONS` → conversas, etc.), depois do evento promovido e do objetivo da campanha. Para cada tipo usamos o **primeiro** `action_type` presente (ex.: `lead` antes de `offsite_conversion.fb_pixel_lead`), nunca a soma de equivalentes.
- O "resultado principal" do cliente é o tipo com mais investimento; o custo por resultado considera só o investimento dos conjuntos desse tipo.
- Campanha com conjuntos de tipos diferentes mostra "Tipos mistos" em vez de somar.
- Status efetivo prevalece sobre o configurado; data de término no passado = "Encerrado".
- "Em veiculação" = status efetivo ativo **e** impressões registradas desde ontem.
- Atribuição: `use_unified_attribution_setting=true` (a mesma configurada em cada conjunto, como no Gerenciador).
