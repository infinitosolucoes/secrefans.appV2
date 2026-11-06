-- Operação: auditoria imutável, configurações e feature flags.

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id);

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_logs é imutável (append-only)' using errcode = '42501';
end;
$$;

create trigger admin_audit_logs_immutable
  before update or delete on public.admin_audit_logs
  for each row execute function private.prevent_audit_mutation();

create trigger admin_audit_logs_no_truncate
  before truncate on public.admin_audit_logs
  for each statement execute function private.prevent_audit_mutation();

-- Grava auditoria a partir de funções security definer (nunca direto pelo cliente).
create or replace function private.audit(
  p_action text, p_target_type text, p_target_id text, p_reason text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('creator_min_age', '18'::jsonb, 'Idade mínima para criadores (anos).'),
  ('commission_model', '"commission"'::jsonb, 'Modelo comercial único do MVP. Percentual a definir (S4).');

insert into public.feature_flags (key, enabled, description) values
  ('payments_enabled', false, 'Pagamentos reais — bloqueado até aprovação do provedor (ADR 0003).'),
  ('creator_publishing', false, 'Publicação de conteúdo por criadores (S2).'),
  ('wallets', false, 'Carteiras e transferências (S6, condicionado a BaaS).');
