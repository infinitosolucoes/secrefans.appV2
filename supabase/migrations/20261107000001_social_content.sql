-- S2: perfis enriquecidos, seguir, publicações, mídia protegida, curtidas, comentários e denúncias.
-- Regra central (M04/M05): card de post bloqueado não revela bytes, miniatura nem URL da mídia.

create type public.post_visibility as enum ('free', 'subscribers', 'ppv');
create type public.post_status as enum ('draft', 'published', 'removed');
create type public.report_target as enum ('post', 'comment', 'profile');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.comment_status as enum ('visible', 'removed');

-- Perfis: categorias e links --------------------------------------------------
create or replace function private.links_valid(p_links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(l ~ '^https://[^[:space:]<>"'']{4,200}$'), true) from unnest(p_links) l;
$$;

alter table public.profiles
  add column categories text[] not null default '{}'
    constraint profiles_categories_valid check (
      cardinality(categories) <= 3
      and categories <@ array['sensual', 'fitness', 'lifestyle', 'cosplay', 'tattoo', 'lingerie', 'viagens', 'ao-vivo']::text[]
    ),
  add column links text[] not null default '{}'
    constraint profiles_links_valid check (cardinality(links) <= 3 and private.links_valid(links));

grant update (categories, links) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = false) as
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.banner_path,
         exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'creator') as is_creator,
         p.created_at, p.categories, p.links
  from public.profiles p
  where p.status = 'active' and p.visibility <> 'private';

-- Avatares e banners são imagens públicas de perfil (nomes aleatórios, metadados removidos no envio).
update storage.buckets set public = true where id in ('avatars', 'banners');

-- Bloqueios e criadores ativos -------------------------------------------------
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b) or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

create or replace function private.is_active_creator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user and ur.role = 'creator' and p.status = 'active'
  );
$$;

-- Wrappers para policies: respondem só sobre o próprio chamador (auth.uid()).
create or replace function public.can_follow(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and auth.uid() <> p_creator_id
    and private.is_active_creator(p_creator_id)
    and not private.is_blocked_between(auth.uid(), p_creator_id);
$$;

create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.is_blocked_between(auth.uid(), p_other);
$$;

revoke execute on function public.can_follow(uuid), public.is_blocked_with(uuid) from public, anon;
grant execute on function public.can_follow(uuid), public.is_blocked_with(uuid) to authenticated;

-- Seguir ----------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  constraint follows_not_self check (follower_id <> creator_id)
);
create index follows_creator_idx on public.follows (creator_id);

-- Publicações -----------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' constraint posts_body_len check (char_length(body) <= 2000),
  visibility public.post_visibility not null default 'free',
  -- Preço só para PPV (em centavos, R$ 5,00 a R$ 1.000,00). Cobrança real chega na S4.
  price_cents integer constraint posts_price_valid check (
    (visibility = 'ppv' and price_cents between 500 and 100000)
    or (visibility <> 'ppv' and price_cents is null)
  ),
  status public.post_status not null default 'draft',
  published_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_creator_idx on public.posts (creator_id, created_at desc);
create index posts_published_idx on public.posts (published_at desc) where status = 'published';

create trigger posts_set_updated_at before update on public.posts
  for each row execute function private.set_updated_at();

create or replace function private.posts_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger posts_published_at before insert or update on public.posts
  for each row execute function private.posts_set_published_at();

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  kind text not null default 'image' constraint post_media_kind check (kind in ('image')),
  width integer constraint post_media_width check (width between 1 and 10000),
  height integer constraint post_media_height check (height between 1 and 10000),
  position smallint not null default 0 constraint post_media_position check (position between 0 and 19),
  created_at timestamptz not null default now(),
  constraint post_media_path_owner check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
    and split_part(storage_path, '/', 1) = creator_id::text
    and split_part(storage_path, '/', 2) = post_id::text
  )
);
create index post_media_post_idx on public.post_media (post_id, position);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null constraint post_comments_body_len check (char_length(btrim(body)) between 1 and 500),
  status public.comment_status not null default 'visible',
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

-- Denúncias -------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null constraint reports_reason_valid check (
    reason in ('nao_consensual', 'menor_de_idade', 'violencia', 'assedio', 'spam', 'direitos_autorais', 'outro')
  ),
  details text not null default '' constraint reports_details_len check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);
create unique index reports_one_open_per_target on public.reports (reporter_id, target_type, target_id)
  where status = 'open';
