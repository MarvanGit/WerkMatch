import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import {
  createTailoringPlan,
  documentPromptVersion,
  type CandidateFactForDocuments,
} from '../lib/ai/documents.ts';
import { renderTailoredDocuments } from '../lib/documents/render.ts';
import { sendTelegramDocumentsReady } from '../lib/notifications/telegram.ts';

const supabaseUrl = requiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL');
const supabaseSecretKey = requiredEnvironmentVariable('SUPABASE_SECRET_KEY');
const tectonicBinary = process.env.TECTONIC_BIN ?? 'tectonic';
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: pending, error: pendingError } = await supabase
  .from('generation_requests')
  .select(
    'id,user_id,job_id,match_evaluation_id,status,profile_version,template_version',
  )
  .eq('status', 'queued')
  .order('requested_at')
  .limit(1)
  .maybeSingle();
if (pendingError) throw pendingError;

if (!pending) {
  console.log('WerkMatch document worker found no queued requests.');
} else {
  const { data: request, error: claimError } = await supabase
    .from('generation_requests')
    .update({ status: 'generating', error_message: null })
    .eq('id', pending.id)
    .eq('status', 'queued')
    .select(
      'id,user_id,job_id,match_evaluation_id,status,profile_version,template_version',
    )
    .maybeSingle();
  if (claimError) throw claimError;
  if (!request) {
    console.log('The queued document request was claimed by another worker.');
  } else {
    await processRequest(request);
  }
}

