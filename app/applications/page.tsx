import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ApplicationStatusControl } from '@/components/application-status-control';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import {
  applicationStatusMeta,
  isApplicationStatus,
  type ApplicationStatus,
} from '@/lib/domain/applications';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type StoredApplication = {
  job_id: string;
  status: string;
  applied_at: string;
  status_updated_at: string;
};

type StoredJob = {
  id: string;
  title: string;
  company: string;
  location_text: string;
  work_mode: string;
  source: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: applicationData } = await supabase
    .from('applications')
    .select('job_id,status,applied_at,status_updated_at')
    .eq('user_id', user.id)
    .order('status_updated_at', { ascending: false });
  const applications = (applicationData ?? []) as StoredApplication[];
  const jobIds = applications.map((application) => application.job_id);
  const [{ data: jobData }, { data: evaluationData }] = jobIds.length
    ? await Promise.all([
        supabase
          .from('jobs')
          .select('id,title,company,location_text,work_mode,source')
          .eq('user_id', user.id)
          .in('id', jobIds),
        supabase
          .from('match_evaluations')
          .select('job_id,overall_score')
          .eq('user_id', user.id)
          .in('job_id', jobIds),
      ])
    : [{ data: [] }, { data: [] }];
  const jobById = new Map(
    ((jobData ?? []) as StoredJob[]).map((job) => [job.id, job]),
  );
  const scoreByJobId = new Map(
    (evaluationData ?? []).map((evaluation) => [
      evaluation.job_id,
      evaluation.overall_score,
    ]),
  );
  const rows = applications.flatMap((application) => {
    const job = jobById.get(application.job_id);
    if (!job || !isApplicationStatus(application.status)) return [];
    return [
      {
        ...application,
        status: application.status as ApplicationStatus,
        job,
        score: scoreByJobId.get(application.job_id) as number | undefined,
      },
    ];
  });
  const activeCount = rows.filter((row) =>
    ['applied', 'screening', 'interview'].includes(row.status),
  ).length;
  const interviewCount = rows.filter(
    (row) => row.status === 'interview',
  ).length;
  const offerCount = rows.filter((row) => row.status === 'offer').length;

  return (
    <WorkspacePage
      active="/applications"
      actions={
        <Link className={buttonVariants()} href="/jobs">
          <Search />
          Find jobs
        </Link>
      }
      description="Every role you confirmed as submitted, with progress controlled by you. Change a status whenever the hiring process moves."
      title="Applications"
    >
      <section
        aria-label="Application overview"
        className="mb-6 grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: 'Active', value: activeCount, detail: 'In progress' },
          {
            label: 'Interviews',
            value: interviewCount,
            detail: 'Current stage',
          },
          { label: 'Offers', value: offerCount, detail: 'Received' },
        ].map((item) => (
          <Card key={item.label} className="border-0 bg-card/90 shadow-sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 font-heading text-2xl font-semibold tracking-[-0.03em]">
                  {item.value}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                {item.detail}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      {rows.length === 0 ? (
        <Card className="border-dashed bg-card/60 py-12 text-center">
          <CardContent>
            <ClipboardCheck className="mx-auto mb-3 size-7 text-muted-foreground" />
            <p className="font-medium">No confirmed applications yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Open a job match and choose “Mark as applied” after you submit it.
              It will appear here immediately.
            </p>
            <Link
              className={buttonVariants({ className: 'mt-5' })}
              href="/jobs"
            >
              Browse matches
              <ArrowRight />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.job_id} className="bg-card/90">
              <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {applicationStatusMeta[row.status].label}
                    </Badge>
                    {typeof row.score === 'number' ? (
                      <Badge
                        className="bg-primary/10 text-primary"
                        variant="ghost"
                      >
                        {row.score}% match
                      </Badge>
                    ) : null}
                    <Badge variant="outline">{row.job.source}</Badge>
                  </div>
                  <Link
                    className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md font-heading text-base font-semibold tracking-[-0.02em] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/jobs/${row.job_id}`}
                  >
                    <span className="truncate">{row.job.title}</span>
                    <ArrowRight className="size-4 shrink-0" />
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.job.company} · {row.job.location_text} ·{' '}
                    {row.job.work_mode}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" />
                      Applied {formatDate(row.applied_at)}
                    </span>
                    <span>
                      Status updated {formatDate(row.status_updated_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-border/70 pt-4 md:border-l md:border-t-0 md:py-1 md:pl-5">
                  <BriefcaseBusiness className="hidden size-4 text-muted-foreground sm:block" />
                  <ApplicationStatusControl
                    compact
                    initialStatus={row.status}
                    jobId={row.job_id}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </WorkspacePage>
  );
}
