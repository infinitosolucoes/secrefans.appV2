# Bot do Telegram (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot próprio que modera o grupo Secretfans VIP: entrada só para fãs com conta vinculada, boas-vindas, antispam, punições e denúncias na fila do Super Admin.

**Architecture:** O Telegram envia updates para `POST /api/webhooks/telegram` (Next.js na Vercel). A lógica fica em `src/server/telegram/`: módulos puros (comandos, antispam, escalada), um cliente fino da Bot API via `fetch` e um repositório Supabase com service role. Escritas sensíveis (vínculo, denúncia, auditoria com ator explícito) passam por RPCs `security definer` executáveis só pela `service_role`.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase Postgres + pgTAP, zod 4, Vitest. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-11-12-telegram-bot-design.md`

## Global Constraints

- Nenhuma dependência npm nova; a Bot API é chamada com `fetch` em `https://api.telegram.org/bot<TOKEN>/<method>`.
- Variáveis opcionais: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_GROUP_ID`. Sem as quatro, o bot fica desligado (rota 404, cartão oculto em `/conta`).
- O token nunca aparece em logs, erros ou respostas.
- Código de vínculo: 32 caracteres `[A-Za-z0-9_-]`, validade de 15 min, uso único.
- Padrões: `warn_limit` 3, `auto_mute_hours` 24, `flood_repeat_limit` 3, `flood_window_seconds` 60; prazos de `/silenciar`: `1h`, `24h` e `7d`.
- Motivos de denúncia: `nao_consensual`, `menor_de_idade`, `violencia`, `assedio`, `spam`, `direitos_autorais`, `outro`. Os dois primeiros notificam os moderadores na hora.
- A conta no site usa `account_status` (`active`, `blocked`, `deleted`). "Suspensa" na spec = `blocked`.
- Textos da UI e do bot em pt-BR. Commits no padrão `feat(telegram): …` com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Webhook: segredo errado → 401; bot desligado → 404; qualquer erro interno após autenticar → 200 (e log).

## Review Focus

1. **Updates reenviados pelo Telegram** (mesmo `update_id`): nada pode ser aplicado duas vezes (advertência, denúncia). Teste na Task 5.
2. **Comando de moderação sem responder a uma mensagem, ou respondendo a um admin/ao próprio bot:** o bot não pune ninguém e apaga o comando. Teste na Task 4.
3. **Mensagens sem texto (foto com legenda, sticker, entrada de serviço):** o antispam lê `caption`/`caption_entities` e não quebra quando `text` está ausente. Teste na Task 3.
4. **Telegram já vinculado a outra conta ou código reutilizado/expirado:** o vínculo é recusado com mensagem clara e não sobrescreve o vínculo existente. Teste na Task 1 (SQL) e na Task 4.
5. **Membro que sai do site (conta bloqueada ou excluída) continua no grupo:** a varredura diária remove a pessoa. Teste na Task 6.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261114000001_telegram.sql` | Tabelas, RLS, enum, kind de notificação, RPCs |
| `supabase/tests/telegram.test.sql` | pgTAP de RLS e RPCs |
| `src/lib/env.server.ts` (mod.) | Variáveis do Telegram |
| `src/server/telegram/config.ts` | `telegramConfig()`: config ou `null` se desligado |
| `src/server/telegram/types.ts` | Tipos mínimos de Update/Message/ChatJoinRequest/ChatMemberUpdated |
| `src/server/telegram/client.ts` | Cliente da Bot API (fetch, 429, redação do token) |
| `src/server/telegram/commands.ts` | Parser de comandos (puro) |
| `src/server/telegram/antispam.ts` | Detecção de spam (puro) |
| `src/server/telegram/punishments.ts` | Escalada de advertências (puro) + aplicação |
| `src/server/telegram/repo.ts` | Acesso ao Supabase (service role) |
| `src/server/telegram/handler.ts` | Roteia um Update |
| `src/server/telegram/group.ts` | Ações chamadas pelo site (remover, silenciar, apagar mensagem) |
| `src/app/api/webhooks/telegram/route.ts` | Rota do webhook |
| `src/app/api/cron/telegram/route.ts` | Varredura diária + limpeza |
| `src/features/telegram/actions.ts`, `TelegramCard.tsx` | Cartão em `/conta/perfil` |
| `src/features/super-admin/TelegramSettingsForm.tsx`, `telegram-actions.ts` | Configurações do bot |
| `src/features/super-admin/reports.ts`, `ReportDecisionForm.tsx` (mod.) | Ações no Telegram ao decidir |
| `scripts/telegram-setup.ts`, `docs/runbooks/telegram-bot.md`, `vercel.json` (mod.) | Operação |
| `tests/unit/telegram-*.test.ts` | Testes Vitest |

