begin;
create table public.account_invitations (
  email text primary key,
  expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table public.account_invitations enable row level security;
revoke all on public.account_invitations from public, anon, authenticated;
grant all on public.account_invitations to service_role;
create or replace function public.require_werkmatch_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.account_invitations where email = lower(new.email) and expires_at > now();
  if not found then raise exception 'WerkMatch accounts are invite-only'; end if;
  return new;
end $$;
commit;
