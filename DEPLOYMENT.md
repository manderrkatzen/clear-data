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
