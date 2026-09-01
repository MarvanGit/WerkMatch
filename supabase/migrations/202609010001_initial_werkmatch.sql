begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.candidate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  home_city text not null default 'Erlangen',
  home_region text not null default 'Bavaria',
  english_level text not null default 'C1',
  german_level text not null default 'B1',
  target_roles jsonb not null default '["working_student_software", "working_student_tech"]'::jsonb,
  target_skills jsonb not null default '[]'::jsonb,
  excluded_roles jsonb not null default '[]'::jsonb,
  search_policy jsonb not null default '{}'::jsonb,
  master_cv_object_key text,
  latex_template_object_key text,
  portrait_object_key text,
  profile_version integer not null default 1 check (profile_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text,
  canonical_url text not null,
  title text not null,
  company text not null,
  description text not null,
  location_text text not null,
  region text,
  country text not null default 'Germany',
  work_mode text not null default 'unknown'
    check (work_mode in ('onsite', 'hybrid', 'remote', 'unknown')),
  employment_type text not null,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  content_fingerprint text not null,
  active boolean not null default true,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, canonical_url),
  unique (user_id, source, external_id)
);

create table public.match_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  eligible boolean not null,
  overall_score integer not null check (overall_score between 0 and 100),
  technical_score integer not null check (technical_score between 0 and 100),
  location_eligible boolean not null,
  language_risk text not null default 'none'
    check (language_risk in ('none', 'low', 'medium', 'high')),
  language_assessment text not null,
  summary text not null,
  reasons jsonb not null default '[]'::jsonb,
  matched_evidence jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  model_provider text not null,
  model_id text not null,
  prompt_version text not null,
  profile_version integer not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  unique (user_id, job_id)
);

create table public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  match_evaluation_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'compiling', 'ready', 'failed')),
  template_version integer not null,
  profile_version integer not null,
  tailoring_plan jsonb,
  verified_content jsonb,
  model_provider text,
  model_id text,
  prompt_version text,
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  foreign key (match_evaluation_id, user_id)
    references public.match_evaluations(id, user_id)
);

create table public.document_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_request_id uuid not null,
  kind text not null
    check (kind in ('cv_tex', 'cv_pdf', 'cover_letter_tex', 'cover_letter_pdf', 'diff')),
  object_key text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  foreign key (generation_request_id, user_id)
    references public.generation_requests(id, user_id) on delete cascade,
  unique (generation_request_id, kind)
);

create table public.search_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  interval_minutes integer not null default 360 check (interval_minutes >= 15),
  notification_threshold integer not null default 75
    check (notification_threshold between 0 and 100),
  telegram_enabled boolean not null default true,
  telegram_chat_id text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_successful_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source)
);

create index jobs_active_first_seen_idx
  on public.jobs (user_id, active, first_seen_at desc);
create index jobs_region_work_mode_idx
  on public.jobs (user_id, region, work_mode);
create index match_user_eligible_score_idx
  on public.match_evaluations (user_id, eligible, overall_score desc);
create index match_job_id_idx on public.match_evaluations (job_id);
create index generation_user_status_idx
  on public.generation_requests (user_id, status, requested_at desc);
create index generation_job_requested_idx
  on public.generation_requests (job_id, requested_at desc);

create trigger candidate_profiles_set_updated_at
before update on public.candidate_profiles
for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();
create trigger match_evaluations_set_updated_at
before update on public.match_evaluations
for each row execute function public.set_updated_at();
create trigger generation_requests_set_updated_at
before update on public.generation_requests
for each row execute function public.set_updated_at();
create trigger search_schedules_set_updated_at
before update on public.search_schedules
for each row execute function public.set_updated_at();
create trigger source_configs_set_updated_at
before update on public.source_configs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.candidate_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'WerkMatch user')
  )
  on conflict (user_id) do nothing;

  insert into public.search_schedules (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.candidate_profiles (user_id, display_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', email, 'WerkMatch user')
from auth.users
on conflict (user_id) do nothing;

insert into public.search_schedules (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.candidate_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.match_evaluations enable row level security;
alter table public.generation_requests enable row level security;
alter table public.document_artifacts enable row level security;
alter table public.search_schedules enable row level security;
alter table public.source_configs enable row level security;

create policy "profiles_owned_by_user"
on public.candidate_profiles for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "jobs_owned_by_user"
on public.jobs for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "matches_owned_by_user"
on public.match_evaluations for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generation_requests_owned_by_user"
on public.generation_requests for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "artifacts_owned_by_user"
on public.document_artifacts for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "schedules_owned_by_user"
on public.search_schedules for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "sources_owned_by_user"
on public.source_configs for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'candidate-assets',
    'candidate-assets',
    false,
    15728640,
    array['application/pdf', 'text/plain', 'application/x-tex', 'image/jpeg', 'image/png']
  ),
  (
    'generated-documents',
    'generated-documents',
    false,
    15728640,
    array['application/pdf', 'text/plain', 'application/x-tex', 'application/json']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users_read_own_werkmatch_files"
on storage.objects for select to authenticated
using (
  bucket_id in ('candidate-assets', 'generated-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users_upload_own_werkmatch_files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('candidate-assets', 'generated-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users_update_own_werkmatch_files"
on storage.objects for update to authenticated
using (
  bucket_id in ('candidate-assets', 'generated-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('candidate-assets', 'generated-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users_delete_own_werkmatch_files"
on storage.objects for delete to authenticated
using (
  bucket_id in ('candidate-assets', 'generated-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