---

### Task 1: Migration e testes de banco

**Files:**
- Create: `supabase/migrations/20261114000001_telegram.sql`
- Create: `supabase/tests/telegram.test.sql`
- Modify: `src/types/database.ts` (regenerado)

**Interfaces:**
- Produces (tabelas): `telegram_links(user_id uuid pk, telegram_user_id bigint unique, telegram_username text, linked_at)`, `telegram_link_codes(code text pk, user_id, expires_at, used_at)`, `telegram_members(telegram_user_id bigint pk, status text check in ('member','muted','banned','left'), warnings int default 0, muted_until, last_action_by uuid, updated_at)`, `telegram_settings(id boolean pk default true check (id), rules_text, welcome_text, allowed_domains text[], warn_limit int default 3, auto_mute_hours int default 24, flood_repeat_limit int default 3, flood_window_seconds int default 60, updated_by, updated_at)` com uma linha inicial (`allowed_domains = '{secretfans.app.br}'`), `telegram_updates_seen(update_id bigint pk, seen_at)`, `telegram_recent_messages(id bigint identity pk, telegram_user_id bigint, text_hash text, sent_at)`, `telegram_pending_deletes(chat_id bigint, message_id bigint, delete_after timestamptz, primary key (chat_id, message_id))`, `telegram_reported_messages(id uuid pk default gen_random_uuid(), chat_id bigint, message_id bigint, author_telegram_user_id bigint, author_user_id uuid null, text text check (char_length(text) <= 4096), has_media boolean, created_at)`.
- Produces (enum/check): `report_target` + `'telegram_message'`; `notifications_kind` + `'report_urgent'`.
- Produces (RPCs, `security definer`, `grant execute … to service_role` apenas, `revoke … from public, authenticated, anon`):
  - `public.telegram_create_link_code(p_user uuid) returns text`: exige `profiles.status = 'active'` e `consent_records` com `age_18` e `granted` (senão `42501`); apaga códigos não usados do usuário e devolve um novo de 32 caracteres (`encode(gen_random_bytes(24),'base64')` com `+/=` trocados para `-_` e cortado em 32).
  - `public.telegram_consume_link_code(p_code text, p_telegram_user_id bigint, p_username text) returns uuid`: devolve o `user_id`. Erros: `P0002` código inexistente/usado/expirado; `23505` Telegram já ligado a **outro** usuário; `42501` conta não ativa. Faz upsert por `user_id` e marca `used_at`.
  - `public.telegram_user_for(p_telegram_user_id bigint) returns table(user_id uuid, status public.account_status, can_moderate boolean)`: `can_moderate` = existe papel do usuário com `reports.decide`.
  - `public.telegram_log_action(p_actor uuid, p_action text, p_target text, p_reason text, p_metadata jsonb) returns void`: insere em `admin_audit_logs` com `target_type = 'telegram_user'` e `metadata || {"source":"telegram_bot"}`.
  - `public.telegram_create_report(p_reporter uuid, p_reason text, p_details text, p_chat_id bigint, p_message_id bigint, p_author_tg bigint, p_text text, p_has_media boolean) returns uuid`: grava `telegram_reported_messages` e `reports(target_type='telegram_message', target_id = id da linha)`. Se o motivo for `menor_de_idade` ou `nao_consensual`, chama `private.notify(u, 'report_urgent', 'Denúncia urgente no grupo VIP', <motivo>, '/super-admin/denuncias')` para cada usuário com `reports.decide`. Uma denúncia aberta repetida pelo mesmo usuário para a mesma mensagem devolve o id existente.
- RLS: `telegram_links` select/delete `user_id = auth.uid()`; `telegram_members` e `telegram_reported_messages` select para `public.staff_can('reports.read')`; `telegram_settings` select para `staff_can('settings.manage')` e update para `staff_can('settings.manage')`; as demais tabelas ficam sem policies (só service role).

