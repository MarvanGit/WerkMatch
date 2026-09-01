import { LockKeyhole, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/');

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-heading text-lg font-semibold tracking-[-0.03em]">
              WerkMatch
            </p>
            <p className="text-xs text-muted-foreground">
              Private application workspace
            </p>
          </div>
        </div>

        <Card className="border-0 bg-card/95 shadow-[0_24px_80px_rgb(15_23_42/10%)]">
          <CardHeader className="pb-2 text-center">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <LockKeyhole className="size-4" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-[-0.04em]">
              Sign in to your job radar
            </CardTitle>
            <CardDescription className="mx-auto mt-1 max-w-sm leading-relaxed">
              Use a passwordless email link to access your matches and private
              application documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {error ? (
              <div
                className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-950"
                role="alert"
              >
                That sign-in link could not be verified. Request a fresh link
                below.
              </div>
            ) : null}
            <LoginForm />
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Your CV and generated documents stay in private Supabase storage.
        </p>
      </div>
    </main>
  );
}
