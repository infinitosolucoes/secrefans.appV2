-- S4: comissão por venda (versionada, sem retroatividade), pedidos, assinaturas de fãs, PPV,
-- pacotes e gorjetas. Acesso só é liberado por evento de pagamento validado no servidor
-- (confirm_payment, restrito à service_role). Ledger de dupla entrada e split real: S5.

create type public.order_kind as enum ('subscription', 'ppv', 'package', 'tip');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'chargeback');
create type public.commission_rule_status as enum ('pending_approval', 'approved', 'rejected');
create type public.subscription_status as enum ('active', 'canceled', 'expired');

-- Regras de comissão ------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique constraint commission_rules_version check (version >= 1),
  rate_bps integer not null constraint commission_rules_rate check (rate_bps between 0 and 5000),
  applies_to_tips boolean not null default true,
  effective_from timestamptz not null,
  status public.commission_rule_status not null default 'pending_approval',
  reason text not null constraint commission_rules_reason check (char_length(btrim(reason)) >= 5),
  proposed_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);
create index commission_rules_effective_idx on public.commission_rules (effective_from desc) where status = 'approved';

-- Taxa inicial do lançamento: 10% sobre o valor bruto, inclusive gorjetas.
insert into public.commission_rules (version, rate_bps, applies_to_tips, effective_from, status, reason, decided_at, decision_reason)
values (1, 1000, true, '2026-01-01T00:00:00Z', 'approved', 'Taxa inicial do lançamento: 10% por venda', now(),
        'Definida pelo dono da plataforma');

create or replace function public.current_commission_rule(p_at timestamptz default now())
returns public.commission_rules
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.commission_rules
   where status = 'approved' and effective_from <= p_at
   order by effective_from desc, version desc
   limit 1;
$$;

-- Ciência/aceite do criador sobre a regra (PLAN-001).
create table public.creator_commission_acceptances (
  creator_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid not null references public.commission_rules (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  primary key (creator_id, rule_id)
);

-- Preço da assinatura mensal do criador (null = não oferece assinatura).
alter table public.profiles
  add column subscription_price_cents integer
    constraint profiles_subscription_price check (subscription_price_cents is null or subscription_price_cents between 500 and 100000);
grant update (subscription_price_cents) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = false) as
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.banner_path,
         exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'creator') as is_creator,
         p.created_at, p.categories, p.links, p.socials, p.creator_type, p.subscription_price_cents
  from public.profiles p
  where p.status = 'active' and p.visibility <> 'private';

