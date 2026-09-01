import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

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
  const { data: profile } = await supabase
    .from('candidate_profiles')
    .select('profile_version,master_cv_object_key,latex_template_object_key')
    .eq('user_id', user.id)
    .maybeSingle();

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

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
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
    .select('id,status')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Could not queue document generation.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      generation: {
        ...generation,
        message:
          'The request is queued. The generation worker will tailor, verify, and compile both documents.',
      },
    },
    { status: 202 },
  );
}
