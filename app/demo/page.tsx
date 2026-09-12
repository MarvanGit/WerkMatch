'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Radar } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

const jobs = [
  {
    title: 'Working Student, Frontend Engineering',
    company: 'Example Studio',
    location: 'Munich · Hybrid',
    score: 92,
    skills: 'React, TypeScript',
    evidence:
      'Alex built a React study planner with typed components and accessible forms.',
    gap: 'No professional design-system experience has been verified.',
  },
  {
    title: 'Working Student, Test Automation',
    company: 'Example Systems',
    location: 'Nuremberg · On-site',
    score: 84,
    skills: 'Python, Git',
    evidence:
      'Alex wrote Python regression tests for a university robotics project.',
    gap: 'The listing asks for German B2; this fictional candidate has B1.',
  },
  {
    title: 'Working Student, Cloud Development',
    company: 'Example Cloud',
    location: 'Germany · Remote',
    score: 76,
    skills: 'TypeScript, Git',
    evidence:
      'Alex deployed a student project and used Git for team collaboration.',
    gap: 'Production cloud operations experience is not verified.',
  },
];

export default function DemoPage() {
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<'matches' | 'profile' | 'applications'>(
    'matches',
  );
  const [applied, setApplied] = useState<number[]>([]);
  const [document, setDocument] = useState(false);
  const job = jobs[selected];
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <Radar className="text-primary" />
          WerkMatch
        </Link>
        <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
          Sign in to your workspace <ArrowRight />
        </Link>
      </header>
      <div className="my-7 rounded-xl bg-secondary px-5 py-4 text-sm leading-relaxed text-secondary-foreground">
        <strong>Interactive demo.</strong> Alex Morgan, the employers, scores,
        and documents are fictional. Changes last until you leave or reload; no
        searches, AI calls, or applications are sent.
      </div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Alex’s job radar
          </h1>
          <p className="mt-2 text-muted-foreground">
            A closer look at how an application comes together.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setApplied([]);
            setDocument(false);
            setSelected(0);
            setView('matches');
          }}
        >
          Reset demo
        </Button>
      </div>
      <nav aria-label="Demo sections" className="mb-8 flex gap-2 border-b pb-4">
        {(['matches', 'profile', 'applications'] as const).map((item) => (
          <Button
            key={item}
            variant={view === item ? 'default' : 'ghost'}
            aria-pressed={view === item}
            onClick={() => setView(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </nav>
      {view === 'matches' && (
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section aria-label="Example matches" className="space-y-3">
            {jobs.map((item, index) => (
              <button
                key={item.title}
                onClick={() => {
                  setSelected(index);
                  setDocument(false);
                }}
                aria-pressed={selected === index}
                className={`w-full rounded-xl border p-5 text-left transition-colors hover:bg-secondary/50 ${selected === index ? 'border-primary bg-secondary/40' : 'bg-card'}`}
              >
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    {item.company}
                  </span>
                  <strong className="text-primary">{item.score}%</strong>
                </div>
                <h2 className="mt-2 text-lg font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {item.location}
                </p>
              </button>
            ))}
          </section>
          <section
            className="rounded-2xl bg-card p-6 sm:p-8"
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">{job.company}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {job.title}
            </h2>
            <h3 className="mt-7 font-semibold">Why this matches</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              {job.evidence}
            </p>
            <p className="mt-3 text-sm font-medium text-primary">
              Verified skills: {job.skills}
            </p>
            <h3 className="mt-6 font-semibold">What to consider</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              {job.gap}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => setDocument(!document)}>
                <FileText />
                {document ? 'Hide sample letter' : 'Preview sample letter'}
              </Button>
              <Button
                variant="outline"
                disabled={applied.includes(selected)}
                onClick={() => setApplied([...applied, selected])}
              >
                {applied.includes(selected) ? (
                  <>
                    <Check />
                    Tracked in demo
                  </>
                ) : (
                  'Mark as applied in demo'
                )}
              </Button>
            </div>
            {document && (
              <article className="mt-6 border-t pt-6">
                <h3 className="font-semibold">
                  Sample letter excerpt · fictional
                </h3>
                <p className="mt-4 leading-loose">
                  Sehr geehrtes Recruiting-Team,
                  <br />
                  <br />
                  mit Interesse bewerbe ich mich als Werkstudent bei{' '}
                  {job.company}. In meinen Studienprojekten habe ich praktische
                  Erfahrung mit {job.skills} gesammelt. Diese Kenntnisse möchte
                  ich in Ihrem Team einsetzen und weiterentwickeln.
                  <br />
                  <br />
                  Mit freundlichen Grüßen
                  <br />
                  Alex Morgan
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  A short, prewritten demo excerpt. Private accounts generate
                  full documents from their own verified facts and templates.
                </p>
              </article>
            )}
          </section>
        </div>
      )}
      {view === 'profile' && (
        <section className="max-w-3xl">
          <h2 className="text-2xl font-semibold">
            A profile built from evidence
          </h2>
          <p className="mt-3 text-muted-foreground">
            Alex Morgan · Computer Science student · English C1 · German B1
          </p>
          {[
            ['Skills', 'React, TypeScript, Python, Git'],
            [
              'Project',
              'Built an accessible study planner using React and TypeScript.',
            ],
            [
              'Experience',
              'Wrote Python regression tests in a university robotics team.',
            ],
          ].map(([title, text]) => (
            <div className="mt-5 border-b pb-5" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{text}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm text-primary">
                <Check className="size-4" />
                Verified in this fictional profile
              </span>
            </div>
          ))}
        </section>
      )}
      {view === 'applications' && (
        <section>
          <h2 className="text-2xl font-semibold">
            Applications you choose to track
          </h2>
          {applied.length ? (
            applied.map((index) => (
              <div
                key={index}
                className="mt-5 flex flex-wrap justify-between gap-4 border-b pb-5"
              >
                <div>
                  <h3 className="font-semibold">{jobs[index].title}</h3>
                  <p className="mt-1 text-muted-foreground">
                    {jobs[index].company}
                  </p>
                </div>
                <span className="text-primary">Applied · demo only</span>
              </div>
            ))
          ) : (
            <div className="mt-6 rounded-xl bg-card p-8">
              <p className="text-muted-foreground">
                No applications tracked yet. Open a match and select “Mark as
                applied in demo”.
              </p>
              <Button className="mt-4" onClick={() => setView('matches')}>
                Browse matches
              </Button>
            </div>
          )}
        </section>
      )}
      <footer className="mt-16 border-t pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to WerkMatch
        </Link>
      </footer>
    </main>
  );
}
