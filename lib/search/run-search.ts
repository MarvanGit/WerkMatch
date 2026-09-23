import { queryBatches } from './query-batches.ts';
import { resolveJobIdentities } from './job-identity.ts';
import { databaseOperation, errorMessage } from '../supabase/operation.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateJobWithOpenCode, matchPromptVersion } from '../ai/opencode.ts';
import { sendTelegramMatch } from '../notifications/telegram.ts';
import {
  fetchArbeitnowJobs,
  isPotentialLocationMatch as isPotentialArbeitnowLocationMatch,
  isTargetStudentTechRole as isTargetArbeitnowStudentTechRole,
  normalizeArbeitnowJob,
} from '../sources/arbeitnow.ts';
import {
  defaultLinkedInBoards,
  fetchLinkedInJobs,
} from '../sources/linkedin.ts';
import { defaultLeverBoards, fetchLeverJobs } from '../sources/lever.ts';
import {
  defaultPersonioBoards,
  fetchPersonioJobs,
} from '../sources/personio.ts';
import {
  defaultSmartRecruitersBoards,
  fetchSmartRecruitersJobs,
} from '../sources/smartrecruiters.ts';
import {
  defaultHealthineersBoard,
  defaultSiemensMarketplaceQueries,
  fetchSiemensJobs,
} from '../sources/siemens.ts';
import type { NormalizedSourceJob } from '../sources/types.ts';

const maxEvaluationsPerRun = Math.max(
  1,
  Math.min(
    40,
    Number.parseInt(process.env.MAX_EVALUATIONS_PER_RUN ?? '20', 10) || 20,
  ),
);

type SourceCollection = {
  source: string;
  scanned: number;
  jobs: NormalizedSourceJob[];
  config: Record<string, unknown>;
  error: string | null;
};

type SavedJob = {
  id: string;
  source: string;
  external_id: string;
  title: string;
  company: string;
  description: string;
  location_text: string;
  region: string | null;
  country: string;
  work_mode: 'onsite' | 'hybrid' | 'remote' | 'unknown';
  employment_type: string;
  canonical_url: string;
  published_at: string | null;
};

export type SearchRunResult = {
  source: string;
  sources: string[];
  scanned: number;
  eligibleForEvaluation: number;
  saved: number;
  evaluated: number;
  eligibleMatches: number;
  notificationsSent: number;
  evaluationFailures: number;
  sourceFailures: number;
  nextRunAt: string;
};

