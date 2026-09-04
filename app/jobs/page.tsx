import { BriefcaseBusiness, ChevronRight, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Evaluation = {
  job_id: string;
  overall_score: number;
  summary: string;
  evaluated_at: string;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location_text: string;
  work_mode: string;
  source: string;
  first_seen_at: string;
};

export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: evaluationData } = await supabase
    .from('match_evaluations')
    .select('job_id,overall_score,summary,evaluated_at')
    .eq('user_id', user.id)
    .eq('eligible', true)
    .order('overall_score', { ascending: false })
    .limit(200);
  const evaluations = (evaluationData ?? []) as Evaluation[];
  const jobIds = evaluations.map((item) => item.job_id);
  const { data: jobData } = jobIds.length
    ? await supabase
        .from('jobs')
        .select('id,title,company,location_text,work_mode,source,first_seen_at')
        .eq('user_id', user.id)
        .in('id', jobIds)
    : { data: [] };
  const jobById = new Map(
    ((jobData ?? []) as Job[]).map((job) => [job.id, job]),
  );
  const matches = evaluations.flatMap((evaluation) => {
    const job = jobById.get(evaluation.job_id);
    return job ? [{ ...job, ...evaluation }] : [];
  });

  return (
    <WorkspacePage
      active="/"
      description="Every eligible role, ordered by match score. Open a result to inspect its evidence, visit the original listing, or generate documents."
      title="All job matches"
    >
      {matches.length === 0 ? (
        <Card className="border-dashed bg-card/60 py-10 text-center">
          <CardContent>
            <Search className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">No eligible matches yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a search from the inbox to collect and score live listings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <Link
              key={match.id}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/jobs/${match.id}`}
            >
              <Card className="bg-card/90 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary">
                      {match.overall_score}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-[15px] font-semibold">
                          {match.title}
                        </CardTitle>
                        <Badge variant="secondary">{match.source}</Badge>
                      </div>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{match.company}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {match.location_text} · {match.work_mode}
                        </span>
                      </CardDescription>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pl-[4.25rem] text-sm leading-relaxed text-muted-foreground">
                  {match.summary}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <footer className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <BriefcaseBusiness className="size-3.5" />
        Showing {matches.length} eligible{' '}
        {matches.length === 1 ? 'role' : 'roles'}.
      </footer>
    </WorkspacePage>
  );
}
