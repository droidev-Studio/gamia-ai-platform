# Droi AI Direct Demo Backend

Node.js + Express backend for the AI Direct frontend demo in this repository.

## Scope

This service is intentionally separate from the original Droi backend. It is a demo/UAT backend for the copied AI Direct frontend only.

- It does not replace the original backend.
- It does not modify the original backend logic.
- It does not implement the original template registry, art skill registry, template patching, or compile endpoints.
- It only implements the API surface needed by this frontend copy to validate direct HTML5 Canvas generation.

It provides the API contract required by the frontend:

- `GET /api/ready`
- `GET /api/models`
- `POST /api/chat`
- `POST /api/ai/analyze-game-request`
- `POST /api/ai/generate-game-plan`
- `POST /api/ai/generate-game-project`
- `POST /api/ai/edit-game-project`
- `GET /generated/:projectId/index.html`
- `GET /generated/:projectId/:file`

This backend does not implement template registry, template patching, art skills, or compile endpoints.

## Local Setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Set at least one provider key:

```env
GEMINI_API_KEY=...
QWEN_API_KEY=...
DEFAULT_PROVIDER=gemini
DEFAULT_MODEL=gemini-3.5-flash
CORS_ORIGINS=http://127.0.0.1:5531,http://127.0.0.1:5530
FRONTEND_URL=http://127.0.0.1:5530
PUBLIC_BACKEND_URL=http://127.0.0.1:8080
USER_GOOGLE_CLIENT_ID=...
USER_GOOGLE_CLIENT_SECRET=...
USER_GOOGLE_REDIRECT_URI=http://127.0.0.1:8080/auth/user/google/callback
```

For Google user sign-in, add the same `USER_GOOGLE_REDIRECT_URI` to the Google OAuth Client's Authorized redirect URIs. In Cloud Run this is normally:

```text
https://YOUR-BACKEND-SERVICE.run.app/auth/user/google/callback
```

The public frontend Sign in button uses `/api/user/session` and `/auth/user/google`. Admin AI Config remains separate and must not be wired to the public user account button.

Smoke checks:

```bash
curl http://127.0.0.1:8080/api/ready
curl http://127.0.0.1:8080/api/models
```

Point only this copied frontend to this backend:

```json
{
  "apiBaseUrl": "http://127.0.0.1:8080"
}
```

If you use `dev-proxy.cjs`, the frontend can stay same-origin while the proxy forwards `/api/*` and `/generated/*`.

## Cloud Run UAT Deploy

The first implementation stores generated projects in the instance temp directory and an in-memory index. For UAT, deploy with one instance so iframe requests hit the same service instance:

Use a distinct service name such as `droi-ai-direct-backend` so it remains separate from the original backend service.

```bash
gcloud run deploy droi-ai-direct-backend \
  --source backend \
  --project project-f8821341-0c82-4e11-bcb \
  --region europe-west3 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 10 \
  --max-instances 1 \
  --set-env-vars DEFAULT_PROVIDER=gemini,DEFAULT_MODEL=gemini-3.5-flash,GAME_GENERATION_TIMEOUT_MS=240000,CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN,FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN,PUBLIC_BACKEND_URL=https://YOUR-BACKEND-SERVICE.run.app,USER_GOOGLE_REDIRECT_URI=https://YOUR-BACKEND-SERVICE.run.app/auth/user/google/callback
```

Set API keys with Secret Manager or Cloud Run environment variables. Do not put keys in `droi-config.json` or generated files.

## Future Storage Upgrade

For a more durable multi-instance demo or a future productionized variant, move `src/storage/generatedProjects.js` to Cloud Storage:

- upload `index.html` and `generation-report.json`
- return `/generated/:projectId/index.html` through this service, or signed/public GCS URLs
- remove `--max-instances=1`

## Validation

`POST /api/ai/generate-game-project` rejects generated output when:

- no HTML document is returned
- no `<canvas>` exists
- no inline gameplay `<script>` exists
- remote dependencies or network calls are present
- basic HUD and game state signals are missing

Failures return structured errors such as `MODEL_NOT_CONFIGURED`, `MODEL_TIMEOUT`, `MODEL_SCHEMA_INVALID`, `AI_DIRECT_HTML_MISSING`, and `AI_DIRECT_VALIDATION_FAILED`.

`POST /api/ai/edit-game-project` accepts the current generated files plus an edit prompt, regenerates a playable edited `index.html`, validates it with the same checks, stores it as a new generated project, and returns a fresh `/generated/.../index.html` preview URL.
