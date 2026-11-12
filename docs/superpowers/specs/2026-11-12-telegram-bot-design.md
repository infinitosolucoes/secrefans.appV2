# Bot do Telegram Secretfans — Design (Fase 1)

Data: 2026-11-12 · Status: aprovado em conversa, aguardando revisão da spec

## 1. Objetivo

Integrar o bot próprio do Secretfans ao site para moderar o grupo **Secretfans VIP** no Telegram, com acesso restrito a **fãs que têm conta no site**. O bot é operado pelo código do próprio app e se reporta ao painel Super Admin.

### Decisões tomadas

| Tema | Decisão |
|---|---|
| Quem entra no grupo | Só fãs com conta ativa no site e vínculo Telegram ↔ conta (opção B) |
| Maioridade | Reaproveita a autodeclaração +18 do site (consentimento `age_18`). Continua sendo **autodeclaração, não verificação real de idade** |
| Escopo da Fase 1 | Vínculo e entrada controlada, boas-vindas e regras, antispam, punições, denúncias na fila do Super Admin |
| Fora da Fase 1 | Relatórios e painel de métricas do grupo, detecção de conteúdo vazado ("proteção"), divulgação automática de criadoras e campanhas, grupos por criadora |
| Arquitetura | Webhook numa rota Next.js na Vercel (`/api/webhooks/telegram`), sem servidor separado e sem biblioteca de bot (só `fetch` na Bot API) |

### Critérios de sucesso

1. Fã logado em `/conta` clica em "Entrar no grupo VIP", vincula o Telegram pelo bot e tem o pedido de entrada aprovado automaticamente.
2. Pedido de entrada de quem não tem vínculo, tem conta inativa ou está banido do grupo é recusado.
3. Conta suspensa ou excluída no site é removida do grupo.
4. Links e convites não permitidos são apagados automaticamente e geram advertência, com silenciamento automático na 3ª advertência.
5. Moderadores punem pelo grupo com comandos, e toda punição aparece em `admin_audit_logs`.
6. `/denunciar` cria uma denúncia na fila existente do Super Admin, que pode ser decidida com ações no Telegram.

## 2. Arquitetura

```
Telegram ──update──▶ POST /api/webhooks/telegram (Next.js, Vercel gru1)
                         │  valida X-Telegram-Bot-Api-Secret-Token
                         │  deduplica update_id
                         ▼
                   src/server/telegram/
                     handler.ts      → roteia o update (mensagem, comando, pedido de entrada, entrada/saída)
                     commands.ts     → parser de comandos (puro)
                     antispam.ts     → regras de spam (puro)
                     punishments.ts  → escalada de advertências e punições (lógica pura + efeitos)
                     client.ts       → cliente fino da Bot API (fetch)
                     repo.ts         → leitura e escrita no Supabase (service role)
                         │
                         ▼
                   Supabase: telegram_* + reports + admin_audit_logs + notificações

Site (/conta, Super Admin) ──server actions──▶ src/server/telegram/* ──▶ Bot API
```

Cada unidade tem uma responsabilidade. `commands.ts`, `antispam.ts` e a escalada em `punishments.ts` não fazem I/O e são testáveis isoladamente. `client.ts` é a única porta para a rede e é substituída por um dublê nos testes.

### Variáveis de ambiente (opcionais, validadas em `src/lib/env.server.ts`)

- `TELEGRAM_BOT_TOKEN`: token do @BotFather. **Nunca vai para o repositório nem para o chat.**
- `TELEGRAM_WEBHOOK_SECRET`: segredo enviado pelo Telegram no header `X-Telegram-Bot-Api-Secret-Token`.
- `TELEGRAM_BOT_USERNAME`: usado para montar `t.me/<bot>?start=<código>`.
- `TELEGRAM_GROUP_ID`: id numérico do grupo VIP.

Se alguma estiver ausente, o bot fica desligado: a rota responde 404 e o botão "Entrar no grupo VIP" não aparece.

### Script operacional

`scripts/telegram-setup.ts` (rodado com `tsx`) chama `setWebhook` (URL, `secret_token`, `allowed_updates`), `setMyCommands` e mostra `getWebhookInfo`. Um runbook em `docs/runbooks/telegram-bot.md` descreve o passo a passo: criar o bot, colocá-lo como admin do grupo com as permissões mínimas (apagar mensagens, banir, restringir, convidar via link e aprovar pedidos), ativar "Aprovar novos membros" no grupo e cadastrar as variáveis na Vercel.

## 3. Modelo de dados (migration nova)

### `telegram_links`
| coluna | tipo | nota |
|---|---|---|
| `user_id` | uuid PK → auth.users, on delete cascade | |
| `telegram_user_id` | bigint unique not null | |
| `telegram_username` | text null | atualizado a cada interação |
| `linked_at` | timestamptz default now() | |

RLS: o fã lê e apaga só a própria linha. Inserção apenas via service role (pelo bot).

