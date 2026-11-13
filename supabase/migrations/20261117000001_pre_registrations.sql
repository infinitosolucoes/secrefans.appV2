-- Leads do pré-cadastro da landing antiga (Lovable "SecretFans: Reveal Soon").
-- Base de convite para o lançamento: não cria contas. Dados pessoais (LGPD): só equipe com
-- users.read + MFA lê; escrita apenas pela service role (importação/rotinas do servidor).

create table public.pre_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text,
  profile_type text not null
    constraint pre_registrations_profile_type check (profile_type in ('creator', 'fan')),
  instagram text,
  lgpd_consent boolean not null,
  consented_at timestamptz not null default now(),
  source text default 'landing-page',
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ip_hash text,
  created_at timestamptz default now(),
  imported_from text,
  imported_at timestamptz,
  invited_at timestamptz,
  converted_user_id uuid references auth.users (id) on delete set null
);

create unique index pre_registrations_email_key on public.pre_registrations (lower(email));
create index pre_registrations_profile_type_idx on public.pre_registrations (profile_type);

alter table public.pre_registrations enable row level security;

revoke all on public.pre_registrations from anon, authenticated;
grant select on public.pre_registrations to authenticated;

create policy pre_registrations_staff_read on public.pre_registrations
  for select to authenticated
  using (public.staff_can('users.read'));
