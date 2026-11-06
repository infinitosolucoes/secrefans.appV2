-- SecretFans 2.0 — extensões, tipos e helpers genéricos.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Schema para funções internas que nunca devem ser expostas pela API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum (
  'fan', 'creator', 'moderator', 'support', 'finance', 'admin_ops', 'super_admin'
);

create type public.verification_status as enum ('pending', 'approved', 'rejected', 'suspended');

create type public.account_status as enum ('active', 'blocked', 'deleted');

create type public.profile_visibility as enum ('public', 'followers', 'private');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
