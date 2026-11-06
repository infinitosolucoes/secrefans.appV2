-- S3: vídeos MP4 em publicações e pacotes de fotos/vídeos com preço e versões.
-- Sem transcodificação no MVP: o MP4 vai como enviado; miniatura (poster) é gerada no navegador.
-- O modelo já guarda poster/duração/tamanho para um worker FFmpeg (HLS) substituir depois.

-- Vídeo nas publicações ----------------------------------------------------------
alter table public.post_media drop constraint post_media_kind;
alter table public.post_media drop constraint post_media_path_owner;
alter table public.post_media
  add column poster_path text,
  add column duration_seconds integer constraint post_media_duration check (duration_seconds between 1 and 3600),
  add column size_bytes bigint constraint post_media_size check (size_bytes between 1 and 104857600),
  add constraint post_media_kind check (kind in ('image', 'video')),
  add constraint post_media_path_owner check (
    split_part(storage_path, '/', 1) = creator_id::text
    and split_part(storage_path, '/', 2) = post_id::text
    and (
      (kind = 'image' and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$' and poster_path is null)
      or (
        kind = 'video'
        and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'
        and poster_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
        and split_part(poster_path, '/', 1) = creator_id::text
        and split_part(poster_path, '/', 2) = post_id::text
      )
    )
  );

update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'video/mp4']
 where id = 'post-media';

-- Retorno passa a incluir tipo e poster; o servidor assina as duas URLs.
drop function public.post_media_for(uuid);
create function public.post_media_for(p_post_id uuid)
returns table (storage_path text, kind text, poster_path text, width integer, height integer,
               duration_seconds integer, "position" smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.storage_path, m.kind, m.poster_path, m.width, m.height, m.duration_seconds, m.position
  from public.post_media m
  where m.post_id = p_post_id and public.can_view_post_media(p_post_id)
  order by m.position;
$$;
revoke execute on function public.post_media_for(uuid) from public;
grant execute on function public.post_media_for(uuid) to anon, authenticated;

-- Contagem por tipo no feed (colunas novas no fim da view).
create or replace view public.feed_posts
with (security_invoker = false) as
  select po.id, po.creator_id, pr.handle, pr.display_name, pr.avatar_path,
         po.body, po.visibility, po.price_cents, po.published_at,
         (select count(*) from public.post_media m where m.post_id = po.id)::integer as media_count,
         (select count(*) from public.post_likes l where l.post_id = po.id)::integer as like_count,
         (select count(*) from public.post_comments c where c.post_id = po.id and c.status = 'visible')::integer as comment_count,
         exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid()) as liked_by_me,
         public.can_view_post_media(po.id) as unlocked,
         (select count(*) from public.post_media m where m.post_id = po.id and m.kind = 'video')::integer as video_count
  from public.posts po
  join public.profiles pr on pr.id = po.creator_id
  where po.status = 'published' and public.post_card_visible(po.id);

-- Pacotes ---------------------------------------------------------------------
create type public.package_status as enum ('draft', 'published', 'archived', 'removed');
create type public.package_version_status as enum ('draft', 'published', 'superseded');
create type public.package_audience as enum ('all', 'subscribers');

create table public.packages (
  id uuid primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  status public.package_status not null default 'draft',
  current_version_id uuid,
  published_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packages_creator_idx on public.packages (creator_id, created_at desc);
create trigger packages_set_updated_at before update on public.packages
  for each row execute function private.set_updated_at();

-- Cada versão é um retrato imutável depois de publicada: quem comprar (S4) fica com a versão comprada.
create table public.package_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  version integer not null constraint package_versions_version check (version >= 1),
  status public.package_version_status not null default 'draft',
  title text not null constraint package_versions_title check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' constraint package_versions_description check (char_length(description) <= 2000),
  category text constraint package_versions_category check (
    category is null or category in ('sensual', 'fitness', 'lifestyle', 'cosplay', 'tattoo', 'lingerie', 'viagens', 'ao-vivo')
  ),
  price_cents integer not null constraint package_versions_price check (price_cents between 500 and 200000),
  audience public.package_audience not null default 'all',
  cover_path text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (package_id, version)
);
create unique index package_versions_one_draft on public.package_versions (package_id) where status = 'draft';
create unique index package_versions_one_published on public.package_versions (package_id) where status = 'published';

alter table public.packages
  add constraint packages_current_version_fk foreign key (current_version_id)
  references public.package_versions (id) on delete set null;

create table public.package_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.package_versions (id) on delete cascade,
  kind text not null constraint package_items_kind check (kind in ('image', 'video')),
  storage_path text not null,
  poster_path text,
  width integer constraint package_items_width check (width between 1 and 10000),
  height integer constraint package_items_height check (height between 1 and 10000),
  duration_seconds integer constraint package_items_duration check (duration_seconds between 1 and 3600),
  size_bytes bigint constraint package_items_size check (size_bytes between 1 and 104857600),
  position smallint not null default 0 constraint package_items_position check (position between 0 and 99),
  unique (version_id, storage_path)
);
create index package_items_version_idx on public.package_items (version_id, position);