async function processRequest(request: {
  id: string;
  user_id: string;
  job_id: string;
  match_evaluation_id: string | null;
  profile_version: number;
  template_version: number;
}) {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'werkmatch-docs-'));
  try {
    const [
      profileResult,
      factsResult,
      jobResult,
      evaluationResult,
      scheduleResult,
    ] = await Promise.all([
      supabase
        .from('candidate_profiles')
        .select(
          'profile_version,latex_template_object_key,cover_letter_template_object_key,portrait_object_key',
        )
        .eq('user_id', request.user_id)
        .single(),
      supabase
        .from('candidate_facts')
        .select('fact_key,category,title,summary,details,tags,order_index')
        .eq('user_id', request.user_id)
        .eq('verification_status', 'verified')
        .order('order_index'),
      supabase
        .from('jobs')
        .select('title,company,description,location_text,work_mode')
        .eq('id', request.job_id)
        .eq('user_id', request.user_id)
        .single(),
      request.match_evaluation_id
        ? supabase
            .from('match_evaluations')
            .select('summary,reasons')
            .eq('id', request.match_evaluation_id)
            .eq('user_id', request.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('search_schedules')
        .select('telegram_enabled,telegram_chat_id')
        .eq('user_id', request.user_id)
        .maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data?.latex_template_object_key) {
      throw new Error('The candidate LaTeX template is unavailable.');
    }
    if (
      profileResult.data.profile_version !== request.profile_version ||
      profileResult.data.profile_version !== request.template_version
    ) {
      throw new Error(
        'The candidate profile changed after this request. Please generate again.',
      );
    }
    if (factsResult.error || !factsResult.data?.length) {
      throw new Error('Verified candidate facts are unavailable.');
    }
    if (jobResult.error || !jobResult.data)
      throw new Error('Job is unavailable.');
    if (evaluationResult.error) throw evaluationResult.error;

    const facts = factsResult.data as CandidateFactForDocuments[];
    const { data: templateBlob, error: templateError } = await supabase.storage
      .from('candidate-assets')
      .download(profileResult.data.latex_template_object_key);
    if (templateError) throw templateError;
    const masterTemplate = await templateBlob.text();
    const coverLetterTemplateKey =
      profileResult.data.cover_letter_template_object_key ??
      process.env.COVER_LETTER_TEMPLATE_OBJECT_KEY;
    let coverLetterTemplate: string | undefined;
    if (coverLetterTemplateKey) {
      const { data: coverLetterBlob, error: coverLetterError } =
        await supabase.storage
          .from('candidate-assets')
          .download(coverLetterTemplateKey);
      if (coverLetterError) throw coverLetterError;
      coverLetterTemplate = await coverLetterBlob.text();
    }

    const { plan, model } = await createTailoringPlan({
      job: {
        title: jobResult.data.title,
        company: jobResult.data.company,
        description: jobResult.data.description,
        locationText: jobResult.data.location_text,
        workMode: jobResult.data.work_mode,
      },
      facts,
      matchSummary: evaluationResult.data?.summary ?? null,
      matchReasons: Array.isArray(evaluationResult.data?.reasons)
        ? (evaluationResult.data.reasons as string[])
        : [],
    });
    const { cvTex, coverLetterTex } = renderTailoredDocuments({
      masterTemplate,
      coverLetterTemplate,
      job: {
        title: jobResult.data.title,
        company: jobResult.data.company,
      },
      facts,
      plan,
    });

    await writeFile(join(workingDirectory, 'cv.tex'), cvTex, 'utf8');
    await writeFile(
      join(workingDirectory, 'cover_letter.tex'),
      coverLetterTex,
      'utf8',
    );
    if (profileResult.data.portrait_object_key) {
      const { data: portraitBlob, error: portraitError } =
        await supabase.storage
          .from('candidate-assets')
          .download(profileResult.data.portrait_object_key);
      if (portraitError) throw portraitError;
      await writeFile(
        join(workingDirectory, 'Foto.jpg'),
        Buffer.from(await portraitBlob.arrayBuffer()),
      );
    }

    await supabase
      .from('generation_requests')
      .update({
        status: 'compiling',
        tailoring_plan: plan,
        verified_content: {
          templatePreserving: true,
          factIds: facts.map((fact) => fact.fact_key),
          factPriorityIds: plan.factPriorityIds,
          evidenceFactIds: [
            ...new Set(
              plan.coverLetter.paragraphs.flatMap(
                (paragraph) => paragraph.evidenceFactIds,
              ),
            ),
          ],
        },
        model_provider: 'opencode-go',
        model_id: model,
        prompt_version: documentPromptVersion,
      })
      .eq('id', request.id)
      .eq('user_id', request.user_id);

    await compileLatex(workingDirectory, 'cv.tex');
    await compileLatex(workingDirectory, 'cover_letter.tex');

    const artifacts = [
      {
        kind: 'cv_tex',
        fileName: 'tailored-cv.tex',
        localName: 'cv.tex',
        contentType: 'application/x-tex',
      },
      {
        kind: 'cv_pdf',
        fileName: 'tailored-cv.pdf',
        localName: 'cv.pdf',
        contentType: 'application/pdf',
      },
      {
        kind: 'cover_letter_tex',
        fileName: 'cover-letter.tex',
        localName: 'cover_letter.tex',
        contentType: 'application/x-tex',
      },
      {
        kind: 'cover_letter_pdf',
        fileName: 'cover-letter.pdf',
        localName: 'cover_letter.pdf',
        contentType: 'application/pdf',
      },
    ] as const;

    for (const artifact of artifacts) {
      const bytes = await readFile(join(workingDirectory, artifact.localName));
      const objectKey = `${request.user_id}/${request.id}/${artifact.fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('generated-documents')
        .upload(objectKey, bytes, {
          contentType: artifact.contentType,
          upsert: true,
        });
      if (uploadError) throw uploadError;
      const { error: artifactError } = await supabase
        .from('document_artifacts')
        .upsert(
          {
            user_id: request.user_id,
            generation_request_id: request.id,
            kind: artifact.kind,
            object_key: objectKey,
            file_name: artifact.fileName,
            content_type: artifact.contentType,
            size_bytes: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
          { onConflict: 'generation_request_id,kind' },
        );
      if (artifactError) throw artifactError;
    }

    const { error: readyError } = await supabase
      .from('generation_requests')
      .update({ status: 'ready', completed_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('user_id', request.user_id);
    if (readyError) throw readyError;

    const telegramChatId =
      scheduleResult.data?.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;
    if ((scheduleResult.data?.telegram_enabled ?? true) && telegramChatId) {
      try {
        await sendTelegramDocumentsReady(telegramChatId, {
          title: jobResult.data.title,
          company: jobResult.data.company,
        });
      } catch (notificationError) {
        console.warn(
          `Document notification failed: ${notificationError instanceof Error ? notificationError.message : 'unknown error'}`,
        );
      }
    }
    console.log('WerkMatch document request completed successfully.');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown document failure.';
    await supabase
      .from('generation_requests')
      .update({ status: 'failed', error_message: message.slice(0, 2_000) })
      .eq('id', request.id)
      .eq('user_id', request.user_id);
    console.error(`WerkMatch document request failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function compileLatex(directory: string, fileName: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      tectonicBinary,
      [
        '-X',
        'compile',
        '--outdir',
        directory,
        '--outfmt',
        'pdf',
        '--untrusted',
        fileName,
      ],
      { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk.toString()));
    child.stderr.on('data', (chunk) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`LaTeX compilation failed: ${output.slice(-1_500)}`));
    });
  });
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
