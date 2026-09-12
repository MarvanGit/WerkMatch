begin;
-- Enforce paid work limits even for requests made directly to the database API.
create or replace function public.enforce_generation_budget()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.candidate_profiles where user_id = new.user_id for update;
  if not public.consume_werkmatch_usage(new.user_id,'generation') then
    raise exception 'Daily generation limit reached';
  end if;
  return new;
end $$;
create trigger generation_budget before insert on public.generation_requests
for each row execute function public.enforce_generation_budget();
commit;
