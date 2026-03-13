# Telegram Relay

Small Fastify service that receives an image and target chat id from `apps/server`, sends it to Telegram with the same `SCHED_BOT_TOKEN`, and returns `fileId` for reuse.

## Endpoints

- `GET /healthz`
- `POST /send/file` (multipart: `target`, `image`)
- `POST /send/base64` (json: `target`, `data`, `mimeType`, `filename?`)
- `POST /send/url` (json: `target`, `url`)

All `/send/*` endpoints require the `X-Relay-Key` header.

## Environment

Use `.env.example` as the template.

- `SCHED_BOT_TOKEN`: Telegram bot token
- `RELAY_KEY`: shared secret expected in `X-Relay-Key`
- `RELAY_HOST`, `RELAY_PORT`: bind address
- `RELAY_MAX_FILE_SIZE_BYTES`: upload limit
- `RELAY_REQUEST_TIMEOUT_MS`: timeout for Telegram and URL checks

## Run

```sh
bun --filter @ssau-schedule/telegram-relay dev
```

## Build

```sh
bun --filter @ssau-schedule/telegram-relay build
```

## Vercel

The app is prepared for Vercel serverless runtime via `api/[...path].ts`.

- `vercel.json` rewrites keep local-style endpoints:
  - `/healthz` -> `/api/healthz`
  - `/send/*` -> `/api/send/*`
- Relay route paths remain unchanged from local runtime.

Deploy from `apps/telegram-relay` and configure these Vercel environment variables:

- `SCHED_BOT_TOKEN`
- `RELAY_KEY`
- `RELAY_MAX_FILE_SIZE_BYTES`
- `RELAY_REQUEST_TIMEOUT_MS`
- `LOG_LEVEL`
- `NODE_ENV=production`

After deploy, set `SCHED_BOT_IMAGE_RELAY_URL` in `apps/server` to your Vercel domain, for example:

```dotenv
SCHED_BOT_IMAGE_RELAY_URL=https://your-relay-app.vercel.app
```
