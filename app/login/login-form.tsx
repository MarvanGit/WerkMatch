'use client';

import { ArrowRight, KeyRound, LoaderCircle, Mail } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action="/auth/password"
      className="space-y-5"
      method="post"
      onSubmit={() => setIsSubmitting(true)}
    >
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
