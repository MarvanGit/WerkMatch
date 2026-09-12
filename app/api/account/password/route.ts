import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login',request.url),303);
  const form = await request.formData(); const password = form.get('password');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || password !== form.get('confirm')) return NextResponse.redirect(new URL('/account/password?error=invalid',request.url),303);
  const { error } = await supabase.auth.updateUser({ password });
  return NextResponse.redirect(new URL(error ? '/account/password?error=save' : '/onboarding',request.url),303);
}
