begin;
-- Auth may populate confirmation timestamps after its initial insert. Use
-- administrator-owned app metadata for provisioning, never user metadata.
create or replace function public.require_werkmatch_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data->>'werkmatch_access','') <> 'invited' then
    raise exception 'WerkMatch accounts are invite-only';
  end if;
  return new;
end $$;
commit;
