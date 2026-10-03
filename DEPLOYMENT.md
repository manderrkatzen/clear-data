# AI Deployment

The browser calls only `POST /api/ai/proposals`. It never receives an AI provider key or selects the provider mode.

## Local development

Use the defaults in `.env.example`: `AI_MODE=local` sends structured, bounded requests to Ollama.

## Public deployment

Set these as encrypted environment secrets in the hosting provider. Do not put them in client-side code, committed files, browser storage, or public configuration.

```text
AI_MODE=deployed
OPENAI_API_KEY=your_server_secret
OPENAI_MODEL=gpt-4.1-mini
AI_MAX_REQUESTS_PER_HOUR=10
```

All proposal runtimes share `src/ai.cjs`: a 64 KiB UTF-8 request cap, a 300-character instruction limit, a 45-second provider timeout, operation/column/category-source validation, and JSON response extraction. A process/isolate-local per-IP hourly limiter defaults to 10 structurally valid proposal attempts and reads `AI_MAX_REQUESTS_PER_HOUR`. Its state resets on process restart or isolate replacement and is not a durable distributed quota.

`GET /api/ai/status` reports provider configuration and `healthChecked: false`; it does not call the provider. `GET /api/ai/proposals` supplies the optional Turnstile site key. Local Node defaults to Ollama; Workers and Pages use OpenAI. The local server serves only the explicit browser asset set.

## Cloudflare Workers

`wrangler.jsonc` deploys `src/worker.js` alongside only the browser assets listed in `.assetsignore`, and sends `/api/*` requests to the Worker. Add `OPENAI_API_KEY` as a Worker runtime **Secret** after the first script deployment:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Set `OPENAI_MODEL` and `TURNSTILE_SITE_KEY` as optional Worker runtime variables. Do not use build variables for these runtime values, and never commit `.dev.vars`.

For public traffic, create a free Cloudflare Turnstile widget and set:

```text
TURNSTILE_SITE_KEY=public widget site key
TURNSTILE_SECRET_KEY=encrypted widget secret
```

When `TURNSTILE_SECRET_KEY` is set, the AI endpoint rejects requests that do not include a valid Turnstile token. The widget is only requested when a user asks AI for an alternative fix.

## Browser-local projects and review rules

Saved projects and rule libraries use IndexedDB on the frontend. Reports, logs, project backups, and rule files are generated/downloaded in the browser. No D1, R2, KV, login service, or additional API route is required for these capabilities. `.assetsignore` includes `workspace.js` and `workspace.css` so they are delivered by the Worker asset binding.

Storage belongs to each browser/site origin and is not cloud-synchronized. A preview hostname and the deployed Worker hostname have different libraries. Downloaded JSON project backups can be imported on another origin. Storage failures are surfaced in the UI; backup export remains independent of IndexedDB. Project/rule JSON uploads into the browser are limited to 50 MiB.

## Feature branch preview and preserved baseline

The analytics review release is developed on `feature/analytics-review-workspace`. The original Git version remains on `main` at `4f138c42b497dda58a97e3b15d8fc931a719db66` and is also named by the annotated tag `baseline-before-analytics-review-2026-10-03`.

At the start of preview setup, the production Worker served version `28122d2a-f7aa-4a64-b0ea-a1261ecffae5` at 100% traffic. Its browser application matched that Git baseline. Publishing the feature version as a **version preview** does not move production traffic to it.

To publish or update the feature preview from the feature branch:

```bash
git switch feature/analytics-review-workspace
node --test scripts/verify_quality.cjs
npx wrangler versions upload --keep-vars --preview-alias analytics-review --tag analytics-review --message "Analytics review feature branch preview"
```

Use the Preview URL printed by Wrangler. `--keep-vars` preserves variables configured through the Cloudflare dashboard; deployment secrets remain server-side. The preview uses the existing Worker's runtime secrets. If Turnstile is enabled later, its allowed-hostname configuration must also cover the preview hostname.

GitHub and Cloudflare are separate release steps: pushing this branch saves its source code on GitHub; the command above publishes its current code/assets to the Cloudflare preview. Future branch pushes do not automatically update this preview unless a separate preview-build integration is configured. Updating the preview alias gives the same testing address a new version; version-specific URLs also identify individual uploaded versions.

To inspect the old code locally, use `git switch main`. To return to the latest feature code, use `git switch feature/analytics-review-workspace`. Git switching changes the local checkout, not Cloudflare's live deployment. Save or commit any new work before switching if Git reports conflicting changes; do not use a hard reset to switch versions.

The existing production URL remains available while testing. If this feature version is promoted to production in the future, the recorded baseline Worker version provides a Cloudflare rollback target:

```bash
npx wrangler rollback 28122d2a-f7aa-4a64-b0ea-a1261ecffae5
```

Promotion/rollback changes production traffic and should be performed as a separate release decision. Version previews do not merge the feature branch into `main`.
