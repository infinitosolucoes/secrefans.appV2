-- M03 — verificação de identidade/maioridade de criadores.

create table public.creator_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.verification_status not null default 'pending',
  legal_name text not null constraint cv_legal_name_len check (char_length(legal_name) between 3 and 120),
  birth_date date not null,
  document_front_path text not null,
  document_back_path text,
  selfie_path text not null,
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  appeal_text text constraint cv_appeal_len check (char_length(appeal_text) <= 2000),
  appealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cv_decision_consistency check (
    (status = 'pending' and decided_at is null) or (status <> 'pending' and decided_at is not null and decision_reason is not null)
  )
);

-- No máximo uma verificação em aberto/aprovada por usuário; rejeitadas ficam como histórico.
create unique index creator_verifications_one_active
  on public.creator_verifications (user_id) where status in ('pending', 'approved', 'suspended');
create index creator_verifications_status_idx on public.creator_verifications (status, submitted_at);

create trigger creator_verifications_set_updated_at before update on public.creator_verifications
  for each row execute function private.set_updated_at();
