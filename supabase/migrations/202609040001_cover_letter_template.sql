begin;

alter table public.candidate_profiles
  add column if not exists cover_letter_template_object_key text;

commit;
