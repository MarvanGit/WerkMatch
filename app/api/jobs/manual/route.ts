import { NextResponse } from 'next/server';

import { manualJobSchema } from '@/lib/domain/contracts';
import { defaultMatchPolicy } from '@/lib/domain/match-policy';
import { isBavariaLocation } from '@/lib/sources/job-filter';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
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

  const input = manualJobSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json(
      { error: 'Invalid job data.', issues: input.error.issues },
      { status: 400 },
    );
  }

  const displayName =
    typeof user.user_metadata.full_name === 'string'
      ? user.user_metadata.full_name
      : (user.email ?? 'WerkMatch user');

  const { error: profileError } = await supabase
    .from('candidate_profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: displayName,
        target_roles: defaultMatchPolicy.targetRoleFamilies,
        search_policy: defaultMatchPolicy,
      },
      { onConflict: 'user_id' },
    );

  if (profileError) {
    return NextResponse.json(
      { error: 'Could not prepare your candidate profile.' },
      { status: 500 },
    );
  }

  const fingerprint = await sha256(
    [input.data.company, input.data.title, input.data.description].join('\n'),
  );
  const now = new Date().toISOString();

  const { data: savedJob, error: jobError } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: user.id,
        source: 'manual',
        canonical_url: input.data.canonicalUrl,
        title: input.data.title,
        company: input.data.company,
        description: input.data.description,
        location_text: input.data.locationText,
        region:
          input.data.region ??
          (isBavariaLocation(input.data.locationText) ? 'Bavaria' : null),
        country: input.data.country,
        work_mode: input.data.workMode,
        employment_type: input.data.employmentType,
        published_at: input.data.publishedAt,
        content_fingerprint: fingerprint,
        last_seen_at: now,
      },
      { onConflict: 'user_id,canonical_url' },
    )
    .select('id,title,company,canonical_url')
    .single();

  if (jobError) {
    return NextResponse.json(
      { error: 'Could not save the job.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ job: savedJob }, { status: 201 });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
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
