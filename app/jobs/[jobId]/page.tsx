import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Languages,
  MapPin,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ApplicationStatusControl } from '@/components/application-status-control';
import { GenerateDocumentsButton } from '@/components/generate-documents-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkspacePage } from '@/components/workspace-chrome';
import {
  applicationStatusMeta,
  isApplicationStatus,
  type ApplicationStatus,
} from '@/lib/domain/applications';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type JobDetailPageProps = {
  params: Promise<{ jobId: string }>;
};

type MatchEvidence = {
  requirement?: string;
  candidateFactId?: string;
  explanation?: string;
};

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatDate(value: string | null): string {
  if (!value) return 'Not specified';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [jobResult, evaluationResult, applicationResult] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        'id,title,company,description,location_text,region,country,work_mode,employment_type,source,canonical_url,published_at,first_seen_at',
      )
      .eq('id', jobId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('match_evaluations')
      .select(
        'overall_score,technical_score,summary,reasons,matched_evidence,gaps,red_flags,language_risk,language_assessment,evaluated_at',
      )
      .eq('job_id', jobId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('applications')
      .select('status,applied_at,status_updated_at')
      .eq('job_id', jobId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const job = jobResult.data;
  if (!job) redirect('/jobs');

  const evaluation = evaluationResult.data;
  const rawEvidence = Array.isArray(evaluation?.matched_evidence)
    ? (evaluation.matched_evidence as MatchEvidence[])
    : [];
  const factIds = [
    ...new Set(
      rawEvidence.flatMap((item) =>
        item.candidateFactId ? [item.candidateFactId] : [],
      ),
    ),
  ];
  const { data: factData } = factIds.length
    ? await supabase
        .from('candidate_facts')
        .select('fact_key,title,tags')
        .eq('user_id', user.id)
        .in('fact_key', factIds)
    : { data: [] };
  const factsByKey = new Map(
    (factData ?? []).map((fact) => [fact.fact_key, fact]),
  );
  const evidence = rawEvidence.map((item) => ({
    ...item,
    fact: item.candidateFactId
      ? factsByKey.get(item.candidateFactId)
      : undefined,
  }));
  const applicationStatus =
    applicationResult.data && isApplicationStatus(applicationResult.data.status)
      ? (applicationResult.data.status as ApplicationStatus)
      : null;

  return (
    <WorkspacePage
      active="/"
      actions={
        <Link className={buttonVariants({ variant: 'outline' })} href="/jobs">
          <ArrowLeft />
          All matches
        </Link>
      }
      description={`${job.company} · ${job.location_text} · ${job.work_mode}`}
      title={job.title}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge className="bg-primary/10 text-primary" variant="ghost">
          {evaluation ? `${evaluation.overall_score}% match` : 'Not scored'}
        </Badge>
        <Badge variant="secondary">{job.source}</Badge>
        {applicationStatus ? (
          <Badge variant="outline">
            {applicationStatusMeta[applicationStatus].label}
          </Badge>
        ) : null}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          {evaluation ? (
            <Card className="border-0 bg-card/90 shadow-[0_8px_30px_rgb(15_23_42/5%)]">
              <CardHeader className="border-b border-border/70">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                      <Sparkles className="size-4 text-primary" />
                      Match assessment
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Evaluated {formatDate(evaluation.evaluated_at)}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-3xl font-semibold tracking-[-0.04em] text-primary">
                      {evaluation.overall_score}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      overall
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-[15px] leading-7 text-foreground/85">
                  {evaluation.summary}
                </p>

                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Why it matches
                  </h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {textList(evaluation.reasons).map((reason) => (
                      <li
                        key={reason}
                        className="flex gap-2.5 rounded-xl bg-secondary/60 p-3.5 leading-relaxed"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {evaluation.language_risk !== 'none' ? (
                  <section className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em]">
                      <Languages className="size-4" />
                      Language note · {evaluation.language_risk} risk
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed">
                      {evaluation.language_assessment}
                    </p>
                  </section>
                ) : null}

                {evidence.length > 0 ? (
                  <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Verified evidence from your CV
                    </h2>
                    <div className="space-y-3">
                      {evidence.map((item, index) => (
                        <div
                          key={`${item.candidateFactId ?? 'evidence'}-${index}`}
                          className="rounded-xl border border-border/80 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {item.requirement ?? 'Relevant requirement'}
                            </p>
                            {item.fact?.title ? (
                              <Badge variant="secondary">
                                {item.fact.title}
                              </Badge>
                            ) : null}
                          </div>
                          {item.explanation ? (
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              {item.explanation}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {textList(evaluation.gaps).length > 0 ? (
                  <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Gaps to consider
                    </h2>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      {textList(evaluation.gaps).map((gap) => (
                        <li key={gap} className="flex gap-2.5">
                          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-card/90">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="text-lg font-semibold">
                Full job description
              </CardTitle>
              <CardDescription>
                Saved from the public listing. Confirm details on the original
                source before applying.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-line text-sm leading-7 text-foreground/80">
                {job.description}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <Card className="border-0 bg-card shadow-[0_18px_60px_rgb(15_23_42/8%)]">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="text-base font-semibold">
                Application
              </CardTitle>
              <CardDescription>
                Confirm submission here, then track its progress in
                Applications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ApplicationStatusControl
                initialStatus={applicationStatus}
                jobId={job.id}
              />
              {applicationResult.data ? (
                <p className="border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
                  Applied {formatDate(applicationResult.data.applied_at)} · Last
                  updated {formatDate(applicationResult.data.status_updated_at)}
                </p>
              ) : null}
              <a
                className={buttonVariants({
                  variant: 'outline',
                  className: 'h-10 w-full',
                })}
                href={job.canonical_url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink />
                Open original listing
              </a>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <FileText className="size-4 text-primary" />
                Tailored documents
              </CardTitle>
              <CardDescription>
                Generated only when you request them.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <GenerateDocumentsButton jobId={job.id} />
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{job.location_text}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.region ?? job.country} · {job.work_mode}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{job.employment_type}</p>
                  <p className="text-xs text-muted-foreground">
                    Source: {job.source}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    Published {formatDate(job.published_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Found {formatDate(job.first_seen_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </WorkspacePage>
  );
}
