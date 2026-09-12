import Link from 'next/link';
import { ArrowRight, Check, FileCheck2, Radar } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function PublicHome() {
  return (
    <main className="min-h-screen">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Radar className="text-primary" />
          WerkMatch
        </Link>
        <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
          Sign in
        </Link>
      </nav>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-balance sm:text-6xl">
            Your experience.
            <br />
            <span className="text-primary">Your next opportunity.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground">
            A personal workspace for technical working-student jobs in Germany.
            Find relevant roles, see why they fit, and prepare applications
            grounded in your real experience.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/demo" className={buttonVariants({ size: 'lg' })}>
              Explore the demo <ArrowRight />
            </Link>
            <a
              href="#how-it-works"
              className="text-sm font-medium underline underline-offset-4"
            >
              How it works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No account or CV needed to explore. Private accounts are
            invite-only.
          </p>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-[0_20px_60px_rgb(15_23_42/8%)] sm:p-8">
          <div className="flex items-center justify-between gap-4 border-b pb-5">
            <h2 className="text-lg font-semibold">
              A match you can understand
            </h2>
            <span className="text-xs text-muted-foreground">
              Fictional example
            </span>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Example employer · Munich · Hybrid
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">
            Working Student, Frontend Engineering
          </h3>
          <div className="my-6 flex items-baseline gap-2 text-primary">
            <span className="text-4xl font-semibold tabular-nums">92%</span>
            <span className="text-sm">illustrative match</span>
          </div>
          <ul className="space-y-4 text-sm leading-relaxed">
            {[
              'React experience supported by a verified project.',
              'TypeScript skills match the role’s requirements.',
              'Hybrid work fits this candidate’s preferences.',
            ].map((text) => (
              <li key={text} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3 border-t pt-5 text-sm text-muted-foreground">
            <FileCheck2 className="size-5 shrink-0" />
            Every match connects requirements to candidate evidence.
          </div>
        </div>
      </section>
      <section id="how-it-works" className="border-y bg-card/60">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">
            From your CV to a considered application.
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              [
                'Make it yours',
                'Add your CV and LaTeX templates. Review the facts that matching and document tailoring can use.',
              ],
              [
                'Let your search run',
                'Choose your preferences and search schedule. Review matches and the gaps behind each score.',
              ],
              [
                'Apply with context',
                'Request a tailored CV and German cover letter, review the result, then track applications you submit.',
              ],
            ].map(([title, description]) => (
              <div key={title}>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
        <h2 className="max-w-md text-3xl font-semibold tracking-tight">
          Built for a real job search.
          <br />
          Open for a closer look.
        </h2>
        <div className="space-y-4 leading-relaxed text-muted-foreground">
          <p>
            WerkMatch is a personal software project by Marwan Abdelsamad. The
            public demo shows the workflow with fictional data, while each
            signed-in account has its own private workspace.
          </p>
          <p>
            Under the hood: React and TypeScript, Supabase authentication and
            storage, scheduled job collection, evidence-based AI matching, and a
            queue for application documents.
          </p>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 font-medium text-primary"
          >
            Take a look inside <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t px-5 py-6 text-sm text-muted-foreground">
        <span>WerkMatch · A personal job-search project</span>
        <Link href="/login">Private workspace</Link>
      </footer>
    </main>
  );
}