- [ ] **Step 1: Escrever `supabase/tests/telegram.test.sql`** no estilo de `notifications.test.sql` (helpers `pg_temp.as_user` e `as_service`; usuários do seed: fã `…001`, moderador `…003`). Asserções:
  - O fã não lê a linha de vínculo de outro usuário, e `select count(*) from telegram_link_codes` como fã falha (`42501`).
  - `telegram_create_link_code` como `authenticated` → `42501`; como service, para o fã sem consentimento `age_18` → `42501`; com consentimento → texto de 32 caracteres.
  - `telegram_consume_link_code` do código válido devolve o uuid do fã; repetir com o mesmo código → `P0002`; código novo de outro usuário com o mesmo `telegram_user_id` → `23505`.
  - `telegram_user_for` do moderador vinculado → `can_moderate = true`; do fã → `false`.
  - `telegram_create_report` com `menor_de_idade` cria 1 linha em `reports` com `target_type = 'telegram_message'` e 1 notificação `report_urgent` para o moderador.
  - `telegram_log_action` cria 1 linha em `admin_audit_logs` com `metadata->>'source' = 'telegram_bot'`.
- [ ] **Step 2:** `npm run db:reset && npm run db:test`. Esperado: FAIL em `telegram.test.sql` (funções inexistentes).
- [ ] **Step 3:** Escrever a migration conforme as Interfaces. O `alter type … add value` fica num bloco próprio no início do arquivo, como em `20261113000001_chat.sql`. O check de `notifications_kind` é recriado (drop e add) com a lista atual + `'report_urgent'`.
- [ ] **Step 4:** `npm run db:reset && npm run db:test`. Esperado: todos os arquivos PASS.
- [ ] **Step 5:** `npm run db:types` e depois `npm run typecheck`. Esperado: sem erros.
- [ ] **Step 6: Commit** `feat(telegram): tabelas, RLS e RPCs do bot`.

---

### Task 2: Configuração e cliente da Bot API

**Files:**
- Modify: `src/lib/env.server.ts`
- Create: `src/server/telegram/config.ts`, `src/server/telegram/types.ts`, `src/server/telegram/client.ts`
- Test: `tests/unit/telegram-client.test.ts`

**Interfaces:**
- Produces: `interface TelegramConfig { token: string; webhookSecret: string; botUsername: string; groupId: number }` e `telegramConfig(): TelegramConfig | null` (null se faltar qualquer variável).
- Produces: `types.ts` com os campos usados: `Update { update_id; message?; chat_join_request?; chat_member? }`; `Message { message_id; from?: User; chat: Chat; text?; caption?; entities?: MessageEntity[]; caption_entities?; reply_to_message?: Message; forward_origin?: { type: string }; photo?; video?; document? }`; `User { id; is_bot; username?; first_name }`; `Chat { id; type: "private"|"group"|"supergroup"|"channel" }`; `MessageEntity { type; offset; length; url? }`; `ChatJoinRequest { chat; from; user_chat_id }`; `ChatMemberUpdated { chat; from; new_chat_member: { status; user: User }; old_chat_member: { status } }`.
- Produces: `class TelegramApiError extends Error { method: string; status: number; description: string }` e
  ```ts
  interface BotApi {
    sendMessage(chatId: number, text: string, opts?: { replyTo?: number }): Promise<{ message_id: number }>;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
    approveChatJoinRequest(chatId: number, userId: number): Promise<void>;
    declineChatJoinRequest(chatId: number, userId: number): Promise<void>;
    createChatInviteLink(chatId: number): Promise<string>; // creates_join_request: true
    restrictChatMember(chatId: number, userId: number, untilUnix: number): Promise<void>; // todas as permissões false
    banChatMember(chatId: number, userId: number): Promise<void>;
    unbanChatMember(chatId: number, userId: number): Promise<void>; // only_if_banned: true
    kickChatMember(chatId: number, userId: number): Promise<void>; // ban + unban
    getChatAdministratorIds(chatId: number): Promise<number[]>;
  }
  function createBotApi(token: string, fetchImpl?: typeof fetch): BotApi
  ```

- [ ] **Step 1: Escrever os testes** com um `fetch` falso:
  - `sendMessage` faz POST em `.../bot<token>/sendMessage` com JSON `{chat_id, text, reply_parameters?}` e devolve `message_id`.
  - Resposta `{ok:false, error_code:400, description:"Bad Request: x"}` lança `TelegramApiError` com `status 400`; `String(err)` e `err.message` **não** contêm o token.
  - 429 com `parameters.retry_after: 1` tenta de novo 1 vez e funciona; com `retry_after: 5` lança sem tentar de novo.
  - `kickChatMember` chama `banChatMember` e depois `unbanChatMember`.
  - `telegramConfig()` devolve `null` sem `TELEGRAM_BOT_TOKEN` e converte `TELEGRAM_GROUP_ID="-100123"` em número.
