# Meta Ads: sincronização

As telas leem só do banco. A sincronização roda no servidor, nunca no navegador.

| Gatilho | Quando | Janela de métricas diárias |
|---|---|---|
| Vínculo de conta | ao vincular a um cliente | 90 dias (inicial) |
| Ao abrir as telas | dados com mais de **30 min** (via `after()`, depois de responder) | 3 dias |
| Botão "Atualizar dados" (admin) | manual | 3 dias, ou desde a data pedida em "Buscar histórico" |
| Vercel Cron diário `/api/cron/meta-sync?modo=reconciliar` (08:00 UTC) | 1×/dia | 28 dias (resultados atribuídos mudam depois) |
| Agendador externo (opcional) `GET /api/cron/meta-sync` com `Bearer META_SYNC_CRON_SECRET` | ex.: a cada 30 min | 3 dias |

O plano Hobby da Vercel só permite cron diário; por isso a atualização de 30 minutos acontece quando alguém abre as telas. Para sincronizar mesmo sem acessos, configure um agendador externo (ex.: cron-job.org) chamando a rota a cada 30 minutos com o cabeçalho `Authorization: Bearer <META_SYNC_CRON_SECRET>`.

## Etapas de cada sincronização

1. Trava a conta (`syncLockedUntil`, 10 min). Se já houver uma em andamento, a nova é ignorada (`SKIPPED`).
2. Dados da conta (nome, moeda, fuso, status).
3. Campanhas, conjuntos e anúncios (paginados, 200 por página); criativos em lotes de 50 (`?ids=`), com miniatura de 720 px.
4. Métricas diárias (`time_increment=1`) nos níveis conta, campanha, conjunto e anúncio. O intervalo é **substituído** numa transação, então reprocessar não duplica.
5. Atualiza `lastSyncedAt`, `historyFrom` e registra o `MetaSyncJob`.

## Erros e limites

- Retry com backoff exponencial (3 tentativas) para falhas transitórias e de limite (códigos 4, 17, 32, 341, 613, 80000–80099); no máximo 4 requisições simultâneas por instância; timeout de 30 s.
- Token expirado ou revogado (190) → conexão marcada "Autorização expirada/revogada"; permissão negada (10, 200–299) → "Permissões insuficientes".
- Em qualquer falha, os dados anteriores continuam visíveis com o aviso "Você está visualizando a última sincronização disponível" e o botão "Tentar novamente".
- Alcance do período: consulta sob demanda com cache de 30 min (24 h para períodos antigos). Se a Meta falhar, usa o último valor guardado ou mostra "Não disponível".

## Operação

- Histórico de sincronizações: *Configurações → Integrações · Meta Ads → Últimas sincronizações*.
- Rodar manualmente em produção: `curl -H "Authorization: Bearer $CRON_SECRET" "https://kroma-os.vercel.app/api/cron/meta-sync?modo=reconciliar"`.