-- Pedidos ------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete restrict,
  creator_id uuid not null references auth.users (id) on delete restrict,
  kind public.order_kind not null,
  -- ppv: post; package: versão do pacote; subscription/tip: o próprio criador.
  target_id uuid not null,
  description text not null default '',
  method text not null constraint orders_method check (method in ('pix', 'card')),
  -- Snapshot congelado no pedido (spec M17 §4).
  gross_cents integer not null constraint orders_gross check (gross_cents > 0),
  commission_rule_id uuid not null references public.commission_rules (id),
  commission_rule_version integer not null,
  commission_bps integer not null,
  commission_cents integer not null constraint orders_commission check (commission_cents >= 0),
  external_fees_cents integer not null default 0 constraint orders_fees check (external_fees_cents >= 0),
  creator_net_cents integer not null,
  status public.order_status not null default 'pending',
  provider text,
  provider_ref text,
  idempotency_key text not null constraint orders_idem check (char_length(idempotency_key) between 8 and 80),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint orders_split check (creator_net_cents = gross_cents - commission_cents - external_fees_cents),
  unique (buyer_id, idempotency_key),
  unique (provider, provider_ref)
);
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_creator_idx on public.orders (creator_id, created_at desc);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  order_id uuid references public.orders (id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  price_cents integer not null,
  status public.subscription_status not null default 'active',
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  last_order_id uuid references public.orders (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (fan_id, creator_id)
);
create index subscriptions_creator_idx on public.subscriptions (creator_id);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint entitlements_kind check (kind in ('post', 'package_version')),
  target_id uuid not null,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index entitlements_one_active on public.entitlements (user_id, kind, target_id) where revoked_at is null;

-- Permissões financeiras -----------------------------------------------------------
insert into public.permissions (key, description) values
  ('finance.read', 'Consultar pedidos, comissões e assinaturas'),
  ('commission.manage', 'Propor e aprovar regras de comissão');
insert into public.role_permissions (role, permission_key) values
  ('finance', 'finance.read'), ('admin_ops', 'finance.read'),
  ('super_admin', 'finance.read'), ('super_admin', 'commission.manage');

-- Regras de acesso -----------------------------------------------------------------
create or replace function public.has_active_subscription(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.subscriptions s
     where s.fan_id = auth.uid() and s.creator_id = p_creator_id
       and s.status in ('active', 'canceled') and s.current_period_end > now()
  );
$$;

create or replace function public.has_entitlement(p_kind text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.entitlements e
     where e.user_id = auth.uid() and e.kind = p_kind and e.target_id = p_target_id and e.revoked_at is null
  );
$$;

-- Mídia do post: dono, moderação, grátis visível, assinante ativo (posts de assinantes)
-- ou comprador do PPV (o PPV é vendido à parte, mesmo para assinantes).
create or replace function public.can_view_post_media(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts po
    where po.id = p_post_id
      and (
        po.creator_id = auth.uid()
        or public.staff_can('content.moderate')
        or (public.post_card_visible(po.id) and (
              po.visibility = 'free'
              or (po.visibility = 'subscribers' and public.has_active_subscription(po.creator_id))
              or (po.visibility = 'ppv' and public.has_entitlement('post', po.id))
        ))
      )
  );
$$;

-- Itens de uma versão de pacote: dono, moderação ou quem comprou ESTA versão.
create or replace function public.package_items_for(p_version_id uuid)
returns table (storage_path text, kind text, poster_path text, width integer, height integer,
               duration_seconds integer, "position" smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select i.storage_path, i.kind, i.poster_path, i.width, i.height, i.duration_seconds, i.position
    from public.package_items i
    join public.package_versions v on v.id = i.version_id
    join public.packages p on p.id = v.package_id
   where i.version_id = p_version_id
     and (p.creator_id = auth.uid()
          or public.staff_can('content.moderate')
          or public.has_entitlement('package_version', p_version_id))
   order by i.position;
$$;

revoke execute on function public.has_active_subscription(uuid), public.has_entitlement(text, uuid),
  public.package_items_for(uuid), public.current_commission_rule(timestamptz) from public;
grant execute on function public.has_active_subscription(uuid), public.has_entitlement(text, uuid),
  public.package_items_for(uuid), public.current_commission_rule(timestamptz) to anon, authenticated;

-- Criação do pedido: preço e comissão calculados no banco (nunca vindos do cliente) ----
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
  else -- tip
    if p_amount_cents is null or p_amount_cents not between 500 and 100000 then
      raise exception 'valor de gorjeta inválido' using errcode = '22023';
    end if;
    v_creator := p_target_id; v_price := p_amount_cents; v_desc := 'Gorjeta';
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

-- Vincula a cobrança criada no provedor ao pedido (somente servidor).
create or replace function public.attach_order_charge(p_order_id uuid, p_provider text, p_provider_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set provider = p_provider, provider_ref = p_provider_ref
   where id = p_order_id and status = 'pending' and provider_ref is null;
$$;

-- Evento de pagamento validado (webhook): idempotente por (provider, event_id). Somente servidor.
create or replace function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_status text, p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_event uuid;
begin
  if p_status not in ('paid', 'failed', 'refunded', 'chargeback') then
    raise exception 'status inválido' using errcode = '22023';
  end if;
  select * into v_order from public.orders where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;

  insert into public.payment_events (provider, event_id, order_id, type, payload)
  values (p_provider, p_event_id, v_order.id, p_status, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  if p_status = 'paid' then
    if v_order.status <> 'pending' then return 'ignored'; end if;
    update public.orders set status = 'paid', paid_at = now() where id = v_order.id;
    if v_order.kind = 'ppv' then
      insert into public.entitlements (user_id, kind, target_id, order_id)
      values (v_order.buyer_id, 'post', v_order.target_id, v_order.id) on conflict do nothing;
    elsif v_order.kind = 'package' then
      insert into public.entitlements (user_id, kind, target_id, order_id)
      values (v_order.buyer_id, 'package_version', v_order.target_id, v_order.id) on conflict do nothing;
    elsif v_order.kind = 'subscription' then
      insert into public.subscriptions (fan_id, creator_id, price_cents, status, current_period_end, last_order_id)
      values (v_order.buyer_id, v_order.creator_id, v_order.gross_cents, 'active', now() + interval '30 days', v_order.id)
      on conflict (fan_id, creator_id) do update
        set status = 'active', cancel_at_period_end = false, price_cents = excluded.price_cents,
            current_period_end = greatest(public.subscriptions.current_period_end, now()) + interval '30 days',
            last_order_id = excluded.last_order_id;
    end if;
    return 'paid';
  elsif p_status = 'failed' then
    if v_order.status = 'pending' then
      update public.orders set status = 'failed' where id = v_order.id;
    end if;
    return 'failed';
  else -- refunded / chargeback: revê o acesso (spec M07)
    if v_order.status <> 'paid' then return 'ignored'; end if;
    update public.orders set status = p_status::public.order_status where id = v_order.id;
    update public.entitlements set revoked_at = now() where order_id = v_order.id and revoked_at is null;
    if v_order.kind = 'subscription' then
      update public.subscriptions set status = 'expired', current_period_end = now()
       where fan_id = v_order.buyer_id and creator_id = v_order.creator_id and last_order_id = v_order.id;
    end if;
    return p_status;
  end if;
end;
$$;

-- Cancelamento pelo fã: o acesso vale até o fim do período pago.
create or replace function public.cancel_subscription(p_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions set status = 'canceled', cancel_at_period_end = true
   where fan_id = auth.uid() and creator_id = p_creator_id and status = 'active';
  if not found then
    raise exception 'assinatura não encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- Ciência da regra vigente pelo criador.
create or replace function public.accept_commission_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('creator') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commission_rules where id = p_rule_id and status = 'approved') then
    raise exception 'regra inválida' using errcode = 'P0002';
  end if;
  insert into public.creator_commission_acceptances (creator_id, rule_id) values (auth.uid(), p_rule_id)
  on conflict do nothing;
end;
$$;

-- Super Admin: propor nova taxa (vale só para vendas novas a partir da data informada).
create or replace function public.propose_commission_rule(
  p_rate_bps integer, p_effective_from timestamptz, p_applies_to_tips boolean, p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not public.staff_can('commission.manage') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if p_effective_from < now() - interval '1 minute' then
    raise exception 'sem retroatividade: a vigência precisa ser futura' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'justificativa obrigatória' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.commission_rules;
  insert into public.commission_rules (version, rate_bps, applies_to_tips, effective_from, reason, proposed_by)
  values (v_version, p_rate_bps, p_applies_to_tips, p_effective_from, p_reason, auth.uid());
  perform private.audit('commission.propose', 'commission_rule', v_version::text, p_reason,
    jsonb_build_object('rate_bps', p_rate_bps, 'effective_from', p_effective_from, 'applies_to_tips', p_applies_to_tips));
  return v_version;
end;
$$;

-- Segunda aprovação: precisa ser outro administrador (operação financeira sensível).
create or replace function public.decide_commission_rule(p_rule_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.commission_rules;
begin
  if not public.staff_can('commission.manage') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  select * into r from public.commission_rules where id = p_rule_id for update;
  if not found or r.status <> 'pending_approval' then
    raise exception 'regra não encontrada ou já decidida' using errcode = 'P0002';
  end if;
  if r.proposed_by = auth.uid() then
    raise exception 'a aprovação precisa ser de outro administrador' using errcode = '42501';
  end if;
  if p_approve and r.effective_from < now() - interval '1 minute' then
    raise exception 'vigência já passou: proponha uma nova data' using errcode = '22023';
  end if;
  update public.commission_rules
     set status = case when p_approve then 'approved'::public.commission_rule_status else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
   where id = p_rule_id;
  perform private.audit(case when p_approve then 'commission.approve' else 'commission.reject' end,
    'commission_rule', r.version::text, p_reason, jsonb_build_object('rate_bps', r.rate_bps));
end;
$$;

revoke execute on function public.create_order(public.order_kind, uuid, integer, text, text),
  public.cancel_subscription(uuid), public.accept_commission_rule(uuid),
  public.propose_commission_rule(integer, timestamptz, boolean, text),
  public.decide_commission_rule(uuid, boolean, text) from public, anon;
grant execute on function public.create_order(public.order_kind, uuid, integer, text, text),
  public.cancel_subscription(uuid), public.accept_commission_rule(uuid),
  public.propose_commission_rule(integer, timestamptz, boolean, text),
  public.decide_commission_rule(uuid, boolean, text) to authenticated;
-- Confirmação de pagamento e vínculo de cobrança: só o servidor (service_role), nunca o navegador.
revoke execute on function public.confirm_payment(text, text, text, text, jsonb),
  public.attach_order_charge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_payment(text, text, text, text, jsonb),
  public.attach_order_charge(uuid, text, text) to service_role;

-- RLS -------------------------------------------------------------------------------
alter table public.commission_rules enable row level security;
alter table public.creator_commission_acceptances enable row level security;
alter table public.orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;

revoke all on public.commission_rules, public.creator_commission_acceptances, public.orders,
  public.payment_events, public.subscriptions, public.entitlements from anon;
revoke insert, update, delete, truncate, references, trigger on public.commission_rules,
  public.creator_commission_acceptances, public.orders, public.payment_events, public.subscriptions,
  public.entitlements from authenticated;

create policy commission_rules_select on public.commission_rules for select to authenticated
  using (status = 'approved' or public.staff_can('commission.manage'));
create policy acceptances_select on public.creator_commission_acceptances for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy orders_select on public.orders for select to authenticated
  using (buyer_id = (select auth.uid()) or creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy payment_events_select on public.payment_events for select to authenticated
  using (public.staff_can('finance.read'));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (fan_id = (select auth.uid()) or creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy entitlements_select on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can('finance.read'));