- [ ] **Step 2:** `npx vitest run tests/unit/telegram-client.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Em `env.server.ts`: `TELEGRAM_BOT_TOKEN: z.string().min(30).optional()`, `TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).optional()`, `TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional()`, `TELEGRAM_GROUP_ID: z.string().regex(/^-?\d+$/).optional()`. Na espera do 429 usar `setTimeout` (máx. 2 s).
- [ ] **Step 4:** Rodar o teste → PASS; `npm run typecheck` → ok.
- [ ] **Step 5: Commit** `feat(telegram): config e cliente da Bot API`.

---

### Task 3: Regras puras (comandos, antispam, escalada)

**Files:**
- Create: `src/server/telegram/commands.ts`, `src/server/telegram/antispam.ts`, `src/server/telegram/punishments.ts` (só a parte pura nesta task)
- Test: `tests/unit/telegram-rules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ReportReason = "nao_consensual"|"menor_de_idade"|"violencia"|"assedio"|"spam"|"direitos_autorais"|"outro";
  type Command =
    | { kind: "start"; code: string | null }
    | { kind: "warn"; reason: string }
    | { kind: "mute"; hours: 1 | 24 | 168; reason: string }
    | { kind: "ban"; reason: string }
    | { kind: "unban" }
    | { kind: "report"; reason: ReportReason; details: string };
  function parseCommand(text: string, botUsername: string): Command | null;

  interface SpamSettings { allowedDomains: string[]; floodRepeatLimit: number; floodWindowSeconds: number }
  type SpamVerdict = { spam: false } | { spam: true; rule: "link" | "invite" | "channel_forward" | "flood" };
  function detectSpam(msg: Message, s: SpamSettings, recentSameHashCount: number): SpamVerdict;
  function textHash(msg: Message): string | null; // sha256 do texto/legenda normalizado (trim, minúsculas, espaços colapsados); null sem texto

  interface Escalation { warnings: number; mute: boolean }
  function escalate(currentWarnings: number, warnLimit: number): Escalation;
  ```

- [ ] **Step 1: Escrever os testes:**
  - `parseCommand("/start abc_123", "SfBot")` → `{kind:"start", code:"abc_123"}`; `"/start"` → `code:null`; `"/banir@SfBot spam pesado"` → `{kind:"ban", reason:"spam pesado"}`; `"/banir@OutroBot"` → `null`; `"/silenciar 7d flood"` → `{kind:"mute", hours:168, reason:"flood"}`; `"/silenciar 2h"` → `null`; `"/advertir"` → `reason:""`.
  - `/denunciar` com apelidos: `"menor"` → `menor_de_idade`; `"nao consensual"` e `"não consensual"` → `nao_consensual`; `"spam"` → `spam`; `"assédio"` → `assedio`; `"copia"` e `"direitos"` → `direitos_autorais`; vazio → `outro`; `"golpe de pix"` → `{reason:"outro", details:"golpe de pix"}`.
  - `detectSpam`: link `https://secretfans.app.br/x` e `https://www.secretfans.app.br` (subdomínio) → não é spam; `https://evil.com` → `link`; entidade `text_link` com `url: "https://evil.com"` → `link`; `t.me/+AbC` e `https://t.me/joinchat/x` → `invite`; `t.me/algumcanal` → `invite`; `forward_origin: {type:"channel"}` → `channel_forward`; `forward_origin: {type:"user"}` → não é spam; `recentSameHashCount = 2` com limite 3 → `flood` (a mensagem atual é a 3ª); foto só com `caption` contendo link proibido em `caption_entities` → `link`; sticker sem texto nem legenda → não é spam e `textHash` → `null`.
  - `escalate(0,3)` → `{warnings:1, mute:false}`; `escalate(2,3)` → `{warnings:0, mute:true}`.
