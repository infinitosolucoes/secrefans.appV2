-- Redes sociais no perfil (fã e criador): só o @usuário de cada rede; o link é montado no app.
create or replace function private.socials_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('instagram', 'tiktok', 'x', 'youtube', 'telegram')
          or jsonb_typeof(e.value) <> 'string'
          or (e.value #>> '{}') !~ '^[A-Za-z0-9_.]{1,32}$'
     );
$$;
grant execute on function private.socials_valid(jsonb) to authenticated;

alter table public.profiles
  add column socials jsonb not null default '{}'::jsonb
    constraint profiles_socials_valid check (private.socials_valid(socials));
grant update (socials) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = false) as
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.banner_path,
         exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'creator') as is_creator,
         p.created_at, p.categories, p.links, p.socials
  from public.profiles p
  where p.status = 'active' and p.visibility <> 'private';
