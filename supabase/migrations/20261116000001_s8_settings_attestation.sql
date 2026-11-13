-- S8: configurações editáveis pelo Super Admin (auditadas) e declaração do criador ao publicar.

-- 1) Configurações ----------------------------------------------------------------------------------
-- Só chaves conhecidas, cada uma com faixa válida. Toda mudança vai para a auditoria com o valor
-- anterior e o novo. Comissão e taxas seguem nas próprias telas (com aprovação em duas etapas).
create or replace function public.update_platform_setting(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_int integer;
  v_min integer;
  v_max integer;
begin
  if not public.staff_can('settings.manage') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'justificativa obrigatória' using errcode = '22023';
  end if;
  select case p_key
    when 'creator_min_age' then 18 when 'payout_min_cents' then 100
    when 'payout_hold_days_pix' then 0 when 'payout_hold_days_card' then 0 end,
         case p_key
    when 'creator_min_age' then 99 when 'payout_min_cents' then 1000000
    when 'payout_hold_days_pix' then 90 when 'payout_hold_days_card' then 90 end
    into v_min, v_max;
  if v_min is null then
    raise exception 'configuração não editável' using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception 'valor inválido' using errcode = '22023';
  end if;
  v_int := (p_value #>> '{}')::numeric::integer;
  if v_int::numeric <> (p_value #>> '{}')::numeric or v_int not between v_min and v_max then
    raise exception 'valor fora da faixa permitida (% a %)', v_min, v_max using errcode = '22023';
  end if;
  select value into v_old from public.platform_settings where key = p_key for update;
  if not found then
    raise exception 'configuração não encontrada' using errcode = 'P0002';
  end if;
  update public.platform_settings
     set value = to_jsonb(v_int), updated_by = auth.uid(), updated_at = now()
   where key = p_key;
  perform private.audit('settings.update', 'platform_setting', p_key, p_reason,
    jsonb_build_object('old', v_old, 'new', to_jsonb(v_int)));
end;
$$;
revoke execute on function public.update_platform_setting(text, jsonb, text) from public, anon;
grant execute on function public.update_platform_setting(text, jsonb, text) to authenticated;

update public.platform_settings set description = 'Idade mínima para criadores (anos, mínimo legal 18).'
 where key = 'creator_min_age';

-- 2) Declaração do criador ao publicar -----------------------------------------------------------------
-- Ao publicar, o criador declara que tem os direitos do conteúdo e que todas as pessoas que aparecem
-- são maiores de 18 e consentiram. O banco grava quando (horário do servidor) e qual versão do texto.
alter table public.posts
  add column content_attested_at timestamptz,
  add column content_attestation_version text;
alter table public.package_versions
  add column content_attested_at timestamptz,
  add column content_attestation_version text;

-- O criador marca a declaração no próprio insert/update (o horário é sempre o do servidor).
grant insert (content_attested_at) on public.posts to authenticated;
grant update (content_attested_at) on public.posts to authenticated;

create or replace function private.posts_require_attestation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.content_attested_at is not null then
    -- Declaração já feita não muda nem some.
    new.content_attested_at := old.content_attested_at;
    new.content_attestation_version := old.content_attestation_version;
  elsif new.content_attested_at is not null then
    new.content_attested_at := now();
    new.content_attestation_version := coalesce(new.content_attestation_version, '2026-11');
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and new.content_attested_at is null then
    raise exception 'confirme os direitos e o consentimento das pessoas do conteúdo' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger posts_require_attestation before insert or update on public.posts
  for each row execute function private.posts_require_attestation();

create or replace function public.save_package(
  p_package_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_price_cents integer,
  p_audience public.package_audience,
  p_cover_path text,
  p_items jsonb,
  p_publish boolean,
  p_attested boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pkg public.packages;
  v_draft public.package_versions;
  v_prefix text;
  v_item jsonb;
  v_pos integer := 0;
begin
  if v_uid is null or not public.has_role('creator') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'o pacote precisa de 1 a 100 itens' using errcode = '22023';
  end if;
  v_prefix := v_uid::text || '/packages/' || p_package_id::text || '/';
  if p_cover_path is not null and p_cover_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'capa inválida' using errcode = '22023';
  end if;

  select * into v_pkg from public.packages where id = p_package_id for update;
  if not found then
    insert into public.packages (id, creator_id) values (p_package_id, v_uid) returning * into v_pkg;
  elsif v_pkg.creator_id <> v_uid then
    raise exception 'permissão negada' using errcode = '42501';
  elsif v_pkg.status = 'removed' then
    raise exception 'pacote retirado pela moderação' using errcode = '42501';
  end if;

  select * into v_draft from public.package_versions
   where package_id = p_package_id and status = 'draft' for update;
  if not found then
    insert into public.package_versions (package_id, version, title, description, category, price_cents, audience, cover_path)
    values (p_package_id,
            coalesce((select max(version) from public.package_versions where package_id = p_package_id), 0) + 1,
            p_title, coalesce(p_description, ''), p_category, p_price_cents, p_audience, p_cover_path)
    returning * into v_draft;
  else
    update public.package_versions
       set title = p_title, description = coalesce(p_description, ''), category = p_category,
           price_cents = p_price_cents, audience = p_audience, cover_path = p_cover_path
     where id = v_draft.id
    returning * into v_draft;
    delete from public.package_items where version_id = v_draft.id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'path') !~ ('^' || v_prefix || '[0-9a-f-]{36}\.(webp|mp4)$')
       or (v_item ->> 'kind') not in ('image', 'video')
       or ((v_item ->> 'kind') = 'video' and coalesce(v_item ->> 'poster', '') !~ ('^' || v_prefix || '[0-9a-f-]{36}\.webp$'))
       or ((v_item ->> 'kind') = 'image' and (v_item ->> 'path') !~ '\.webp$')
       or ((v_item ->> 'kind') = 'video' and (v_item ->> 'path') !~ '\.mp4$') then
      raise exception 'item de mídia inválido' using errcode = '22023';
    end if;
    insert into public.package_items (version_id, kind, storage_path, poster_path, width, height, duration_seconds, size_bytes, position)
    values (v_draft.id, v_item ->> 'kind', v_item ->> 'path', nullif(v_item ->> 'poster', ''),
            nullif(v_item ->> 'width', '')::integer, nullif(v_item ->> 'height', '')::integer,
            nullif(v_item ->> 'duration', '')::integer, nullif(v_item ->> 'size', '')::bigint, v_pos);
    v_pos := v_pos + 1;
  end loop;

  if p_publish then
    if not coalesce(p_attested, false) then
      raise exception 'confirme os direitos e o consentimento das pessoas do conteúdo' using errcode = '22023';
    end if;
    update public.package_versions set content_attested_at = now(), content_attestation_version = '2026-11'
     where id = v_draft.id;
    update public.package_versions set status = 'superseded'
     where package_id = p_package_id and status = 'published';
    update public.package_versions set status = 'published', published_at = now() where id = v_draft.id;
    update public.packages
       set status = 'published', current_version_id = v_draft.id, published_at = coalesce(published_at, now())
     where id = p_package_id;
  end if;

  return v_draft.version;
end;
$$;

revoke execute on function public.save_package(uuid, text, text, text, integer, public.package_audience, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.save_package(uuid, text, text, text, integer, public.package_audience, text, jsonb, boolean, boolean) to authenticated;
drop function public.save_package(uuid, text, text, text, integer, public.package_audience, text, jsonb, boolean);