- [ ] **Step 2:** `npx vitest run tests/unit/telegram-rules.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Os links vêm das entidades (`url` → fatia do texto; `text_link` → `url`) e de uma regex de fallback para `t.me/`/`telegram.me/` sem esquema. Comparar o hostname sem `www.`: permitido se for igual a um domínio da lista ou terminar em `.<domínio>`. Normalizar acentos com `normalize("NFD")` antes de casar os apelidos.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `feat(telegram): parser de comandos, antispam e escalada`.

---

### Task 4: Repositório e handler de updates

**Files:**
- Create: `src/server/telegram/repo.ts`, `src/server/telegram/handler.ts`
- Modify: `src/server/telegram/punishments.ts` (aplicação)
- Test: `tests/unit/telegram-handler.test.ts`

**Interfaces:**
- Consumes: `BotApi`, `TelegramConfig`, `parseCommand`, `detectSpam`, `textHash` e `escalate` (Tasks 2–3), além das RPCs da Task 1.
- Produces:
  ```ts
  interface TelegramSettings { rulesText: string; welcomeText: string; allowedDomains: string[]; warnLimit: number; autoMuteHours: number; floodRepeatLimit: number; floodWindowSeconds: number }
  interface LinkedUser { userId: string; status: "active"|"blocked"|"deleted"; canModerate: boolean }
  interface MemberState { status: "member"|"muted"|"banned"|"left"; warnings: number }
  interface TelegramRepo {
    markUpdateSeen(updateId: number): Promise<boolean>;            // false = já visto
    getSettings(): Promise<TelegramSettings>;
    consumeLinkCode(code: string, tgId: number, username: string | null): Promise<{ ok: true; userId: string } | { ok: false; error: "invalid" | "taken" | "inactive" }>;
    userFor(tgId: number): Promise<LinkedUser | null>;
    getMember(tgId: number): Promise<MemberState | null>;
    upsertMember(tgId: number, patch: Partial<MemberState> & { mutedUntil?: string | null; lastActionBy?: string | null }): Promise<void>;
    countRecentHash(tgId: number, hash: string, windowSeconds: number): Promise<number>; // também grava a mensagem atual e apaga as com mais de 1h
    logAction(actor: string | null, action: "telegram.warn"|"telegram.mute"|"telegram.ban"|"telegram.unban"|"telegram.kick"|"telegram.spam_deleted", tgId: number, reason: string, metadata?: Record<string, unknown>): Promise<void>;
    createReport(input: { reporterUserId: string; reason: ReportReason; details: string; chatId: number; messageId: number; authorTgId: number; text: string; hasMedia: boolean }): Promise<string>;
    scheduleDelete(chatId: number, messageId: number, afterSeconds: number): Promise<void>;
    takeDueDeletes(now: Date): Promise<{ chatId: number; messageId: number }[]>; // devolve e remove as vencidas
  }
  function createTelegramRepo(db?: SupabaseClient): TelegramRepo; // padrão: createServiceSupabase()

  // punishments.ts
  function applyWarning(ctx: Ctx, tgId: number, actor: string | null, reason: string): Promise<void>; // escalate → restrict se mute
  function applyMute(ctx: Ctx, tgId: number, hours: number, actor: string | null, reason: string): Promise<void>;
  function applyBan(ctx: Ctx, tgId: number, actor: string | null, reason: string): Promise<void>;
  function applyUnban(ctx: Ctx, tgId: number, actor: string | null): Promise<void>;

  interface Ctx { api: BotApi; repo: TelegramRepo; config: TelegramConfig; now?: () => Date; siteUrl: string }
  function handleUpdate(ctx: Ctx, update: Update): Promise<void>;
  ```
  (A deduplicação fica na rota, Task 5; `handleUpdate` não chama `markUpdateSeen`.)

**Regras do handler** (da spec, seção 4):
- Chat privado `/start <code>`: `consumeLinkCode`. `ok` → envia `rulesText` + o link de `createChatInviteLink(groupId)`. `invalid` → "Link expirado ou já usado. Gere outro em <siteUrl>/conta/perfil". `taken` → "Este Telegram já está vinculado a outra conta Secretfans". `inactive` → "Sua conta Secretfans não está ativa". `/start` sem código → instrução com o link do site.
- `chat_join_request` no grupo: aprova se `userFor` for `active` e `getMember` não for `banned`; senão recusa e manda a explicação para `user_chat_id` (ignorando erro de envio).
- `chat_member` com `new_chat_member.status = "member"` no grupo: `upsertMember(status member)` e envia `welcomeText` (`{nome}` → `first_name`). `left`/`kicked` → `upsertMember(status left)`, mas sem sobrescrever `banned`.
- Mensagem no grupo: os admins (`getChatAdministratorIds`) e bots ficam isentos do antispam. Se for comando de moderação (`warn`/`mute`/`ban`/`unban`): o autor precisa estar em `getChatAdministratorIds` **e** `userFor(autor).canModerate`, e o comando precisa ser resposta (`reply_to_message`) a um usuário que não seja bot nem admin. Se não for o caso, só apaga o comando. Se for, aplica a punição, apaga o comando, manda uma confirmação curta e chama `scheduleDelete(chat, confirmação, 30)`. No início de todo update do grupo, o handler chama `takeDueDeletes(now)` e apaga essas mensagens (erros ignorados). Funções na Vercel não ficam vivas 30 s, por isso a exclusão é preguiçosa. `report`: exige `reply_to_message` e autor vinculado; apaga o comando, `createReport` e confirma no privado (ignorando erro). Demais mensagens: se `detectSpam` acusar, `deleteMessage` + `applyWarning(…, null, "spam:<rule>")` + `logAction("telegram.spam_deleted")`.
- Updates de outros chats: ignorados.

- [ ] **Step 1: Escrever os testes** com `BotApi` e `TelegramRepo` falsos (objetos com `vi.fn()`) e fixtures de `Update`:
  - `/start` válido → `consumeLinkCode` chamado e `sendMessage` com texto contendo o link de convite; `invalid` e `taken` → as mensagens acima, sem convite.
  - Pedido de entrada: usuário ativo → `approveChatJoinRequest`; sem vínculo → `declineChatJoinRequest`; `blocked` → recusa; membro `banned` → recusa.
  - Entrada → `welcomeText` com `{nome}` substituído; saída de `banned` → status continua `banned`.
  - `/banir` em resposta, autor admin e moderador → `banChatMember`, `logAction("telegram.ban")` com o `actor` = userId do moderador, `deleteMessage` do comando e `scheduleDelete(…, 30)` da confirmação.
  - `takeDueDeletes` devolvendo 1 item → `deleteMessage` desse item antes de processar a mensagem.
  - `/banir` de um admin sem `canModerate` → só `deleteMessage`, sem `banChatMember`.
  - `/banir` sem resposta → só `deleteMessage`. `/banir` em resposta a um admin → só `deleteMessage`.
  - Link proibido de membro comum → `deleteMessage` + advertência; 3ª advertência (`getMember.warnings = 2`, `warnLimit = 3`) → `restrictChatMember` com `until ≈ now + 24h` e `warnings: 0`.
  - Link de um admin → nenhuma chamada a `deleteMessage`.
  - `/denunciar menor` em resposta a uma foto com legenda → `createReport` com `reason "menor_de_idade"`, `text` = legenda e `hasMedia true`; comando apagado.
  - Update de outro chat → nenhuma chamada.
- [ ] **Step 2:** `npx vitest run tests/unit/telegram-handler.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `repo.ts` (mapear os códigos de erro das RPCs: `P0002 → invalid`, `23505 → taken`, `42501 → inactive`), a aplicação em `punishments.ts` e `handler.ts`. Cachear `getChatAdministratorIds` por 60 s em memória do módulo.
- [ ] **Step 4:** Rodar → PASS; `npm run typecheck && npm run lint` → ok.
- [ ] **Step 5: Commit** `feat(telegram): handler de updates (vínculo, entrada, moderação, denúncias)`.

