-- Tipo de perfil do criador (quem aparece no conteúdo): mulher, homem, casal, trans, não binário.
-- Usado no perfil público e como filtro no Explorar, junto com as categorias.
alter table public.profiles
  add column creator_type text
    constraint profiles_creator_type_valid check (
      creator_type is null or creator_type in ('mulher', 'homem', 'casal', 'trans', 'nao_binario')
    );
grant update (creator_type) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = false) as
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.banner_path,
         exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'creator') as is_creator,
         p.created_at, p.categories, p.links, p.socials, p.creator_type
  from public.profiles p
  where p.status = 'active' and p.visibility <> 'private';
