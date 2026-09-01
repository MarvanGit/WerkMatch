'use client';

import { ArrowRight, CheckCircle2, LoaderCircle, Mail } from 'lucide-react';
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
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

export function LoginForm() {
  const [state, setState] = useState<FormState>({ status: 'idle' });

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const emailEntry = form.get('email');
    const email = typeof emailEntry === 'string' ? emailEntry.trim() : '';

    if (!email) {
      setState({ status: 'error', message: 'Enter your email address.' });
      return;
    }

    setState({ status: 'submitting' });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setState({ status: 'error', message: error.message });
      return;
    }

    setState({ status: 'sent', email });
  }

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-5">
        <CheckCircle2 className="size-6 text-primary" />
        <p className="mt-3 font-heading text-lg font-semibold">
          Check your inbox
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          We sent a secure sign-in link to {state.email}. It expires shortly and
          can only be used once.
        </p>
        <Button
          className="mt-4"
          onClick={() => setState({ status: 'idle' })}
          variant="outline"
        >
          Use another email
        </Button>
      </div>
    );
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
            type="email"
          />
        </div>
        <FieldDescription>
          Only accounts created in your WerkMatch Supabase project can sign in.
        </FieldDescription>
        {state.status === 'error' ? (
          <FieldError>{state.message}</FieldError>
        ) : null}
      </Field>

      <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <ArrowRight />
        )}
        Email me a sign-in link
      </Button>
    </form>
  );
}