---

### Task 5: Rota do webhook

**Files:**
- Create: `src/app/api/webhooks/telegram/route.ts`
- Test: `tests/unit/telegram-route.test.ts`

**Interfaces:**
- Consumes: `telegramConfig`, `createBotApi`, `createTelegramRepo` e `handleUpdate`.
- Produces: `POST(request: Request): Promise<Response>`; `export const maxDuration = 30`.

- [ ] **Step 1: Escrever os testes** (com `vi.mock` de `@/server/telegram/handler`, `repo` e `config`):
  - Config `null` → 404.
  - Header `x-telegram-bot-api-secret-token` ausente ou errado → 401, sem chamar o handler.
  - Segredo certo e `markUpdateSeen → true` → handler chamado 1 vez, resposta 200.
  - Mesmo update com `markUpdateSeen → false` → 200, sem chamar o handler.
  - Handler lança erro → 200 e `console.error` chamado com uma mensagem **sem** o token.
  - Corpo que não é JSON → 200, sem chamar o handler.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar, comparando o segredo com `timingSafeEqual` sobre sha256 (mesmo padrão de `src/app/api/cron/conciliar/route.ts`). `siteUrl` vem de `NEXT_PUBLIC_SITE_URL`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `feat(telegram): rota do webhook`.

---

### Task 6: Integração com o site (vínculo, bloqueio e varredura)

**Files:**
- Create: `src/server/telegram/group.ts`, `src/features/telegram/actions.ts`, `src/features/telegram/TelegramCard.tsx`, `src/app/api/cron/telegram/route.ts`
- Modify: `src/app/(fan)/conta/perfil/page.tsx`, `src/features/super-admin/actions.ts` (`setAccountStatusAction`), `vercel.json`
- Test: `tests/unit/telegram-group.test.ts`

