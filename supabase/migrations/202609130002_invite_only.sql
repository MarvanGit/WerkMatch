begin;
-- The Auth API is reachable independently of the public website. Reject
-- self-registration there as well. Admin-confirmed accounts and invitations
-- remain supported; existing accounts are unaffected.
create or replace function public.require_werkmatch_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invited_at is null and new.email_confirmed_at is null then
    raise exception 'WerkMatch accounts are invite-only';
  end if;
  return new;
end $$;
create trigger require_werkmatch_invitation before insert on auth.users
for each row execute function public.require_werkmatch_invitation();
commit;
