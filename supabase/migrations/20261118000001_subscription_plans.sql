-- Planos de assinatura por período (mensal, trimestral, semestral, anual) e promoção com vagas.
-- O mensal continua em profiles.subscription_price_cents. Os demais são o mensal × meses com o
-- desconto do criador. A promoção vale só no 1º período: as renovações voltam ao preço normal.

-- Planos -----------------------------------------------------------------------------------------
create table public.subscription_plans (
  creator_id uuid not null references auth.users (id) on delete cascade,
  months smallint not null constraint subscription_plans_months check (months in (3, 6, 12)),
  discount_bps integer not null constraint subscription_plans_discount check (discount_bps between 0 and 6000),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (creator_id, months)
);

-- Promoção (uma ativa por criador) ------------------------------------------------------------------
create table public.subscription_promotions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  months smallint not null default 1 constraint subscription_promotions_months check (months in (1, 3, 6, 12)),
  discount_bps integer not null constraint subscription_promotions_discount check (discount_bps between 500 and 9000),
  message text not null default '' constraint subscription_promotions_message check (char_length(message) <= 200),
  ends_at timestamptz not null,
  max_redemptions integer constraint subscription_promotions_max check (max_redemptions is null or max_redemptions between 1 and 100000),
  redemptions integer not null default 0,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index subscription_promotions_one_open on public.subscription_promotions (creator_id)
  where ended_at is null;

alter table public.orders
  add column period_months smallint not null default 1
    constraint orders_period_months check (period_months in (1, 3, 6, 12)),
  add column renewal_price_cents integer,
  add column promotion_id uuid references public.subscription_promotions (id) on delete set null;
alter table public.subscriptions
  add column period_months smallint not null default 1
    constraint subscriptions_period_months check (period_months in (1, 3, 6, 12));

