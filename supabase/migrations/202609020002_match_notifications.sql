begin;

alter table public.match_evaluations
  add column remote_from_germany_confirmed boolean not null default false,
  add column notified_at timestamptz;

commit;
