import {
  ArrowDownUp,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { WorkspacePage } from '@/components/workspace-chrome';
import {
  deduplicateJobMatches,
  filterAndSortJobMatches,
  JOBS_PER_PAGE,
  matchDate,
  paginateMatches,
  paginationRange,
  parseJobAge,
  parseJobSort,
  parsePage,
  type JobAge,
  type JobSort,
} from '@/lib/jobs/matches';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

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
  published_at: string | null;
  first_seen_at: string;
};

type JobsPageProps = {
  searchParams: Promise<{ sort?: string; age?: string; page?: string }>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const sort = parseJobSort(params.sort);
  const age = parseJobAge(params.age);
  const requestedPage = parsePage(params.page);
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
    .limit(1_000);
  const evaluations = (evaluationData ?? []) as Evaluation[];
  const jobIds = evaluations.map((item) => item.job_id);
  const { data: jobData } = jobIds.length
    ? await supabase
        .from('jobs')
        .select(
          'id,title,company,location_text,work_mode,source,published_at,first_seen_at',
        )
        .eq('user_id', user.id)
        .eq('active', true)
        .in('id', jobIds)
    : { data: [] };
  const jobById = new Map(
    ((jobData ?? []) as Job[]).map((job) => [job.id, job]),
  );
  const matches = deduplicateJobMatches(
    evaluations.flatMap((evaluation) => {
      const job = jobById.get(evaluation.job_id);
      return job ? [{ ...job, ...evaluation }] : [];
    }),
  );
  const filteredMatches = filterAndSortJobMatches(matches, sort, age);
  const page = paginateMatches(filteredMatches, requestedPage, JOBS_PER_PAGE);
  const hasFilters = sort !== 'recent' || age !== 'all';

  return (
    <WorkspacePage
      active="/"
      description="Review eligible roles by posting date or match score, then open a result to inspect its evidence and prepare an application."
      title="All job matches"
    >
      {matches.length === 0 ? (
        <EmptyMatches />
      ) : (
        <div className="space-y-4">
          <form
            className="grid gap-3 rounded-xl border bg-card/70 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end"
            method="get"
          >
            <label
              className="grid gap-1.5 text-xs font-medium text-muted-foreground"
              htmlFor="job-sort"
            >
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownUp className="size-3.5" />
                Sort by
              </span>
              <NativeSelect
                className="w-full"
                defaultValue={sort}
                id="job-sort"
                name="sort"
              >
                <NativeSelectOption value="recent">
                  Most recent
                </NativeSelectOption>
                <NativeSelectOption value="match">
                  Highest match
                </NativeSelectOption>
                <NativeSelectOption value="oldest">
                  Oldest first
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label
              className="grid gap-1.5 text-xs font-medium text-muted-foreground"
              htmlFor="job-age"
            >
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                Posted
              </span>
              <NativeSelect
                className="w-full"
                defaultValue={age}
                id="job-age"
                name="age"
              >
                <NativeSelectOption value="all">Any date</NativeSelectOption>
                <NativeSelectOption value="24h">
                  Last 24 hours
                </NativeSelectOption>
                <NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
                <NativeSelectOption value="30d">
                  Last 30 days
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <Button className="w-full sm:w-auto" type="submit">
              Apply
            </Button>
            {hasFilters ? (
              <Link
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full sm:w-auto',
                )}
                href="/jobs"
              >
                Reset
              </Link>
            ) : null}
          </form>

          {page.items.length === 0 ? (
            <Card className="border-dashed bg-card/60 py-10 text-center">
              <CardContent>
                <CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" />
                <p className="font-medium">No matches in this date range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a broader date range to see more eligible roles.
                </p>
                <Link
                  className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
                  href="/jobs"
                >
                  Clear filters
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {page.items.map((match) => (
                <Link
                  aria-label={`Open ${match.title} at ${match.company}`}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/jobs/${match.id}`}
                  key={match.id}
                >
                  <Card className="bg-card/90 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardHeader>
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          aria-label={`${match.overall_score}% match`}
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary"
                        >
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
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3.5" />
                              {match.published_at ? 'Posted' : 'Found'}{' '}
                              {formatRelativeTime(matchDate(match))}
                            </span>
                          </CardDescription>
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm leading-relaxed text-muted-foreground sm:pl-[4.25rem]">
                      {match.summary}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <BriefcaseBusiness className="size-3.5" />
              Showing {page.firstItem}–{page.lastItem} of{' '}
              {filteredMatches.length} eligible{' '}
              {filteredMatches.length === 1 ? 'role' : 'roles'}
            </p>
            {page.totalPages > 1 ? (
              <MatchPagination
                age={age}
                currentPage={page.currentPage}
                sort={sort}
                totalPages={page.totalPages}
              />
            ) : null}
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}

function EmptyMatches() {
  return (
    <Card className="border-dashed bg-card/60 py-10 text-center">
      <CardContent>
        <Search className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="font-medium">No eligible matches yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a search from the inbox to collect and score live listings.
        </p>
      </CardContent>
    </Card>
  );
}

function MatchPagination({
  age,
  currentPage,
  sort,
  totalPages,
}: {
  age: JobAge;
  currentPage: number;
  sort: JobSort;
  totalPages: number;
}) {
  return (
    <Pagination className="mx-0 w-auto justify-start sm:justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={currentPage === 1}
            className={cn(
              currentPage === 1 && 'pointer-events-none opacity-50',
            )}
            href={jobsHref(currentPage - 1, sort, age)}
            tabIndex={currentPage === 1 ? -1 : undefined}
          />
        </PaginationItem>
        {paginationRange(currentPage, totalPages).map((item, index) =>
          item === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                aria-label={`Go to page ${item}`}
                href={jobsHref(item, sort, age)}
                isActive={item === currentPage}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            aria-disabled={currentPage === totalPages}
            className={cn(
              currentPage === totalPages && 'pointer-events-none opacity-50',
            )}
            href={jobsHref(currentPage + 1, sort, age)}
            tabIndex={currentPage === totalPages ? -1 : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function jobsHref(page: number, sort: JobSort, age: JobAge) {
  const params = new URLSearchParams();
  if (sort !== 'recent') params.set('sort', sort);
  if (age !== 'all') params.set('age', age);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/jobs?${query}` : '/jobs';
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!timestamp) return 'recently';

  const differenceMinutes = Math.round((timestamp - Date.now()) / 60_000);
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
  if (days < 30) {
    return differenceMinutes >= 0 ? `in ${days}d` : `${days}d ago`;
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: timestamp < oneYearAgo.getTime() ? 'numeric' : undefined,
  }).format(new Date(timestamp));
}
