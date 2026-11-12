-- S6: notificações no site (gatilhos no banco) + fila de e-mail (o servidor envia via Resend).
-- Cada evento gera uma linha em notifications; email_status = 'pending' quando o tipo manda e-mail
-- e o usuário não desligou nas preferências.

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_sales boolean not null default true,          -- criador: vendas, mimos, assinantes
  email_messages boolean not null default true,       -- nova mensagem (1 por conversa até ler)
  email_account boolean not null default true,        -- pagamento recusado da assinatura
  inapp_new_posts boolean not null default true,      -- fã: novo post de quem assina
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint notifications_kind check (kind in
    ('sale', 'tip', 'new_subscriber', 'renewal', 'payment_failed', 'message', 'new_post', 'new_follower')),
  title text not null,
  body text not null default '',
  link text not null default '/' constraint notifications_link check (link ~ '^/[^/]'),
  actor_id uuid references auth.users (id) on delete set null,
  read_at timestamptz,
  email_status text not null default 'none'
    constraint notifications_email_status check (email_status in ('none', 'pending', 'sending', 'sent', 'failed', 'skipped')),
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_pending_idx on public.notifications (created_at) where email_status = 'pending';

-- Cria a notificação respeitando as preferências do usuário.
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
  v_email := case
    when p_kind in ('sale', 'tip', 'new_subscriber', 'renewal') then coalesce(p.email_sales, true)
    when p_kind = 'message' then coalesce(p.email_messages, true)
    when p_kind = 'payment_failed' then coalesce(p.email_account, true)
    else false end;
  insert into public.notifications (user_id, kind, title, body, link, actor_id, email_status)
  values (p_user, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 280), p_link, p_actor,
          case when v_email then 'pending' else 'none' end);
end;
$$;

create or replace function private.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(display_name, ''), handle, 'Alguém') from public.profiles where id = p_user;
$$;

-- Vendas e pagamentos ------------------------------------------------------------------
create or replace function private.notify_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer text := private.display_name(new.buyer_id);
  v_value text := 'R$ ' || replace(to_char(new.gross_cents / 100.0, 'FM999999990.00'), '.', ',');
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.kind = 'tip' then
      perform private.notify(new.creator_id, 'tip', v_buyer || ' te enviou um mimo de ' || v_value,
        'Líquido para você: R$ ' || replace(to_char(new.creator_net_cents / 100.0, 'FM999999990.00'), '.', ','),
        '/estudio/extrato', new.buyer_id);
    elsif new.kind = 'subscription' and new.renewal_of is not null then
      perform private.notify(new.creator_id, 'renewal', v_buyer || ' renovou a assinatura',
        'Mensalidade de ' || v_value, '/estudio/extrato', new.buyer_id);
    elsif new.kind = 'subscription' then
      perform private.notify(new.creator_id, 'new_subscriber', v_buyer || ' assinou o seu perfil',
        'Assinatura mensal de ' || v_value, '/estudio/vendas', new.buyer_id);
    else
      perform private.notify(new.creator_id, 'sale', 'Nova venda: ' || v_value,
        new.description || ' · comprado por ' || v_buyer, '/estudio/extrato', new.buyer_id);
    end if;
  elsif new.status = 'failed' and old.status = 'pending' and new.kind = 'subscription'
        and new.renewal_of is not null then
    perform private.notify(new.buyer_id, 'payment_failed', 'Não conseguimos renovar sua assinatura',
      'O pagamento da mensalidade de ' || private.display_name(new.creator_id)
        || ' não foi aprovado. Assine de novo para manter o acesso.',
      '/biblioteca?aba=assinaturas', new.creator_id);
  end if;
  return new;
end;
$$;
create trigger orders_notify after update of status on public.orders
  for each row execute function private.notify_order();

-- Mensagens: avisa o destinatário só na 1ª não lida da conversa (evita uma por mensagem) ---------
create or replace function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_to uuid;
  v_unread integer;
begin
  select * into c from public.conversations where id = new.conversation_id;
  v_to := case when new.sender_id = c.creator_id then c.fan_id else c.creator_id end;
  v_unread := case when v_to = c.creator_id then c.creator_unread else c.fan_unread end;
  if v_unread = 0 then
    perform private.notify(v_to, 'message', private.display_name(new.sender_id) || ' te mandou uma mensagem',
      case when new.price_cents is not null then 'Mensagem paga'
           else left(coalesce(nullif(btrim(new.body), ''), 'Nova mídia'), 120) end,
      '/mensagens/' || new.conversation_id, new.sender_id);
  end if;
  return new;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_message();

-- Novo post publicado: avisa os assinantes ativos (só no site) --------------------------------
create or replace function private.notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fan uuid;
  v_name text := private.display_name(new.creator_id);
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    for v_fan in
      select s.fan_id from public.subscriptions s
       where s.creator_id = new.creator_id and s.status in ('active', 'canceled') and s.current_period_end > now()
       limit 5000
    loop
      perform private.notify(v_fan, 'new_post', v_name || ' publicou algo novo',
        left(coalesce(nullif(btrim(new.body), ''), 'Nova publicação'), 120), '/p/' || new.id, new.creator_id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger posts_notify after insert or update of status on public.posts
  for each row execute function private.notify_new_post();

-- Novo seguidor (só no site) ---------------------------------------------------------------
create or replace function private.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.creator_id, 'new_follower', private.display_name(new.follower_id) || ' começou a seguir você',
    '', '/' || coalesce((select handle from public.profiles where id = new.follower_id), 'inicio'), new.follower_id);
  return new;
end;
$$;
create trigger follows_notify after insert on public.follows
  for each row execute function private.notify_follow();

-- RPCs do usuário --------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.set_notification_prefs(
  p_email_sales boolean, p_email_messages boolean, p_email_account boolean, p_inapp_new_posts boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_prefs (user_id, email_sales, email_messages, email_account, inapp_new_posts)
  values (auth.uid(), p_email_sales, p_email_messages, p_email_account, p_inapp_new_posts)
  on conflict (user_id) do update
    set email_sales = excluded.email_sales, email_messages = excluded.email_messages,
        email_account = excluded.email_account, inapp_new_posts = excluded.inapp_new_posts, updated_at = now();
$$;

revoke execute on function private.notify(uuid, text, text, text, text, uuid), private.display_name(uuid),
  private.notify_order(), private.notify_message(), private.notify_new_post(), private.notify_follow()
  from public, anon, authenticated;
revoke execute on function public.mark_notifications_read(bigint[]),
  public.set_notification_prefs(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]),
  public.set_notification_prefs(boolean, boolean, boolean, boolean) to authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
revoke all on public.notifications, public.notification_prefs from anon;
revoke insert, update, delete, truncate, references, trigger on public.notifications, public.notification_prefs
  from authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_prefs_select on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.notifications;
