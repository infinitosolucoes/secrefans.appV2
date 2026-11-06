-- Identidade: perfis, papéis, permissões, bloqueios e consentimentos.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext not null unique
    constraint profiles_handle_format check (handle::text ~ '^[a-z0-9_.]{3,30}$'),
  display_name text not null default '' constraint profiles_display_name_len check (char_length(display_name) <= 60),
  bio text not null default '' constraint profiles_bio_len check (char_length(bio) <= 500),
  avatar_path text,
  banner_path text,
  visibility public.profile_visibility not null default 'public',
  -- Intenção declarada no cadastro; não concede nenhum poder (o papel creator só vem da aprovação).
  creator_intent boolean not null default false,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.status is 'Somente equipe altera (grant por coluna bloqueia o dono).';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.role_permissions (
  role public.app_role not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null
    constraint consent_type_valid check (consent_type in ('terms', 'privacy', 'age_18', 'marketing', 'creator_content_rights', 'depicted_persons_consent')),
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, consent_type, created_at desc);

-- Catálogo inicial de permissões (RBAC). Ajustes finos via Super Admin em rodadas futuras.
insert into public.permissions (key, description) values
  ('users.read', 'Consultar usuários'),
  ('users.manage', 'Bloquear/desbloquear contas'),
  ('roles.manage', 'Conceder e revogar papéis'),
  ('verifications.read', 'Consultar verificações de criadores'),
  ('verifications.decide', 'Aprovar/rejeitar/suspender verificações'),
  ('verification_documents.read', 'Abrir documentos de identidade'),
  ('audit.read', 'Consultar trilha de auditoria'),
  ('settings.read', 'Consultar configurações e feature flags'),
  ('settings.manage', 'Alterar configurações e feature flags');

insert into public.role_permissions (role, permission_key) values
  ('support', 'users.read'),
  ('moderator', 'users.read'),
  ('moderator', 'verifications.read'),
  ('moderator', 'verifications.decide'),
  ('moderator', 'verification_documents.read'),
  ('finance', 'users.read'),
  ('finance', 'audit.read'),
  ('admin_ops', 'users.read'),
  ('admin_ops', 'users.manage'),
  ('admin_ops', 'verifications.read'),
  ('admin_ops', 'audit.read'),
  ('admin_ops', 'settings.read'),
  ('super_admin', 'users.read'),
  ('super_admin', 'users.manage'),
  ('super_admin', 'roles.manage'),
  ('super_admin', 'verifications.read'),
  ('super_admin', 'verifications.decide'),
  ('super_admin', 'verification_documents.read'),
  ('super_admin', 'audit.read'),
  ('super_admin', 'settings.read'),
  ('super_admin', 'settings.manage');
