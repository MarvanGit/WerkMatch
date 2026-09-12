# WerkMatch

WerkMatch has a public portfolio homepage and an interactive fictional demo, with invite-only private job-search workspaces for technical working-student roles. It discovers and ranks eligible jobs, sends account-specific Telegram alerts, and generates a tailored CV and cover letter when the user requests them.

## Public demo and private accounts

Anonymous visitors see the public homepage at `/` and can explore `/demo` without any database writes, AI requests, or messages. Signed-in visitors retain the existing job radar at `/`. New accounts are directed to `/onboarding`.

Onboarding accepts self-contained UTF-8 `.tex` CV and cover-letter templates, up to 200 KB each. CV text is sent to the configured OpenCode service to extract draft facts. Users edit and confirm those facts and their German study/availability statements before saving. A compatible cover-letter starter is available at `/templates/cover-letter.tex`; users must replace its sender details. Arbitrary PDF/Word templates and custom TeX dependency bundles are not supported in this release.

Each account chooses language levels, optional role keywords, Bavaria-plus-remote or remote-only coverage, schedule, and Telegram destination. New schedules and notifications default to off. Daily limits are 6 searches (at least 15 minutes apart), 8 document requests, and 3 profile extractions. LaTeX runs in untrusted mode with a timeout and without service credentials in its environment.

## Invite an account

Apply all Supabase migrations first. An administrator-only, short-lived email allowlist enforces invite-only provisioning at the Auth database boundary, including direct Auth API signup attempts. Existing users remain valid. Do not use ordinary self-signup or dashboard invitation creation without provisioning the allowlist.

With the existing server credentials configured locally and `NEXT_PUBLIC_SITE_URL` set to the production URL, run:

```powershell
node --env-file=.env.local scripts/create-invite.ts person@example.com
```

The script creates the account and prints a one-time setup link. It does not send email. Share the link privately with its intended recipient; it leads to password setup and then onboarding. Treat the link as a credential. Existing users can edit their details through **Profile → Edit profile and templates**. Profiles cannot be replaced while document generation is pending.

## Validation

```powershell
npx tsc --noEmit
npm run lint
node --test tests/*.test.ts
```

The opt-in `node --env-file=.env.local tests/multi-user.integration.ts` check requires the local preview at port 3000 and live Supabase credentials. It creates temporary accounts, uploads fictional templates, calls the configured AI service once, checks profile persistence, invitation acceptance, quotas and cross-account isolation, and removes its own accounts/files. It does not run job searches or send messages.

## Matching policy

- Werkstudent / Working Student software and technical roles
- On-site, hybrid, or remote roles anywhere in Bavaria
- Outside Bavaria, only roles confirmed as remote from Germany
- English fluent and German B1
- Higher German requirements reduce the score or add a warning; they do not automatically reject a role
- Default search cadence: every 6 hours
- Default Telegram notification threshold: 75%

## Architecture

- TypeScript, React, Vinext, and Cloudflare-compatible server routes
- Supabase Auth with email and password
- Supabase Postgres with row-level security
- Private Supabase Storage buckets for candidate assets and generated documents
- OpenCode Go for structured job matching and on-demand document tailoring
- Telegram Bot API for notifications
- Arbeitnow as a structured job source
- Direct HTML scraping of selected Bavarian company career boards on Personio
- Direct HTML scraping of selected SmartRecruiters and Lever employer boards
- Public LinkedIn guest job search pages (no authenticated LinkedIn crawling)
- OpenCode Go Responses API for evidence-locked match evaluation
- Staggered document workers for on-demand LaTeX compilation

## Live search flow

The dashboard's **Run search** action currently:

1. scrapes selected Personio, SmartRecruiters, Lever, and public LinkedIn career pages, with Arbeitnow retained as a supplemental feed;
2. rejects non-student, non-technical, and location-ineligible roles before AI use;
3. sends only candidate listings and verified candidate facts to OpenCode Go;
4. stores structured scores and exact candidate-fact references in Supabase; and
5. sends Telegram alerts for new eligible matches at or above the configured threshold.

Candidate facts are never sent to the job source. OpenCode and Telegram are only
called during an authorized search run.

LinkedIn searches cover Bavaria, Bavarian cities, and Germany-wide remote roles
using German and English technical-role variants, including embedded software,
robotics, full-stack development, and student assistant roles. Remote searches
also use LinkedIn's remote-work filter. Queries are interleaved across regions
and paged breadth-first; overlapping queries cannot prematurely stop pagination.

Defaults are 8 pages per query and up to 160 detail pages per run (previously
3 and 40). Configure these with `LINKEDIN_MAX_SEARCH_PAGES` (maximum 12) and
`LINKEDIN_MAX_CANDIDATES` (maximum 300). `LINKEDIN_MAX_RUNTIME_SECONDS`
defaults to 360 (maximum 480); 55% is reserved for discovering listings, leaving
time for details. Partial results survive the deadline. Listing/detail concurrency
is bounded to 3/4 workers, with a shared one-second request-start interval and shared
Retry-After cooldown. Persistent rate limits and access challenges stop collection.

Source status records discovery counts, detail requests, and whether a budget
was reached. Job lookups and writes are batched so larger result sets do not
exceed database URL limits. AI evaluation remains limited to 16 jobs per search.
LinkedIn remains an unauthenticated public source; personal account passwords
and session cookies are not collected.

## Document generation

The uploaded LaTeX CV is the immutable content source. WerkMatch preserves the
source and styling exactly. If the Skills section contains recognizable
`\\cvitem` or `\\resumeSubItem` entries, only those complete entries may be
reordered using verified fact priority; sections and entry text are never
rewritten. A separate cover-letter template can be stored in
`cover_letter_template_object_key` for that account. WerkMatch preserves that template's
sender, layout, closing, and signature, replacing only the recipient, subject,
salutation, and evidence-bound body.

Two staggered GitHub workflows check the document queue every 15 minutes. Each
run reclaims interrupted work, processes up to four requests, reuses an existing
tailoring plan on compilation retries, and caches installed dependencies. The
renderer removes only explicit TeX engine driver flags such as `pdftex` before
Tectonic compilation; CV content and styling commands remain unchanged.

## Cover-letter consistency

Every new letter uses four paragraphs: job-specific motivation and current
study status, relevant technical skills, practical professional experience,
and availability plus an invitation to talk. User-confirmed German statements
are maintained centrally in the verified education fact's
`details.cover_letter_study_de` and `details.cover_letter_availability_de`.
The application inserts them verbatim into the first and last paragraphs.
Update these fields when the semester or availability changes; no personal
availability is hardcoded in the generator.

The skills paragraph must name at least two verified technical skills, and the
experience paragraph must name a verified employer and develop a concrete
example. Both paragraphs carry internal evidence connecting them to exact
requirements quoted from the job description. These citations are validation
metadata and do not appear in the PDF. Missing sections trigger one correction
attempt; incomplete output is not saved as a completed letter. The worker
revalidates cached plans against the current prompt version and profile facts.
Existing completed PDFs remain available; generating again uses the new rules.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Apply the SQL migrations in `supabase/migrations` to the Supabase project.
3. Provision an account using the invitation script described above.
4. Accept its setup link, set a password, and upload templates through onboarding.
5. Run `npm install` and `npm run dev`.

Never commit `.env.local`, CV files, photographs, API keys, Telegram tokens, or generated application documents.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
