import { NextResponse } from 'next/server';
import { z } from 'zod';

import { applicationStatuses } from '@/lib/domain/applications';
import { createClient } from '@/lib/supabase/server';

const applicationSchema = z.object({
  status: z.enum(applicationStatuses),
});

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
  const input = applicationSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json(
      { error: 'Choose a valid application status.' },
      { status: 400 },
    );
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const { data: existingApplication } = await supabase
    .from('applications')
    .select('id,applied_at')
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existingApplication && input.data.status !== 'applied') {
    return NextResponse.json(
      { error: 'Confirm that you applied before changing its status.' },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: application, error } = await supabase
    .from('applications')
    .upsert(
      {
        user_id: user.id,
        job_id: jobId,
        status: input.data.status,
        applied_at: existingApplication?.applied_at ?? now,
        status_updated_at: now,
      },
      { onConflict: 'user_id,job_id' },
    )
    .select('id,job_id,status,applied_at,status_updated_at')
    .single();

  if (error || !application) {
    return NextResponse.json(
      { error: 'Could not save the application status.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ application });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
