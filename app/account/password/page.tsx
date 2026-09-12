import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to your workspace.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Set a password for future sign-ins, then add your profile.
      </p>
      <form
        action="/api/account/password"
        method="post"
        className="mt-8 space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            type="password"
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            type="password"
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Use at least 12 characters.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            The passwords must match and have at least 12 characters. If they
            do, please retry.
          </p>
        )}
        <Button type="submit">Save password and continue</Button>
      </form>
    </main>
  );
}
