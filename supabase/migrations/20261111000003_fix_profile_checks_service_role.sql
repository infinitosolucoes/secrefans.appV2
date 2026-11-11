-- As CHECKs de profiles chamam funções do schema private com o papel de quem grava.
-- Faltava permissão para a service_role (servidor/rotinas), o que fazia qualquer update falhar.
grant usage on schema private to service_role;
grant execute on function private.links_valid(text[]) to service_role;
grant execute on function private.socials_valid(jsonb) to service_role;
