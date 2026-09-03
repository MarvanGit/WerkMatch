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
  defaultPersonioBoards,
  fetchPersonioJobs,
} from '../sources/personio.ts';
import type { NormalizedSourceJob } from '../sources/types.ts';

const maxEvaluationsPerRun = 8;

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
      .select('profile_version')
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

  const collections = await collectSourceJobs();
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

  const jobIds = savedJobs.map((job) => job.id);
  const { data: existingEvaluations, error: evaluationsError } = jobIds.length
    ? await supabase
        .from('match_evaluations')
        .select('job_id,notified_at')
        .eq('user_id', userId)
        .in('job_id', jobIds)
    : { data: [], error: null };
  if (evaluationsError) throw evaluationsError;

  const evaluationByJobId = new Map(
    (existingEvaluations ?? []).map((evaluation) => [
      evaluation.job_id,
      evaluation,
    ]),
  );
  const jobsToEvaluate = savedJobs
    .filter(
      (job) => changedJobIds.has(job.id) || !evaluationByJobId.has(job.id),
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
  const telegramChatId =
    scheduleResult.data?.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;
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
      });
      const locationEligible =
        job.region === 'Bavaria' ||
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
  const [arbeitnow, personio] = await Promise.allSettled([
    fetchArbeitnowJobs(),
    fetchPersonioJobs(),
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
  const externalIds = uniqueJobs.map((job) => job.externalId);
  const { data: existingJobs, error: existingJobsError } = externalIds.length
    ? await supabase
        .from('jobs')
        .select('id,external_id,content_fingerprint')
        .eq('user_id', userId)
        .eq('source', source)
        .in('external_id', externalIds)
    : { data: [], error: null };
  if (existingJobsError) throw existingJobsError;

  const existingByExternalId = new Map(
    (existingJobs ?? []).map((job) => [job.external_id, job]),
  );
  const preparedJobs = await Promise.all(
    uniqueJobs.map(async (job) => ({
      normalized: job,
      fingerprint: await sha256(
        [job.title, job.company, job.locationText, job.description].join('\n'),
      ),
    })),
  );
  const changedExternalIds = new Set(
    preparedJobs
      .filter(
        ({ normalized, fingerprint }) =>
          existingByExternalId.get(normalized.externalId)
            ?.content_fingerprint !== fingerprint,
      )
      .map(({ normalized }) => normalized.externalId),
  );

  const { data: savedJobs, error: saveError } = preparedJobs.length
    ? await supabase
        .from('jobs')
        .upsert(
          preparedJobs.map(({ normalized: job, fingerprint }) => ({
            user_id: userId,
            source,
            external_id: job.externalId,
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
          })),
          { onConflict: 'user_id,source,external_id' },
        )
        .select(
          'id,source,external_id,title,company,description,location_text,region,country,work_mode,employment_type,canonical_url,published_at',
        )
    : { data: [], error: null };
  if (saveError) throw saveError;

  return {
    jobs: (savedJobs ?? []) as SavedJob[],
    changedJobIds: new Set(
      (savedJobs ?? [])
        .filter((job) => changedExternalIds.has(job.external_id))
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
  if (failure) throw failure;
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
