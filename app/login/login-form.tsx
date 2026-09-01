'use client';

import { ArrowRight, KeyRound, LoaderCircle, Mail } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string };

export function LoginForm() {
  const [state, setState] = useState<FormState>({ status: 'idle' });

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const emailEntry = form.get('email');
    const passwordEntry = form.get('password');
    const email = typeof emailEntry === 'string' ? emailEntry.trim() : '';
    const password = typeof passwordEntry === 'string' ? passwordEntry : '';

    if (!email || !password) {
      setState({
        status: 'error',
        message: 'Enter both your email address and password.',
      });
      return;
    }

    setState({ status: 'submitting' });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState({
        status: 'error',
        message:
          error.message === 'Invalid login credentials'
            ? 'The email or password is incorrect.'
            : error.message,
      });
      return;
    }

    window.location.assign('/');
  }

  const isSubmitting = state.status === 'submitting';

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="email">Email address</FieldLabel>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoComplete="email"
            className="h-11 pl-9"
            disabled={isSubmitting}
            id="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoComplete="current-password"
            className="h-11 pl-9"
            disabled={isSubmitting}
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        <FieldDescription>
          Use the password from the Supabase user you created. It is sent only
          to Supabase Auth.
        </FieldDescription>
      </Field>

      {state.status === 'error' ? (
        <FieldError>{state.message}</FieldError>
      ) : null}

      <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <ArrowRight />
        )}
        Sign in securely
      </Button>
    </form>
  );
}