### `telegram_link_codes`
| coluna | tipo | nota |
|---|---|---|
| `code` | text PK | 32 caracteres aleatórios, url-safe |
| `user_id` | uuid → auth.users | |
| `expires_at` | timestamptz | criação + 15 min |
| `used_at` | timestamptz null | uso único |

Gerado por server action do fã autenticado, que só gera se houver consentimento `age_18` registrado e a conta estiver `active`. Sem acesso direto pelo cliente.

### `telegram_members`
| coluna | tipo | nota |
|---|---|---|
| `telegram_user_id` | bigint PK | |
| `status` | text check in (`member`,`muted`,`banned`,`left`) | |
| `warnings` | int default 0 | zera ao fim de um silenciamento automático |
| `muted_until` | timestamptz null | |
| `last_action_by` | uuid null → auth.users | null = sistema |
| `updated_at` | timestamptz | |

Sem chave para `telegram_links`, porque um usuário banido pode ter desvinculado. Leitura só para quem tem `reports.read`.

### `telegram_settings` (linha única)
- `rules_text` (text), `welcome_text` (text)
- `allowed_domains` (text[]), inicialmente o domínio do site
- `warn_limit` (int, padrão 3), `auto_mute_hours` (int, padrão 24)
- `flood_repeat_limit` (int, padrão 3), `flood_window_seconds` (int, padrão 60)

Editável em Super Admin › Configurações por quem tem `settings.manage`.

### `telegram_updates_seen`
`update_id` bigint PK, `seen_at` timestamptz. Serve para deduplicar. Linhas com mais de 7 dias são apagadas pelo cron diário existente.

### `telegram_recent_messages` (antiflood)
`telegram_user_id`, `text_hash`, `sent_at`, com índice em (`telegram_user_id`, `sent_at`). Guarda só o hash, nunca o texto. Linhas com mais de 1 hora são removidas no próprio handler.

### Denúncias
- `alter type public.report_target add value if not exists 'telegram_message';`
- Tabela `telegram_reported_messages`: `report_id` (PK → reports), `chat_id`, `message_id`, `author_telegram_user_id`, `author_user_id` (null se não vinculado), `text` (até 4096 caracteres) e `has_media` (bool). Necessária porque a Bot API não permite buscar a mensagem depois. O `target_id` da denúncia aponta para essa linha.
- O denunciante (`reporter_id`) é o `user_id` vinculado de quem enviou `/denunciar`. Quem não tem vínculo não consegue denunciar, o que não deve acontecer no grupo, já que só entram vinculados.

## 4. Fluxos

### 4.1 Vínculo e entrada
1. Em `/conta`, o fã autenticado vê o cartão "Grupo VIP no Telegram": **Entrar no grupo VIP** (sem vínculo) ou **Vinculado como @user · Desvincular**.
2. O clique gera um `telegram_link_codes` e redireciona para `https://t.me/<bot>?start=<code>`.
3. O bot recebe `/start <code>` no privado. Se o código for válido, não usado, não expirado e a conta estiver ativa, ele cria ou atualiza `telegram_links` e marca o código como usado. Se o `telegram_user_id` já estiver ligado a outra conta, o vínculo é recusado com uma mensagem orientando o fã.
4. O bot responde com o texto de regras e um link de convite com `creates_join_request = true`.
5. `chat_join_request`: aprova (`approveChatJoinRequest`) se houver vínculo, a conta estiver `active` e o status em `telegram_members` não for `banned`. Senão recusa (`declineChatJoinRequest`) e, quando possível, avisa no privado com o link do site.
6. Na entrada (`chat_member` → member), o bot cria ou atualiza `telegram_members` e envia a `welcome_text` no grupo, citando o nome. A boas-vindas anterior é apagada para não poluir o grupo.
7. Ao desvincular no site, a pessoa é removida do grupo (`banChatMember` seguido de `unbanChatMember`, ou seja, sai sem ficar banida) e o status passa a `left`.

### 4.2 Conta suspensa ou excluída no site
O ponto do código que suspende ou exclui a conta (ação do Super Admin) chama `telegram.removeUserFromGroup(user_id, motivo)`: remove do grupo e grava `banned` com auditoria. Exclusão de conta apaga o vínculo por cascata, mas `telegram_members` mantém o `banned`.

### 4.3 Antispam (toda mensagem no grupo de quem não é admin do grupo)
Apaga a mensagem quando ela tiver:
- link (entidades `url` e `text_link`) com domínio fora de `allowed_domains`;
- convite do Telegram (`t.me/+…`, `t.me/joinchat/…`, `telegram.me/…`) ou menção a canal ou grupo externo via link;
- encaminhamento de canal (`forward_origin.type = channel`);
- o mesmo `text_hash` repetido `flood_repeat_limit` vezes dentro de `flood_window_seconds`.

Cada exclusão soma uma advertência automática. Ao atingir `warn_limit`: `restrictChatMember` por `auto_mute_hours`, status `muted` e advertências zeradas. Tudo vai para a auditoria com o ator "sistema" (`actor_id` null, `metadata.source = 'telegram_bot'`).

