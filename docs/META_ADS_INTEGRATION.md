# Meta Ads: configuração e uso

O módulo **Anúncios** mostra, dentro do KROMA OS, o desempenho das contas de anúncios da Meta de cada cliente. É **somente leitura**: nada é editado na Meta.

## 1. Configurar o app na Meta

1. Em [developers.facebook.com](https://developers.facebook.com/apps), abra o app (ID em `META_APP_ID`).
2. Adicione o produto **Login do Facebook** (ou Login do Facebook para Empresas).
3. Em *Configurações do Login*, cadastre o **URI de redirecionamento OAuth válido**:
   `https://SEU-DOMINIO/api/integrations/meta/callback`
   (produção atual: `https://kroma-os.vercel.app/api/integrations/meta/callback`).
   A tela *Configurações → Integrações → Meta Ads* mostra o valor exato com botão de copiar.
4. Em *Configurações básicas*, adicione o domínio do KROMA OS em *Domínios do app*.
5. Permissão usada: **`ads_read`**. `ads_management` não é pedida (não há edição). `business_management` não é necessária: `ads_read` já lista as contas a que o usuário tem acesso, inclusive as do Gerenciador de Negócios.
6. **Modo de desenvolvimento**: só pessoas com função no app (admin, desenvolvedor, testador) conseguem autorizar. Para contas de terceiros em modo ativo, a Meta exige **acesso avançado** a `ads_read` (revisão do app e verificação da empresa).
7. Se o app usar *Login do Facebook para Empresas* com "configuração", defina `META_LOGIN_CONFIG_ID`; o diálogo passa a usar `config_id` em vez de `scope`.

## 2. Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `META_APP_ID` | sim | ID do app |
| `META_APP_SECRET` | sim | Segredo do app (troca de código, `appsecret_proof`, `debug_token`). Nunca no código nem no navegador |
| `META_TOKEN_ENCRYPTION_KEY` | sim | Chave (32+ caracteres) para cifrar os tokens no banco. Gere com `openssl rand -base64 48` |
| `META_GRAPH_API_VERSION` | não | Padrão `v26.0` (versão estável verificada em 30/10/2026) |
| `META_OAUTH_REDIRECT_URI` | não | Padrão `APP_URL/api/integrations/meta/callback` |
| `META_LOGIN_CONFIG_ID` | não | Login for Business |
| `META_INITIAL_AD_ACCOUNT_ID` | não | Conta destacada na tela de integração (aceita com ou sem `act_`) |
| `META_SYNC_CRON_SECRET` | não | Bearer para um agendador externo chamar a sincronização |
| `META_WEBHOOK_VERIFY_TOKEN` | não | Reservado; webhooks não são usados nesta versão |

> Trocar `META_TOKEN_ENCRYPTION_KEY` invalida os tokens guardados: reconecte a Meta depois.

## 3. Conectar e vincular

1. Administrador abre **Configurações → Integrações · Meta Ads** e clica em **Conectar Meta Ads**.
2. Autoriza na Meta. O KROMA OS valida o `state`, troca o código por um token de longa duração (~60 dias), confere app e permissões no `debug_token` e lista as contas acessíveis.
3. Em **Contas de anúncios**, escolha o cliente de cada conta. Quando o nome é parecido, aparece o atalho "Vincular a …". O cliente não é criado automaticamente: se não existir, cadastre em **Clientes** antes.
4. Ao vincular, a primeira sincronização (90 dias) começa em segundo plano.

Conta inicial prevista: **Studio da Beleza Rita**, `act_1455371035858511`.

## 4. Telas

- **Anúncios → Visão geral**: investimento total (por moeda), campanhas ativas, impressões, cliques no link, leads, conversas iniciadas, evolução do investimento e participação por cliente.
- **Anúncios → Cliente** (`/anuncios/clientes/[clientId]`): 10 indicadores com comparação com o período anterior, gráfico de evolução com seletor de métrica, distribuição do investimento e desempenho por campanha.
- **Campanhas**, **Conjuntos** e **Criativos** (galeria com filtro "Em veiculação", ranking e prévia).

Períodos: Hoje, Ontem, Últimos 7/14/30 dias (terminando ontem, como no Gerenciador), Este mês, Mês anterior e intervalo personalizado, sempre no fuso da conta de anúncios.

## 5. Permissões no KROMA OS

| Perfil | O que pode |
|---|---|
| Administrador | Conectar, desconectar, vincular contas, sincronizar e ver tudo |
| Gestor | Ver todos os clientes com conta vinculada (sem sincronização manual) |
| Membro | Ver só os clientes aos quais está vinculado |

Tudo é verificado no servidor; trocar o ID na URL devolve 404.

## 6. Limitações conhecidas

- O token de usuário dura ~60 dias e **não pode ser renovado sem novo login**; a tela avisa 7 dias antes. Para não expirar, use um token de *usuário do sistema* do Gerenciador de Negócios (fluxo futuro).
- **Alcance** e **frequência** só são exatos para o período inteiro: o KROMA OS consulta a Meta sob demanda (cache de 30 min). Com várias contas selecionadas, o alcance não é somado.
- Vídeos: a API não entrega o arquivo para este uso; a galeria mostra a miniatura e o link da prévia oficial.
- URLs de miniaturas da Meta expiram; são renovadas a cada sincronização.
- Campanhas arquivadas que tiveram gasto aparecem pelo nome registrado nas métricas.
- ROAS só aparece quando a Meta atribui valor de compra.