**Interfaces:**
- Consumes: `BotApi`, `TelegramRepo` e as RPCs da Task 1.
- Produces:
  ```ts
  // group.ts (server-only)
  function removeUserFromGroup(userId: string, reason: string, actor: string | null, opts?: { ban?: boolean }): Promise<void>; // sem vínculo ou bot desligado = no-op; ban=true → banChatMember + status banned; senão kick + status left
  function sweepGroupMembers(deps?: { api: BotApi; repo: TelegramRepo; db: SupabaseClient }): Promise<{ removed: number }>;
  // membros com status member/muted cujo telegram_user_id não tem vínculo, ou cujo profile.status <> 'active' → kick, status left, logAction("telegram.kick", reason "conta inativa no site")
  // features/telegram/actions.ts ("use server")
  function startTelegramLinkAction(): Promise<void>;         // requireUser → RPC telegram_create_link_code via service → redirect(`https://t.me/${botUsername}?start=${code}`); 42501 → redirect('/conta/perfil?telegram=sem-consentimento')
  function unlinkTelegramAction(): Promise<void>;            // removeUserFromGroup(user.id, "desvinculou", user.id) e depois delete em telegram_links pelo client do usuário (RLS)
  ```
- Card: só aparece com `telegramConfig()` não nulo. Sem vínculo: botão "Entrar no grupo VIP". Com vínculo: "Vinculado como @user" + botão "Desvincular" + texto "Ao desvincular, você sai do grupo." Com `?telegram=sem-consentimento`: Alert "Para entrar no grupo, confirme que tem 18 anos ou mais nos termos da sua conta."
- Bloqueio: em `setAccountStatusAction`, depois do RPC dar certo e quando `status === "blocked"`, chamar `removeUserFromGroup(userId, reason, adminId, { ban: true })` dentro de `try/catch`. Falha no Telegram não desfaz o bloqueio, só acrescenta " (não foi possível remover do grupo do Telegram)" à mensagem.
- Cron `GET /api/cron/telegram`: mesma autenticação Bearer `CRON_SECRET` do `conciliar`. Roda `sweepGroupMembers`, apaga `telegram_updates_seen` com mais de 7 dias e `telegram_link_codes` expirados, e esvazia `takeDueDeletes` (para grupos sem atividade depois de um comando). Em `vercel.json`, adicionar `{ "path": "/api/cron/telegram", "schedule": "30 9 * * *" }`.

- [ ] **Step 1: Escrever os testes** de `group.ts` com dublês:
  - `removeUserFromGroup` sem vínculo → nenhuma chamada à API.
  - Com `ban: true` → `banChatMember` + `upsertMember(status banned)` + `logAction("telegram.ban")`.
  - Sem `ban` → `kickChatMember` + `status left`.
  - `sweepGroupMembers` com 3 membros (ativo, `blocked`, sem vínculo) → `kickChatMember` 2 vezes, `{removed: 2}`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar `group.ts`, as actions, o card, o cron, o hook no bloqueio e o `vercel.json`.
- [ ] **Step 4:** Rodar os testes → PASS; `npm run typecheck && npm run lint` → ok.
- [ ] **Step 5: Verificar no navegador** (preview do dev server): em `/conta/perfil` logado como fã do seed, com variáveis de teste no `.env.local`, o card aparece e o botão redireciona para `https://t.me/<bot>?start=` + 32 caracteres. Sem as variáveis, o card não aparece.
- [ ] **Step 6: Commit** `feat(telegram): vínculo na conta, remoção ao bloquear e varredura diária`.

---

### Task 7: Super Admin (configurações e denúncias)

**Files:**
- Create: `src/features/super-admin/TelegramSettingsForm.tsx`, `src/features/super-admin/telegram-actions.ts`
- Modify: `src/app/super-admin/(painel)/configuracoes/page.tsx`, `src/app/super-admin/(painel)/denuncias/page.tsx`, `src/features/super-admin/reports.ts`, `src/features/super-admin/ReportDecisionForm.tsx`
- Test: `tests/unit/telegram-admin.test.ts`

**Interfaces:**
- Consumes: `removeUserFromGroup` e `group.ts`; `createBotApi`.
- Produces:
  ```ts
  // group.ts (acrescentar)
  function deleteGroupMessage(chatId: number, messageId: number): Promise<void>;
  function muteTelegramUser(tgId: number, hours: number, actor: string, reason: string): Promise<void>;
  function banTelegramUser(tgId: number, actor: string, reason: string): Promise<void>;
  // telegram-actions.ts
  const telegramSettingsSchema: z.ZodType<…>; // rulesText e welcomeText 1..2000; allowedDomains: textarea, um domínio por linha, cada um /^[a-z0-9.-]+\.[a-z]{2,}$/i, 1..50; warnLimit 1..10; autoMuteHours 1..168; floodRepeatLimit 2..20; floodWindowSeconds 10..600
  function saveTelegramSettingsAction(_: AdminResult | null, fd: FormData): Promise<AdminResult>; // requireStaffMfa("settings.manage"); update via client do usuário (RLS)
  ```
