-- Helpers de autorização. security definer para ler user_roles sem recursão de RLS.
-- Respondem apenas sobre o próprio chamador (auth.uid()), então podem ficar expostos como RPC.

create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = check_role and p.status = 'active'
  );
$$;

create or replace function public.has_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and rp.permission_key = permission and p.status = 'active'
  );
$$;

create or replace function public.is_mfa_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role in ('moderator', 'support', 'finance', 'admin_ops', 'super_admin')
      and p.status = 'active'
  );
$$;

-- Permissão efetiva de equipe: papel + MFA (aal2). Usada em policies e RPCs administrativas.
create or replace function public.staff_can(permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_mfa_session() and public.has_permission(permission);
$$;

-- Lista os papéis do chamador (para a UI). Nunca de outros usuários.
create or replace function public.my_roles()
returns setof public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role from public.user_roles ur where ur.user_id = auth.uid();
$$;

revoke execute on function public.has_role(public.app_role), public.has_permission(text), public.is_staff(),
  public.staff_can(text), public.my_roles(), public.is_mfa_session() from public, anon;
grant execute on function public.has_role(public.app_role), public.has_permission(text), public.is_staff(),
  public.staff_can(text), public.my_roles(), public.is_mfa_session() to authenticated;
