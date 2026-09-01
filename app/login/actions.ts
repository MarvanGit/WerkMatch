'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailEntry = formData.get('email');
  const passwordEntry = formData.get('password');
  const email = typeof emailEntry === 'string' ? emailEntry.trim() : '';
  const password = typeof passwordEntry === 'string' ? passwordEntry : '';

  if (!email || !password) {
    return {
      status: 'error',
      message: 'Enter both your email address and password.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      status: 'error',
      message:
        error.message === 'Invalid login credentials'
          ? 'The email or password is incorrect.'
          : error.message,
    };
  }

  redirect('/');
}
