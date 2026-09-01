import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type CandidateFact = {
  id: string;
  fact_key: string;
  category: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  tags: string[];
  verification_status: 'draft' | 'verified';
  order_index: number;
};

type ProfilePageProps = {
  searchParams: Promise<{ error?: string; verified?: string }>;
};

const categoryLabels: Record<string, string> = {
  skills: 'Skills',
  experience: 'Professional experience',
  education: 'Education',
  project: 'Projects',
  certification: 'Certifications',
  award: 'Scholarships and awards',
  activity: 'Activities',
  language: 'Languages',
  interest: 'Interests',
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('candidate_facts')
    .select(
      'id,fact_key,category,title,summary,details,tags,verification_status,order_index',
    )
    .eq('user_id', user.id)
    .order('order_index');

  const facts = (data ?? []) as CandidateFact[];
  const draftCount = facts.filter(
    (fact) => fact.verification_status === 'draft',
  ).length;
  const groupedFacts = Object.entries(
    Object.groupBy(facts, (fact) => fact.category),
  );

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-7 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Back to job radar
            </Link>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <FileCheck2 className="size-5" />
              </div>
              <div>
                <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em]">
                  Verified candidate facts
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Extracted from your uploaded Master CV and checked against its
                  LaTeX source.
                </p>
              </div>
            </div>
          </div>

          <Badge
            className={
              draftCount === 0
                ? 'bg-emerald-500/10 text-emerald-700'
                : 'bg-amber-500/10 text-amber-800'
            }
            variant="ghost"
          >
            {draftCount === 0 ? <CheckCircle2 /> : <Clock3 />}
            {draftCount === 0 ? 'Verified' : `${draftCount} facts to review`}
          </Badge>
        </header>

        {query.verified === '1' ? (
          <div className="mb-5 rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Your CV facts are verified and can now be used for job matching and
            document tailoring.
          </div>
        ) : null}

        {query.error || error ? (
          <div className="mb-5 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-950">
            WerkMatch could not load or verify the profile. Please try again.
          </div>
        ) : null}

        {facts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No extracted facts yet</CardTitle>
              <CardDescription>
                The Master CV has not been processed for this account.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-7">
            {groupedFacts.map(([category, categoryFacts]) => (
              <section key={category}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-heading text-lg font-semibold tracking-[-0.02em]">
                    {categoryLabels[category] ?? category}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {categoryFacts?.length ?? 0}{' '}
                    {categoryFacts?.length === 1 ? 'fact' : 'facts'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryFacts?.map((fact) => (
                    <Card key={fact.id} className="bg-card/90">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle>{fact.title}</CardTitle>
                            <CardDescription className="mt-1 leading-relaxed">
                              {fact.summary}
                            </CardDescription>
                          </div>
                          {fact.verification_status === 'verified' ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Clock3 className="size-4 shrink-0 text-amber-600" />
                          )}
                        </div>
                      </CardHeader>
                      {fact.tags.length > 0 ? (
                        <CardContent className="flex flex-wrap gap-1.5">
                          {fact.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </CardContent>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {draftCount > 0 ? (
          <Card className="mt-8 border-0 bg-primary/[0.06] ring-1 ring-primary/25">
            <CardHeader>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <CardTitle>Approve this factual profile</CardTitle>
                  <CardDescription className="mt-1 leading-relaxed">
                    Approval locks these facts as the evidence WerkMatch may
                    use. Tailored documents can rephrase or select them, but
                    cannot add unsupported claims.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form action="/api/profile/facts/verify" method="post">
                <Button className="h-10 gap-2" type="submit">
                  <Sparkles />
                  I confirm these facts
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
