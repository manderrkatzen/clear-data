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

Storage belongs to each browser/site origin and is not cloud-synchronized. Local development and the deployed Worker hostname have different libraries. Downloaded JSON project backups can be imported on another origin. Storage failures are surfaced in the UI; backup export remains independent of IndexedDB. Project/rule JSON uploads into the browser are limited to 50 MiB.

## One permanent Cloudflare URL; versions preserved in Git

The permanent application URL is:

**https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev**

Every release and rollback targets this same Worker and URL. Never rename `clearview-data-quality-copilot`, create a separate hosted version, or enable version-preview URLs as the default release workflow. Keep `workers_dev: true` and `preview_urls: false` in the deployment configuration.

The analytics review release is saved on `feature/analytics-review-workspace`. The previous Git version remains on `main` at `4f138c42b497dda58a97e3b15d8fc931a719db66`, also preserved by the annotated tag `baseline-before-analytics-review-2026-10-03`. These source versions remain available in Git; only the selected release is served by the permanent application URL.

To deploy the latest release from the feature branch to the original URL:

```bash
git switch feature/analytics-review-workspace
node --test scripts/verify_quality.cjs
npx wrangler deploy --keep-vars
```

`--keep-vars` preserves variables configured through the Cloudflare dashboard; deployment secrets remain server-side. The deployment updates production traffic on the existing Worker. It does not create a second public application URL.

GitHub and Cloudflare are separate release steps: pushing the branch saves source code on GitHub; deploying selects the code/assets served at the permanent URL. Switching a local Git branch alone does not change the live application. An existing Git-connected Cloudflare build may also deploy its configured production branch; any such build must target this same Worker and fixed URL.

To inspect the old code locally, use `git switch main`. To return to the latest feature code, use `git switch feature/analytics-review-workspace`. Save or commit new work before switching if Git reports conflicting changes; do not use a hard reset to switch versions.

### Roll back from a saved Git version

Create a rollback branch from the saved baseline:

```bash
git switch -c rollback/previous-release baseline-before-analytics-review-2026-10-03
```

Before deploying that older source, make sure its `wrangler.jsonc` retains the original Worker name and explicitly has `workers_dev: true` and `preview_urls: false` (older commits predate those explicit settings). Commit that deployment configuration on the rollback branch, then run:

```bash
npx wrangler deploy --keep-vars
```

This redeploys the saved Git version at the same permanent URL while preserving the latest feature branch. A subsequent deployment from `feature/analytics-review-workspace` switches that URL back to the latest release.

For an immediate Cloudflare-version rollback, the original deployment before the analytics release was version `28122d2a-f7aa-4a64-b0ea-a1261ecffae5`:

```bash
npx wrangler rollback 28122d2a-f7aa-4a64-b0ea-a1261ecffae5
```

Both rollback methods change which version is served at the original URL; neither requires deleting Git history or hosting two public copies.
