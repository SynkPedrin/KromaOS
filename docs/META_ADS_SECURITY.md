# Meta Ads: segurança

- **App Secret** só em variável de ambiente do servidor. Nunca no código, no navegador ou em logs. Se um segredo foi compartilhado fora de um gerenciador (chat, e-mail), considere-o comprometido: gere outro em *Configurações básicas → Chave secreta do app → Redefinir* e atualize `META_APP_SECRET`.
- **Tokens de acesso** ficam cifrados com AES-256-GCM (`v1:iv:tag:dados`, com AAD), chave derivada de `META_TOKEN_ENCRYPTION_KEY`. O navegador nunca recebe tokens.
- Toda chamada com token de usuário leva **`appsecret_proof`** (HMAC-SHA256 do token com o App Secret). Pode-se ativar "Exigir prova da chave secreta do app" no painel da Meta.
- **OAuth**: `state` aleatório; um cookie httpOnly (`/api/integrations/meta`, 10 min) guarda `HMAC(AUTH_SECRET, state + cookie de sessão)`. O callback só aceita o mesmo state, na mesma sessão, de um administrador. Erros da Meta viram mensagens genéricas.
- O token é validado no `debug_token` (app correto, válido, `ads_read` concedida). Sem `ads_read` a conexão fica como "Permissões insuficientes".
- Logs registram apenas caminho, tipo e código do erro (`[meta] GET act_…/insights falhou: rate_limit code=17`), nunca URLs com parâmetros.
- **Autorização**: conectar, vincular, desconectar e sincronizar manualmente exigem administrador (verificado no servidor). Leitura respeita `clientScope`: membros só veem clientes vinculados.
- Endpoints de agendamento exigem `Authorization: Bearer CRON_SECRET` (Vercel Cron) ou `META_SYNC_CRON_SECRET`; comparação em tempo constante.
- Sincronização manual tem limite de 12 por 10 minutos por usuário.
- Desconectar apaga o token local e tenta revogar as permissões na Meta (`DELETE /me/permissions`).
- CSP: imagens apenas de `*.fbcdn.net` e `*.cdninstagram.com` além das origens já existentes.