- Denúncias: `decideReportAction` aceita o campo `telegramAction: "none" | "delete" | "mute24" | "ban"` (padrão `none`; só vale com `status = "resolved"` e `target_type = "telegram_message"`). Executa a ação no Telegram **antes** do `decide_report`. Se falhar, devolve `{ ok: false, message: "Não foi possível executar a ação no Telegram. A denúncia continua aberta." }`. Na página, denúncias `telegram_message` mostram o texto guardado, "contém mídia" e o autor (handle se vinculado; senão o id do Telegram), lidos de `telegram_reported_messages`. `ReportDecisionForm` recebe a prop `telegram: boolean`: quando verdadeira, mostra o select "Ação no Telegram" no lugar do checkbox "Retirar o conteúdo".

- [ ] **Step 1: Escrever os testes:**
  - `telegramSettingsSchema` rejeita o domínio `"exemplo"` e aceita `"secretfans.app.br\nexemplo.com"` → `["secretfans.app.br","exemplo.com"]`; rejeita `warnLimit 0`.
  - `decideReportAction` (com `requireStaffMfa`, supabase e `group.ts` simulados): `telegramAction "ban"` + `resolved` → `banTelegramUser` chamado antes do RPC; `banTelegramUser` lançando erro → `ok:false` e RPC não chamado; `dismissed` + `ban` → nenhuma ação no Telegram.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS; `npm run typecheck && npm run lint` → ok.
- [ ] **Step 5: Verificar no navegador:** como moderador do seed (com MFA, conforme o fluxo e2e existente), em `/super-admin/configuracoes` salvar a seção do bot mostra sucesso e persiste; em `/super-admin/denuncias`, uma denúncia `telegram_message` criada via SQL no banco local mostra o texto e o select de ação.
- [ ] **Step 6: Commit** `feat(telegram): configurações do bot e ações no Telegram ao decidir denúncias`.

---

### Task 8: Script de setup e runbook

**Files:**
- Create: `scripts/telegram-setup.ts`, `docs/runbooks/telegram-bot.md`
- Modify: `.env.example` com as 4 variáveis vazias e comentadas

**Interfaces:**
- Consumes: as variáveis de ambiente e `NEXT_PUBLIC_SITE_URL`.
- Produces: `npx tsx scripts/telegram-setup.ts`, que chama `setWebhook` (`url = <site>/api/webhooks/telegram`, `secret_token`, `allowed_updates = ["message","chat_join_request","chat_member"]`, `drop_pending_updates: true`) e `setMyCommands` em dois escopos: padrão (`start`, `denunciar`) e `all_chat_administrators` (+ `advertir`, `silenciar`, `banir`, `desbanir`). Depois imprime `getWebhookInfo` sem o token.

- [ ] **Step 1:** Escrever o script. Falta de variável → sai com código 1 e lista o que falta.
- [ ] **Step 2:** Escrever o runbook com estas seções:
  1. Criar o bot no @BotFather, usando `/setprivacy` → Disable para o bot ler as mensagens do grupo.
  2. Gerar `TELEGRAM_WEBHOOK_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
  3. Cadastrar as 4 variáveis na Vercel (Production e Preview do HML) e no `.env.local`, **sem colar o token em chat ou commit**. Para revogar: `/revoke` no BotFather.
  4. Adicionar o bot ao grupo como admin, só com: apagar mensagens, banir usuários, restringir membros e convidar via link.
  5. Ativar em "Tipo de grupo" → "Aprovar novos membros"; tornar o grupo supergrupo privado.
  6. Obter o `TELEGRAM_GROUP_ID` (encaminhar uma mensagem do grupo para @RawDataBot, ou ler `getUpdates` antes de ativar o webhook).
  7. Rodar `npx tsx scripts/telegram-setup.ts`.
  8. Roteiro de teste num grupo e bot **de teste**: vincular, entrar, mandar link proibido 3 vezes, `/banir` e `/denunciar`, conferir auditoria e denúncias.
  9. Aviso: a autodeclaração de +18 não é verificação real de idade.
- [ ] **Step 3:** `npx tsx scripts/telegram-setup.ts` sem variáveis → código 1 e a lista de faltantes.
- [ ] **Step 4: Verificação final:** `npm run typecheck && npm run lint && npm test && npm run db:test` → tudo verde.
- [ ] **Step 5: Commit** `docs(telegram): runbook e script de setup do webhook`.
