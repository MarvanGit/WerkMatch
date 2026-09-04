begin;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'applied'
    check (status in ('applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn')),
  applied_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id),
  foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade
);

create index applications_user_updated_idx
  on public.applications (user_id, status_updated_at desc);
create index applications_user_status_idx
  on public.applications (user_id, status);

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

create policy "applications_owned_by_user"
on public.applications for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.applications from anon;
grant select, insert, update, delete on public.applications to authenticated;

commit;
