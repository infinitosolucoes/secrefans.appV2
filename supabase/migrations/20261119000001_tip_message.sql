-- Mimo com mensagem opcional (até 500 caracteres). A mensagem fica no pedido e só é entregue no
-- chat do criador quando o pagamento é confirmado (nada chega se o Pix não for pago).

alter table public.orders
  add column tip_message text constraint orders_tip_message check (char_length(tip_message) <= 500);

-- Fã grava a mensagem no próprio pedido de mimo, enquanto ele ainda está pendente.
create or replace function public.set_tip_message(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_msg is not null and char_length(v_msg) > 500 then
    raise exception 'mensagem longa demais' using errcode = '22023';
  end if;
  update public.orders set tip_message = v_msg
   where id = p_order_id and buyer_id = auth.uid() and kind = 'tip' and status = 'pending';
  if not found then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_tip_message(uuid, text) from public, anon;
grant execute on function public.set_tip_message(uuid, text) to authenticated;

-- Pagamento confirmado: entrega a mensagem no chat (abre a conversa se preciso; o fã pagou, então
-- a política de quem pode mandar mensagem não se aplica). Bloqueio entre os dois impede a entrega.
create or replace function private.deliver_tip_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if new.kind <> 'tip' or new.tip_message is null or new.status <> 'paid'
     or old.status is not distinct from 'paid' then
    return new;
  end if;
  if private.is_blocked_between(new.buyer_id, new.creator_id) then return new; end if;
  insert into public.conversations (creator_id, fan_id) values (new.creator_id, new.buyer_id)
  on conflict (creator_id, fan_id) do update set creator_id = excluded.creator_id
  returning * into v_conv;
  perform private.insert_message(gen_random_uuid(), v_conv, new.buyer_id,
    '🎁 Mimo de ' || private.brl(new.gross_cents) || E'\n' || new.tip_message, null, '[]'::jsonb, null);
  return new;
end;
$$;
create trigger orders_deliver_tip_message after update of status on public.orders
  for each row execute function private.deliver_tip_message();
revoke execute on function private.deliver_tip_message() from public, anon, authenticated;