create index reports_queue_idx on public.reports (status, created_at);

insert into public.permissions (key, description) values
  ('reports.read', 'Consultar denúncias'),
  ('reports.decide', 'Decidir denúncias'),
  ('content.moderate', 'Ver e retirar conteúdo publicado');

insert into public.role_permissions (role, permission_key) values
  ('moderator', 'reports.read'), ('moderator', 'reports.decide'), ('moderator', 'content.moderate'),
  ('admin_ops', 'reports.read'),
  ('super_admin', 'reports.read'), ('super_admin', 'reports.decide'), ('super_admin', 'content.moderate');

-- Regras de acesso ------------------------------------------------------------
-- Card visível: post publicado de conta ativa, perfil não privado (ou só para seguidores),
-- sem bloqueio entre o leitor e o criador. Sempre sobre o próprio chamador (auth.uid()).
create or replace function public.post_card_visible(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts po
    join public.profiles pr on pr.id = po.creator_id
    where po.id = p_post_id
      and pr.status = 'active'
      and (
        po.creator_id = auth.uid()
        or (
          po.status = 'published'
          and (
            pr.visibility = 'public'
            or (pr.visibility = 'followers' and exists (
              select 1 from public.follows f where f.follower_id = auth.uid() and f.creator_id = po.creator_id))
          )
          and (auth.uid() is null or not private.is_blocked_between(auth.uid(), po.creator_id))
        )
      )
  );
$$;

-- Mídia liberada: dono, equipe de moderação com MFA, ou post grátis visível.
-- Assinantes e PPV ficam bloqueados até existirem assinaturas/compras confirmadas (S4).
create or replace function public.can_view_post_media(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts po
    where po.id = p_post_id
      and (
        po.creator_id = auth.uid()
        or public.staff_can('content.moderate')
        or (po.visibility = 'free' and public.post_card_visible(po.id))
      )
  );
$$;

-- Caminhos da mídia (para o servidor assinar URLs curtas). Vazio quando bloqueado.
create or replace function public.post_media_for(p_post_id uuid)
returns table (storage_path text, width integer, height integer, "position" smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.storage_path, m.width, m.height, m.position
  from public.post_media m
  where m.post_id = p_post_id and public.can_view_post_media(p_post_id)
  order by m.position;
$$;

create or replace function public.creator_stats(p_creator_id uuid)
returns table (followers integer, posts integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f where f.creator_id = p_creator_id)::integer,
    (select count(*) from public.posts po where po.creator_id = p_creator_id and po.status = 'published')::integer;
$$;

revoke execute on function public.post_card_visible(uuid), public.can_view_post_media(uuid),
  public.post_media_for(uuid), public.creator_stats(uuid) from public;
grant execute on function public.post_card_visible(uuid), public.can_view_post_media(uuid),
  public.post_media_for(uuid), public.creator_stats(uuid) to anon, authenticated;
revoke execute on function private.is_blocked_between(uuid, uuid), private.is_active_creator(uuid) from public;
-- links_valid roda na CHECK de profiles com o papel de quem edita o perfil.
grant execute on function private.links_valid(text[]) to authenticated;

-- Feed: cards publicados visíveis ao leitor, com contadores. Sem caminhos de mídia.
create view public.feed_posts
with (security_invoker = false) as
  select po.id, po.creator_id, pr.handle, pr.display_name, pr.avatar_path,
         po.body, po.visibility, po.price_cents, po.published_at,
         (select count(*) from public.post_media m where m.post_id = po.id)::integer as media_count,
         (select count(*) from public.post_likes l where l.post_id = po.id)::integer as like_count,
         (select count(*) from public.post_comments c where c.post_id = po.id and c.status = 'visible')::integer as comment_count,
         exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid()) as liked_by_me,
         public.can_view_post_media(po.id) as unlocked
  from public.posts po
  join public.profiles pr on pr.id = po.creator_id
  where po.status = 'published' and public.post_card_visible(po.id);
revoke all on public.feed_posts from anon, authenticated;
grant select on public.feed_posts to anon, authenticated;

-- RLS -------------------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.reports enable row level security;

revoke all on public.follows, public.posts, public.post_media, public.post_likes, public.post_comments,
  public.reports from anon;
revoke truncate, references, trigger on public.follows, public.posts, public.post_media, public.post_likes,
  public.post_comments, public.reports from authenticated;

