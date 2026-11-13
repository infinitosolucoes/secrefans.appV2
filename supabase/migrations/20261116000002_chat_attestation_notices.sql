-- Declaração do criador também para mídia no chat (mensagem, mensagem paga e em massa) e novos
-- avisos: curtida, comentário, decisão da verificação e assinatura perto de acabar.

-- 1) Declaração no chat ---------------------------------------------------------------------------
alter table public.messages
  add column content_attested_at timestamptz,
  add column content_attestation_version text;
alter table public.message_broadcasts
  add column content_attested_at timestamptz,
  add column content_attestation_version text;

create or replace function public.send_message(
  p_message_id uuid, p_conversation_id uuid, p_body text,
  p_price_cents integer default null, p_media jsonb default '[]'::jsonb,
  p_attested boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations;
  v_has_media boolean := jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 0;
begin
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found or v_me is null or v_me not in (v_conv.creator_id, v_conv.fan_id) then
    raise exception 'conversa não encontrada' using errcode = 'P0002';
  end if;
  if private.is_blocked_between(v_conv.creator_id, v_conv.fan_id) then
    raise exception 'conversa indisponível' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' and not v_has_media then
    raise exception 'mensagem vazia' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 2000 then
    raise exception 'mensagem longa demais' using errcode = '22023';
  end if;
  if v_me = v_conv.fan_id and (v_has_media or p_price_cents is not null) then
    raise exception 'só o criador envia mídia ou mensagem paga' using errcode = '42501';
  end if;
  if p_price_cents is not null and (not v_has_media or p_price_cents not between 500 and 100000) then
    raise exception 'mensagem paga precisa de mídia e preço entre R$ 5 e R$ 1.000' using errcode = '22023';
  end if;
  if v_has_media and not private.message_media_valid(v_conv.creator_id, p_message_id, p_media) then
    raise exception 'mídia inválida' using errcode = '22023';
  end if;
  if v_has_media and not coalesce(p_attested, false) then
    raise exception 'confirme os direitos e o consentimento das pessoas do conteúdo' using errcode = '22023';
  end if;
  perform private.insert_message(p_message_id, v_conv, v_me, p_body, p_price_cents, p_media, null);
  if v_has_media then
    update public.messages set content_attested_at = now(), content_attestation_version = '2026-11'
     where id = p_message_id;
  end if;
  return p_message_id;
end;
$$;

create or replace function public.send_broadcast(
  p_broadcast_id uuid, p_body text, p_price_cents integer default null, p_media jsonb default '[]'::jsonb,
  p_attested boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_has_media boolean := jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 0;
  v_conv public.conversations;
  v_fan uuid;
  v_count integer := 0;
begin
  if v_me is null or not private.is_active_creator(v_me) then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if exists (select 1 from public.message_broadcasts where creator_id = v_me and created_at > now() - interval '10 minutes') then
    raise exception 'aguarde 10 minutos entre envios em massa' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_body, '')) = '' and not v_has_media then
    raise exception 'mensagem vazia' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 2000 then
    raise exception 'mensagem longa demais' using errcode = '22023';
  end if;
  if p_price_cents is not null and (not v_has_media or p_price_cents not between 500 and 100000) then
    raise exception 'mensagem paga precisa de mídia e preço entre R$ 5 e R$ 1.000' using errcode = '22023';
  end if;
  if v_has_media and not private.message_media_valid(v_me, p_broadcast_id, p_media) then
    raise exception 'mídia inválida' using errcode = '22023';
  end if;

  if v_has_media and not coalesce(p_attested, false) then
    raise exception 'confirme os direitos e o consentimento das pessoas do conteúdo' using errcode = '22023';
  end if;
  insert into public.message_broadcasts (id, creator_id, body, price_cents, content_attested_at, content_attestation_version)
  values (p_broadcast_id, v_me, coalesce(p_body, ''), p_price_cents,
          case when v_has_media then now() end, case when v_has_media then '2026-11' end);

  for v_fan in
    select s.fan_id from public.subscriptions s
     where s.creator_id = v_me and s.status in ('active', 'canceled') and s.current_period_end > now()
       and not private.is_blocked_between(v_me, s.fan_id)
     limit 5000
  loop
    insert into public.conversations (creator_id, fan_id) values (v_me, v_fan)
    on conflict (creator_id, fan_id) do update set creator_id = excluded.creator_id
    returning * into v_conv;
    perform private.insert_message(gen_random_uuid(), v_conv, v_me, p_body, p_price_cents, p_media, p_broadcast_id);
    v_count := v_count + 1;
  end loop;

  update public.message_broadcasts set recipients = v_count where id = p_broadcast_id;
  if v_has_media then
    update public.messages set content_attested_at = now(), content_attestation_version = '2026-11'
     where broadcast_id = p_broadcast_id;
  end if;
  return v_count;
end;
$$;

drop function public.send_message(uuid, uuid, text, integer, jsonb);
drop function public.send_broadcast(uuid, text, integer, jsonb);
revoke execute on function public.send_message(uuid, uuid, text, integer, jsonb, boolean),
  public.send_broadcast(uuid, text, integer, jsonb, boolean) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, integer, jsonb, boolean),
  public.send_broadcast(uuid, text, integer, jsonb, boolean) to authenticated;

-- 2) Novos tipos de aviso ----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications add constraint notifications_kind check (kind in
  ('sale', 'tip', 'new_subscriber', 'renewal', 'payment_failed', 'message', 'new_post', 'new_follower',
   'report_urgent', 'payout', 'like', 'comment', 'verification', 'subscription_expiring'));

