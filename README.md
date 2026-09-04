# WerkMatch

WerkMatch is a private job-search workspace for technical working-student roles. It discovers and ranks eligible jobs, sends Telegram alerts, and generates a tailored CV and cover letter only when the user explicitly requests them.

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
- Public LinkedIn guest job search pages (no authenticated LinkedIn crawling)
- OpenCode Go Responses API for evidence-locked match evaluation
- A scheduled worker for on-demand LaTeX compilation

## Live search flow

The dashboard's **Run search** action currently:

1. reads recent Arbeitnow and LinkedIn listings and scrapes selected company career boards;
2. rejects non-student, non-technical, and location-ineligible roles before AI use;
3. sends only candidate listings and verified candidate facts to OpenCode Go;
4. stores structured scores and exact candidate-fact references in Supabase; and
5. sends Telegram alerts for new eligible matches at or above the configured threshold.

Candidate facts are never sent to the job source. OpenCode and Telegram are only
called during an authorized search run.

LinkedIn searches cover Bavaria, major Bavarian cities, and Germany-wide remote
roles. `LINKEDIN_MAX_SEARCH_PAGES` and `LINKEDIN_MAX_CANDIDATES` control the
depth and detail-page budget; both are capped by the scraper for safety.

## Document generation

The uploaded LaTeX CV is the immutable content source. WerkMatch preserves the
source and styling exactly. If the Skills section contains recognizable
`\\cvitem` or `\\resumeSubItem` entries, only those complete entries may be
reordered using verified fact priority; sections and entry text are never
rewritten. A separate cover-letter template can be stored in
`cover_letter_template_object_key` (or configured with
`COVER_LETTER_TEMPLATE_OBJECT_KEY`). WerkMatch preserves that template's
sender, layout, closing, and signature, replacing only the recipient, subject,
salutation, and evidence-bound body.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Apply the SQL migrations in `supabase/migrations` to the Supabase project.
3. Create the authorized user in Supabase Authentication.
4. Upload the CV and cover-letter templates to the private `candidate-assets`
   bucket and set their object keys on the candidate profile. The cover-letter
   key may alternatively be provided with `COVER_LETTER_TEMPLATE_OBJECT_KEY`.
5. Run `npm install` and `npm run dev`.

Never commit `.env.local`, CV files, photographs, API keys, Telegram tokens, or generated application documents.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
