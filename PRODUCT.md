# WerkMatch product brief

## Product and audience

WerkMatch combines a public portfolio homepage and fictional interactive demo with private, invite-only application workspaces for technical working-student opportunities in Germany. Recruiters and engineering managers can explore the demo without an account. Each invited candidate owns their profile, templates, matches, schedule, notifications, and documents.

## Core job

- Scrape public job pages on demand and on a configurable schedule.
- Find Werkstudent / Working Student software and technology roles.
- Accept on-site and hybrid roles anywhere in Bavaria; outside Bavaria, accept roles only when they are remote from Germany.
- Rank roles against each account's confirmed CV facts and configured language levels.
- Let candidates choose Bavaria plus Germany-remote coverage or remote-only coverage, with optional role keyword filters. Higher German requirements are a risk, not automatic rejection.
- Send Telegram notifications for relevant matches.
- Generate tailored CV and cover-letter documents only after an explicit request.
- Onboard users with self-contained LaTeX CV and cover-letter templates, editable extracted facts, and confirmed German study/availability statements. PDF/Word import is outside this release.
- Keep new accounts' schedules and notifications disabled until they choose to enable them. Enforce daily limits of 6 searches, 8 document requests, and 3 profile extractions.

## Document truth

- The uploaded LaTeX templates are the source of structure and styling.
- Tailoring must not invent or remove candidate facts.
- The CV keeps its established field order and content; only the ordering of technologies, evidence, and bullet points may change to emphasize relevance.
- The cover letter keeps the uploaded template and changes only job-specific text such as company, address, position, and letter content.
- Every generated cover letter is written in standard German orthography for Germany, including native umlauts and ß, even when the source listing is in English.

## Application workflow

- Every discovered match has a dedicated detail page with the full listing, match explanation, verified evidence, document-generation action, and original listing link.
- A role enters the Applications workspace only when its user explicitly confirms that they applied.
- Application status is user-controlled and can move through Applied, Screening, Interview, Offer, Rejected, or Withdrawn.
- The authenticated workspace homepage keeps its compact right-hand match preview; clicking a job card opens the dedicated detail page. The public homepage uses a clearly labelled fictional example.

## Technical constraints

- TypeScript web application using React/Vinext.
- Supabase provides authentication, private storage, and durable per-user data protected by row-level security.
- The app is deployed to OpenAI Sites / Cloudflare infrastructure and its source is mirrored to GitHub.
- OpenCode Go provides AI matching and on-demand document generation.

## Current product commitments

- Product name: WerkMatch.
- Existing interface is the visual authority for new authenticated workspace pages.
- The workspace must remain responsive, keyboard accessible, and explicit about state-changing actions.

## Open questions

- No future application statuses, notes, reminders, or interview-event fields have been confirmed beyond the initial status tracker.
