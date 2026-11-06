-- Checagem de disponibilidade de handle no cadastro (inclui perfis privados/bloqueados, sem expô-los).
create or replace function public.handle_available(p_handle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(p_handle, '')) ~ '^[a-z0-9_.]{3,30}$'
     and not exists (select 1 from public.profiles where handle = lower(p_handle)::extensions.citext);
$$;

revoke execute on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to anon, authenticated;

-- Detalhe de um usuário para a equipe (inclui e-mail: PII mínima, exige users.read + MFA).
create or replace function public.admin_get_user(p_user_id uuid)
returns table (
  id uuid, handle text, display_name text, email text, status public.account_status,
  roles public.app_role[], creator_intent boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('users.read') then
    raise exception 'Sem permissão ou sem MFA' using errcode = '42501';
  end if;
  return query
    select p.id, p.handle::text, p.display_name, u.email::text, p.status,
           coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}'),
           p.creator_intent, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles ur on ur.user_id = p.id
    where p.id = p_user_id
    group by p.id, u.email, u.last_sign_in_at;
end;
$$;

revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;
