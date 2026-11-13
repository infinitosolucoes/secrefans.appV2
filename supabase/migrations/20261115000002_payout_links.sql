-- Avisos de saque passam a abrir a Carteira (/carteira), onde ficam saldo, chave Pix e saques.
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
    'Se não foi você, troque sua senha e fale com o suporte antes de pedir um saque.', '/carteira');
end;
$$;

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
      'Motivo: ' || p_reason || '. O valor voltou para o seu saldo.', '/carteira');
  end if;
  return w;
end;
$$;

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
      'O Pix foi enviado para a sua chave cadastrada.', '/carteira');
  else
    update public.withdrawals set status = 'failed', failure_reason = left(coalesce(p_reason, 'falha no provedor'), 300)
     where id = p_id;
    perform private.notify(w.creator_id, 'payout', 'Não conseguimos enviar seu saque de ' || private.brl(w.amount_cents),
      'Confira sua chave Pix e peça de novo. O valor voltou para o seu saldo.', '/carteira');
  end if;
  return 'ok';
end;
$$;

update public.notifications set link = '/carteira' where kind = 'payout' and link = '/estudio/recebimentos';
