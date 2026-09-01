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
- Supabase Auth with passwordless email links
- Supabase Postgres with row-level security
- Private Supabase Storage buckets for candidate assets and generated documents
- OpenCode Go for structured job matching and on-demand document tailoring
- Telegram Bot API for notifications
- A separate Docker worker will handle browser-based scraping and LaTeX compilation

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Apply the SQL migration in `supabase/migrations` to the Supabase project.
3. Create the authorized user in Supabase Authentication.
4. Run `npm install` and `npm run dev`.

Never commit `.env.local`, CV files, photographs, API keys, Telegram tokens, or generated application documents.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

The application is not production-ready until scraping adapters, model evaluation, document verification, LaTeX compilation, scheduling, and deployment secrets are completed.
