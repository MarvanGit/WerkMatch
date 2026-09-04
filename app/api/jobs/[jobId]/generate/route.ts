import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { triggerDocumentWorker } from '@/lib/workers/github';

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
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

  const { jobId } = await context.params;
  const { data: generation, error } = await supabase
    .from('generation_requests')
    .select('id,status,error_message,requested_at,completed_at')
    .eq('user_id', user.id)
    .eq('job_id', jobId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: 'Could not load document status.' },
      { status: 500 },
    );
  }
  return NextResponse.json({
    generation: generation
      ? await withSignedArtifacts(supabase, user.id, generation)
      : null,
  });
}

export async function POST(_request: Request, context: RouteContext) {
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

  const { jobId } = await context.params;
  const [{ data: profile }, { data: job }, { data: activeGeneration }] =
    await Promise.all([
      supabase
        .from('candidate_profiles')
        .select(
          'profile_version,master_cv_object_key,latex_template_object_key',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('id')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle(),
      supabase
        .from('generation_requests')
        .select('id,status,error_message,requested_at,completed_at')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .in('status', ['queued', 'generating', 'compiling'])
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!profile) {
    return NextResponse.json(
      { error: 'Complete your candidate profile first.' },
      { status: 409 },
    );
  }
  if (!profile.master_cv_object_key || !profile.latex_template_object_key) {
    return NextResponse.json(
      { error: 'Upload your master CV and LaTeX template before generating.' },
      { status: 409 },
    );
  }
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }
  if (activeGeneration) {
    const dispatchWarning =
      activeGeneration.status === 'queued'
        ? await dispatchWorkerSafely()
        : null;
    return NextResponse.json(
      { generation: activeGeneration, dispatchWarning },
      { status: 200 },
    );
  }

  const { data: evaluation } = await supabase
    .from('match_evaluations')
    .select('id')
    .eq('user_id', user.id)
    .eq('job_id', jobId)
    .maybeSingle();
  const { data: generation, error } = await supabase
    .from('generation_requests')
    .insert({
      user_id: user.id,
      job_id: jobId,
      match_evaluation_id: evaluation?.id ?? null,
      status: 'queued',
      template_version: profile.profile_version,
      profile_version: profile.profile_version,
    })
    .select('id,status,error_message,requested_at,completed_at')
    .single();
  if (error) {
    return NextResponse.json(
      { error: 'Could not queue document generation.' },
      { status: 500 },
    );
  }
  const dispatchWarning = await dispatchWorkerSafely();
  return NextResponse.json({ generation, dispatchWarning }, { status: 202 });
}

async function dispatchWorkerSafely(): Promise<string | null> {
  try {
    const result = await triggerDocumentWorker();
    return result.triggered
      ? null
      : 'The request is queued, but immediate generation is not configured yet.';
  } catch (error) {
    console.error(
      `Immediate document-worker dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return 'The request is queued, but the immediate worker could not start. The scheduled fallback will retry it.';
  }
}

async function withSignedArtifacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  generation: {
    id: string;
    status: string;
    error_message: string | null;
    requested_at: string;
    completed_at: string | null;
  },
) {
  if (generation.status !== 'ready') return { ...generation, artifacts: [] };
  const { data: artifacts } = await supabase
    .from('document_artifacts')
    .select('kind,file_name,object_key')
    .eq('user_id', userId)
    .eq('generation_request_id', generation.id);
  const signedArtifacts = await Promise.all(
    (artifacts ?? []).map(async (artifact) => {
      const { data } = await supabase.storage
        .from('generated-documents')
        .createSignedUrl(artifact.object_key, 3_600, {
          download: artifact.file_name,
        });
      return {
        kind: artifact.kind,
        fileName: artifact.file_name,
        url: data?.signedUrl ?? null,
      };
    }),
  );
  return {
    ...generation,
    artifacts: signedArtifacts.filter((artifact) => artifact.url),
  };
}