-- follows: o fã segue criadores ativos sem bloqueio; o criador vê quem o segue.
create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or creator_id = (select auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and public.can_follow(creator_id)
  );
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
revoke update on public.follows from authenticated;

-- posts: o criador aprovado gerencia os próprios; leitura pública só pela view feed_posts.
create policy posts_select on public.posts for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('content.moderate'));
create policy posts_insert on public.posts for insert to authenticated
  with check (creator_id = (select auth.uid()) and public.has_role('creator') and status <> 'removed');
create policy posts_update on public.posts for update to authenticated
  using (creator_id = (select auth.uid()) and status <> 'removed')
  with check (creator_id = (select auth.uid()) and public.has_role('creator') and status <> 'removed');
create policy posts_delete on public.posts for delete to authenticated
  using (creator_id = (select auth.uid()) and status = 'draft');
revoke insert, update on public.posts from authenticated;
-- O id vem do cliente para que a mídia seja enviada antes ao caminho <criador>/<post>/.
grant insert (id, creator_id, body, visibility, price_cents, status) on public.posts to authenticated;
grant update (body, visibility, price_cents, status) on public.posts to authenticated;

-- post_media: só o dono registra/vê as linhas; leitores recebem caminhos via post_media_for().
create policy post_media_select on public.post_media for select to authenticated
  using (creator_id = (select auth.uid()) or public.staff_can('content.moderate'));
create policy post_media_insert on public.post_media for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and exists (select 1 from public.posts po
                where po.id = post_id and po.creator_id = (select auth.uid()) and po.status <> 'removed')
  );
create policy post_media_delete on public.post_media for delete to authenticated
  using (creator_id = (select auth.uid()));
revoke update on public.post_media from authenticated;

-- curtidas
create policy post_likes_select on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy post_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.post_card_visible(post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));
revoke update on public.post_likes from authenticated;

-- comentários: leitura dos visíveis em posts visíveis; o autor apaga os próprios.
create policy post_comments_select on public.post_comments for select to authenticated
  using (
    (status = 'visible' and public.post_card_visible(post_id)
      and not public.is_blocked_with(author_id))
    or author_id = (select auth.uid())
    or public.staff_can('content.moderate')
  );
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible' and public.post_card_visible(post_id));
create policy post_comments_delete on public.post_comments for delete to authenticated
  using (author_id = (select auth.uid()));
revoke update on public.post_comments from authenticated;

-- denúncias: o autor cria e acompanha; equipe com MFA lê; decisão só via RPC.
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.staff_can('reports.read'));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
revoke update, delete on public.reports from authenticated;
revoke insert on public.reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

-- Decisão de denúncia (equipe + MFA), com retirada opcional do conteúdo e auditoria.
create or replace function public.decide_report(
  p_report_id uuid, p_status public.report_status, p_reason text, p_remove_target boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.staff_can('reports.decide') then
    raise exception 'permissão negada' using errcode = '42501';
  end if;
  if p_status = 'open' or char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'decisão inválida' using errcode = '22023';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found or r.status <> 'open' then
    raise exception 'denúncia não encontrada ou já decidida' using errcode = 'P0002';
  end if;

  update public.reports
     set status = p_status, decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
   where id = p_report_id;

  if p_remove_target and p_status = 'resolved' then
    if r.target_type = 'post' then
      update public.posts set status = 'removed', removed_reason = p_reason where id = r.target_id;
      perform private.audit('post.remove', 'post', r.target_id::text, p_reason, jsonb_build_object('report_id', p_report_id));
    elsif r.target_type = 'comment' then
      update public.post_comments set status = 'removed' where id = r.target_id;
      perform private.audit('comment.remove', 'comment', r.target_id::text, p_reason, jsonb_build_object('report_id', p_report_id));
    end if;
  end if;

  perform private.audit('report.decide', 'report', p_report_id::text, p_reason,
    jsonb_build_object('status', p_status, 'target_type', r.target_type, 'target_id', r.target_id,
                       'removed', p_remove_target and p_status = 'resolved'));
end;
$$;
revoke execute on function public.decide_report(uuid, public.report_status, text, boolean) from public, anon;
grant execute on function public.decide_report(uuid, public.report_status, text, boolean) to authenticated;

-- Storage: mídia de posts em bucket privado. Caminho <criador>/<post>/<arquivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-media', 'post-media', false, 15728640, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "post media: creator upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_role('creator')
  );

create policy "post media: owner read"
  on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "post media: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
