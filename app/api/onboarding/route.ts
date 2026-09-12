import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ownsAsset, setupSchema } from '@/lib/domain/onboarding';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: 'Sign in to save your profile.' },
      { status: 401 },
    );
  const input = setupSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: 'Review all required profile fields and confirm your facts.' },
      { status: 400 },
    );
  if (
    ![input.data.cvKey, input.data.coverKey].every((key) =>
      ownsAsset(user.id, key),
    )
  )
    return NextResponse.json(
      { error: 'These files do not belong to this account.' },
      { status: 403 },
    );
  for (const key of [input.data.cvKey, input.data.coverKey]) {
    const { data, error } = await supabase.storage
      .from('candidate-assets')
      .download(key);
    if (error || !data)
      return NextResponse.json(
        { error: 'Upload both templates before saving.' },
        { status: 409 },
      );
    if (key === input.data.cvKey) {
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest('SHA-256', await data.arrayBuffer()),
        ),
      ]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== input.data.cvHash)
        return NextResponse.json(
          { error: 'The CV has changed. Upload it again before saving.' },
          { status: 409 },
        );
    }
  }
  const { error } = await supabase.rpc('save_werkmatch_profile', {
    payload: input.data,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          'Could not save your profile. Please retry; your previous profile is unchanged.',
      },
      { status: 503 },
    );
  return NextResponse.json({ ok: true });
}
