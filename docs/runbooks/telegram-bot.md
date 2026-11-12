# Runbook: bot de moderação do Telegram

O bot modera o grupo VIP da Secretfans: aprova entradas, apaga links proibidos, aplica advertências e recebe denúncias.

Pré-requisitos no site:

- Moderadores precisam do papel `moderator` ou `super_admin` no site, ser admins do grupo **e** ter vinculado o Telegram na conta.
- O cartão "Grupo VIP" em `/conta/perfil` só aparece quando as **quatro** variáveis `TELEGRAM_*` estão definidas. Uma variável malformada desliga só o bot (o resto do site segue no ar) e o log mostra `[telegram] variáveis de ambiente inválidas`, com os nomes delas (nunca os valores).
- As configurações do bot ficam em Super Admin › Configurações (somente `super_admin`).
- O cron `/api/cron/telegram` roda diariamente (`vercel.json`, 09:30 UTC) e exige `CRON_SECRET` configurado na Vercel.

## 1. Criar o bot no @BotFather

1. Converse com o @BotFather e envie `/newbot`. Anote o username (`TELEGRAM_BOT_USERNAME`, sem `@`).
2. Envie `/setprivacy`, escolha o bot e selecione **Disable**, para o bot ler as mensagens do grupo.

## 2. Gerar o segredo do webhook

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

O resultado é o `TELEGRAM_WEBHOOK_SECRET`.

## 3. Cadastrar as variáveis

Cadastre `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` e `TELEGRAM_GROUP_ID` na Vercel (Production e Preview do HML) e no `.env.local`.

**Não cole o token em chat nem em commit.** Se vazar, revogue com `/revoke` no @BotFather e atualize as variáveis.

## 4. Adicionar o bot ao grupo como admin

Torne o bot administrador, **somente** com estas permissões:

- apagar mensagens
- banir usuários
- restringir membros
- convidar via link

## 5. Configurar o grupo

1. Em "Tipo de grupo", ative "Aprovar novos membros".
2. Torne o grupo um supergrupo **privado**.

## 6. Obter o TELEGRAM_GROUP_ID

- Encaminhe uma mensagem do grupo para o @RawDataBot; ou
- Leia `getUpdates` **antes** de ativar o webhook (depois dele, `getUpdates` deixa de funcionar).

O ID de supergrupo começa com `-100`.

## 7. Registrar o webhook

```bash
npx tsx scripts/telegram-setup.ts
```

O script carrega `.env.local`, chama `setWebhook` (com `allowed_updates` = `message`, `edited_message`, `chat_join_request` e `chat_member`; o `chat_member` só chega se for pedido explicitamente) e `setMyCommands` (escopo padrão e `all_chat_administrators`) e imprime `getWebhookInfo` sem o token. O Telegram exige https: rode com `NEXT_PUBLIC_SITE_URL` apontando para a URL da Vercel, não `localhost`. Sem variáveis, o script sai com código 1 listando as que faltam.

## 8. Membros antigos e outros links de convite

A varredura diária só avalia quem tem linha em `telegram_members`. A linha nasce quando a pessoa entra pelo fluxo do bot, quando entra por qualquer meio enquanto o bot já é admin (update `chat_member`) ou quando ela **fala** no grupo (mensagem ou edição).

- **Membros que já estavam no grupo antes do bot e nunca falam não são detectados** pela varredura. Se o grupo já existia, revise a lista de membros manualmente uma vez e remova quem não tiver conta ativa vinculada.
- **Revogue todos os outros links de convite** do grupo (Configurações do grupo › Links de convite) e mantenha "Aprovar novos membros" ligado: só o link gerado pelo bot passa pela aprovação com checagem de vínculo.

## 9. Roteiro de teste (grupo e bot de teste)

Use um grupo e um bot **de teste**, nunca os de produção.

1. Vincule sua conta em `/conta/perfil` (cartão "Grupo VIP").
2. Entre no grupo e confirme a aprovação do pedido.
3. Envie um link proibido 3 vezes e confirme apagamento e advertências.
4. Como moderador, responda a uma mensagem com `/banir`; confirme o banimento.
5. Como membro, responda a uma mensagem com `/denunciar`.
6. Confira o registro de auditoria e a fila de denúncias no painel.

## 10. Aviso sobre idade

A autodeclaração de +18 **não é verificação real de idade**. Não trate o grupo como conteúdo com idade comprovada.
