import { NextResponse } from 'next/server';

import { evaluateJobWithOpenCode, matchPromptVersion } from '@/lib/ai/opencode';
import { sendTelegramMatch } from '@/lib/notifications/telegram';
import {
  fetchArbeitnowJobs,
  isPotentialLocationMatch,
  isTargetStudentTechRole,
  normalizeArbeitnowJob,
} from '@/lib/sources/arbeitnow';
import { createClient } from '@/lib/supabase/server';

const source = 'arbeitnow';
const maxEvaluationsPerRun = 8;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }

  const now = new Date();

  try {
    const [profileResult, factsResult, scheduleResult] = await Promise.all([
      supabase
        .from('candidate_profiles')
        .select('profile_version')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('candidate_facts')
        .select('fact_key,category,title,summary,details,tags')
        .eq('user_id', user.id)
        .eq('verification_status', 'verified')
        .order('order_index'),
      supabase
        .from('search_schedules')
        .select(
          'interval_minutes,notification_threshold,telegram_enabled,telegram_chat_id',
        )
        .eq('user_id', user.id)
        .single(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json(
        { error: 'Candidate profile is missing.' },
        { status: 409 },
      );
    }

    if (factsResult.error || !factsResult.data?.length) {
      return NextResponse.json(
        { error: 'Verify your candidate facts before running a search.' },
        { status: 409 },
      );
    }

    const rawJobs = await fetchArbeitnowJobs();
    const normalizedJobs = rawJobs
      .filter(isTargetStudentTechRole)
      .filter(isPotentialLocationMatch)
      .map(normalizeArbeitnowJob);

    const externalIds = normalizedJobs.map((job) => job.externalId);
    const { data: existingJobs, error: existingJobsError } = externalIds.length
      ? await supabase
          .from('jobs')
          .select('id,external_id,content_fingerprint')
          .eq('user_id', user.id)
          .eq('source', source)
          .in('external_id', externalIds)
      : { data: [], error: null };

    if (existingJobsError) throw existingJobsError;

    const existingByExternalId = new Map(
      (existingJobs ?? []).map((job) => [job.external_id, job]),
    );
    const preparedJobs = await Promise.all(
      normalizedJobs.map(async (job) => ({
        normalized: job,
        fingerprint: await sha256(
          [job.title, job.company, job.locationText, job.description].join(
            '\n',
          ),
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
              user_id: user.id,
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
            'id,external_id,title,company,description,location_text,region,country,work_mode,employment_type,canonical_url',
          )
      : { data: [], error: null };

    if (saveError) throw saveError;

    const jobIds = (savedJobs ?? []).map((job) => job.id);
    const { data: existingEvaluations, error: evaluationsError } = jobIds.length
      ? await supabase
          .from('match_evaluations')
          .select('job_id,notified_at')
          .eq('user_id', user.id)
          .in('job_id', jobIds)
      : { data: [], error: null };

    if (evaluationsError) throw evaluationsError;

    const evaluationByJobId = new Map(
      (existingEvaluations ?? []).map((evaluation) => [
        evaluation.job_id,
        evaluation,
      ]),
    );
    const jobsToEvaluate = (savedJobs ?? [])
      .filter(
        (job) =>
          changedExternalIds.has(job.external_id) ||
          !evaluationByJobId.has(job.id),
      )
      .slice(0, maxEvaluationsPerRun);

    const threshold =
      scheduleResult.data?.notification_threshold ??
      Number(process.env.MATCH_NOTIFICATION_THRESHOLD ?? 75);
    const telegramChatId =
      scheduleResult.data?.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;
    const telegramEnabled =
      (scheduleResult.data?.telegram_enabled ?? true) &&
      Boolean(telegramChatId);
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

        const { data: storedEvaluation, error: evaluationError } =
          await supabase
            .from('match_evaluations')
            .upsert(
              {
                user_id: user.id,
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
            .eq('user_id', user.id);
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
    const lastError = evaluationErrors.length
      ? `${evaluationErrors.length} evaluation(s) failed: ${evaluationErrors[0]}`
      : null;

    await Promise.all([
      supabase.from('source_configs').upsert(
        {
          user_id: user.id,
          source,
          enabled: true,
          config: { pages_per_run: 8, max_evaluations_per_run: 8 },
          last_successful_run_at: now.toISOString(),
          last_error: lastError,
        },
        { onConflict: 'user_id,source' },
      ),
      supabase
        .from('search_schedules')
        .update({ last_run_at: now.toISOString(), next_run_at: nextRunAt })
        .eq('user_id', user.id),
    ]);

    return NextResponse.json({
      source,
      scanned: rawJobs.length,
      eligibleForEvaluation: normalizedJobs.length,
      saved: savedJobs?.length ?? 0,
      evaluated,
      eligibleMatches,
      notificationsSent,
      evaluationFailures: evaluationErrors.length,
      nextRunAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown search failure.';
    await supabase.from('source_configs').upsert(
      {
        user_id: user.id,
        source,
        enabled: true,
        last_error: message,
      },
      { onConflict: 'user_id,source' },
    );

    return NextResponse.json(
      { error: 'The search run failed.', detail: message },
      { status: 502 },
    );
  }
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
