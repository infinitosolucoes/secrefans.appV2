-- S6: saques do criador (saldo "a receber" pela Secretfans → Pix do criador, via Asaas).
-- Fluxo: criador cadastra a chave Pix e pede o saque → financeiro aprova (MFA) → servidor cria a
-- transferência no provedor → webhook/conciliação confirma (paid) ou falha (failed).
-- O ledger só lança o repasse quando o provedor confirma: D creator_payable / C provider_clearing,
-- e a tarifa da transferência (se houver) fica com a plataforma: D fee_variance / C provider_clearing.
-- Enquanto o saque está aberto, o valor fica reservado (não pode ser sacado de novo).

-- Configurações ---------------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('payout_min_cents', '2000'::jsonb, 'Valor mínimo de saque do criador (centavos).'),
  ('payout_hold_days_pix', '7'::jsonb, 'Dias até a venda via Pix ficar disponível para saque.'),
  ('payout_hold_days_card', '32'::jsonb, 'Dias até a venda no cartão ficar disponível para saque (prazo de recebimento do provedor).')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('payout.manage', 'Aprovar, recusar e pagar saques de criadores');
insert into public.role_permissions (role, permission_key) values
  ('finance', 'payout.manage'), ('super_admin', 'payout.manage');

-- Chave Pix de saque ------------------------------------------------------------------------------
create table public.creator_pix_keys (
  creator_id uuid primary key references auth.users (id) on delete cascade,
  key_type text not null constraint creator_pix_keys_type check (key_type in ('cpf', 'cnpj', 'email', 'phone', 'evp')),
  key_value text not null constraint creator_pix_keys_value check (char_length(key_value) between 5 and 77),
  updated_at timestamptz not null default now()
);

-- Saques -------------------------------------------------------------------------------------------
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete restrict,
  amount_cents integer not null constraint withdrawals_amount check (amount_cents > 0),
  fee_cents integer not null default 0 constraint withdrawals_fee check (fee_cents >= 0),
  status text not null default 'requested' constraint withdrawals_status check
    (status in ('requested', 'processing', 'paid', 'rejected', 'failed', 'canceled')),
  pix_key_type text not null,
  pix_key_value text not null,
  provider text,
  provider_transfer_id text,
  failure_reason text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
-- No máximo um saque aberto por criador.
create unique index withdrawals_one_open on public.withdrawals (creator_id) where status in ('requested', 'processing');
create unique index withdrawals_provider_ref on public.withdrawals (provider, provider_transfer_id)
  where provider_transfer_id is not null;
create index withdrawals_status_idx on public.withdrawals (status, requested_at);
create trigger withdrawals_set_updated_at before update on public.withdrawals
  for each row execute function private.set_updated_at();

-- Ledger passa a aceitar lançamentos de saque ------------------------------------------------------
alter table public.ledger_entries alter column order_id drop not null;
alter table public.ledger_entries add column withdrawal_id uuid references public.withdrawals (id) on delete restrict;
alter table public.ledger_entries add constraint ledger_entries_source
  check ((order_id is null) <> (withdrawal_id is null));
alter table public.ledger_entries drop constraint ledger_entries_kind;
alter table public.ledger_entries add constraint ledger_entries_kind
  check (kind in ('sale', 'refund', 'chargeback', 'split_settlement', 'payout'));
create unique index ledger_entries_withdrawal_kind on public.ledger_entries (withdrawal_id, kind)
  where withdrawal_id is not null;

-- Notificações de saque (sempre por e-mail: envolve dinheiro e segurança da conta) ------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications add constraint notifications_kind check (kind in
  ('sale', 'tip', 'new_subscriber', 'renewal', 'payment_failed', 'message', 'new_post', 'new_follower',
   'report_urgent', 'payout'));

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
    when p_kind = 'payout' then true
    else false end;
  insert into public.notifications (user_id, kind, title, body, link, actor_id, email_status)
  values (p_user, p_kind, left(p_title, 140), left(coalesce(p_body, ''), 280), p_link, p_actor,
          case when v_email then 'pending' else 'none' end);
end;
$$;

create or replace function private.brl(p_cents integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',');
$$;

create or replace function private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = p_key), p_default);
$$;

