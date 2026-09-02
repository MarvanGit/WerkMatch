import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  LogOut,
  MapPin,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RunSearchButton } from '@/components/run-search-button';
import { GenerateDocumentsButton } from '@/components/generate-documents-button';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type StoredEvaluation = {
  job_id: string;
  overall_score: number;
  summary: string;
  reasons: unknown;
  matched_evidence: unknown;
  language_risk: 'none' | 'low' | 'medium' | 'high';
  language_assessment: string;
  evaluated_at: string;
};

type StoredJob = {
  id: string;
  title: string;
  company: string;
  location_text: string;
  work_mode: string;
  canonical_url: string;
  first_seen_at: string;
};

function formatRelativeTime(value: string): string {
  const differenceMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / 60_000,
  );
  const absoluteMinutes = Math.abs(differenceMinutes);

  if (absoluteMinutes < 60) {
    return differenceMinutes >= 0
      ? `in ${absoluteMinutes}m`
      : `${absoluteMinutes}m ago`;
  }

  const hours = Math.round(absoluteMinutes / 60);
  if (hours < 24) {
    return differenceMinutes >= 0 ? `in ${hours}h` : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return differenceMinutes >= 0 ? `in ${days}d` : `${days}d ago`;
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="grid size-12 shrink-0 place-items-center rounded-full p-[3px]"
      style={{
        background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--muted) 0deg)`,
      }}
      aria-label={`${score}% match`}
    >
      <div className="grid size-full place-items-center rounded-full bg-card text-sm font-semibold text-foreground">
        {score}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="size-4" />
      </div>
      <div>
        <p className="font-heading text-[15px] font-semibold tracking-[-0.02em]">
          WerkMatch
        </p>
        <p className="text-[11px] text-muted-foreground">
          Application workspace
        </p>
      </div>
    </div>
  );
}

type HomeProps = {
  searchParams: Promise<{ job?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { job: selectedJobId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const weekStart = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1_000);
  const [
    evaluationResult,
    scheduleResult,
    weeklyJobsResult,
    strongResult,
    factsResult,
  ] = await Promise.all([
    supabase
      .from('match_evaluations')
      .select(
        'job_id,overall_score,summary,reasons,matched_evidence,language_risk,language_assessment,evaluated_at',
      )
      .eq('user_id', user.id)
      .eq('eligible', true)
      .order('overall_score', { ascending: false })
      .limit(8),
    supabase
      .from('search_schedules')
      .select(
        'enabled,interval_minutes,notification_threshold,telegram_enabled,telegram_chat_id,last_run_at,next_run_at',
      )
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('first_seen_at', weekStart.toISOString()),
    supabase
      .from('match_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('eligible', true)
      .gte('overall_score', 80),
    supabase
      .from('candidate_facts')
      .select('fact_key,tags')
      .eq('user_id', user.id)
      .eq('verification_status', 'verified'),
  ]);

  const evaluations = (evaluationResult.data ?? []) as StoredEvaluation[];
  const jobIds = evaluations.map((evaluation) => evaluation.job_id);
  const { data: jobData } = jobIds.length
    ? await supabase
        .from('jobs')
        .select(
          'id,title,company,location_text,work_mode,canonical_url,first_seen_at',
        )
        .eq('user_id', user.id)
        .in('id', jobIds)
    : { data: [] };
  const jobById = new Map(
    ((jobData ?? []) as StoredJob[]).map((job) => [job.id, job]),
  );
  const factTags = new Map(
    (factsResult.data ?? []).map((fact) => [
      fact.fact_key,
      fact.tags as string[],
    ]),
  );
  const jobs = evaluations.flatMap((evaluation) => {
    const job = jobById.get(evaluation.job_id);
    if (!job) return [];

    const evidence = Array.isArray(evaluation.matched_evidence)
      ? (evaluation.matched_evidence as Array<{ candidateFactId?: string }>)
      : [];
    const tags = [
      ...new Set(
        evidence.flatMap((item) =>
          item.candidateFactId
            ? (factTags.get(item.candidateFactId) ?? [])
            : [],
        ),
      ),
    ].slice(0, 5);

    return [
      {
        ...job,
        score: evaluation.overall_score,
        summary: evaluation.summary,
        reasons: Array.isArray(evaluation.reasons)
          ? (evaluation.reasons as string[])
          : [],
        languageRisk: evaluation.language_risk,
        languageAssessment: evaluation.language_assessment,
        tags,
        status: evaluation.overall_score >= 80 ? 'Strong match' : 'Good match',
      },
    ];
  });
  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;
  const schedule = scheduleResult.data;
  const intervalHours = Math.max(
    1,
    Math.round((schedule?.interval_minutes ?? 360) / 60),
  );
  const telegramReady =
    (schedule?.telegram_enabled ?? true) &&
    Boolean(schedule?.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID);
  const stats = [
    {
      label: 'New this week',
      value: String(weeklyJobsResult.count ?? 0),
      detail: 'Across active sources',
      icon: BriefcaseBusiness,
    },
    {
      label: 'Strong matches',
      value: String(strongResult.count ?? 0),
      detail: 'Score of 80 or higher',
      icon: Sparkles,
    },
    {
      label: 'Search cadence',
      value: `${intervalHours}h`,
      detail: schedule?.next_run_at
        ? `Next ${formatRelativeTime(schedule.next_run_at)}`
        : 'Run the first search now',
      icon: CalendarClock,
    },
    {
      label: 'Telegram',
      value: telegramReady ? 'Ready' : 'Off',
      detail: telegramReady
        ? `Alerts at ${schedule?.notification_threshold ?? 75}%+`
        : 'Notifications disabled',
      icon: Send,
    },
  ];
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Berlin',
  }).format(new Date());

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] border-r border-border/80 bg-sidebar px-4 py-5 lg:flex lg:flex-col">
        <div className="px-2">
          <Brand />
        </div>

        <nav className="mt-9 space-y-1" aria-label="Main navigation">
          <Button
            className="h-10 w-full justify-start gap-3 bg-primary/10 px-3 text-primary hover:bg-primary/15"
            variant="ghost"
          >
            <BriefcaseBusiness />
            Job inbox
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
              {strongResult.count ?? 0}
            </span>
          </Button>
          <Button
            className="h-10 w-full justify-start gap-3 px-3"
            variant="ghost"
          >
            <FileText />
            Documents
          </Button>
          <Button
            className="h-10 w-full justify-start gap-3 px-3"
            variant="ghost"
          >
            <Radio />
            Sources
          </Button>
          <Link
            className={buttonVariants({
              variant: 'ghost',
              className: 'h-10 w-full justify-start gap-3 px-3',
            })}
            href="/profile"
          >
            <SlidersHorizontal />
            Match profile
          </Link>
        </nav>

        <div className="mt-auto rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {schedule?.enabled ? 'Discovery is active' : 'Discovery is paused'}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Bavaria on-site and hybrid, plus Germany-wide remote roles.
          </p>
          <Button className="mt-3 w-full" size="sm" variant="outline">
            <Settings2 />
            Search settings
          </Button>
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
            <Clock3 className="size-4" />
            {schedule?.last_run_at
              ? `Last search ${formatRelativeTime(schedule.last_run_at)}`
              : 'No search has run yet'}
          </div>
          <div className="flex items-center gap-2">
            <form action="/auth/signout" method="post">
              <Button
                aria-label="Sign out"
                size="icon"
                type="submit"
                variant="ghost"
              >
                <LogOut />
              </Button>
            </form>
            <Button aria-label="Notifications" size="icon" variant="ghost">
              <Bell />
            </Button>
            <Button className="hidden gap-2 sm:flex" variant="outline">
              <Plus />
              Add a job
            </Button>
            <RunSearchButton />
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
          <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                {today}
              </p>
              <h1 className="mt-1 font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Your job radar
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Technical working-student roles ranked against your verified CV
                facts.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <CheckCircle2 className="size-4 text-primary" />
              German B1 applications remain eligible
            </div>
          </section>

          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Overview"
          >
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={stat.label}
                  className="border-0 bg-card/90 shadow-[0_1px_0_rgb(15_23_42/5%),0_8px_30px_rgb(15_23_42/4%)]"
                >
                  <CardHeader>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                        <Icon className="size-4" />
                      </div>
                      {stat.label === 'Telegram' ? (
                        <span className="size-2 rounded-full bg-emerald-500" />
                      ) : null}
                    </div>
                    <CardDescription>{stat.label}</CardDescription>
                    <CardTitle className="text-2xl font-semibold tracking-[-0.03em]">
                      {stat.value}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {stat.detail}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg font-semibold tracking-[-0.02em]">
                    Best new matches
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {jobs.length}{' '}
                    {jobs.length === 1 ? 'eligible match' : 'eligible matches'}
                  </p>
                </div>
                <Button variant="ghost">
                  View all
                  <ChevronRight />
                </Button>
              </div>

              <div className="space-y-3">
                {jobs.length === 0 ? (
                  <Card className="border-dashed bg-card/60 py-10 text-center">
                    <CardContent>
                      <Search className="mx-auto mb-3 size-6 text-muted-foreground" />
                      <p className="font-medium">No evaluated matches yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Run the first search to collect and score live listings.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
                {jobs.map((job) => (
                  <Link
                    key={job.id}
                    aria-label={`View ${job.title} at ${job.company}`}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/?job=${job.id}`}
                    scroll={false}
                  >
                    <Card
                      className={`cursor-pointer border-0 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                        selectedJob?.id === job.id
                          ? 'bg-primary/[0.055] ring-1 ring-primary/25'
                          : 'bg-card/90'
                      }`}
                    >
                      <CardHeader>
                        <div className="flex min-w-0 gap-4">
                          <ScoreRing score={job.score} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="truncate text-[15px] font-semibold">
                                {job.title}
                              </CardTitle>
                              <Badge
                                className={
                                  selectedJob?.id === job.id
                                    ? 'bg-primary/12 text-primary'
                                    : 'bg-secondary text-secondary-foreground'
                                }
                                variant="ghost"
                              >
                                {job.status}
                              </Badge>
                            </div>
                            <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>{job.company}</span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3.5" />
                                {job.location_text} · {job.work_mode}
                              </span>
                              <span>
                                {formatRelativeTime(job.first_seen_at)}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                        <CardAction>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-1.5 pl-20">
                        {job.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>

            {selectedJob ? (
              <Card className="border-0 bg-card shadow-[0_18px_60px_rgb(15_23_42/8%)] xl:sticky xl:top-20">
                <CardHeader className="border-b border-border/70 pb-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge
                      className="bg-primary/10 text-primary"
                      variant="ghost"
                    >
                      {selectedJob.score}% match
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Live listing
                    </span>
                  </div>
                  <CardTitle className="text-xl font-semibold tracking-[-0.03em]">
                    {selectedJob.title}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {selectedJob.company} · {selectedJob.location_text} ·{' '}
                    {selectedJob.work_mode}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 pt-1">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedJob.summary}
                  </p>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Why it matches
                    </p>
                    <ul className="space-y-2.5 text-sm leading-relaxed">
                      {selectedJob.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2.5">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {selectedJob.languageRisk !== 'none' ? (
                    <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-3.5 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                      <p className="text-xs font-semibold uppercase tracking-[0.11em]">
                        Language note · {selectedJob.languageRisk} risk
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">
                        {selectedJob.languageAssessment}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Verified evidence
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.tags.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-5">
                    <GenerateDocumentsButton jobId={selectedJob.id} />
                    <a
                      className={buttonVariants({
                        variant: 'outline',
                        className: 'col-span-2',
                      })}
                      href={selectedJob.canonical_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open listing
                    </a>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed bg-card/60 xl:sticky xl:top-20">
                <CardHeader>
                  <CardTitle>Run your first live search</CardTitle>
                  <CardDescription className="leading-relaxed">
                    WerkMatch will collect technical working-student listings,
                    enforce your location policy, score them against verified
                    facts, and send Telegram alerts for high matches.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </section>

          <footer className="mt-8 flex flex-col gap-2 border-t border-border/70 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              WerkMatch only generates application documents when you ask.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleUserRound className="size-3.5" />
              Candidate facts are locked to your verified master CV
            </span>
          </footer>
        </div>
      </div>
    </main>
  );
}
