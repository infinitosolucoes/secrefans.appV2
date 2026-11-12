-- S5: provedor real (Asaas), taxa do meio de pagamento paga pelo criador, renovação de
-- assinaturas pelo provedor e ledger de partidas dobradas (imutável, sempre balanceado).

-- Taxa ESTIMADA por provedor/meio (versionada). A taxa real vem do provedor (netValue) e a
-- diferença vai para a conta fee_variance da plataforma; o criador recebe o líquido estimado.
create table public.payment_fee_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  method text not null constraint payment_fee_settings_method check (method in ('pix', 'card')),
  fixed_cents integer not null default 0 constraint payment_fee_settings_fixed check (fixed_cents between 0 and 10000),
  bps integer not null default 0 constraint payment_fee_settings_bps check (bps between 0 and 2000),
  effective_from timestamptz not null default now(),
  reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payment_fee_settings_lookup on public.payment_fee_settings (provider, method, effective_from desc);

-- Valores iniciais de referência (ajustáveis no Super Admin conforme o contrato com o Asaas).
insert into public.payment_fee_settings (provider, method, fixed_cents, bps, effective_from, reason) values
  ('asaas', 'pix', 199, 0, '2026-01-01T00:00:00Z', 'Estimativa inicial: Pix R$ 1,99 por cobrança (medida no sandbox)'),
  ('asaas', 'card', 49, 299, '2026-01-01T00:00:00Z', 'Estimativa inicial: cartão 2,99% + R$ 0,49');

create or replace function private.estimate_fee(p_provider text, p_method text, p_gross integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.fixed_cents + round(p_gross * f.bps / 10000.0)::integer
      from public.payment_fee_settings f
     where f.provider = p_provider and f.method = p_method and f.effective_from <= now()
     order by f.effective_from desc, f.created_at desc
     limit 1
  ), 0);
$$;

-- Cliente do fã no provedor. O CPF completo vai só para o provedor; aqui fica o final.
create table public.payment_customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  cpf_last4 text not null constraint payment_customers_cpf check (cpf_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, provider_customer_id)
);

-- Conta de recebimento do criador (subconta Asaas): destino do split.
create table public.creator_payout_accounts (
  creator_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  wallet_id text not null,
  status text not null default 'pending' constraint creator_payout_status check (status in ('pending', 'approved', 'rejected')),
  document_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, provider),
  unique (provider, wallet_id)
);
create trigger creator_payout_accounts_set_updated_at before update on public.creator_payout_accounts
  for each row execute function private.set_updated_at();

-- Segredos devolvidos pelo provedor na criação da subconta (ex.: apiKey, irrecuperável depois).
-- Schema private: inacessível pela API; só funções do servidor. (Migrar para o Vault antes do go-live.)
create table private.payout_account_secrets (
  creator_id uuid not null,
  provider text not null,
  secret jsonb not null,
  created_at timestamptz not null default now(),
  primary key (creator_id, provider)
);

-- Pedidos: taxa real, renovação e vínculo com a assinatura do provedor.
alter table public.orders
  add column actual_fee_cents integer constraint orders_actual_fee check (actual_fee_cents is null or actual_fee_cents >= 0),
  add column provider_subscription_id text,
  add column renewal_of uuid references public.orders (id) on delete set null;
