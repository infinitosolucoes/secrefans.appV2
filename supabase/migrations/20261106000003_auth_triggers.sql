-- Toda conta nova: perfil + papel mínimo 'fan' + consentimentos declarados no cadastro.
-- Metadados vêm do cliente (raw_user_meta_data) e NUNCA concedem papéis.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := lower(coalesce(meta ->> 'handle', ''));
  final_handle text;
  consent jsonb;
begin
  if wanted ~ '^[a-z0-9_.]{3,30}$'
     and not exists (select 1 from public.profiles p where p.handle = wanted::extensions.citext) then
    final_handle := wanted;
  else
    final_handle := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, handle, display_name, creator_intent)
  values (
    new.id,
    final_handle,
    left(coalesce(meta ->> 'display_name', ''), 60),
    coalesce((meta ->> 'creator_intent')::boolean, false)
  );

  insert into public.user_roles (user_id, role) values (new.id, 'fan');

  -- consents: [{ "type": "terms", "version": "2026-11" }, ...]
  if jsonb_typeof(meta -> 'consents') = 'array' then
    for consent in select * from jsonb_array_elements(meta -> 'consents') loop
      if consent ->> 'type' in ('terms', 'privacy', 'age_18', 'marketing') then
        insert into public.consent_records (user_id, consent_type, version, granted)
        values (new.id, consent ->> 'type', left(coalesce(consent ->> 'version', 'unknown'), 20), true);
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