create or replace function private.plan_price(p_monthly integer, p_months integer, p_bps integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(p_monthly * p_months * (10000 - coalesce(p_bps, 0)) / 10000.0)::integer;
$$;

create or replace function private.period_label(p_months integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_months when 1 then 'mensal' when 3 then 'trimestral' when 6 then 'semestral' else 'anual' end;
$$;

-- Promoção ativa: dentro do prazo e com vaga.
create or replace function private.active_promotion(p_creator uuid)
returns public.subscription_promotions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscription_promotions
   where creator_id = p_creator and ended_at is null and ends_at > now()
     and (max_redemptions is null or redemptions < max_redemptions)
   limit 1;
$$;

-- Opções de assinatura de um criador (perfil público e checkout). Visitantes também leem.
create or replace function public.creator_subscription_options(p_creator uuid)
returns table (months integer, regular_cents integer, monthly_cents integer, plan_discount_bps integer,
               promo_id uuid, promo_cents integer, promo_discount_bps integer, promo_message text,
               promo_ends_at timestamptz, promo_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_monthly integer;
  v_promo public.subscription_promotions;
begin
  select p.subscription_price_cents into v_monthly from public.profiles p
   where p.id = p_creator and p.status = 'active';
  if v_monthly is null or not private.is_active_creator(p_creator) then return; end if;
  v_promo := private.active_promotion(p_creator);
  return query
    with opts as (
      select 1 as m, 0 as bps
      union all
      select sp.months::integer, sp.discount_bps from public.subscription_plans sp
       where sp.creator_id = p_creator and sp.active
    )
    select o.m, private.plan_price(v_monthly, o.m, o.bps), v_monthly, o.bps,
           case when v_promo.months = o.m then v_promo.id end,
           case when v_promo.months = o.m
                then round(private.plan_price(v_monthly, o.m, o.bps) * (10000 - v_promo.discount_bps) / 10000.0)::integer end,
           case when v_promo.months = o.m then v_promo.discount_bps end,
           case when v_promo.months = o.m then v_promo.message end,
           case when v_promo.months = o.m then v_promo.ends_at end,
           case when v_promo.months = o.m and v_promo.max_redemptions is not null
                then v_promo.max_redemptions - v_promo.redemptions end
      from opts o
     order by o.m;
end;
$$;

-- Criador: define os planos de 3, 6 e 12 meses ([{months, discount_bps, active}]).
create or replace function public.set_subscription_plans(p_plans jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  p jsonb;
begin
  if v_me is null or not public.has_role('creator') then
    raise exception 'apenas criadores' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plans) <> 'array' then
    raise exception 'planos inválidos' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_plans) loop
    if (p ->> 'months')::integer not in (3, 6, 12)
       or coalesce((p ->> 'discount_bps')::integer, -1) not between 0 and 6000 then
      raise exception 'plano inválido (desconto de 0%% a 60%%)' using errcode = '22023';
    end if;
    insert into public.subscription_plans (creator_id, months, discount_bps, active, updated_at)
    values (v_me, (p ->> 'months')::smallint, (p ->> 'discount_bps')::integer,
            coalesce((p ->> 'active')::boolean, true), now())
    on conflict (creator_id, months) do update
      set discount_bps = excluded.discount_bps, active = excluded.active, updated_at = now();
  end loop;
end;
$$;

-- Criador: abre uma promoção (encerra a anterior). Só o 1º período sai com desconto.
create or replace function public.start_subscription_promotion(
  p_months integer, p_discount_bps integer, p_message text, p_ends_at timestamptz,
  p_max_redemptions integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null or not public.has_role('creator') then
    raise exception 'apenas criadores' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_me and subscription_price_cents is not null) then
    raise exception 'defina o preço da assinatura antes' using errcode = '22023';
  end if;
  if p_months <> 1 and not exists (select 1 from public.subscription_plans
                                    where creator_id = v_me and months = p_months and active) then
    raise exception 'ative o plano deste período antes' using errcode = '22023';
  end if;
  if p_discount_bps not between 500 and 9000 then
    raise exception 'desconto entre 5%% e 90%%' using errcode = '22023';
  end if;
  if p_ends_at < now() + interval '1 hour' or p_ends_at > now() + interval '60 days' then
    raise exception 'a promoção dura de 1 hora a 60 dias' using errcode = '22023';
  end if;
  update public.subscription_promotions set ended_at = now() where creator_id = v_me and ended_at is null;
  insert into public.subscription_promotions (creator_id, months, discount_bps, message, ends_at, max_redemptions)
  values (v_me, p_months, p_discount_bps, left(btrim(coalesce(p_message, '')), 200), p_ends_at, p_max_redemptions)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.end_subscription_promotion()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscription_promotions set ended_at = now()
   where creator_id = auth.uid() and ended_at is null;
$$;

-- Pedido de assinatura com período e (opcional) promoção.
create or replace function public.create_subscription_order(
  p_creator_id uuid, p_months integer, p_use_promotion boolean, p_method text, p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_existing uuid;
  v_opt record;
  v_price integer;
  v_promo uuid;
  v_rule public.commission_rules;
  v_commission integer;
  v_id uuid;
begin
  if v_buyer is null or not exists (select 1 from public.profiles where id = v_buyer and status = 'active') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if p_method not in ('pix', 'card') then
    raise exception 'forma de pagamento inválida' using errcode = '22023';
  end if;
  select id into v_existing from public.orders where buyer_id = v_buyer and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;
  if p_creator_id = v_buyer then
    raise exception 'não é possível comprar o próprio conteúdo' using errcode = '22023';
  end if;
  if not private.is_active_creator(p_creator_id) or private.is_blocked_between(v_buyer, p_creator_id) then
    raise exception 'criador indisponível' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.creator_commission_acceptances where creator_id = p_creator_id) then
    raise exception 'criador ainda não habilitado para vendas' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions where fan_id = v_buyer and creator_id = p_creator_id
              and status = 'active' and current_period_end > now()) then
    raise exception 'você já assina este criador' using errcode = '23505';
  end if;

  select * into v_opt from public.creator_subscription_options(p_creator_id) o where o.months = p_months;
  if not found then
    raise exception 'plano indisponível' using errcode = 'P0002';
  end if;
  v_price := v_opt.regular_cents;
  if coalesce(p_use_promotion, false) then
    if v_opt.promo_id is null then
      raise exception 'promoção encerrada' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.orders where buyer_id = v_buyer and promotion_id = v_opt.promo_id
                and status = 'paid') then
      raise exception 'você já usou esta promoção' using errcode = '23505';
    end if;
    v_price := v_opt.promo_cents;
    v_promo := v_opt.promo_id;
  end if;
  if v_price < 500 then
    raise exception 'valor mínimo de R$ 5' using errcode = '22023';
  end if;

  v_rule := public.current_commission_rule(now());
  if v_rule.id is null then
    raise exception 'sem regra de comissão vigente' using errcode = 'P0001';
  end if;
  v_commission := round(v_price * v_rule.rate_bps / 10000.0)::integer;

  insert into public.orders (buyer_id, creator_id, kind, target_id, description, method, gross_cents,
                             commission_rule_id, commission_rule_version, commission_bps, commission_cents,
                             external_fees_cents, creator_net_cents, idempotency_key,
                             period_months, renewal_price_cents, promotion_id)
  values (v_buyer, p_creator_id, 'subscription', p_creator_id,
          'Assinatura ' || private.period_label(p_months) || case when v_promo is not null then ' (promoção)' else '' end,
          p_method, v_price, v_rule.id, v_rule.version, v_rule.rate_bps, v_commission, 0, v_price - v_commission,
          p_idempotency_key, p_months, v_opt.regular_cents, v_promo)
  returning id into v_id;
  return v_id;