create index orders_provider_subscription_idx on public.orders (provider, provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.subscriptions
  add column provider text,
  add column provider_subscription_id text;
create unique index subscriptions_provider_ref on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- Ledger de partidas dobradas ----------------------------------------------------------
create table public.ledger_accounts (
  code text primary key,
  kind text not null constraint ledger_accounts_kind check
    (kind in ('provider_clearing', 'platform_revenue', 'creator_payable', 'fee_variance')),
  owner_id uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
insert into public.ledger_accounts (code, kind) values
  ('provider_clearing:asaas', 'provider_clearing'),
  ('provider_clearing:simulado', 'provider_clearing'),
  ('platform_revenue', 'platform_revenue'),
  ('fee_variance', 'fee_variance');

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete restrict,
  kind text not null constraint ledger_entries_kind check (kind in ('sale', 'refund', 'chargeback')),
  payment_event_id uuid references public.payment_events (id) on delete restrict,
  memo text not null default '',
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);

create table public.ledger_lines (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.ledger_entries (id) on delete restrict,
  account_code text not null references public.ledger_accounts (code) on delete restrict,
  debit_cents integer not null default 0 constraint ledger_lines_debit check (debit_cents >= 0),
  credit_cents integer not null default 0 constraint ledger_lines_credit check (credit_cents >= 0),
  constraint ledger_lines_one_side check ((debit_cents = 0) <> (credit_cents = 0))
);
create index ledger_lines_entry_idx on public.ledger_lines (entry_id);
create index ledger_lines_account_idx on public.ledger_lines (account_code);

-- Marcadores de ambiente gravados só pelo seed.sql local (nunca aplicado no remoto).
create table private.environment_markers (key text primary key);
revoke all on private.environment_markers from public, anon, authenticated, service_role;

-- Imutável (como a auditoria).
create or replace function private.prevent_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exceção só para o banco local de testes (limpeza entre execuções de E2E/pgTAP).
  if tg_op in ('DELETE', 'TRUNCATE')
     and exists (select 1 from private.environment_markers where key = 'local_test_db') then
    return case when tg_op = 'DELETE' then old else null end;
  end if;
  raise exception 'ledger é imutável (append-only)' using errcode = '42501';
end;
$$;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function private.prevent_ledger_mutation();
create trigger ledger_lines_immutable before update or delete on public.ledger_lines
  for each row execute function private.prevent_ledger_mutation();
create trigger ledger_entries_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.prevent_ledger_mutation();
create trigger ledger_lines_no_truncate before truncate on public.ledger_lines
  for each statement execute function private.prevent_ledger_mutation();

-- Débitos = créditos em cada lançamento, conferido no fim da transação.
create or replace function private.check_ledger_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_diff bigint;
begin
  select coalesce(sum(debit_cents), 0) - coalesce(sum(credit_cents), 0) into v_diff
    from public.ledger_lines where entry_id = new.entry_id;
  if v_diff <> 0 then
    raise exception 'lançamento % desbalanceado (diferença %)', new.entry_id, v_diff using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger ledger_lines_balanced after insert on public.ledger_lines
  deferrable initially deferred
  for each row execute function private.check_ledger_balance();

create or replace function private.ledger_creator_account(p_creator uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := 'creator_payable:' || p_creator::text;
begin
  insert into public.ledger_accounts (code, kind, owner_id) values (v_code, 'creator_payable', p_creator)
  on conflict (code) do nothing;
  return v_code;
end;
$$;

-- Venda paga: D clearing (líquido real) = C criador (líquido estimado) + C plataforma (comissão)
-- ± fee_variance (taxa estimada − taxa real, absorvida pela plataforma).
create or replace function private.ledger_post_sale(p_order public.orders, p_net_cents integer, p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry bigint;
  v_variance integer := p_net_cents - p_order.creator_net_cents - p_order.commission_cents;
begin
  insert into public.ledger_entries (order_id, kind, payment_event_id, memo)
  values (p_order.id, 'sale', p_event, p_order.description)
  returning id into v_entry;
  insert into public.ledger_lines (entry_id, account_code, debit_cents) values
    (v_entry, 'provider_clearing:' || p_order.provider, p_net_cents);
  insert into public.ledger_lines (entry_id, account_code, credit_cents)
    select v_entry, private.ledger_creator_account(p_order.creator_id), p_order.creator_net_cents
     where p_order.creator_net_cents > 0;
  insert into public.ledger_lines (entry_id, account_code, credit_cents)
    select v_entry, 'platform_revenue', p_order.commission_cents where p_order.commission_cents > 0;
  if v_variance > 0 then
    insert into public.ledger_lines (entry_id, account_code, credit_cents) values (v_entry, 'fee_variance', v_variance);
  elsif v_variance < 0 then
    insert into public.ledger_lines (entry_id, account_code, debit_cents) values (v_entry, 'fee_variance', -v_variance);
  end if;
end;
$$;

-- Estorno/chargeback: lançamento inverso da venda (o saldo do criador pode ficar negativo).
create or replace function private.ledger_post_reversal(p_order_id uuid, p_kind text, p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale bigint;
  v_entry bigint;
begin
  select id into v_sale from public.ledger_entries where order_id = p_order_id and kind = 'sale';
  if v_sale is null then return; end if;
  insert into public.ledger_entries (order_id, kind, payment_event_id, memo)
  values (p_order_id, p_kind, p_event, 'Reversão: ' || p_kind)
  returning id into v_entry;
  insert into public.ledger_lines (entry_id, account_code, debit_cents, credit_cents)
    select v_entry, account_code, credit_cents, debit_cents from public.ledger_lines where entry_id = v_sale;
end;
$$;

-- Saldo a repassar do próprio criador.
create or replace view public.creator_balance
with (security_invoker = false) as
  select a.owner_id as creator_id,
         coalesce(sum(l.credit_cents), 0) - coalesce(sum(l.debit_cents), 0) as balance_cents,
         count(distinct l.entry_id) as entries
    from public.ledger_accounts a
    left join public.ledger_lines l on l.account_code = a.code
   where a.kind = 'creator_payable'
     and (a.owner_id = (select auth.uid()) or public.staff_can('finance.read'))
   group by a.owner_id;

-- Prepara o pedido para o provedor: grava o provedor e aplica a taxa estimada (somente servidor).
-- Devolve o líquido do criador, usado no split.
create or replace function public.prepare_order_charge(p_order_id uuid, p_provider text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_fee integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'pending' then
    raise exception 'pedido indisponível' using errcode = 'P0002';
  end if;
  if v_order.provider_ref is not null then
    return v_order.creator_net_cents;
  end if;
  v_fee := private.estimate_fee(p_provider, v_order.method, v_order.gross_cents);
  if v_order.gross_cents - v_order.commission_cents - v_fee <= 0 then
    raise exception 'valor baixo demais para este meio de pagamento' using errcode = '22023';
  end if;
  update public.orders
     set provider = p_provider, external_fees_cents = v_fee,
         creator_net_cents = gross_cents - commission_cents - v_fee
   where id = p_order_id;
  return v_order.gross_cents - v_order.commission_cents - v_fee;
end;
$$;

create or replace function public.attach_order_charge(
  p_order_id uuid, p_provider text, p_provider_ref text, p_provider_subscription_id text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders
     set provider = p_provider, provider_ref = p_provider_ref,
         provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id)
   where id = p_order_id and status = 'pending' and provider_ref is null;
$$;
drop function public.attach_order_charge(uuid, text, text);

-- Mensalidade gerada pelo provedor: novo pedido com a regra de comissão VIGENTE na renovação.
create or replace function public.create_renewal_order(
  p_provider text, p_provider_ref text, p_provider_subscription_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_sub public.subscriptions;
  v_last public.orders;
  v_rule public.commission_rules;
  v_commission integer;
  v_fee integer;
  v_id uuid;
begin
  select id into v_existing from public.orders where provider = p_provider and provider_ref = p_provider_ref;
  if found then return v_existing; end if;

  select * into v_sub from public.subscriptions
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id;
  if not found then
    return null; -- primeira cobrança ainda não vinculada ao pedido inicial
  end if;
  select * into v_last from public.orders where id = v_sub.last_order_id;

  v_rule := public.current_commission_rule(now());
  if v_rule.id is null then
    raise exception 'sem regra de comissão vigente' using errcode = 'P0001';
  end if;
  v_commission := round(v_sub.price_cents * v_rule.rate_bps / 10000.0)::integer;
  v_fee := private.estimate_fee(p_provider, coalesce(v_last.method, 'card'), v_sub.price_cents);

  insert into public.orders (buyer_id, creator_id, kind, target_id, description, method, gross_cents,
                             commission_rule_id, commission_rule_version, commission_bps, commission_cents,
                             external_fees_cents, creator_net_cents, idempotency_key, provider, provider_ref,
                             provider_subscription_id, renewal_of)
  values (v_sub.fan_id, v_sub.creator_id, 'subscription', v_sub.creator_id, 'Assinatura mensal (renovação)',
          coalesce(v_last.method, 'card'), v_sub.price_cents, v_rule.id, v_rule.version, v_rule.rate_bps,
          v_commission, v_fee, v_sub.price_cents - v_commission - v_fee, left('renew:' || p_provider_ref, 80),
          p_provider, p_provider_ref, p_provider_subscription_id, v_sub.last_order_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Evento validado: agora também recebe o líquido real (netValue) e lança no ledger.
drop function public.confirm_payment(text, text, text, text, jsonb);
create or replace function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_status text,
  p_payload jsonb default '{}'::jsonb, p_net_cents integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_event uuid;
  v_net integer;
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
    -- Sem netValue (provedor simulado): taxa real = estimada.
    v_net := coalesce(p_net_cents, v_order.gross_cents - v_order.external_fees_cents);
    if v_net < 0 or v_net > v_order.gross_cents then
      raise exception 'valor líquido inválido' using errcode = '22023';
    end if;
    update public.orders set status = 'paid', paid_at = now(), actual_fee_cents = gross_cents - v_net
     where id = v_order.id
     returning * into v_order;
    perform private.ledger_post_sale(v_order, v_net, v_event);

    if v_order.kind = 'ppv' then
      insert into public.entitlements (user_id, kind, target_id, order_id)
      values (v_order.buyer_id, 'post', v_order.target_id, v_order.id) on conflict do nothing;
    elsif v_order.kind = 'package' then
      insert into public.entitlements (user_id, kind, target_id, order_id)
      values (v_order.buyer_id, 'package_version', v_order.target_id, v_order.id) on conflict do nothing;
    elsif v_order.kind = 'subscription' then
      insert into public.subscriptions (fan_id, creator_id, price_cents, status, current_period_end, last_order_id,
                                        provider, provider_subscription_id)
      values (v_order.buyer_id, v_order.creator_id, v_order.gross_cents, 'active', now() + interval '30 days',
              v_order.id, v_order.provider, v_order.provider_subscription_id)
      on conflict (fan_id, creator_id) do update
        set status = case when public.subscriptions.cancel_at_period_end then public.subscriptions.status
                          else 'active' end,
            price_cents = excluded.price_cents,
            current_period_end = greatest(public.subscriptions.current_period_end, now()) + interval '30 days',
            last_order_id = excluded.last_order_id,
            provider = excluded.provider,
            provider_subscription_id = coalesce(excluded.provider_subscription_id,
                                                public.subscriptions.provider_subscription_id);
    end if;
    return 'paid';
  elsif p_status = 'failed' then
    if v_order.status = 'pending' then
      update public.orders set status = 'failed' where id = v_order.id;
    end if;
    return 'failed';
  else -- refunded / chargeback: revoga o acesso e reverte o lançamento (spec M07)
    if v_order.status <> 'paid' then return 'ignored'; end if;
    update public.orders set status = p_status::public.order_status where id = v_order.id;
    perform private.ledger_post_reversal(v_order.id,
      case when p_status = 'refunded' then 'refund' else 'chargeback' end, v_event);
    update public.entitlements set revoked_at = now() where order_id = v_order.id and revoked_at is null;
    if v_order.kind = 'subscription' then
      update public.subscriptions set status = 'expired', current_period_end = now()
       where fan_id = v_order.buyer_id and creator_id = v_order.creator_id and last_order_id = v_order.id;
    end if;
    return p_status;
  end if;
end;
$$;

-- Super Admin: nova taxa estimada (vale para pedidos novos; auditada).
create or replace function public.set_payment_fee(
  p_provider text, p_method text, p_fixed_cents integer, p_bps integer, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('commission.manage') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'justificativa obrigatória' using errcode = '22023';
  end if;
  insert into public.payment_fee_settings (provider, method, fixed_cents, bps, reason, created_by)
  values (p_provider, p_method, p_fixed_cents, p_bps, p_reason, auth.uid());
  perform private.audit('payment_fee.set', 'payment_fee', p_provider || ':' || p_method, p_reason,
    jsonb_build_object('fixed_cents', p_fixed_cents, 'bps', p_bps));
end;
$$;

-- Registro da subconta do criador (somente servidor, logo após criá-la no provedor).
create or replace function public.register_payout_account(
  p_creator_id uuid, p_provider text, p_account_id text, p_wallet_id text, p_status text,
  p_document_last4 text, p_secret jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.creator_payout_accounts (creator_id, provider, provider_account_id, wallet_id, status, document_last4)
  values (p_creator_id, p_provider, p_account_id, p_wallet_id, p_status, p_document_last4)
  on conflict (creator_id, provider) do update
    set provider_account_id = excluded.provider_account_id, wallet_id = excluded.wallet_id,
        status = excluded.status, document_last4 = excluded.document_last4;
  if p_secret is not null then
    insert into private.payout_account_secrets (creator_id, provider, secret)
    values (p_creator_id, p_provider, p_secret)
    on conflict (creator_id, provider) do update set secret = excluded.secret, created_at = now();
  end if;
end;
$$;
revoke execute on function public.register_payout_account(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.register_payout_account(uuid, text, text, text, text, text, jsonb) to service_role;

-- Permissões de execução ----------------------------------------------------------------
revoke execute on function private.estimate_fee(text, text, integer), private.ledger_creator_account(uuid),
  private.ledger_post_sale(public.orders, integer, uuid), private.ledger_post_reversal(uuid, text, uuid)
  from public, anon, authenticated;

revoke execute on function public.prepare_order_charge(uuid, text),
  public.attach_order_charge(uuid, text, text, text),
  public.create_renewal_order(text, text, text),
  public.confirm_payment(text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.prepare_order_charge(uuid, text),
  public.attach_order_charge(uuid, text, text, text),
  public.create_renewal_order(text, text, text),
  public.confirm_payment(text, text, text, text, jsonb, integer) to service_role;

revoke execute on function public.set_payment_fee(text, text, integer, integer, text) from public, anon;
grant execute on function public.set_payment_fee(text, text, integer, integer, text) to authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.payment_fee_settings enable row level security;
alter table public.payment_customers enable row level security;
alter table public.creator_payout_accounts enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_lines enable row level security;
alter table private.payout_account_secrets enable row level security;

revoke all on public.payment_fee_settings, public.payment_customers, public.creator_payout_accounts,
  public.ledger_accounts, public.ledger_entries, public.ledger_lines from anon;
revoke insert, update, delete, truncate, references, trigger on public.payment_fee_settings,
  public.payment_customers, public.creator_payout_accounts, public.ledger_accounts, public.ledger_entries,
  public.ledger_lines from authenticated;
revoke all on private.payout_account_secrets from public, anon, authenticated;
grant select, insert, update on private.payout_account_secrets to service_role;
grant select on public.creator_balance to authenticated;
revoke all on public.creator_balance from anon;

create policy payment_fee_settings_select on public.payment_fee_settings for select to authenticated using (true);
create policy payment_customers_select on public.payment_customers for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy creator_payout_select on public.creator_payout_accounts for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy ledger_accounts_select on public.ledger_accounts for select to authenticated
  using (public.staff_can('finance.read'));
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (public.staff_can('finance.read'));
create policy ledger_lines_select on public.ledger_lines for select to authenticated
  using (public.staff_can('finance.read'));
