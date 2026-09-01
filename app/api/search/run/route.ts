import { NextResponse } from 'next/server';

import { runSearchForUser } from '@/lib/search/run-search';
import { createClient } from '@/lib/supabase/server';

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

  try {
    return NextResponse.json(await runSearchForUser(supabase, user.id));
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Unknown search failure.';
    return NextResponse.json(
      { error: 'The search run failed.', detail },
      { status: 502 },
    );
  }
}
