# Operação e manutenção

## Rotina diária (cron)

`GET /api/cron/daily` (protegido por `CRON_SECRET`):

| Ação | Detalhe |
|---|---|
| Prazo próximo | Notifica o responsável por tarefas abertas que vencem hoje ou amanhã |
| Tarefa atrasada | Notifica o responsável por tarefas abertas com prazo vencido |
| Cobranças | `PENDING` com vencimento passado → `OVERDUE` |
| Uploads abandonados | Remove objetos e registros `PENDING` com mais de 24 h |
| Sessões | Apaga sessões expiradas |

Cada aviso tem `dedupeKey` (tarefa + dia), então rodar a rotina mais de uma vez no dia não duplica notificações. Telas e relatórios **não dependem** da rotina para mostrar atrasos: o status efetivo é calculado na leitura.

Para rodar manualmente: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily`.

## Permissões no dia a dia

- **Dar acesso financeiro a um gestor:** Membros → editar → "Acesso financeiro" (apenas administradores).
- **Membro precisa ver um cliente:** edite o cliente e marque o membro em "Membros com acesso". Membros também veem qualquer tarefa atribuída a eles ou criada por eles, e tarefas internas.
- **Alguém saiu da equipe:** Membros → editar → desative. As sessões são encerradas na hora; tarefas e histórico permanecem.

## Fluxo de caixa (Financeiro → Entradas e saídas)

- **Primeiro uso:** um administrador define o **saldo inicial** (quanto havia na conta antes do primeiro lançamento). Pode ser negativo.
- **Lançamentos:** "+ Entrada" e "+ Saída". Desligue "Já foi pago/recebido?" para registrar contas previstas; elas não mudam o saldo até serem marcadas como pagas/recebidas.
- **Cobranças pagas** entram sozinhas como entrada (categoria "Recebimento de cliente"). Para corrigir uma delas, edite a cobrança em Recebimentos.
- **Conferência mensal:** compare o "Saldo em conta" com o extrato do banco. Se divergir, procure lançamentos com data errada ou ainda marcados como previstos; ajuste o saldo inicial apenas se o erro for anterior aos lançamentos registrados.
- Mesma permissão do restante do financeiro: administradores e gestores com acesso financeiro. Saldo inicial: só administradores.

## Convites

- Validade de 7 dias, uso único. "Reenviar" gera um novo link e invalida o anterior (máx. 3 reenvios/hora por convite).
- Se o Resend falhar ou não estiver configurado, o link aparece na tela para envio manual e o erro fica registrado no convite.

## Backup

**Banco (essencial).** Use o backup automático do provedor (Neon: *point-in-time restore*; Supabase: backups diários + PITR no plano pago). Além disso, um dump lógico semanal fora do provedor:

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > kroma-$(date +%F).dump
# restaurar em um banco vazio:
pg_restore --no-owner --dbname "$DATABASE_URL_NOVO" kroma-AAAA-MM-DD.dump
```

**Arquivos.** O R2 é durável, mas não protege contra exclusão. Para cópia externa, use `rclone sync r2:kroma-files backup:kroma-files` periodicamente. Os nomes dos objetos são as chaves guardadas em `FileAsset.storageKey`.

Teste a restauração ao menos uma vez por trimestre.

## Atualizações

```bash
git pull
npm ci
npm run db:migrate      # aplica migrations novas
npm run typecheck && npm run lint && npm test
npm run build
```

Na Vercel, rode `npm run db:migrate` antes de promover o deploy (ou como etapa do CI) quando houver migration nova.

## Diagnóstico

- **Upload trava em 0% ou falha com erro de rede:** CORS do bucket não inclui o domínio do app (ver DEPLOYMENT.md §2.4).
- **"O conteúdo do arquivo não corresponde à extensão":** o arquivo foi renomeado ou está corrompido; exporte novamente no formato correto.
- **Vídeo MOV não toca:** o codec (geralmente HEVC/ProRes) não é suportado pelo navegador. O sistema oferece download; para preview, exporte em MP4 (H.264).
- **E-mail de convite não chega:** veja o erro no convite (Membros → convites pendentes). Confira domínio verificado e `RESEND_FROM_EMAIL` usando esse domínio.
- **Prisma Studio:** `npm run db:studio` para inspecionar dados (use com cuidado em produção).

## Importação de extratos (Entradas e saídas)

- O PDF anexado em **Extratos do mês** é lido pelo servidor (posição do texto na página, sem IA e sem enviar o arquivo a terceiros). A prévia mostra as movimentações, a categoria sugerida e confere a soma com os "Total de entradas/saídas" impressos.
- Só entram as linhas marcadas, como lançamentos **realizados**. Data, valor e tipo vêm sempre da releitura do PDF no servidor.
- Cada movimentação tem uma chave (`CashEntry.importKey`); reimportar o mesmo extrato ou outro com período sobreposto não duplica. Lançamentos manuais com mesma data, tipo e valor aparecem como "possível duplicado" e começam desmarcados.
- Testado com o relatório de movimentações do InfinitePay e com o formato clássico `dd/mm … 1.234,56 D/C`. Extratos escaneados (imagem) não têm texto e precisam ser lançados à mão.

## Avisos de evento

Quem é adicionado a um evento recebe notificação na plataforma e, se houver e-mail configurado (SMTP ou Resend), um e-mail com o arquivo `.ics`. Quem criou o evento e quem já estava nele não recebem de novo.

