-- RLS: deny by default. Toda tabela tem RLS ligada; o que não tem policy fica inacessível ao cliente.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_blocks enable row level security;
alter table public.consent_records enable row level security;
alter table public.creator_verifications enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.feature_flags enable row level security;

-- Visitantes não leem tabelas diretamente; perfis públicos saem pela view abaixo.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- profiles ---------------------------------------------------------------
create policy profiles_select_own_or_staff on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.staff_can('users.read'));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and status = 'active')
  with check (id = (select auth.uid()));

-- O dono só altera colunas não privilegiadas (status/created_at ficam fora).
revoke insert, update, delete on public.profiles from authenticated;
grant update (handle, display_name, bio, avatar_path, banner_path, visibility, creator_intent) on public.profiles to authenticated;

-- View pública: apenas colunas públicas de contas ativas.
create view public.public_profiles
with (security_invoker = false) as
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.banner_path,
         exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'creator') as is_creator,
         p.created_at
  from public.profiles p
  where p.status = 'active' and p.visibility <> 'private';
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- user_roles: leitura própria; NENHUMA escrita pelo cliente (grant_role/revoke_role apenas).
create policy user_roles_select_own_or_staff on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can('users.read'));
revoke insert, update, delete on public.user_roles from authenticated;

-- Catálogo de permissões: leitura para autenticados.
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
revoke insert, update, delete on public.permissions, public.role_permissions from authenticated;

-- user_blocks: o próprio bloqueador gerencia.
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));
revoke update on public.user_blocks from authenticated;

-- consent_records: append-only pelo próprio usuário.
create policy consent_select_own on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy consent_insert_own on public.consent_records
  for insert to authenticated with check (user_id = (select auth.uid()));
revoke update, delete on public.consent_records from authenticated;

-- creator_verifications: leitura própria ou equipe com MFA; escrita só via RPC.
create policy cv_select_own_or_staff on public.creator_verifications
  for select to authenticated
  using (user_id = (select auth.uid()) or public.staff_can('verifications.read'));
revoke insert, update, delete on public.creator_verifications from authenticated;

-- admin_audit_logs: leitura por equipe com MFA; escrita só via private.audit().
create policy audit_select_staff on public.admin_audit_logs
  for select to authenticated using (public.staff_can('audit.read'));
revoke insert, update, delete on public.admin_audit_logs from authenticated;

-- platform_settings / feature_flags: leitura por equipe com MFA.
create policy settings_select_staff on public.platform_settings
  for select to authenticated using (public.staff_can('settings.read'));
create policy flags_select_staff on public.feature_flags
  for select to authenticated using (public.staff_can('settings.read'));
revoke insert, update, delete on public.platform_settings, public.feature_flags from authenticated;
