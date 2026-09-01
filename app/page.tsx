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
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const jobs = [
  {
    title: 'Working Student Full-Stack Engineering',
    company: 'Bavaria Systems Lab',
    location: 'Nuremberg · Hybrid',
    age: '18 min ago',
    score: 91,
    tags: ['Python', 'FastAPI', 'TypeScript'],
    status: 'Strong match',
  },
  {
    title: 'Werkstudent Software Testing & QA',
    company: 'Erlangen Robotics',
    location: 'Erlangen · On-site',
    age: '2 hours ago',
    score: 86,
    tags: ['pytest', 'Playwright', 'CI/CD'],
    status: 'Strong match',
  },
  {
    title: 'Working Student Data Engineering',
    company: 'Remote Analytics Europe',
    location: 'Germany · Remote',
    age: '4 hours ago',
    score: 78,
    tags: ['PostgreSQL', 'Python', 'Docker'],
    status: 'Good match',
  },
];

const stats = [
  {
    label: 'New this week',
    value: '24',
    detail: 'Across active sources',
    icon: BriefcaseBusiness,
  },
  {
    label: 'Strong matches',
    value: '8',
    detail: 'Score of 80 or higher',
    icon: Sparkles,
  },
  {
    label: 'Search cadence',
    value: '6h',
    detail: 'Next run in 2h 14m',
    icon: CalendarClock,
  },
  {
    label: 'Telegram',
    value: 'Ready',
    detail: 'High-match alerts enabled',
    icon: Send,
  },
];

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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

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
              8
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
          <Button
            className="h-10 w-full justify-start gap-3 px-3"
            variant="ghost"
          >
            <SlidersHorizontal />
            Match profile
          </Button>
        </nav>

        <div className="mt-auto rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Discovery is active
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
            Last search completed 18 minutes ago
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
            <Button className="gap-2 shadow-sm">
              <Search />
              Run search
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
          <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Tuesday, 1 September
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
                    3 of 8 strong matches
                  </p>
                </div>
                <Button variant="ghost">
                  View all
                  <ChevronRight />
                </Button>
              </div>

              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <Card
                    key={job.title}
                    className={`cursor-pointer border-0 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      index === 0
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
                                index === 0
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
                              {job.location}
                            </span>
                            <span>{job.age}</span>
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
                ))}
              </div>
            </div>

            <Card className="border-0 bg-card shadow-[0_18px_60px_rgb(15_23_42/8%)] xl:sticky xl:top-20">
              <CardHeader className="border-b border-border/70 pb-4">
                <div className="mb-3 flex items-center justify-between">
                  <Badge className="bg-primary/10 text-primary" variant="ghost">
                    91% match
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Demo listing
                  </span>
                </div>
                <CardTitle className="text-xl font-semibold tracking-[-0.03em]">
                  Working Student Full-Stack Engineering
                </CardTitle>
                <CardDescription className="mt-1">
                  Bavaria Systems Lab · Nuremberg · Hybrid
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 pt-1">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Why it matches
                  </p>
                  <ul className="space-y-2.5 text-sm leading-relaxed">
                    {[
                      'Direct overlap with your FastAPI, PostgreSQL and Angular project.',
                      'Automated testing and CI/CD experience are explicitly relevant.',
                      'Hybrid location in Bavaria passes the location gate.',
                    ].map((reason) => (
                      <li key={reason} className="flex gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-3.5 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="text-xs font-semibold uppercase tracking-[0.11em]">
                    Language note
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">
                    German B2 is preferred, not mandatory. Keep eligible and
                    review before applying.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Relevant evidence
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'FastAPI',
                      'Angular',
                      'PostgreSQL',
                      'Docker',
                      'Playwright',
                    ].map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-5">
                  <Button className="col-span-2 h-10 gap-2 shadow-sm">
                    <Sparkles />
                    Generate tailored documents
                  </Button>
                  <Button variant="outline">Open listing</Button>
                  <Button variant="outline">Save for later</Button>
                </div>
              </CardContent>
            </Card>
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