### 4.4 Comandos de moderação
Válidos só no grupo e só **respondendo** à mensagem do alvo. O autor precisa ser admin do grupo **e** ter vínculo com uma conta que tenha `reports.decide` (papéis `moderator` ou `super_admin`). Se não tiver, o comando é apagado em silêncio.

| Comando | Efeito |
|---|---|
| `/advertir [motivo]` | +1 advertência (aplica a mesma escalada automática) |
| `/silenciar <1h\|24h\|7d> [motivo]` | `restrictChatMember` até o prazo, status `muted` |
| `/banir [motivo]` | `banChatMember`, status `banned` (bloqueia a reentrada) |
| `/desbanir` | `unbanChatMember` com `only_if_banned`, status `left` (pode pedir entrada de novo) |

O comando é apagado do grupo depois de executado. O bot confirma com uma mensagem curta que se apaga em 30 segundos. Toda execução grava em `admin_audit_logs` (`action` = `telegram.warn|mute|ban|unban`, `target_type` = `telegram_user`, `target_id` = id do Telegram, `reason`, `metadata` com o vínculo). Punições no grupo **não** alteram o status da conta no site.

### 4.5 Denúncias
1. O membro responde a uma mensagem com `/denunciar [motivo]`. O motivo aceita as chaves existentes (`menor_de_idade`, `nao_consensual`, `violencia`, `assedio`, `spam`, `direitos_autorais`, `outro`) e apelidos simples ("menor", "spam", …). Sem motivo, o padrão é `outro`.
2. O bot apaga o comando no grupo, grava `telegram_reported_messages` e `reports` (`target_type = telegram_message`) e confirma no privado. Se o bot não conseguir escrever no privado (o usuário nunca abriu conversa), a confirmação é omitida.
3. Motivos `menor_de_idade` e `nao_consensual` geram notificação imediata para quem tem `reports.decide`, pelo módulo de notificações existente.
4. Em Super Admin › Denúncias, a denúncia mostra o texto e o autor da mensagem. A decisão ganha ações opcionais: **apagar mensagem**, **silenciar 24h** e **banir do grupo**, executadas pela Bot API. Se a chamada falhar, o erro aparece no formulário e a denúncia não é encerrada.

## 5. Erros e segurança

- O header `X-Telegram-Bot-Api-Secret-Token` é conferido em tempo constante. Se divergir, a rota responde 401.
- Updates de chats que não sejam o grupo configurado ou o privado com o bot são ignorados (200).
- Deduplicação por `update_id`: se já estiver em `telegram_updates_seen`, responde 200 sem processar.
- Falha da Bot API ou do banco dentro do handler: o erro é logado e a rota responde 200. O Telegram reenviaria o update e repetiria efeitos parciais, então evitamos o reenvio. Ações vindas do painel propagam o erro para a UI.
- Respeito a `429 retry_after`: uma nova tentativa só se a espera for de até 2 s; acima disso, desiste e registra.
- O token nunca aparece em logs. O cliente redige a URL nas mensagens de erro.
- O bot nunca publica dados de conta (e-mail, nome real) no grupo.
- O bot recebe só as permissões de admin necessárias (seção 2).

## 6. Mudanças na UI

- `/conta`: cartão "Grupo VIP no Telegram" (entrar, estado do vínculo, desvincular).
- Super Admin › Configurações: seção "Bot do Telegram" com regras, boas-vindas, domínios permitidos e limites.
- Super Admin › Denúncias: tipo `telegram_message` na lista e no detalhe, com as ações no Telegram no `ReportDecisionForm`.

## 7. Testes

- **Vitest (puro):** parser de comandos (prazos, motivos, apelidos, comando sem resposta), detecção de spam (domínios permitidos e bloqueados, convites, encaminhamento de canal, flood), escalada de advertências.
- **Vitest (handler):** updates de exemplo (`/start` válido, expirado ou reutilizado; pedido de entrada aprovado ou recusado; `/banir` por moderador e por não moderador; `/denunciar`), com `client.ts` e `repo.ts` substituídos por dublês.
- **Rota:** 401 com segredo errado, 404 com o bot desligado, 200 ao reenviar o mesmo `update_id`.
- **Banco (`supabase test db`):** RLS de `telegram_links` (o fã só vê o próprio vínculo), `telegram_link_codes` e `telegram_members` inacessíveis ao cliente comum, e o novo valor de `report_target`.
- **Manual (runbook):** em um grupo de teste com um bot de teste, percorrer o fluxo completo antes de apontar para o grupo VIP real.

## 8. Fora de escopo (fases futuras)

- Relatórios de atividade do grupo no Super Admin.
- Detecção de conteúdo das criadoras vazado no grupo, com revisão humana.
- Divulgação automática de criadoras e campanhas.
- Grupos por criadora e grupos exclusivos para assinantes pagantes.
- Verificação real de idade (documento ou serviço terceiro) como requisito de entrada.