export async function runSearchForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<SearchRunResult> {
  const now = new Date();
  const [profileResult, factsResult, scheduleResult] = await Promise.all([
    supabase
      .from('candidate_profiles')
      .select('profile_version,german_level,english_level,search_policy')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('candidate_facts')
      .select('fact_key,category,title,summary,details,tags')
      .eq('user_id', userId)
      .eq('verification_status', 'verified')
      .order('order_index'),
    supabase
      .from('search_schedules')
      .select(
        'interval_minutes,notification_threshold,telegram_enabled,telegram_chat_id',
      )
      .eq('user_id', userId)
      .single(),
  ]);

  if (profileResult.error || !profileResult.data) {
    throw new Error('Candidate profile is missing.');
  }
  if (factsResult.error || !factsResult.data?.length) {
    throw new Error('Verify your candidate facts before running a search.');
  }

  const { data: allowed, error: quotaError } = await supabase.rpc(
    'consume_werkmatch_usage',
    { requested_user: userId, requested_operation: 'search' },
  );
  if (quotaError)
    throw new Error(
      'Search usage controls are unavailable. Please try again later.',
    );
  if (!allowed)
    throw new Error(
      'Search limit reached: allow 15 minutes between searches, up to 6 per day.',
    );
  const preferences = {
    germanLevel: profileResult.data.german_level,
    englishLevel: profileResult.data.english_level,
    location:
      profileResult.data.search_policy?.location ?? 'bavaria-and-remote',
    roleKeywords: profileResult.data.search_policy?.roleKeywords ?? '',
  };
  const collections = await collectSourceJobs();
  const keywords = preferences.roleKeywords
    .split(',')
    .map((word: string) => word.trim().toLowerCase())
    .filter(Boolean);
  for (const collection of collections)
    collection.jobs = collection.jobs.filter(
      (job) =>
        (preferences.location !== 'remote-only' || job.workMode === 'remote') &&
        (!keywords.length ||
          keywords.some((word: string) =>
            `${job.title} ${job.description}`.toLowerCase().includes(word),
          )),
    );
  if (
    collections.every(
      (collection) => collection.error && !collection.jobs.length,
    )
  ) {
    await persistSourceStatuses(supabase, userId, collections, now);
    throw new Error(
      `All job sources failed: ${collections
        .map((item) => item.error)
        .filter(Boolean)
        .join('; ')}`,
    );
  }

  const savedJobs: SavedJob[] = [];
  const changedJobIds = new Set<string>();
  for (const collection of collections) {
    const saved = await saveSourceJobs(
      supabase,
      userId,
      collection.source,
      collection.jobs,
      now,
    );
    savedJobs.push(...saved.jobs);
    saved.changedJobIds.forEach((jobId) => changedJobIds.add(jobId));
  }

  const distinctSavedJobs = [
    ...new Map(savedJobs.map((job) => [job.id, job])).values(),
  ];
  const jobIds = distinctSavedJobs.map((job) => job.id);
  const existingEvaluations = await queryBatches(
    jobIds,
    (batch) =>
      supabase
        .from('match_evaluations')
        .select('job_id,notified_at,profile_version')
        .eq('user_id', userId)
        .in('job_id', batch),
    'Read existing evaluations',
  );

  const evaluationByJobId = new Map(
    (existingEvaluations ?? []).map((evaluation) => [
      evaluation.job_id,
      evaluation,
    ]),
  );
  const jobsToEvaluate = distinctSavedJobs
    .filter(
      (job) =>
        changedJobIds.has(job.id) ||
        !evaluationByJobId.has(job.id) ||
        evaluationByJobId.get(job.id)?.profile_version !==
          profileResult.data.profile_version,
    )
    .sort((left, right) => {
      const leftDate =
        Date.parse((left.published_at as string | null) ?? '') || 0;
      const rightDate =
        Date.parse((right.published_at as string | null) ?? '') || 0;
      return rightDate - leftDate;
    })
    .slice(0, maxEvaluationsPerRun);

  const threshold =
    scheduleResult.data?.notification_threshold ??
    Number(process.env.MATCH_NOTIFICATION_THRESHOLD ?? 75);
  const telegramChatId = scheduleResult.data?.telegram_chat_id;
  const telegramEnabled =
    (scheduleResult.data?.telegram_enabled ?? true) && Boolean(telegramChatId);
  let evaluated = 0;
  let eligibleMatches = 0;
  let notificationsSent = 0;
  const evaluationErrors: string[] = [];

  for (const job of jobsToEvaluate) {
    try {
      const { evaluation, model } = await evaluateJobWithOpenCode({
        job: {
          title: job.title,
          company: job.company,
          description: job.description,
          locationText: job.location_text,
          region: job.region,
          country: job.country,
          workMode: job.work_mode,
          employmentType: job.employment_type,
        },
        facts: factsResult.data,
        preferences,
      });
      const locationEligible =
        (preferences.location !== 'remote-only' && job.region === 'Bavaria') ||
        (job.work_mode === 'remote' && evaluation.remoteFromGermanyConfirmed);
      const eligible = evaluation.eligible && locationEligible;
      const { data: storedEvaluation, error: evaluationError } = await supabase
        .from('match_evaluations')
        .upsert(
          {
            user_id: userId,
            job_id: job.id,
            eligible,
            overall_score: evaluation.overallScore,
            technical_score: evaluation.technicalScore,
            location_eligible: locationEligible,
            remote_from_germany_confirmed:
              evaluation.remoteFromGermanyConfirmed,
            language_risk: evaluation.languageRisk,
            language_assessment: evaluation.languageAssessment,
            summary: evaluation.summary,
            reasons: evaluation.reasons,
            matched_evidence: evaluation.matchedEvidence,
            gaps: evaluation.gaps,
            red_flags: evaluation.redFlags,
            model_provider: 'opencode-go',
            model_id: model,
            prompt_version: matchPromptVersion,
            profile_version: profileResult.data.profile_version,
            evaluated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,job_id' },
        )
        .select('id,notified_at')
        .single();
      if (evaluationError) throw evaluationError;
      evaluated += 1;
      if (eligible) eligibleMatches += 1;

      if (
        eligible &&
        evaluation.overallScore >= threshold &&
        telegramEnabled &&
        telegramChatId &&
        !storedEvaluation.notified_at
      ) {
        await sendTelegramMatch(telegramChatId, {
          title: job.title,
          company: job.company,
          location: job.location_text,
          score: evaluation.overallScore,
          summary: evaluation.summary,
          url: job.canonical_url,
        });
        await supabase
          .from('match_evaluations')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', storedEvaluation.id)
          .eq('user_id', userId);
        notificationsSent += 1;
      }
    } catch (error) {
      evaluationErrors.push(
        error instanceof Error ? error.message : 'Unknown evaluation error.',
      );
    }
  }

  const intervalMinutes = scheduleResult.data?.interval_minutes ?? 360;
  const nextRunAt = new Date(
    now.getTime() + intervalMinutes * 60_000,
  ).toISOString();
  await Promise.all([
    persistSourceStatuses(supabase, userId, collections, now),
    supabase
      .from('search_schedules')
      .update({ last_run_at: now.toISOString(), next_run_at: nextRunAt })
      .eq('user_id', userId),
  ]);

  const sources = collections.map((collection) => collection.source);
  return {
    source: sources.join(','),
    sources,
    scanned: collections.reduce(
      (total, collection) => total + collection.scanned,
      0,
    ),
    eligibleForEvaluation: collections.reduce(
      (total, collection) => total + collection.jobs.length,
      0,
    ),
    saved: savedJobs.length,
    evaluated,
    eligibleMatches,
    notificationsSent,
    evaluationFailures: evaluationErrors.length,
    sourceFailures: collections.filter((collection) => collection.error).length,
    nextRunAt,
  };
}

async function collectSourceJobs(): Promise<SourceCollection[]> {
  const [arbeitnow, personio, linkedin, smartrecruiters, lever, siemens] =
    await Promise.allSettled([
      fetchArbeitnowJobs(),
      fetchPersonioJobs(),
      fetchLinkedInJobs(),
      fetchSmartRecruitersJobs(),
      fetchLeverJobs(),
      fetchSiemensJobs(),
    ]);

  const collections: SourceCollection[] = [];
  if (arbeitnow.status === 'fulfilled') {
    const jobs = arbeitnow.value
      .filter(isTargetArbeitnowStudentTechRole)
      .filter(isPotentialArbeitnowLocationMatch)
      .map(normalizeArbeitnowJob);
    collections.push({
      source: 'arbeitnow',
      scanned: arbeitnow.value.length,
      jobs,
      config: { pages_per_run: 8 },
      error: null,
    });
  } else {
    collections.push({
      source: 'arbeitnow',
      scanned: 0,
      jobs: [],
      config: { pages_per_run: 8 },
      error:
        arbeitnow.reason instanceof Error
          ? arbeitnow.reason.message
          : 'Arbeitnow failed.',
    });
  }

  if (personio.status === 'fulfilled') {
    collections.push({
      source: 'personio',
      scanned: personio.value.scanned,
      jobs: personio.value.jobs,
      config: {
        boards: defaultPersonioBoards.map((board) => board.url),
        candidate_pages: personio.value.candidatePages,
      },
      error: personio.value.errors.length
        ? personio.value.errors.join('; ').slice(0, 2_000)
        : null,
    });
  } else {
    collections.push({
      source: 'personio',
      scanned: 0,
      jobs: [],
      config: { boards: defaultPersonioBoards.map((board) => board.url) },
      error:
        personio.reason instanceof Error
          ? personio.reason.message
          : 'Personio scraper failed.',
    });
  }

  if (linkedin.status === 'fulfilled') {
    collections.push({
      source: 'linkedin',
      scanned: linkedin.value.scanned,
      jobs: linkedin.value.jobs,
      config: {
        boards: defaultLinkedInBoards.map((board) => ({
          id: board.id,
          queries: board.queries,
          max_pages: board.maxPages,
        })),
        candidate_pages: linkedin.value.detailRequests,
        discovered_candidates: linkedin.value.candidateUrls,
        listing_requests: linkedin.value.listingRequests,
        budget_exhausted: linkedin.value.budgetExhausted,
      },
      error: linkedin.value.errors.length
        ? linkedin.value.errors.join('; ').slice(0, 2_000)
        : null,
    });
  } else {
    collections.push({
      source: 'linkedin',
      scanned: 0,
      jobs: [],
      config: {
        boards: defaultLinkedInBoards.map((board) => ({
          id: board.id,
          queries: board.queries,
          max_pages: board.maxPages,
        })),
      },
      error:
        linkedin.reason instanceof Error
          ? linkedin.reason.message
          : 'LinkedIn scraper failed.',
    });
  }

  if (smartrecruiters.status === 'fulfilled') {
    collections.push({
      source: 'smartrecruiters',
      scanned: smartrecruiters.value.scanned,
      jobs: smartrecruiters.value.jobs,
      config: {
        boards: defaultSmartRecruitersBoards.map((board) => board.url),
        candidate_pages: smartrecruiters.value.candidatePages,
      },
      error: smartrecruiters.value.errors.length
        ? smartrecruiters.value.errors.join('; ').slice(0, 2_000)
        : null,
    });
  } else {
    collections.push({
      source: 'smartrecruiters',
      scanned: 0,
      jobs: [],
      config: {
        boards: defaultSmartRecruitersBoards.map((board) => board.url),
      },
      error:
        smartrecruiters.reason instanceof Error
          ? smartrecruiters.reason.message
          : 'SmartRecruiters scraper failed.',
    });
  }

  if (lever.status === 'fulfilled') {
    collections.push({
      source: 'lever',
      scanned: lever.value.scanned,
      jobs: lever.value.jobs,
      config: {
        boards: defaultLeverBoards.map((board) => board.url),
        candidate_pages: lever.value.candidatePages,
      },
      error: lever.value.errors.length
        ? lever.value.errors.join('; ').slice(0, 2_000)
        : null,
    });
  } else {
    collections.push({
      source: 'lever',
      scanned: 0,
      jobs: [],
      config: { boards: defaultLeverBoards.map((board) => board.url) },
      error:
        lever.reason instanceof Error
          ? lever.reason.message
          : 'Lever scraper failed.',
    });
  }

  if (siemens.status === 'fulfilled') {
    collections.push({
      source: 'siemens',
      scanned: siemens.value.scanned,
      jobs: siemens.value.jobs,
      config: {
        marketplaces: defaultSiemensMarketplaceQueries.map((query) => ({
          id: query.id,
          marketplace: query.marketplace,
          url: query.url,
          max_pages: query.maxPages,
        })),
        healthineers: defaultHealthineersBoard.apiBaseUrl,
        candidate_pages: siemens.value.candidatePages,
        listing_requests: siemens.value.listingRequests,
        portals: siemens.value.portals,
      },
      error: siemens.value.errors.length
        ? siemens.value.errors.join('; ').slice(0, 2_000)
        : null,
    });
  } else {
    collections.push({
      source: 'siemens',
      scanned: 0,
      jobs: [],
      config: {
        marketplaces: defaultSiemensMarketplaceQueries.map((query) => ({
          id: query.id,
          marketplace: query.marketplace,
          url: query.url,
          max_pages: query.maxPages,
        })),
        healthineers: defaultHealthineersBoard.apiBaseUrl,
      },
      error:
        siemens.reason instanceof Error
          ? siemens.reason.message
          : 'Siemens scraper failed.',
    });
  }
  return collections;
}

async function saveSourceJobs(
  supabase: SupabaseClient,
  userId: string,
  source: string,
  jobs: NormalizedSourceJob[],
  now: Date,
) {
  const uniqueJobs = [
    ...new Map(jobs.map((job) => [job.externalId, job])).values(),
  ];
  const { data: storedJobs } = await databaseOperation(
    () =>
      supabase
        .from('jobs')
        .select(
          'id,source,external_id,canonical_url,content_fingerprint,title,company,location_text,active,published_at,last_seen_at',
        )
        .eq('user_id', userId)
        .limit(1_000),
    'Read existing job identities',
    true,
  );
  const resolvedJobs = resolveJobIdentities(
    source,
    uniqueJobs,
    storedJobs ?? [],
  );
  const preparedJobs = await Promise.all(
    resolvedJobs.map(async (job) => ({
      ...job,
      fingerprint: await sha256(
        [
          job.normalized.title,
          job.normalized.company,
          job.normalized.locationText,
          job.normalized.description,
        ].join('\n'),
      ),
    })),
  );
  const changedKeys = new Set(
    preparedJobs
      .filter((job) => job.existingFingerprint !== job.fingerprint)
      .map((job) => JSON.stringify([job.source, job.externalId])),
  );

  const savedJobs: SavedJob[] = [];
  for (let offset = 0; offset < preparedJobs.length; offset += 50) {
    const { data } = await databaseOperation(
      () =>
        supabase
          .from('jobs')
          .upsert(
            preparedJobs
              .slice(offset, offset + 50)
              .map(
                ({
                  normalized: job,
                  fingerprint,
                  source: resolvedSource,
                  externalId,
                }) => ({
                  user_id: userId,
                  source: resolvedSource,
                  external_id: externalId,
                  canonical_url: job.canonicalUrl,
                  title: job.title,
                  company: job.company,
                  description: job.description,
                  location_text: job.locationText,
                  region: job.region,
                  country: job.country,
                  work_mode: job.workMode,
                  employment_type: job.employmentType,
                  published_at: job.publishedAt,
                  last_seen_at: now.toISOString(),
                  content_fingerprint: fingerprint,
                  active: true,
                  raw_payload: job.rawPayload,
                }),
              ),
            { onConflict: 'user_id,source,external_id' },
          )
          .select(
            'id,source,external_id,title,company,description,location_text,region,country,work_mode,employment_type,canonical_url,published_at',
          ),
      'Save source jobs',
      true,
    );
    savedJobs.push(...((data ?? []) as SavedJob[]));
  }

  return {
    jobs: (savedJobs ?? []) as SavedJob[],
    changedJobIds: new Set(
      (savedJobs ?? [])
        .filter((job) =>
          changedKeys.has(JSON.stringify([job.source, job.external_id])),
        )
        .map((job) => job.id as string),
    ),
  };
}

async function persistSourceStatuses(
  supabase: SupabaseClient,
  userId: string,
  collections: SourceCollection[],
  now: Date,
) {
  const results = await Promise.all(
    collections.map((collection) =>
      supabase.from('source_configs').upsert(
        {
          user_id: userId,
          source: collection.source,
          enabled: true,
          config: {
            ...collection.config,
            max_evaluations_per_run: maxEvaluationsPerRun,
          },
          ...(collection.jobs.length || !collection.error
            ? { last_successful_run_at: now.toISOString() }
            : {}),
          last_error: collection.error,
        },
        { onConflict: 'user_id,source' },
      ),
    ),
  );
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error('Save source status: ' + errorMessage(failure));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