end;
$$;

-- Renovação herda o período da assinatura.
create or replace function private.orders_renewal_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months smallint;
begin
  if new.kind = 'subscription' and new.renewal_of is not null then
    select period_months into v_months from public.subscriptions
     where fan_id = new.buyer_id and creator_id = new.creator_id;
    new.period_months := coalesce(v_months, 1);
    new.description := 'Assinatura ' || private.period_label(new.period_months) || ' (renovação)';
  end if;
  return new;
end;
$$;
create trigger orders_renewal_period before insert on public.orders
  for each row execute function private.orders_renewal_period();

-- Pagamento confirmado: período em meses do calendário e preço de renovação (sem promoção).
create or replace function private.subscriptions_apply_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  if new.last_order_id is null or (tg_op = 'UPDATE' and new.last_order_id is not distinct from old.last_order_id) then
    return new;
  end if;
  select * into o from public.orders where id = new.last_order_id;
  if not found then return new; end if;
  new.period_months := o.period_months;
  new.price_cents := coalesce(o.renewal_price_cents, o.gross_cents);
  new.current_period_end := (case when tg_op = 'INSERT' then now() else greatest(old.current_period_end, now()) end)
    + make_interval(months => o.period_months);
  return new;
end;
$$;
create trigger subscriptions_apply_order before insert or update on public.subscriptions
  for each row execute function private.subscriptions_apply_order();

-- Vaga consumida quando o pagamento da promoção é confirmado; encerra ao esgotar.
create or replace function private.promotion_redeem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.promotion_id is not null and new.status = 'paid' and old.status is distinct from 'paid' then
    update public.subscription_promotions
       set redemptions = redemptions + 1,
           ended_at = case when max_redemptions is not null and redemptions + 1 >= max_redemptions
                           then now() else ended_at end
     where id = new.promotion_id;
  end if;
  return new;
end;
$$;
create trigger orders_promotion_redeem after update of status on public.orders
  for each row execute function private.promotion_redeem();

-- Servidor: valor de renovação e líquido do criador (para atualizar a assinatura no provedor).
create or replace function public.subscription_renewal_terms(p_order_id uuid)
returns table (renewal_cents integer, creator_net_cents integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_rule public.commission_rules;
  v_price integer;
  v_commission integer;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return; end if;
  v_price := coalesce(o.renewal_price_cents, o.gross_cents);
  v_rule := public.current_commission_rule(now());
  v_commission := round(v_price * coalesce(v_rule.rate_bps, o.commission_bps) / 10000.0)::integer;
  return query select v_price,
    v_price - v_commission - private.estimate_fee(coalesce(o.provider, 'asaas'), o.method, v_price);
end;
$$;

-- RLS e permissões ---------------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscription_promotions enable row level security;
create policy subscription_plans_read on public.subscription_plans for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy subscription_promotions_read on public.subscription_promotions for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
grant select on public.subscription_plans, public.subscription_promotions to authenticated;

revoke execute on function public.creator_subscription_options(uuid) from public;
grant execute on function public.creator_subscription_options(uuid) to anon, authenticated;
revoke execute on function public.set_subscription_plans(jsonb),
  public.start_subscription_promotion(integer, integer, text, timestamptz, integer),
  public.end_subscription_promotion(),
  public.create_subscription_order(uuid, integer, boolean, text, text) from public, anon;
grant execute on function public.set_subscription_plans(jsonb),
  public.start_subscription_promotion(integer, integer, text, timestamptz, integer),
  public.end_subscription_promotion(),
  public.create_subscription_order(uuid, integer, boolean, text, text) to authenticated;
revoke execute on function public.subscription_renewal_terms(uuid) from public, anon, authenticated;
grant execute on function public.subscription_renewal_terms(uuid) to service_role;
revoke execute on function private.plan_price(integer, integer, integer), private.period_label(integer),
  private.active_promotion(uuid) from public, anon, authenticated;
