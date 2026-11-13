-- Bot do Telegram (fase 1): vínculo da conta, moderação do grupo VIP e denúncias de mensagens.
-- O bot roda no servidor com a service role; o cliente só lê o próprio vínculo.

alter type public.report_target add value if not exists 'telegram_message';

-- Vínculo e códigos ---------------------------------------------------------------------------
create table public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_username text,
  linked_at timestamptz not null default now()
);

create table public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz
);
create index telegram_link_codes_user_idx on public.telegram_link_codes (user_id);

-- Estado de moderação por membro do grupo -------------------------------------------------------------
create table public.telegram_members (
  telegram_user_id bigint primary key,
  status text not null default 'member'
    constraint telegram_members_status check (status in ('member', 'muted', 'banned', 'left')),
  warnings integer not null default 0 constraint telegram_members_warnings check (warnings >= 0),
  muted_until timestamptz,
  last_action_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Configuração do grupo (linha única) ----------------------------------------------------------------
create table public.telegram_settings (
  id boolean primary key default true constraint telegram_settings_single check (id),
  rules_text text not null default '',
  welcome_text text not null default '',
  allowed_domains text[] not null default '{}',
  warn_limit integer not null default 3 constraint telegram_settings_warn_limit check (warn_limit > 0),
  auto_mute_hours integer not null default 24 constraint telegram_settings_mute_hours check (auto_mute_hours > 0),
  flood_repeat_limit integer not null default 3 constraint telegram_settings_flood_repeat check (flood_repeat_limit > 0),
  flood_window_seconds integer not null default 60 constraint telegram_settings_flood_window check (flood_window_seconds > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.telegram_settings (id, allowed_domains) values (true, '{secretfans.app.br}');

-- Controle interno do bot (sem policies: só service role) -----------------------------------------------
create table public.telegram_updates_seen (
  update_id bigint primary key,
  seen_at timestamptz not null default now()
);
create index telegram_updates_seen_at_idx on public.telegram_updates_seen (seen_at);

create table public.telegram_recent_messages (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  text_hash text not null,
  sent_at timestamptz not null default now()
);
create index telegram_recent_messages_user_idx on public.telegram_recent_messages (telegram_user_id, sent_at desc);

create table public.telegram_pending_deletes (
  chat_id bigint not null,
  message_id bigint not null,
  delete_after timestamptz not null,
  primary key (chat_id, message_id)
);
create index telegram_pending_deletes_due_idx on public.telegram_pending_deletes (delete_after);

-- Cópia da mensagem denunciada (a denúncia aponta para esta linha) -----------------------------------------
create table public.telegram_reported_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  message_id bigint not null,
  author_telegram_user_id bigint not null,
  author_user_id uuid references auth.users (id) on delete set null,
  text text not null default '' constraint telegram_reported_text_len check (char_length(text) <= 4096),
  has_media boolean not null default false,
  created_at timestamptz not null default now()
);
create index telegram_reported_messages_msg_idx on public.telegram_reported_messages (chat_id, message_id);

-- Nova categoria de notificação ------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
-- Lista completa (inclui os tipos criados depois, em 20261115/20261116): esta migration pode ser
-- aplicada depois delas num banco que já tem avisos desses tipos.
alter table public.notifications add constraint notifications_kind check (kind in
  ('sale', 'tip', 'new_subscriber', 'renewal', 'payment_failed', 'message', 'new_post', 'new_follower',
   'report_urgent', 'payout', 'like', 'comment', 'verification', 'subscription_expiring'));

-- RPCs (só service role) ----------------------------------------------------------------------------------
create or replace function public.telegram_create_link_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'conta não ativa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consent_records
                  where user_id = p_user and consent_type = 'age_18' and granted) then
    raise exception 'consentimento de maioridade ausente' using errcode = '42501';
  end if;
  delete from public.telegram_link_codes where user_id = p_user and used_at is null;
  v_code := left(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-__'), 32);
  insert into public.telegram_link_codes (code, user_id) values (v_code, p_user);
  return v_code;
end;
$$;

create or replace function public.telegram_consume_link_code(p_code text, p_telegram_user_id bigint, p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.telegram_link_codes;
begin
  select * into c from public.telegram_link_codes
   where code = p_code and used_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'código inválido, usado ou expirado' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = c.user_id and status = 'active') then
    raise exception 'conta não ativa' using errcode = '42501';
  end if;
  if exists (select 1 from public.telegram_links
              where telegram_user_id = p_telegram_user_id and user_id <> c.user_id) then
    raise exception 'Telegram já vinculado a outra conta' using errcode = '23505';
  end if;
  insert into public.telegram_links (user_id, telegram_user_id, telegram_username)
  values (c.user_id, p_telegram_user_id, p_username)
  on conflict (user_id) do update
    set telegram_user_id = excluded.telegram_user_id,
        telegram_username = excluded.telegram_username,
        linked_at = now();
  update public.telegram_link_codes set used_at = now() where code = c.code;
  return c.user_id;
end;
$$;

create or replace function public.telegram_user_for(p_telegram_user_id bigint)
returns table (user_id uuid, status public.account_status, can_moderate boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id, p.status,
         exists (
           select 1 from public.user_roles ur
           join public.role_permissions rp on rp.role = ur.role
           where ur.user_id = l.user_id and rp.permission_key = 'reports.decide'
         )
    from public.telegram_links l
    join public.profiles p on p.id = l.user_id
   where l.telegram_user_id = p_telegram_user_id;
$$;

-- Auditoria com ator explícito (private.audit usa auth.uid(), nulo sob service role).
create or replace function public.telegram_log_action(
  p_actor uuid, p_action text, p_target text, p_reason text, p_metadata jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (p_actor, p_action, 'telegram_user', p_target, p_reason,
          coalesce(p_metadata, '{}'::jsonb) || '{"source":"telegram_bot"}'::jsonb);
$$;

create or replace function public.telegram_create_report(
  p_reporter uuid, p_reason text, p_details text, p_chat_id bigint, p_message_id bigint,
  p_author_tg bigint, p_text text, p_has_media boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_msg uuid;
  v_mod uuid;
begin
  -- Mesma mensagem já denunciada (e ainda aberta) por este usuário: devolve a existente.
  select r.id into v_id
    from public.reports r
    join public.telegram_reported_messages m on m.id = r.target_id
   where r.reporter_id = p_reporter and r.target_type = 'telegram_message' and r.status = 'open'
     and m.chat_id = p_chat_id and m.message_id = p_message_id
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.telegram_reported_messages
    (chat_id, message_id, author_telegram_user_id, author_user_id, text, has_media)
  values (p_chat_id, p_message_id, p_author_tg,
          (select user_id from public.telegram_links where telegram_user_id = p_author_tg),
          coalesce(p_text, ''), coalesce(p_has_media, false))
  returning id into v_msg;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (p_reporter, 'telegram_message', v_msg, p_reason, left(coalesce(p_details, ''), 1000))
  returning id into v_id;

  if p_reason in ('menor_de_idade', 'nao_consensual') then
    for v_mod in
      select distinct ur.user_id
        from public.user_roles ur
        join public.role_permissions rp on rp.role = ur.role
        join public.profiles p on p.id = ur.user_id
       where rp.permission_key = 'reports.decide' and p.status = 'active'
    loop
      perform private.notify(v_mod, 'report_urgent', 'Denúncia urgente no grupo VIP', p_reason, '/super-admin/denuncias');
    end loop;
  end if;
  return v_id;
end;
$$;

revoke execute on function
  public.telegram_create_link_code(uuid),
  public.telegram_consume_link_code(text, bigint, text),
  public.telegram_user_for(bigint),
  public.telegram_log_action(uuid, text, text, text, jsonb),
  public.telegram_create_report(uuid, text, text, bigint, bigint, bigint, text, boolean)
  from public, authenticated, anon;
grant execute on function
  public.telegram_create_link_code(uuid),
  public.telegram_consume_link_code(text, bigint, text),
  public.telegram_user_for(bigint),
  public.telegram_log_action(uuid, text, text, text, jsonb),
  public.telegram_create_report(uuid, text, text, bigint, bigint, bigint, text, boolean)
  to service_role;

-- RLS ----------------------------------------------------------------------------------------------
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_members enable row level security;
alter table public.telegram_settings enable row level security;
alter table public.telegram_updates_seen enable row level security;
alter table public.telegram_recent_messages enable row level security;
alter table public.telegram_pending_deletes enable row level security;
alter table public.telegram_reported_messages enable row level security;

revoke all on public.telegram_links, public.telegram_link_codes, public.telegram_members, public.telegram_settings,
  public.telegram_updates_seen, public.telegram_recent_messages, public.telegram_pending_deletes,
  public.telegram_reported_messages from anon, authenticated;
grant select, delete on public.telegram_links to authenticated;
grant select on public.telegram_members, public.telegram_reported_messages to authenticated;
grant select, update on public.telegram_settings to authenticated;

create policy telegram_links_select on public.telegram_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy telegram_links_delete on public.telegram_links for delete to authenticated
  using (user_id = (select auth.uid()));
create policy telegram_members_select on public.telegram_members for select to authenticated
  using ((select public.staff_can('reports.read')));
create policy telegram_reported_messages_select on public.telegram_reported_messages for select to authenticated
  using ((select public.staff_can('reports.read')));
create policy telegram_settings_select on public.telegram_settings for select to authenticated
  using ((select public.staff_can('settings.manage')));
create policy telegram_settings_update on public.telegram_settings for update to authenticated
  using ((select public.staff_can('settings.manage')))
  with check ((select public.staff_can('settings.manage')));