-- Saldo do criador: total a receber, retido (vendas recentes), reservado (saque aberto), disponível.
create or replace function public.creator_payout_summary(p_creator uuid default null)
returns table (balance_cents bigint, held_cents bigint, reserved_cents bigint, available_cents bigint,
               min_cents integer, hold_days_pix integer, hold_days_card integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creator uuid := coalesce(p_creator, auth.uid());
  v_pix integer := private.setting_int('payout_hold_days_pix', 7);
  v_card integer := private.setting_int('payout_hold_days_card', 32);
  v_balance bigint;
  v_held bigint;
  v_reserved bigint;
begin
  if v_creator is null or (v_creator <> auth.uid() and not public.staff_can('finance.read')
                           and coalesce(auth.role(), '') <> 'service_role') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  select coalesce(sum(l.credit_cents), 0) - coalesce(sum(l.debit_cents), 0) into v_balance
    from public.ledger_lines l
   where l.account_code = 'creator_payable:' || v_creator::text;
  select coalesce(sum(greatest(o.creator_net_cents - o.split_cents, 0)), 0) into v_held
    from public.orders o
   where o.creator_id = v_creator and o.status = 'paid'
     and o.paid_at > now() - make_interval(days => case when o.method = 'card' then v_card else v_pix end);
  select coalesce(sum(w.amount_cents), 0) into v_reserved
    from public.withdrawals w
   where w.creator_id = v_creator and w.status in ('requested', 'processing');
  return query select v_balance, least(v_held, greatest(v_balance, 0)), v_reserved,
    greatest(v_balance - least(v_held, greatest(v_balance, 0)) - v_reserved, 0),
    private.setting_int('payout_min_cents', 2000), v_pix, v_card;
end;
$$;

-- Criador: cadastra ou troca a chave Pix (não pode trocar com saque aberto). Sempre avisa por e-mail.
create or replace function public.set_payout_pix_key(p_type text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_value text := btrim(coalesce(p_value, ''));
begin
  if v_me is null or not public.has_role('creator') then
    raise exception 'apenas criadores' using errcode = '42501';
  end if;
  if p_type not in ('cpf', 'cnpj', 'email', 'phone', 'evp') then
    raise exception 'tipo de chave inválido' using errcode = '22023';
  end if;
  if (p_type = 'cpf' and v_value !~ '^[0-9]{11}$')
     or (p_type = 'cnpj' and v_value !~ '^[0-9]{14}$')
     or (p_type = 'email' and v_value !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     or (p_type = 'phone' and v_value !~ '^\+55[0-9]{10,11}$')
     or (p_type = 'evp' and v_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'chave Pix inválida' using errcode = '22023';
  end if;
  if exists (select 1 from public.withdrawals where creator_id = v_me and status in ('requested', 'processing')) then
    raise exception 'há um saque em andamento: aguarde para trocar a chave' using errcode = '55000';
  end if;
  insert into public.creator_pix_keys (creator_id, key_type, key_value) values (v_me, p_type, v_value)
  on conflict (creator_id) do update set key_type = excluded.key_type, key_value = excluded.key_value, updated_at = now();
  perform private.notify(v_me, 'payout', 'Sua chave Pix de saque foi alterada',
    'Se não foi você, troque sua senha e fale com o suporte antes de pedir um saque.', '/estudio/recebimentos');
end;
$$;

-- Criador: pede o saque (valor ≤ disponível, ≥ mínimo, identidade aprovada, um aberto por vez).
create or replace function public.request_withdrawal(p_amount_cents integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  k public.creator_pix_keys;
  s record;
  v_id uuid;
begin
  if v_me is null or not public.has_role('creator')
     or not exists (select 1 from public.profiles where id = v_me and status = 'active') then
    raise exception 'apenas criadores ativos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creator_verifications where user_id = v_me and status = 'approved') then
    raise exception 'verificação de identidade pendente' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('withdrawal:' || v_me::text));
  select * into k from public.creator_pix_keys where creator_id = v_me;
  if not found then
    raise exception 'cadastre uma chave Pix antes de sacar' using errcode = '55000';
  end if;
  if exists (select 1 from public.withdrawals where creator_id = v_me and status in ('requested', 'processing')) then
    raise exception 'já existe um saque em andamento' using errcode = '55000';
  end if;
  select * into s from public.creator_payout_summary(v_me);
  if p_amount_cents is null or p_amount_cents < s.min_cents then
    raise exception 'valor abaixo do mínimo de saque' using errcode = '22023';
  end if;
  if p_amount_cents > s.available_cents then
    raise exception 'saldo disponível insuficiente' using errcode = '22023';
  end if;
  insert into public.withdrawals (creator_id, amount_cents, pix_key_type, pix_key_value)
  values (v_me, p_amount_cents, k.key_type, k.key_value)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_withdrawal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.withdrawals set status = 'canceled'
   where id = p_id and creator_id = auth.uid() and status = 'requested';
  if not found then
    raise exception 'saque não encontrado ou já em processamento' using errcode = 'P0002';
  end if;
end;
$$;

-- Financeiro (MFA): aprova (→ processing, o servidor cria a transferência) ou recusa.
create or replace function public.decide_withdrawal(p_id uuid, p_approve boolean, p_reason text)
returns public.withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.withdrawals;
  s record;
begin
  if not public.staff_can('payout.manage') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  select * into w from public.withdrawals where id = p_id for update;
  if not found or w.status <> 'requested' then
    raise exception 'saque não encontrado ou já decidido' using errcode = 'P0002';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'justificativa obrigatória para recusar' using errcode = '22023';
  end if;
  if p_approve then
    -- Saldo pode ter mudado (estorno/chargeback): o saque ainda precisa caber no saldo.
    select * into s from public.creator_payout_summary(w.creator_id);
    if s.balance_cents - s.held_cents - s.reserved_cents < 0 then
      raise exception 'saldo do criador não cobre mais este saque' using errcode = '22023';
    end if;
  end if;
  update public.withdrawals
     set status = case when p_approve then 'processing' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id
   returning * into w;
  perform private.audit(case when p_approve then 'withdrawal.approve' else 'withdrawal.reject' end,
    'withdrawal', p_id::text, coalesce(p_reason, ''),
    jsonb_build_object('amount_cents', w.amount_cents, 'creator_id', w.creator_id));
  if not p_approve then
    perform private.notify(w.creator_id, 'payout', 'Seu saque de ' || private.brl(w.amount_cents) || ' foi recusado',
      'Motivo: ' || p_reason || '. O valor voltou para o seu saldo.', '/estudio/recebimentos');
  end if;
  return w;
end;
$$;

-- Servidor: grava a transferência criada no provedor.
create or replace function public.attach_withdrawal_transfer(p_id uuid, p_provider text, p_transfer_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.withdrawals set provider = p_provider, provider_transfer_id = p_transfer_id
   where id = p_id and status = 'processing' and provider_transfer_id is null;
$$;

-- Servidor (webhook/conciliação): resultado final da transferência. Idempotente.
create or replace function public.settle_withdrawal(
  p_id uuid, p_status text, p_fee_cents integer default 0, p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.withdrawals;
  v_entry bigint;
  v_fee integer := greatest(coalesce(p_fee_cents, 0), 0);
  v_clearing text;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'status inválido' using errcode = '22023';
  end if;
  select * into w from public.withdrawals where id = p_id for update;
  if not found then
    raise exception 'saque não encontrado' using errcode = 'P0002';
  end if;
  if w.status in ('paid', 'failed') then return 'duplicate'; end if;
  if w.status <> 'processing' then
    raise exception 'saque não está em processamento' using errcode = '55000';
  end if;
  v_clearing := 'provider_clearing:' || coalesce(w.provider, 'asaas');
  if p_status = 'paid' then
    update public.withdrawals set status = 'paid', paid_at = now(), fee_cents = v_fee where id = p_id;
    insert into public.ledger_entries (withdrawal_id, kind, memo)
    values (p_id, 'payout', 'Saque Pix do criador')
    returning id into v_entry;
    insert into public.ledger_lines (entry_id, account_code, debit_cents) values
      (v_entry, private.ledger_creator_account(w.creator_id), w.amount_cents);
    insert into public.ledger_lines (entry_id, account_code, credit_cents) values
      (v_entry, v_clearing, w.amount_cents);
    if v_fee > 0 then
      insert into public.ledger_lines (entry_id, account_code, debit_cents) values (v_entry, 'fee_variance', v_fee);
      insert into public.ledger_lines (entry_id, account_code, credit_cents) values (v_entry, v_clearing, v_fee);
    end if;
    perform private.notify(w.creator_id, 'payout', 'Saque de ' || private.brl(w.amount_cents) || ' enviado',
      'O Pix foi enviado para a sua chave cadastrada.', '/estudio/recebimentos');
  else
    update public.withdrawals set status = 'failed', failure_reason = left(coalesce(p_reason, 'falha no provedor'), 300)
     where id = p_id;
    perform private.notify(w.creator_id, 'payout', 'Não conseguimos enviar seu saque de ' || private.brl(w.amount_cents),
      'Confira sua chave Pix e peça de novo. O valor voltou para o seu saldo.', '/estudio/recebimentos');
  end if;
  return 'ok';
end;
$$;

-- RLS -----------------------------------------------------------------------------------------------
alter table public.creator_pix_keys enable row level security;
alter table public.withdrawals enable row level security;
create policy creator_pix_keys_read on public.creator_pix_keys for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
create policy withdrawals_read on public.withdrawals for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('finance.read'));
grant select on public.creator_pix_keys, public.withdrawals to authenticated;

revoke execute on function public.creator_payout_summary(uuid), public.set_payout_pix_key(text, text),
  public.request_withdrawal(integer), public.cancel_withdrawal(uuid),
  public.decide_withdrawal(uuid, boolean, text) from public, anon;
grant execute on function public.creator_payout_summary(uuid), public.set_payout_pix_key(text, text),
  public.request_withdrawal(integer), public.cancel_withdrawal(uuid),
  public.decide_withdrawal(uuid, boolean, text) to authenticated;
revoke execute on function public.attach_withdrawal_transfer(uuid, text, text),
  public.settle_withdrawal(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.attach_withdrawal_transfer(uuid, text, text),
  public.settle_withdrawal(uuid, text, integer, text) to service_role;
revoke execute on function private.brl(integer), private.setting_int(text, integer) from public, anon, authenticated;
