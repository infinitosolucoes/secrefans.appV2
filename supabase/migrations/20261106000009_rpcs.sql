-- RPCs de negócio. security definer + search_path vazio; cada ação relevante grava auditoria.
-- Erros de autorização usam SQLSTATE 42501 (insufficient_privilege).

-- Criador envia verificação ------------------------------------------------
create or replace function public.submit_creator_verification(
  p_legal_name text,
  p_birth_date date,
  p_document_front_path text,
  p_document_back_path text,
  p_selfie_path text,
  p_rights_consent boolean,
  p_depicted_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  min_age int;
  new_id uuid;
  path text;
begin
  if uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid and status = 'active') then
    raise exception 'Conta inativa' using errcode = '42501';
  end if;
  if not coalesce(p_rights_consent, false) or not coalesce(p_depicted_consent, false) then
    raise exception 'Consentimentos obrigatórios não aceitos' using errcode = '22023';
  end if;

  select coalesce((value #>> '{}')::int, 18) into min_age from public.platform_settings where key = 'creator_min_age';
  if p_birth_date is null or p_birth_date > (current_date - make_interval(years => coalesce(min_age, 18)))::date then
    raise exception 'Idade mínima não atingida' using errcode = '22023';
  end if;

  foreach path in array array_remove(array[p_document_front_path, p_document_back_path, p_selfie_path], null) loop
    if split_part(path, '/', 1) <> uid::text or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'verification-documents' and o.name = path and o.owner_id = uid::text
    ) then
      raise exception 'Documento inválido: %', path using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from public.creator_verifications
    where user_id = uid and status in ('pending', 'approved', 'suspended')
  ) then
    raise exception 'Já existe verificação em andamento ou concluída' using errcode = '23505';
  end if;

  insert into public.creator_verifications (user_id, legal_name, birth_date, document_front_path, document_back_path, selfie_path)
  values (uid, trim(p_legal_name), p_birth_date, p_document_front_path, p_document_back_path, p_selfie_path)
  returning id into new_id;

  insert into public.consent_records (user_id, consent_type, version, granted) values
    (uid, 'creator_content_rights', '2026-11', true),
    (uid, 'depicted_persons_consent', '2026-11', true);

  update public.profiles set creator_intent = true where id = uid;

  perform private.audit('verification.submitted', 'creator_verification', new_id::text, null, '{}'::jsonb);
  return new_id;
end;
$$;

-- Criador recorre de rejeição: volta para a fila --------------------------
create or replace function public.appeal_creator_verification(p_verification_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.creator_verifications;
begin
  select * into v from public.creator_verifications where id = p_verification_id for update;
  if v.id is null or v.user_id is distinct from uid then
    raise exception 'Verificação não encontrada' using errcode = '42501';
  end if;
  if v.status <> 'rejected' then
    raise exception 'Só é possível recorrer de verificações rejeitadas' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_text), '')) < 10 then
    raise exception 'Explique o recurso (mínimo 10 caracteres)' using errcode = '22023';
  end if;
  if exists (select 1 from public.creator_verifications where user_id = uid and status in ('pending', 'approved', 'suspended')) then
    raise exception 'Já existe verificação em andamento' using errcode = '23505';
  end if;

  update public.creator_verifications
     set status = 'pending', appeal_text = trim(p_text), appealed_at = now(),
         decided_at = null, decided_by = null, decision_reason = null
   where id = v.id;

  perform private.audit('verification.appealed', 'creator_verification', v.id::text, null,
    jsonb_build_object('previous_reason', v.decision_reason, 'previous_decided_by', v.decided_by));
end;
$$;