-- Curtidas e comentários (só no site); dá para desligar nas preferências.
alter table public.notification_prefs
  add column inapp_engagement boolean not null default true;

create or replace function private.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.notification_prefs;
  v_email boolean;
begin
  if p_user is null or p_user = p_actor then return; end if;
  select * into p from public.notification_prefs where user_id = p_user;
  if p_kind = 'new_post' and p.user_id is not null and not p.inapp_new_posts then return; end if;
  if p_kind in ('like', 'comment') and p.user_id is not null and not p.inapp_engagement then return; end if;
  v_email := case
    when p_kind in ('sale', 'tip', 'new_subscriber', 'renewal') then coalesce(p.email_sales, true)
    when p_kind = 'message' then coalesce(p.email_messages, true)
    when p_kind in ('payment_failed', 'subscription_expiring') then coalesce(p.email_account, true)
    when p_kind in ('payout', 'verification') then true
    else false end;
  insert into public.notifications (user_id, kind, title, body, link, actor_id, email_status)
  values (p_user, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 280), p_link, p_actor,
          case when v_email then 'pending' else 'none' end);
end;
$$;

-- Curtida: um aviso por publicação enquanto não for lido (evita uma avalanche de avisos).
create or replace function private.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.posts where id = new.post_id;
  if v_creator is null or v_creator = new.user_id then return new; end if;
  if exists (select 1 from public.notifications
              where user_id = v_creator and kind = 'like' and read_at is null
                and link = '/p/' || new.post_id::text) then
    return new;
  end if;
  perform private.notify(v_creator, 'like', private.display_name(new.user_id) || ' curtiu sua publicação',
    '', '/p/' || new.post_id::text, new.user_id);
  return new;
end;
$$;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function private.notify_like();

create or replace function private.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.posts where id = new.post_id;
  perform private.notify(v_creator, 'comment', private.display_name(new.author_id) || ' comentou na sua publicação',
    left(new.body, 140), '/p/' || new.post_id::text, new.author_id);
  return new;
end;
$$;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function private.notify_comment();

-- Decisão da verificação de identidade (sempre por e-mail).
create or replace function private.notify_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'approved' then
    perform private.notify(new.user_id, 'verification', 'Sua verificação foi aprovada',
      'Você já pode publicar, vender e sacar seus ganhos.', '/estudio');
  elsif new.status = 'rejected' then
    perform private.notify(new.user_id, 'verification', 'Sua verificação não foi aprovada',
      coalesce('Motivo: ' || new.decision_reason, 'Veja o motivo e envie de novo.'), '/estudio/verificacao');
  elsif new.status = 'suspended' then
    perform private.notify(new.user_id, 'verification', 'Sua conta de criador foi suspensa',
      coalesce('Motivo: ' || new.decision_reason, ''), '/estudio/verificacao');
  end if;
  return new;
end;
$$;
create trigger creator_verifications_notify after update of status on public.creator_verifications
  for each row execute function private.notify_verification();

-- Assinatura perto de acabar: só as que NÃO renovam sozinhas (cancelada para o fim do período ou
-- sem cobrança recorrente no provedor). Rodada pela rotina diária; marca para não repetir no período.
alter table public.subscriptions add column expiry_notified_at timestamptz;

create or replace function public.notify_expiring_subscriptions(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_count integer := 0;
begin
  for s in
    select sub.* from public.subscriptions sub
     where sub.status in ('active', 'canceled')
       and sub.current_period_end > now()
       and sub.current_period_end <= now() + make_interval(days => p_days)
       and (sub.cancel_at_period_end or sub.status = 'canceled' or sub.provider_subscription_id is null)
       and (sub.expiry_notified_at is null or sub.expiry_notified_at < sub.current_period_end - interval '20 days')
     for update skip locked
  loop
    perform private.notify(s.fan_id, 'subscription_expiring',
      'Sua assinatura de ' || private.display_name(s.creator_id) || ' acaba em breve',
      'O acesso vai até ' || to_char(s.current_period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
        || '. Assine de novo para não perder o conteúdo.',
      '/' || coalesce((select handle from public.profiles where id = s.creator_id), 'biblioteca'));
    update public.subscriptions set expiry_notified_at = now() where id = s.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.notify_expiring_subscriptions(integer) from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions(integer) to service_role;

-- Preferência nova (curtidas e comentários) na RPC de preferências.
drop function public.set_notification_prefs(boolean, boolean, boolean, boolean);
create or replace function public.set_notification_prefs(
  p_email_sales boolean, p_email_messages boolean, p_email_account boolean, p_inapp_new_posts boolean,
  p_inapp_engagement boolean default true
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_prefs (user_id, email_sales, email_messages, email_account, inapp_new_posts, inapp_engagement)
  values (auth.uid(), p_email_sales, p_email_messages, p_email_account, p_inapp_new_posts, p_inapp_engagement)
  on conflict (user_id) do update
    set email_sales = excluded.email_sales, email_messages = excluded.email_messages,
        email_account = excluded.email_account, inapp_new_posts = excluded.inapp_new_posts,
        inapp_engagement = excluded.inapp_engagement, updated_at = now();
$$;
revoke execute on function public.set_notification_prefs(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_prefs(boolean, boolean, boolean, boolean, boolean) to authenticated;
revoke execute on function private.notify_like(), private.notify_comment(), private.notify_verification()
  from public, anon, authenticated;
