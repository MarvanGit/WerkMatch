import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding-form';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: facts }] = await Promise.all([
    supabase
      .from('candidate_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('candidate_facts')
      .select('*')
      .eq('user_id', user.id)
      .order('order_index'),
  ]);
  const study = facts?.find((fact) => fact.details?.cover_letter_study_de)
    ?.details?.cover_letter_study_de;
  const availability = facts?.find(
    (fact) => fact.details?.cover_letter_availability_de,
  )?.details?.cover_letter_availability_de;
  const initialUpload =
    profile?.latex_template_object_key &&
    profile?.cover_letter_template_object_key &&
    facts?.length
      ? {
          cvKey: profile.latex_template_object_key,
          coverKey: profile.cover_letter_template_object_key,
          cvHash: facts[0].source_sha256,
          facts: facts
            .filter((fact) => fact.fact_key !== 'profile.study-availability')
            .map((fact) => ({
              category: fact.category,
              title: fact.title,
              summary: fact.summary,
              tags: fact.tags,
              organization: fact.details?.organization ?? '',
            })),
        }
      : undefined;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Back to workspace
      </Link>
      <h1 className="mt-7 text-4xl font-semibold tracking-tight">
        Your workspace starts with you.
      </h1>
      <p className="mb-10 mt-4 leading-relaxed text-muted-foreground">
        Add your documents, check your factual profile, and choose what fits
        your search. Your account’s files and matches stay private.
      </p>
      <OnboardingForm
        profile={profile ?? {}}
        initialUpload={initialUpload}
        study={study}
        availability={availability}
      />
    </main>
  );
}
