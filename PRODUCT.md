# WerkMatch product brief

## Product and audience

WerkMatch is Marwan's private application workspace for finding and acting on technical working-student opportunities in Germany. It is an authenticated personal tool, not a public job marketplace.

## Core job

- Scrape public job pages on demand and on a configurable schedule.
- Find Werkstudent / Working Student software and technology roles.
- Accept on-site and hybrid roles anywhere in Bavaria; outside Bavaria, accept roles only when they are remote from Germany.
- Rank roles against verified facts from Marwan's master CV.
- Treat English as fluent and German B1 as an application risk or warning, not an automatic rejection.
- Send Telegram notifications for relevant matches.
- Generate tailored CV and cover-letter documents only after an explicit request.

## Document truth

- The uploaded LaTeX templates are the source of structure and styling.
- Tailoring must not invent or remove candidate facts.
- The CV keeps its established field order and content; only the ordering of technologies, evidence, and bullet points may change to emphasize relevance.
- The cover letter keeps the uploaded template and changes only job-specific text such as company, address, position, and letter content.
- Every generated cover letter is written in standard German orthography for Germany, including native umlauts and ß, even when the source listing is in English.

## Application workflow

- Every discovered match has a dedicated detail page with the full listing, match explanation, verified evidence, document-generation action, and original listing link.
- A role enters the Applications workspace only when Marwan explicitly confirms that he applied.
- Application status is user-controlled and can move through Applied, Screening, Interview, Offer, Rejected, or Withdrawn.
- The homepage keeps its compact right-hand match preview; clicking a job card opens the dedicated detail page.

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
