import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), {
      status: 303,
    });
  }

  const { error } = await supabase
    .from('candidate_facts')
    .update({
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('verification_status', 'draft');

  if (error) {
    return NextResponse.redirect(
      new URL('/profile?error=verify', request.url),
      {
        status: 303,
      },
    );
  }

  return NextResponse.redirect(new URL('/profile?verified=1', request.url), {
    status: 303,
  });
}
