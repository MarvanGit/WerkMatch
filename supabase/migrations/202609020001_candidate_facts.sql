begin;

create table public.candidate_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact_key text not null,
  category text not null check (
    category in (
      'skills',
      'experience',
      'education',
      'project',
      'certification',
      'award',
      'activity',
      'language',
      'interest'
    )
  ),
  title text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  source_object_key text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verification_status text not null default 'draft' check (
    verification_status in ('draft', 'verified')
  ),
  verified_at timestamptz,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fact_key)
);

create index candidate_facts_user_category_idx
on public.candidate_facts (user_id, category, order_index);

create trigger candidate_facts_set_updated_at
before update on public.candidate_facts
for each row execute function public.set_updated_at();

alter table public.candidate_facts enable row level security;

create policy "users_read_own_candidate_facts"
on public.candidate_facts for select to authenticated
using (auth.uid() = user_id);

create policy "users_insert_own_candidate_facts"
on public.candidate_facts for insert to authenticated
with check (auth.uid() = user_id);

create policy "users_update_own_candidate_facts"
on public.candidate_facts for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users_delete_own_candidate_facts"
on public.candidate_facts for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.candidate_facts to authenticated;

commit;
