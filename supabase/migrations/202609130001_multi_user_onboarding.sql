begin;

-- New users opt into background work after reviewing their profile.
alter table public.search_schedules alter column enabled set default false;
alter table public.search_schedules alter column telegram_enabled set default false;

create table public.usage_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('search','generation','upload')),
  day date not null default current_date,
  used integer not null default 0,
  last_used_at timestamptz not null default now(),
  primary key(user_id, operation, day)
);
alter table public.usage_budgets enable row level security;
revoke all on public.usage_budgets from anon, authenticated;

create or replace function public.consume_werkmatch_usage(requested_user uuid, requested_operation text)
returns boolean language plpgsql security definer set search_path = public as $$
declare budget integer; claimed integer;
begin
  if auth.uid() is distinct from requested_user and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Forbidden'; end if;
  budget := case requested_operation when 'search' then 6 when 'generation' then 8 when 'upload' then 3 else 0 end;
  if budget = 0 then return false; end if;
  insert into public.usage_budgets as b(user_id, operation, day, used, last_used_at)
  values(requested_user, requested_operation, current_date, 1, now())
  on conflict(user_id, operation, day) do update set used = b.used + 1, last_used_at = now()
  where b.used < budget and (b.operation <> 'search' or b.last_used_at < now() - interval '15 minutes')
  returning used into claimed;
  return claimed is not null;
end $$;
revoke all on function public.consume_werkmatch_usage(uuid,text) from public;
grant execute on function public.consume_werkmatch_usage(uuid,text) to authenticated, service_role;

create or replace function public.save_werkmatch_profile(payload jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid(); f jsonb; n integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if payload->>'confirmed' <> 'true' or jsonb_array_length(payload->'facts') not between 1 and 60 then raise exception 'Confirm candidate facts'; end if;
  if split_part(payload->>'cvKey','/',1) <> uid::text or split_part(payload->>'coverKey','/',1) <> uid::text then raise exception 'Invalid file owner'; end if;
  -- Lock profile changes together; queued jobs must never reuse an old plan with new facts.
  perform 1 from candidate_profiles where user_id = uid for update;
  if exists(select 1 from generation_requests where user_id = uid and status in ('queued','generating','compiling')) then raise exception 'Wait for document generation before replacing your profile'; end if;
  update candidate_profiles set display_name = payload->>'displayName', home_city = payload->>'homeCity',
    english_level = payload->>'englishLevel', german_level = payload->>'germanLevel',
    search_policy = jsonb_build_object('location',payload->>'location','roleKeywords',payload->>'roleKeywords'),
    master_cv_object_key = payload->>'cvKey', latex_template_object_key = payload->>'cvKey',
    cover_letter_template_object_key = payload->>'coverKey', profile_version = profile_version + 1
  where user_id = uid;
  if not found then raise exception 'Profile missing'; end if;
  delete from candidate_facts where user_id = uid;
  for f in select value from jsonb_array_elements(payload->'facts') loop
    n := n + 1;
    insert into candidate_facts(user_id,fact_key,category,title,summary,tags,details,source_object_key,source_sha256,verification_status,verified_at,order_index)
    values(uid,'profile.'||n,f->>'category',f->>'title',f->>'summary',array(select jsonb_array_elements_text(f->'tags')),
      jsonb_build_object('items',f->'tags','organization',f->>'organization'),
      payload->>'cvKey',payload->>'cvHash','verified',now(),n);
  end loop;
  insert into candidate_facts(user_id,fact_key,category,title,summary,details,source_object_key,source_sha256,verification_status,verified_at,order_index)
  values(uid,'profile.study-availability','education','Current study and availability',payload->>'study',
    jsonb_build_object('cover_letter_study_de',payload->>'study','cover_letter_availability_de',payload->>'availability'),
    payload->>'cvKey',payload->>'cvHash','verified',now(),n+1);
end $$;
revoke all on function public.save_werkmatch_profile(jsonb) from public;
grant execute on function public.save_werkmatch_profile(jsonb) to authenticated;
commit;