-- Moderação decide ---------------------------------------------------------
create or replace function public.decide_creator_verification(
  p_verification_id uuid, p_status public.verification_status, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.creator_verifications;
begin
  if not public.staff_can('verifications.decide') then
    raise exception 'Sem permissão ou sem MFA' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;

  select * into v from public.creator_verifications where id = p_verification_id for update;
  if v.id is null then
    raise exception 'Verificação não encontrada' using errcode = 'P0002';
  end if;
  if v.user_id = uid then
    raise exception 'Não é permitido decidir a própria verificação' using errcode = '42501';
  end if;
  if not (
    (v.status = 'pending' and p_status in ('approved', 'rejected'))
    or (v.status = 'approved' and p_status = 'suspended')
    or (v.status = 'suspended' and p_status in ('approved', 'rejected'))
  ) then
    raise exception 'Transição inválida: % -> %', v.status, p_status using errcode = '22023';
  end if;

  update public.creator_verifications
     set status = p_status, decided_by = uid, decided_at = now(), decision_reason = trim(p_reason)
   where id = v.id;

  if p_status = 'approved' then
    insert into public.user_roles (user_id, role, granted_by) values (v.user_id, 'creator', uid)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = v.user_id and role = 'creator';
  end if;

  perform private.audit('verification.' || p_status::text, 'creator_verification', v.id::text, trim(p_reason),
    jsonb_build_object('user_id', v.user_id, 'from', v.status, 'to', p_status));
end;
$$;

-- Registro de acesso a documento (chamado pelo servidor antes de assinar a URL) --
create or replace function public.log_verification_document_access(p_verification_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('verification_documents.read') then
    raise exception 'Sem permissão ou sem MFA' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.creator_verifications
    where id = p_verification_id and p_path in (document_front_path, document_back_path, selfie_path)
  ) then
    raise exception 'Documento não pertence à verificação' using errcode = '22023';
  end if;
  perform private.audit('verification.document_viewed', 'creator_verification', p_verification_id::text, null,
    jsonb_build_object('path', p_path));
end;
$$;

-- Papéis -------------------------------------------------------------------
create or replace function public.grant_role(p_user_id uuid, p_role public.app_role, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not (public.has_role('super_admin') and public.is_mfa_session()) then
    -- Tentativa negada fica registrada: retorna false em vez de exceção para não desfazer a auditoria.
    perform private.audit('role.grant_denied', 'user', p_user_id::text, p_reason, jsonb_build_object('role', p_role));
    return false;
  end if;
  if p_user_id = uid then
    raise exception 'Não é permitido alterar os próprios papéis' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, uid)
  on conflict (user_id, role) do nothing;
  perform private.audit('role.granted', 'user', p_user_id::text, trim(p_reason), jsonb_build_object('role', p_role));
  return true;
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role public.app_role, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not (public.has_role('super_admin') and public.is_mfa_session()) then
    perform private.audit('role.revoke_denied', 'user', p_user_id::text, p_reason, jsonb_build_object('role', p_role));
    return false;
  end if;
  if p_user_id = uid then
    raise exception 'Não é permitido alterar os próprios papéis' using errcode = '42501';
  end if;
  if p_role = 'fan' then
    raise exception 'O papel base fan não pode ser revogado' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;

  delete from public.user_roles where user_id = p_user_id and role = p_role;
  perform private.audit('role.revoked', 'user', p_user_id::text, trim(p_reason), jsonb_build_object('role', p_role));
  return true;
end;
$$;

-- Status da conta (bloqueio) ----------------------------------------------
create or replace function public.set_account_status(p_user_id uuid, p_status public.account_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('users.manage') then
    raise exception 'Sem permissão ou sem MFA' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Não é permitido alterar a própria conta' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;
  perform private.audit('account.status_changed', 'user', p_user_id::text, trim(p_reason), jsonb_build_object('status', p_status));
end;
$$;

-- Consultas administrativas (PII mínima: e-mail só para equipe com users.read + MFA) --
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, handle text, display_name text, email text, status public.account_status,
  roles public.app_role[], created_at timestamptz, total_count bigint
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
           p.created_at, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles ur on ur.user_id = p.id
    where p_search is null or p_search = ''
       or p.handle::text ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
    group by p.id, u.email
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_dashboard_counts()
returns table (users_total bigint, creators_total bigint, pending_verifications bigint, audit_events_24h bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff() and public.is_mfa_session()) then
    raise exception 'Sem permissão ou sem MFA' using errcode = '42501';
  end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.user_roles where role = 'creator'),
    (select count(*) from public.creator_verifications where status = 'pending'),
    (select count(*) from public.admin_audit_logs where created_at > now() - interval '24 hours');
end;
$$;

-- Execução: só autenticados (as próprias funções checam papel/MFA).
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.submit_creator_verification(text, date, text, text, text, boolean, boolean)',
    'public.appeal_creator_verification(uuid, text)',
    'public.decide_creator_verification(uuid, public.verification_status, text)',
    'public.log_verification_document_access(uuid, text)',
    'public.grant_role(uuid, public.app_role, text)',
    'public.revoke_role(uuid, public.app_role, text)',
    'public.set_account_status(uuid, public.account_status, text)',
    'public.admin_list_users(text, int, int)',
    'public.admin_dashboard_counts()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke execute on function private.audit(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