-- RLS: leitura do próprio criador ou moderação com MFA; toda escrita passa pelas RPCs abaixo.
alter table public.packages enable row level security;
alter table public.package_versions enable row level security;
alter table public.package_items enable row level security;
revoke all on public.packages, public.package_versions, public.package_items from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.packages, public.package_versions, public.package_items from authenticated;

create policy packages_select on public.packages for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('content.moderate'));
create policy package_versions_select on public.package_versions for select to authenticated
  using (exists (select 1 from public.packages p where p.id = package_id
                 and (p.creator_id = (select auth.uid()) or public.staff_can('content.moderate'))));
create policy package_items_select on public.package_items for select to authenticated
  using (exists (select 1 from public.package_versions v join public.packages p on p.id = v.package_id
                 where v.id = version_id
                   and (p.creator_id = (select auth.uid()) or public.staff_can('content.moderate'))));

-- Salva o rascunho (cria o pacote/versão quando preciso) e, se pedido, publica como nova versão.
create or replace function public.save_package(
  p_package_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_price_cents integer,
  p_audience public.package_audience,
  p_cover_path text,
  p_items jsonb,
  p_publish boolean
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

-- Arquivar tira o pacote da vitrine (compradores mantêm acesso na S4); reativar volta a publicar.
create or replace function public.set_package_status(p_package_id uuid, p_status public.package_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('archived', 'published') then
    raise exception 'status inválido' using errcode = '22023';
  end if;
  update public.packages
     set status = p_status
   where id = p_package_id and creator_id = auth.uid() and status in ('archived', 'published')
     and current_version_id is not null;
  if not found then
    raise exception 'pacote não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- Exclui pacote que nunca foi publicado (devolve os caminhos para o servidor apagar os arquivos).
create or replace function public.delete_package_draft(p_package_id uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.packages
                  where id = p_package_id and creator_id = auth.uid() and current_version_id is null) then
    raise exception 'só pacotes nunca publicados podem ser excluídos' using errcode = '42501';
  end if;
  return query
    select i.storage_path from public.package_items i join public.package_versions v on v.id = i.version_id
     where v.package_id = p_package_id
    union
    select i.poster_path from public.package_items i join public.package_versions v on v.id = i.version_id
     where v.package_id = p_package_id and i.poster_path is not null;
  delete from public.packages where id = p_package_id;
end;
$$;

revoke execute on function public.save_package(uuid, text, text, text, integer, public.package_audience, text, jsonb, boolean),
  public.set_package_status(uuid, public.package_status), public.delete_package_draft(uuid) from public, anon;
grant execute on function public.save_package(uuid, text, text, text, integer, public.package_audience, text, jsonb, boolean),
  public.set_package_status(uuid, public.package_status), public.delete_package_draft(uuid) to authenticated;

-- Vitrine pública: só pacotes publicados de criadores visíveis, com dados da versão vigente.
-- Nunca expõe caminhos de itens; só a capa (imagem pública escolhida pelo criador) e as contagens.
create view public.public_packages
with (security_invoker = false) as
  select p.id, p.creator_id, pr.handle, pr.display_name,
         v.version, v.title, v.description, v.category, v.price_cents, v.audience, v.cover_path,
         (select count(*) from public.package_items i where i.version_id = v.id and i.kind = 'image')::integer as photo_count,
         (select count(*) from public.package_items i where i.version_id = v.id and i.kind = 'video')::integer as video_count,
         p.published_at, v.published_at as version_published_at
  from public.packages p
  join public.package_versions v on v.id = p.current_version_id
  join public.profiles pr on pr.id = p.creator_id
  where p.status = 'published'
    and pr.status = 'active'
    and (pr.visibility = 'public'
         or p.creator_id = auth.uid()
         or (pr.visibility = 'followers' and exists (
               select 1 from public.follows f where f.follower_id = auth.uid() and f.creator_id = p.creator_id)))
    and (auth.uid() is null or not public.is_blocked_with(p.creator_id) or p.creator_id = auth.uid());
-- A view chama is_blocked_with com o papel do leitor (para visitante, sempre false).
grant execute on function public.is_blocked_with(uuid) to anon;
revoke all on public.public_packages from anon, authenticated;
grant select on public.public_packages to anon, authenticated;

-- Capas de pacote: imagens públicas de vitrine (nome aleatório, metadados removidos no envio).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('package-covers', 'package-covers', true, 8388608, array['image/webp'])
on conflict (id) do nothing;

create policy "package covers: creator upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'package-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_role('creator')
  );
create policy "package covers: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'package-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
