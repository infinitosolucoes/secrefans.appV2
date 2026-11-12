-- S6: chat fã ↔ criador. Texto para todos; foto/vídeo e mensagem paga (PPV) só do criador;
-- mensagem em massa para assinantes. Escrita só por RPCs; leitura só dos participantes (RLS);
-- mídia só pela RPC message_media_for (PPV liberado após a compra).

alter type public.order_kind add value if not exists 'message';
alter type public.report_target add value if not exists 'message';

-- Quem pode abrir conversa com o criador.
alter table public.profiles
  add column dm_policy text not null default 'subscribers'
    constraint profiles_dm_policy check (dm_policy in ('subscribers', 'everyone'));
grant update (dm_policy) on public.profiles to authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  fan_id uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  creator_unread integer not null default 0 constraint conversations_creator_unread check (creator_unread >= 0),
  fan_unread integer not null default 0 constraint conversations_fan_unread check (fan_unread >= 0),
  created_at timestamptz not null default now(),
  constraint conversations_distinct check (creator_id <> fan_id),
  unique (creator_id, fan_id)
);
create index conversations_creator_idx on public.conversations (creator_id, last_message_at desc nulls last);
create index conversations_fan_idx on public.conversations (fan_id, last_message_at desc nulls last);

create table public.message_broadcasts (
  id uuid primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  price_cents integer,
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
create index message_broadcasts_creator_idx on public.message_broadcasts (creator_id, created_at desc);

create table public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' constraint messages_body check (char_length(body) <= 2000),
  price_cents integer constraint messages_price check (price_cents is null or price_cents between 500 and 100000),
  broadcast_id uuid references public.message_broadcasts (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  kind text not null constraint message_media_kind check (kind in ('image', 'video')),
  poster_path text,
  width integer constraint message_media_width check (width between 1 and 10000),
  height integer constraint message_media_height check (height between 1 and 10000),
  duration_seconds integer constraint message_media_duration check (duration_seconds between 1 and 3600),
  position smallint not null default 0 constraint message_media_position check (position between 0 and 9)
);
create index message_media_message_idx on public.message_media (message_id, position);

-- Entitlement de mensagem paga.
alter table public.entitlements drop constraint entitlements_kind;
alter table public.entitlements add constraint entitlements_kind
  check (kind in ('post', 'package_version', 'message'));

-- Mídia: {creator}/messages/{origem}/{uuid}.ext, onde origem = id da mensagem ou do envio em massa.
create or replace function private.message_media_valid(p_creator uuid, p_origin uuid, p_media jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  m jsonb;
  v_prefix text := p_creator::text || '/messages/' || p_origin::text || '/';
begin
  if p_media is null or jsonb_typeof(p_media) <> 'array' then return false; end if;
  if jsonb_array_length(p_media) > 10 then return false; end if;
  for m in select * from jsonb_array_elements(p_media) loop
    if m->>'kind' = 'image' then
      if (m->>'path') !~ ('^' || v_prefix || '[0-9a-f-]{36}\.webp$') or m ? 'poster_path' and m->>'poster_path' is not null then
        return false;
      end if;
    elsif m->>'kind' = 'video' then
      if (m->>'path') !~ ('^' || v_prefix || '[0-9a-f-]{36}\.mp4$')
         or coalesce(m->>'poster_path', '') !~ ('^' || v_prefix || '[0-9a-f-]{36}\.webp$') then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Insere uma mensagem já validada e atualiza a conversa (prévia + não lidas do outro lado).
create or replace function private.insert_message(
  p_id uuid, p_conv public.conversations, p_sender uuid, p_body text, p_price integer,
  p_media jsonb, p_broadcast uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb;
  i integer := 0;
  v_preview text;
begin
  insert into public.messages (id, conversation_id, sender_id, body, price_cents, broadcast_id)
  values (p_id, p_conv.id, p_sender, coalesce(p_body, ''), p_price, p_broadcast);
  for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    insert into public.message_media (message_id, creator_id, storage_path, kind, poster_path, width, height,
                                      duration_seconds, position)
    values (p_id, p_conv.creator_id, m->>'path', m->>'kind', m->>'poster_path',
            nullif(m->>'width', '')::integer, nullif(m->>'height', '')::integer,
            nullif(m->>'duration_seconds', '')::integer, i);
    i := i + 1;
  end loop;
  v_preview := case
    when p_price is not null then '🔒 Mensagem paga'
    when btrim(coalesce(p_body, '')) <> '' then left(btrim(p_body), 120)
    when i > 0 then '📷 Mídia'
    else '' end;
  update public.conversations
     set last_message_at = now(), last_message_preview = v_preview,
         creator_unread = creator_unread + case when p_sender = p_conv.fan_id then 1 else 0 end,
         fan_unread = fan_unread + case when p_sender = p_conv.creator_id then 1 else 0 end
   where id = p_conv.id;
end;
$$;

-- Abre (ou devolve) a conversa. Fã: respeita a política do criador. Criador: só com assinantes.
create or replace function public.start_conversation(p_other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_policy text;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me and status = 'active') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if p_other_id = v_me then
    raise exception 'não é possível conversar consigo mesmo' using errcode = '22023';
  end if;
  if private.is_blocked_between(v_me, p_other_id) then
    raise exception 'conversa indisponível' using errcode = '42501';
  end if;

  -- Eu sou o fã, o outro é criador?
  if private.is_active_creator(p_other_id) then
    select id into v_id from public.conversations where creator_id = p_other_id and fan_id = v_me;
    if found then return v_id; end if;
    select dm_policy into v_policy from public.profiles where id = p_other_id;
    if v_policy = 'subscribers' and not public.has_active_subscription(p_other_id) then
      raise exception 'só assinantes podem enviar mensagens a este criador' using errcode = 'P0001';
    end if;
    insert into public.conversations (creator_id, fan_id) values (p_other_id, v_me)
    on conflict (creator_id, fan_id) do update set creator_id = excluded.creator_id
    returning id into v_id;
    return v_id;
  end if;

  -- Eu sou o criador, o outro é meu assinante?
  if private.is_active_creator(v_me) then
    select id into v_id from public.conversations where creator_id = v_me and fan_id = p_other_id;
    if found then return v_id; end if;
    if not exists (select 1 from public.subscriptions s where s.creator_id = v_me and s.fan_id = p_other_id
                    and s.status in ('active', 'canceled') and s.current_period_end > now()) then
      raise exception 'você só pode iniciar conversa com seus assinantes' using errcode = 'P0001';
    end if;
    insert into public.conversations (creator_id, fan_id) values (v_me, p_other_id)
    on conflict (creator_id, fan_id) do update set creator_id = excluded.creator_id
    returning id into v_id;
    return v_id;
  end if;

  raise exception 'conversa indisponível' using errcode = 'P0002';
end;
$$;

create or replace function public.send_message(
  p_message_id uuid, p_conversation_id uuid, p_body text,
  p_price_cents integer default null, p_media jsonb default '[]'::jsonb
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
  perform private.insert_message(p_message_id, v_conv, v_me, p_body, p_price_cents, p_media, null);
  return p_message_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set creator_unread = case when creator_id = auth.uid() then 0 else creator_unread end,
         fan_unread = case when fan_id = auth.uid() then 0 else fan_unread end
   where id = p_conversation_id and auth.uid() in (creator_id, fan_id);
$$;

create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set deleted_at = now(), body = ''
   where id = p_message_id and sender_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'mensagem não encontrada' using errcode = 'P0002';
  end if;
  delete from public.message_media where message_id = p_message_id;
end;
$$;

-- Mensagem em massa para os assinantes ativos (1 a cada 10 min; até 5.000 destinatários).
create or replace function public.send_broadcast(
  p_broadcast_id uuid, p_body text, p_price_cents integer default null, p_media jsonb default '[]'::jsonb
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

  insert into public.message_broadcasts (id, creator_id, body, price_cents)
  values (p_broadcast_id, v_me, coalesce(p_body, ''), p_price_cents);

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
  return v_count;
end;
$$;

-- Mídia da mensagem: remetente sempre; destinatário se grátis ou depois de comprar.
create or replace function public.message_media_for(p_message_id uuid)
returns table (storage_path text, kind text, poster_path text, width integer, height integer,
               duration_seconds integer, "position" smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select mm.storage_path, mm.kind, mm.poster_path, mm.width, mm.height, mm.duration_seconds, mm.position
    from public.message_media mm
    join public.messages m on m.id = mm.message_id
    join public.conversations c on c.id = m.conversation_id
   where mm.message_id = p_message_id
     and m.deleted_at is null
     and (
       m.sender_id = auth.uid()
       or (auth.uid() in (c.creator_id, c.fan_id)
           and (m.price_cents is null or public.has_entitlement('message', m.id)))
     )
   order by mm.position;
$$;

-- Quantas mídias cada mensagem tem (só a contagem, para o cadeado do PPV), aos participantes.
create or replace function public.message_media_counts(p_conversation_id uuid)
returns table (message_id uuid, media_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select mm.message_id, count(*)::integer
    from public.message_media mm
    join public.messages m on m.id = mm.message_id
    join public.conversations c on c.id = m.conversation_id
   where c.id = p_conversation_id and auth.uid() in (c.creator_id, c.fan_id) and m.deleted_at is null
   group by mm.message_id;
$$;

-- Commerce: create_order ganha o ramo 'message' (mensagem paga) -----------------------------
create or replace function public.create_order(
  p_kind public.order_kind,
  p_target_id uuid,
  p_amount_cents integer,
  p_method text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_existing uuid;
  v_creator uuid;
  v_target uuid := p_target_id;
  v_price integer;
  v_desc text;
  v_rule public.commission_rules;
  v_commission integer;
  v_id uuid;
  v_post public.posts;
  v_pkg public.packages;
  v_ver public.package_versions;
  v_msg public.messages;
  v_conv public.conversations;
begin
  if v_buyer is null or not exists (select 1 from public.profiles where id = v_buyer and status = 'active') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if p_method not in ('pix', 'card') then
    raise exception 'forma de pagamento inválida' using errcode = '22023';
  end if;

  select id into v_existing from public.orders where buyer_id = v_buyer and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if p_kind = 'ppv' then
    select * into v_post from public.posts where id = p_target_id;
    if not found or v_post.visibility <> 'ppv' or v_post.status <> 'published' or not public.post_card_visible(v_post.id) then
      raise exception 'publicação indisponível' using errcode = 'P0002';
    end if;
    if public.has_entitlement('post', v_post.id) then
      raise exception 'você já desbloqueou esta publicação' using errcode = '23505';
    end if;
    v_creator := v_post.creator_id; v_price := v_post.price_cents;
    v_desc := 'PPV · ' || left(coalesce(nullif(v_post.body, ''), 'Publicação'), 60);
  elsif p_kind = 'package' then
    select * into v_pkg from public.packages where id = p_target_id;
    if not found or v_pkg.status <> 'published' or v_pkg.current_version_id is null then
      raise exception 'pacote indisponível' using errcode = 'P0002';
    end if;
    select * into v_ver from public.package_versions where id = v_pkg.current_version_id;
    if v_ver.audience = 'subscribers' and not public.has_active_subscription(v_pkg.creator_id) then
      raise exception 'pacote exclusivo para assinantes' using errcode = '42501';
    end if;
    if public.has_entitlement('package_version', v_ver.id) then
      raise exception 'você já comprou este pacote' using errcode = '23505';
    end if;
    v_creator := v_pkg.creator_id; v_price := v_ver.price_cents; v_target := v_ver.id;
    v_desc := 'Pacote · ' || v_ver.title || ' (v' || v_ver.version || ')';
  elsif p_kind = 'subscription' then
    select subscription_price_cents into v_price from public.profiles where id = p_target_id and status = 'active';
    if v_price is null then
      raise exception 'criador não oferece assinatura' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.subscriptions where fan_id = v_buyer and creator_id = p_target_id
                and status = 'active' and current_period_end > now()) then
      raise exception 'você já assina este criador' using errcode = '23505';
    end if;
    v_creator := p_target_id; v_desc := 'Assinatura mensal';
  elsif p_kind = 'message' then
    select * into v_msg from public.messages where id = p_target_id;
    if found then
      select * into v_conv from public.conversations where id = v_msg.conversation_id;
    end if;
    if not found or v_msg.id is null or v_msg.price_cents is null or v_msg.deleted_at is not null
       or v_msg.sender_id <> v_conv.creator_id or v_conv.fan_id <> v_buyer then
      raise exception 'mensagem indisponível' using errcode = 'P0002';
    end if;
    if public.has_entitlement('message', v_msg.id) then
      raise exception 'você já desbloqueou esta mensagem' using errcode = '23505';
    end if;
    v_creator := v_conv.creator_id; v_price := v_msg.price_cents;
    v_desc := 'Mensagem paga' || case when btrim(v_msg.body) <> '' then ' · ' || left(btrim(v_msg.body), 50) else '' end;
  else -- tip (mimo)
    if p_amount_cents is null or p_amount_cents not between 500 and 100000 then
      raise exception 'valor de mimo inválido' using errcode = '22023';
    end if;
    v_creator := p_target_id; v_price := p_amount_cents; v_desc := 'Mimo';
  end if;

  if v_creator = v_buyer then
    raise exception 'não é possível comprar o próprio conteúdo' using errcode = '22023';
  end if;
  if not private.is_active_creator(v_creator) or private.is_blocked_between(v_buyer, v_creator) then
    raise exception 'criador indisponível' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.creator_commission_acceptances where creator_id = v_creator) then
    raise exception 'criador ainda não habilitado para vendas' using errcode = 'P0001';
  end if;

  v_rule := public.current_commission_rule(now());
  if v_rule.id is null then
    raise exception 'sem regra de comissão vigente' using errcode = 'P0001';
  end if;
  v_commission := case when p_kind = 'tip' and not v_rule.applies_to_tips then 0
                       else round(v_price * v_rule.rate_bps / 10000.0)::integer end;

  insert into public.orders (buyer_id, creator_id, kind, target_id, description, method, gross_cents,
                             commission_rule_id, commission_rule_version, commission_bps, commission_cents,
                             external_fees_cents, creator_net_cents, idempotency_key)
  values (v_buyer, v_creator, p_kind, v_target, v_desc, p_method, v_price,
          v_rule.id, v_rule.version, v_rule.rate_bps, v_commission, 0, v_price - v_commission, p_idempotency_key)
  returning id into v_id;
  return v_id;
end;
$$;

-- Liberação de mensagem paga após o pagamento (gatilho em orders: evita reescrever confirm_payment).
create or replace function private.grant_message_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'message' and new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.entitlements (user_id, kind, target_id, order_id)
    values (new.buyer_id, 'message', new.target_id, new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger orders_grant_message_entitlement after update of status on public.orders
  for each row execute function private.grant_message_entitlement();

-- Permissões ---------------------------------------------------------------------------
revoke execute on function private.message_media_valid(uuid, uuid, jsonb),
  private.insert_message(uuid, public.conversations, uuid, text, integer, jsonb, uuid),
  private.grant_message_entitlement() from public, anon, authenticated;
revoke execute on function public.start_conversation(uuid), public.send_message(uuid, uuid, text, integer, jsonb),
  public.mark_conversation_read(uuid), public.delete_message(uuid),
  public.send_broadcast(uuid, text, integer, jsonb), public.message_media_for(uuid),
  public.message_media_counts(uuid) from public, anon;
grant execute on function public.start_conversation(uuid), public.send_message(uuid, uuid, text, integer, jsonb),
  public.mark_conversation_read(uuid), public.delete_message(uuid),
  public.send_broadcast(uuid, text, integer, jsonb), public.message_media_for(uuid),
  public.message_media_counts(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_media enable row level security;
alter table public.message_broadcasts enable row level security;

revoke all on public.conversations, public.messages, public.message_media, public.message_broadcasts from anon;
revoke insert, update, delete, truncate, references, trigger on public.conversations, public.messages,
  public.message_media, public.message_broadcasts from authenticated;
revoke select on public.message_media from authenticated;

create policy conversations_select on public.conversations for select to authenticated
  using ((select auth.uid()) in (creator_id, fan_id));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c
                  where c.id = conversation_id and (select auth.uid()) in (c.creator_id, c.fan_id)));
create policy message_broadcasts_select on public.message_broadcasts for select to authenticated
  using (creator_id = (select auth.uid()));

-- Realtime: novas mensagens e conversas (a RLS acima vale para os eventos).
alter publication supabase_realtime add table public.messages, public.conversations;
