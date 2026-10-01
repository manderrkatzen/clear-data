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

The server enforces a per-IP hourly proposal limit, a 64 KB request cap, a 300-character instruction limit, a 45-second provider timeout, and operation/column validation. Add authentication and durable rate limiting before public traffic exceeds a small demo audience.

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
