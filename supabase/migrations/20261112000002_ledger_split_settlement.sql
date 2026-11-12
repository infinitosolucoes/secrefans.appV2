-- Repasse via split: quando o provedor paga o criador direto (split), o ledger registra o repasse
-- em um lançamento próprio ("split_settlement"): D creator_payable / C provider_clearing.
-- Assim o saldo "a repassar" mostra só o que ainda está com a plataforma.
-- O valor vem da própria API do provedor (soma do split da cobrança), não do pedido.

alter table public.orders
  add column split_cents integer not null default 0 constraint orders_split_cents check (split_cents >= 0);

alter table public.ledger_entries drop constraint ledger_entries_kind;
alter table public.ledger_entries add constraint ledger_entries_kind
  check (kind in ('sale', 'refund', 'chargeback', 'split_settlement'));

create or replace function private.ledger_post_split(p_order public.orders, p_split_cents integer, p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry bigint;
begin
  if coalesce(p_split_cents, 0) <= 0 then return; end if;
  insert into public.ledger_entries (order_id, kind, payment_event_id, memo)
  values (p_order.id, 'split_settlement', p_event, 'Repasse ao criador via split do provedor')
  on conflict (order_id, kind) do nothing
  returning id into v_entry;
  if v_entry is null then return; end if;
  insert into public.ledger_lines (entry_id, account_code, debit_cents) values
    (v_entry, private.ledger_creator_account(p_order.creator_id), p_split_cents);
  insert into public.ledger_lines (entry_id, account_code, credit_cents) values
    (v_entry, 'provider_clearing:' || p_order.provider, p_split_cents);
  update public.orders set split_cents = p_split_cents where id = p_order.id;
end;
$$;
revoke execute on function private.ledger_post_split(public.orders, integer, uuid) from public, anon, authenticated;

-- Correção de lançamentos já feitos (somente servidor): registra o repasse de uma venda paga.
create or replace function public.record_split_settlement(p_order_id uuid, p_split_cents integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and status = 'paid' for update;
  if not found then
    raise exception 'pedido pago não encontrado' using errcode = 'P0002';
  end if;
  if p_split_cents < 0 or p_split_cents > v_order.gross_cents then
    raise exception 'valor de split inválido' using errcode = '22023';
  end if;
  perform private.ledger_post_split(v_order, p_split_cents, null);
  return 'ok';
end;
$$;
revoke execute on function public.record_split_settlement(uuid, integer) from public, anon, authenticated;
grant execute on function public.record_split_settlement(uuid, integer) to service_role;

-- confirm_payment passa a receber o split efetivado pelo provedor.
drop function public.confirm_payment(text, text, text, text, jsonb, integer);
create or replace function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_status text,
  p_payload jsonb default '{}'::jsonb, p_net_cents integer default null, p_split_cents integer default null
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
    if coalesce(p_split_cents, 0) < 0 or coalesce(p_split_cents, 0) > v_net then
      raise exception 'valor de split inválido' using errcode = '22023';
    end if;
    update public.orders set status = 'paid', paid_at = now(), actual_fee_cents = gross_cents - v_net
     where id = v_order.id
     returning * into v_order;
    perform private.ledger_post_sale(v_order, v_net, v_event);
    perform private.ledger_post_split(v_order, p_split_cents, v_event);

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
  else -- refunded / chargeback: revoga o acesso e reverte a venda (o repasse via split fica:
       -- se o provedor devolver pela conta da plataforma, o criador passa a dever esse valor).
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
revoke execute on function public.confirm_payment(text, text, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_payment(text, text, text, text, jsonb, integer, integer) to service_role;
