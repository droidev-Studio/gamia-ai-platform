import express from 'express';
import crypto from 'crypto';
import { chatGemini, hasGeminiConfig } from './src/providers/gemini.js';
import { chatQwen, hasQwenConfig } from './src/providers/qwen.js';
import { editAIDirectGameProject, generateAIDirectGameProject, normalizeModelJsonContent } from './src/generation/aiDirectGameProject.js';
import { createProjectId, listStoredProjects, readGeneratedFile, saveGeneratedProject } from './src/storage/generatedProjects.js';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND_SERVICE = 'droi-ai-direct-backend';
const GENERATION_MODE = 'ai_direct';
const BACKEND_CONTRACT_VERSION = 'ai-direct-v1';
const USER_SESSION_COOKIE = 'droi_user_session';
const USER_SESSION_TTL_MS = Number(process.env.USER_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 14);
const USER_OAUTH_STATE_TTL_MS = 1000 * 60 * 10;
const userSessions = new Map();
const userOAuthStates = new Map();
const OAUTH_STATE_VERSION = 'v1';

app.set('trust proxy', true);
app.use(express.json({ limit: process.env.JSON_LIMIT || '4mb' }));

function parseCorsOrigins() {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin = '') {
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch (error) {
    return false;
  }
}

function getUserGoogleConfig() {
  return {
    clientId: process.env.USER_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.USER_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.USER_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || ''
  };
}

function hasUserGoogleConfig() {
  const config = getUserGoogleConfig();
  return Boolean(config.clientId && config.clientSecret);
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index <= 0) return cookies;
      const key = decodeURIComponent(part.slice(0, index).trim());
      const value = decodeURIComponent(part.slice(index + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function cookieSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

function setUserSessionCookie(req, res, sessionId) {
  const secure = cookieSecure(req);
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${USER_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Max-Age=${Math.floor(USER_SESSION_TTL_MS / 1000)}`
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearUserSessionCookie(req, res) {
  const secure = cookieSecure(req);
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${USER_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getPublicBackendOrigin(req) {
  const configured = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function getUserGoogleRedirectUri(req) {
  const config = getUserGoogleConfig();
  return config.redirectUri || `${getPublicBackendOrigin(req)}/auth/user/google/callback`;
}

function oauthStateSecret() {
  return process.env.SESSION_SECRET
    || process.env.USER_AUTH_STATE_SECRET
    || process.env.CONFIG_ENCRYPTION_SECRET
    || process.env.USER_GOOGLE_CLIENT_SECRET
    || process.env.GOOGLE_CLIENT_SECRET
    || '';
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signOAuthStatePayload(payload) {
  const body = base64UrlJson(payload);
  const secret = oauthStateSecret();
  if (!secret) return '';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function createOAuthState(returnTo) {
  const payload = {
    v: OAUTH_STATE_VERSION,
    n: crypto.randomBytes(16).toString('base64url'),
    returnTo,
    exp: Date.now() + USER_OAUTH_STATE_TTL_MS
  };
  const signedState = signOAuthStatePayload(payload);
  if (signedState) return signedState;
  const state = crypto.randomBytes(24).toString('base64url');
  userOAuthStates.set(state, {
    returnTo,
    createdAt: Date.now(),
    expiresAt: Date.now() + USER_OAUTH_STATE_TTL_MS
  });
  return state;
}

function readOAuthState(state) {
  if (!state) return null;
  const legacyState = userOAuthStates.get(state);
  if (legacyState) {
    userOAuthStates.delete(state);
    return Date.now() <= legacyState.expiresAt ? legacyState : null;
  }

  const [body, signature] = String(state).split('.');
  const secret = oauthStateSecret();
  if (!body || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.v !== OAUTH_STATE_VERSION || !payload.returnTo || Date.now() > Number(payload.exp || 0)) return null;
    return {
      returnTo: String(payload.returnTo),
      createdAt: Number(payload.exp) - USER_OAUTH_STATE_TTL_MS,
      expiresAt: Number(payload.exp)
    };
  } catch (error) {
    return null;
  }
}

function allowedReturnOrigins(req) {
  const configured = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    process.env.USER_AUTH_RETURN_ORIGINS,
    process.env.CORS_ORIGINS
  ]
    .filter(Boolean)
    .flatMap(value => String(value).split(','))
    .map(value => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/+$/, '') : '';
  if (origin) configured.push(origin);
  return [...new Set(configured)];
}

function normalizeReturnTo(req, rawReturnTo = '') {
  const fallback = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '/';
  const value = String(rawReturnTo || '').trim();
  if (!value) return fallback;
  try {
    const url = new URL(value, getPublicBackendOrigin(req));
    if (url.origin === getPublicBackendOrigin(req)) return `${url.pathname}${url.search}${url.hash}`;
    const allowed = allowedReturnOrigins(req);
    if (allowed.includes(url.origin) || isLocalDevOrigin(url.origin)) return url.href;
  } catch (error) {
    // Fall through to safe relative handling.
  }
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

function getUserSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[USER_SESSION_COOKIE] || '';
  if (!sessionId) return null;
  const session = userSessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    userSessions.delete(sessionId);
    return null;
  }
  return { ...session, sessionId };
}

function userSessionPayload(req) {
  const session = getUserSession(req);
  const googleConfigured = hasUserGoogleConfig();
  const user = session ? session.user : null;
  return {
    ok: true,
    loggedIn: Boolean(user),
    authenticated: Boolean(user),
    user,
    email: user?.email || '',
    name: user?.name || '',
    picture: user?.picture || '',
    accountType: 'user',
    authConfigured: googleConfigured,
    googleConfigured,
    loginUrl: googleConfigured ? '/auth/user/google' : null,
    capabilities: {
      googleContact: Boolean(user?.email),
      crossDeviceSync: Boolean(user),
      paymentMethods: false
    },
    message: googleConfigured ? '' : 'Google user sign-in is not configured on this backend yet.'
  };
}

function createUserSession(req, res, user) {
  const sessionId = crypto.randomBytes(32).toString('base64url');
  userSessions.set(sessionId, {
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + USER_SESSION_TTL_MS
  });
  setUserSessionCookie(req, res, sessionId);
}

async function exchangeGoogleCode(req, code) {
  const config = getUserGoogleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getUserGoogleRedirectUri(req),
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.error || 'Google token exchange failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fetchGoogleUser(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.error || 'Google userinfo failed');
    error.status = response.status;
    throw error;
  }
  return {
    id: data.sub || '',
    email: data.email || '',
    emailVerified: Boolean(data.email_verified),
    name: data.name || data.email || '',
    picture: data.picture || '',
    provider: 'google'
  };
}

function applyCors(req, res, next) {
  const allowed = parseCorsOrigins();
  const origin = req.headers.origin;
  const allowAny = allowed.includes('*') || allowed.length === 0;
  if (origin && (allowAny || allowed.includes(origin) || isLocalDevOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin && allowAny) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

app.use(applyCors);

app.get('/', (req, res) => {
  const { models, defaultModel } = publicModels();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Droi AI Direct Backend</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #080a12; color: #eef6ff; font-family: Arial, sans-serif; }
    main { width: min(760px, calc(100vw - 40px)); border: 1px solid rgba(93, 214, 255, 0.32); border-radius: 8px; padding: 28px; background: rgba(12, 18, 34, 0.92); box-shadow: 0 20px 70px rgba(0,0,0,0.35); }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { color: #b8c7dc; line-height: 1.55; }
    code { color: #7de7ff; background: rgba(125,231,255,0.08); padding: 2px 6px; border-radius: 4px; }
    ul { padding-left: 20px; line-height: 1.8; }
    a { color: #7de7ff; }
  </style>
</head>
<body>
  <main>
    <h1>Droi AI Direct Backend</h1>
    <p>This Cloud Run service is healthy. It is an API backend for the Droi AI Direct frontend, not the frontend app itself.</p>
    <p><strong>Default model:</strong> ${defaultModel ? `${defaultModel.providerId} / ${defaultModel.modelId}` : 'none configured'}</p>
    <p><strong>Available models:</strong> ${models.length ? models.map(model => `${model.providerId}:${model.modelId}`).join(', ') : 'none configured'}</p>
    <ul>
      <li><a href="/api/ready"><code>GET /api/ready</code></a></li>
      <li><a href="/api/models"><code>GET /api/models</code></a></li>
      <li><code>POST /api/ai/generate-game-project</code></li>
      <li><code>POST /api/ai/edit-game-project</code></li>
      <li><code>GET /generated/:projectId/index.html</code></li>
    </ul>
  </main>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

function publicModels() {
  const models = [];
  if (hasGeminiConfig()) {
    const geminiDefault = process.env.GEMINI_DEFAULT_MODEL || process.env.DEFAULT_MODEL || 'gemini-3.5-flash';
    models.push({
      providerId: 'gemini',
      provider: 'gemini',
      modelId: geminiDefault,
      id: geminiDefault,
      label: process.env.GEMINI_DEFAULT_LABEL || 'Gemini 3.5 Flash',
      enabled: true,
      default: process.env.DEFAULT_PROVIDER !== 'qwen'
    });
    const extra = String(process.env.GEMINI_MODELS || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    for (const modelId of extra) {
      if (!models.some(model => model.providerId === 'gemini' && model.modelId === modelId)) {
        models.push({
          providerId: 'gemini',
          provider: 'gemini',
          modelId,
          id: modelId,
          label: modelId,
          enabled: true
        });
      }
    }
  }
  if (hasQwenConfig()) {
    const qwenDefault = process.env.QWEN_DEFAULT_MODEL || 'qwen-plus';
    models.push({
      providerId: 'qwen',
      provider: 'qwen',
      modelId: qwenDefault,
      id: qwenDefault,
      label: process.env.QWEN_DEFAULT_LABEL || 'Qwen Plus',
      enabled: true,
      default: process.env.DEFAULT_PROVIDER === 'qwen' || !hasGeminiConfig()
    });
    const extra = String(process.env.QWEN_MODELS || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    for (const modelId of extra) {
      if (!models.some(model => model.providerId === 'qwen' && model.modelId === modelId)) {
        models.push({
          providerId: 'qwen',
          provider: 'qwen',
          modelId,
          id: modelId,
          label: modelId,
          enabled: true
        });
      }
    }
  }
  const defaultModel = models.find(model => model.default) || models[0] || null;
  return {
    models: models.map(model => ({
      ...model,
      default: defaultModel ? model.providerId === defaultModel.providerId && model.modelId === defaultModel.modelId : false
    })),
    defaultModel
  };
}

function resolveModel(requestBody = {}) {
  const available = publicModels();
  if (!available.models.length) {
    const error = new Error('No backend model provider is configured.');
    error.code = 'MODEL_NOT_CONFIGURED';
    throw error;
  }

  const requestedProvider = requestBody.provider || requestBody.providerId || '';
  const requestedModel = requestBody.model || requestBody.modelId || '';
  if (!requestedProvider && !requestedModel) return available.defaultModel;

  const exact = available.models.find(model =>
    (!requestedProvider || model.providerId === requestedProvider) &&
    (!requestedModel || model.modelId === requestedModel)
  );
  if (exact) return exact;

  const error = new Error(`Requested model is not configured: ${requestedProvider || '(any provider)'}/${requestedModel || '(any model)'}.`);
  error.code = 'MODEL_SELECTION_UNAVAILABLE';
  error.requestedProvider = requestedProvider;
  error.requestedModel = requestedModel;
  error.availableModels = available.models.map(model => `${model.providerId}:${model.modelId}`);
  throw error;
}

function summarizeModelError(error) {
  return {
    code: error?.code || '',
    status: error?.status || 0,
    message: error?.message || String(error || 'Unknown model error')
  };
}

function createModelMeta(selected, fallbackChain = []) {
  return {
    providerId: selected.providerId,
    modelId: selected.modelId,
    label: selected.label || selected.modelId,
    fallbackChain
  };
}

function modelCandidates(requestBody = {}, options = {}) {
  const available = publicModels();
  if (!available.models.length) {
    const error = new Error('No backend model provider is configured.');
    error.code = 'MODEL_NOT_CONFIGURED';
    throw error;
  }

  const requestedProvider = options.provider || requestBody.provider || requestBody.providerId || '';
  const requestedModel = options.model || requestBody.model || requestBody.modelId || '';
  const candidates = [];

  if (requestedProvider || requestedModel) {
    const exact = available.models.find(model =>
      (!requestedProvider || model.providerId === requestedProvider) &&
      (!requestedModel || model.modelId === requestedModel)
    );
    if (exact) candidates.push(exact);
  }

  const preferredDefault = !candidates.length && available.defaultModel ? available.defaultModel : null;
  if (preferredDefault) candidates.push(preferredDefault);

  for (const model of available.models) {
    if (!candidates.some(candidate => candidate.providerId === model.providerId && candidate.modelId === model.modelId)) {
      candidates.push(model);
    }
  }

  return {
    requested: {
      providerId: requestedProvider,
      modelId: requestedModel
    },
    candidates
  };
}

async function callConcreteModel(selected, messages, options = {}) {
  const provider = selected.providerId;
  const model = selected.modelId;
  const callOptions = {
    ...options,
    model
  };

  const result = provider === 'qwen'
    ? await chatQwen(messages, callOptions)
    : await chatGemini(messages, callOptions);

  return {
    ...result,
    providerId: provider,
    model,
    modelMeta: createModelMeta(selected)
  };
}

async function withModelFallback(requestBody = {}, options = {}, operation) {
  const { requested, candidates } = modelCandidates(requestBody, options);
  const attempts = [];

  for (const selected of candidates) {
    try {
      const result = await operation(selected, attempts);
      const fallbackChain = attempts.map(attempt => ({
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        ok: false,
        error: attempt.error
      }));
      const successMeta = createModelMeta(selected, [
        ...fallbackChain,
        {
          providerId: selected.providerId,
          modelId: selected.modelId,
          ok: true
        }
      ]);
      return {
        ...result,
        providerId: selected.providerId,
        model: selected.modelId,
        modelMeta: {
          ...(result.modelMeta || successMeta),
          providerId: selected.providerId,
          modelId: selected.modelId,
          label: selected.label || selected.modelId,
          requestedProviderId: requested.providerId,
          requestedModelId: requested.modelId,
          fallbackUsed: attempts.length > 0,
          fallbackChain: successMeta.fallbackChain
        }
      };
    } catch (error) {
      attempts.push({
        providerId: selected.providerId,
        modelId: selected.modelId,
        error: summarizeModelError(error)
      });
    }
  }

  const error = new Error('Every configured model failed for this AI request.');
  error.code = 'MODEL_FALLBACK_EXHAUSTED';
  error.technicalMessage = attempts.map(attempt => `${attempt.providerId}/${attempt.modelId}: ${attempt.error.message}`).join('\n');
  error.fallbackChain = attempts;
  throw error;
}

async function callSelectedModel(messages, options = {}, requestBody = {}) {
  return withModelFallback(requestBody, options, selected => callConcreteModel(selected, messages, options));
}

async function callJsonModel(messages, options = {}, requestBody = {}, phase = 'AI generation') {
  return withModelFallback(requestBody, options, async selected => {
    const result = await callConcreteModel(selected, messages, options);
    return {
      ...result,
      content: normalizeModelJsonContent(result.content, phase)
    };
  });
}

function errorCategory(code) {
  if (code === 'MODEL_NOT_CONFIGURED' || code === 'MODEL_SELECTION_UNAVAILABLE' || code === 'MODEL_AUTH_FAILED') return 'model_config_failure';
  if (code === 'MODEL_FALLBACK_EXHAUSTED') return 'recoverable_model_failure';
  if (code === 'MODEL_TIMEOUT' || code === 'MODEL_RATE_LIMITED' || code === 'MODEL_NETWORK_ERROR') return 'recoverable_model_failure';
  if (code === 'MODEL_SCHEMA_INVALID' || code === 'AI_DIRECT_HTML_MISSING' || code === 'AI_DIRECT_VALIDATION_FAILED') return 'schema_failure';
  return 'recoverable_model_failure';
}

function classifyError(error, phase = 'AI generation') {
  const message = error?.message || String(error || 'Unknown error');
  const lower = message.toLowerCase();
  let code = error?.code || 'MODEL_CALL_FAILED';
  if (!error?.code) {
    if (/timeout|timed out|abort/i.test(message)) code = 'MODEL_TIMEOUT';
    else if (/api key|auth|unauthorized|forbidden|permission/i.test(message)) code = 'MODEL_AUTH_FAILED';
    else if (/rate limit|quota|429/i.test(message)) code = 'MODEL_RATE_LIMITED';
    else if (/json|schema|parse/i.test(message)) code = 'MODEL_SCHEMA_INVALID';
    else if (error?.status >= 500 || /network|fetch failed|econn|dns|502|503/i.test(lower)) code = 'MODEL_NETWORK_ERROR';
  }
  const titles = {
    MODEL_NOT_CONFIGURED: 'Current model is not configured',
    MODEL_SELECTION_UNAVAILABLE: 'Requested model is not configured',
    MODEL_AUTH_FAILED: 'Current model is not available',
    MODEL_TIMEOUT: 'Current model timed out',
    MODEL_RATE_LIMITED: 'Current model is rate limited',
    MODEL_FALLBACK_EXHAUSTED: 'All configured models failed',
    MODEL_SCHEMA_INVALID: 'AI response format is invalid',
    AI_DIRECT_HTML_MISSING: 'AI direct HTML is missing',
    AI_DIRECT_VALIDATION_FAILED: 'AI direct validation failed'
  };
  const messages = {
    MODEL_NOT_CONFIGURED: 'The backend has no usable model provider configured. This is a generation service issue, not a game type limitation.',
    MODEL_SELECTION_UNAVAILABLE: 'The requested model is not listed in the configured backend model registry.',
    MODEL_AUTH_FAILED: 'The selected backend model cannot be used. Check API key, model access, or provider settings.',
    MODEL_TIMEOUT: 'The selected model did not finish in time. Retry or switch model.',
    MODEL_RATE_LIMITED: 'The selected model is rate limited or out of quota. Retry later or switch model.',
    MODEL_FALLBACK_EXHAUSTED: 'The selected model failed and every configured fallback model also failed. No generated result was created.',
    MODEL_SCHEMA_INVALID: 'The model response could not be parsed as the required JSON schema.',
    AI_DIRECT_HTML_MISSING: 'The model did not return a runnable HTML entry. This is a result validation issue, not a game type limitation.',
    AI_DIRECT_VALIDATION_FAILED: 'The generated result failed browser-game validation. This is a result validation issue, not a game type limitation.'
  };
  return {
    code,
    category: errorCategory(code),
    title: titles[code] || `${phase} failed`,
    message: messages[code] || message,
    technicalMessage: error?.technicalMessage || message,
    actions: ['retry', 'switch_model', 'manual_queue'],
    fallbackChain: error?.fallbackChain || undefined,
    requestedProvider: error?.requestedProvider || undefined,
    requestedModel: error?.requestedModel || undefined,
    availableModels: error?.availableModels || undefined,
    validationReport: error?.validationReport || undefined
  };
}

function sendError(res, error, phase = 'AI generation') {
  const classified = classifyError(error, phase);
  const status = classified.code === 'MODEL_NOT_CONFIGURED' ? 503
    : classified.code === 'MODEL_AUTH_FAILED' ? 401
      : classified.code === 'MODEL_RATE_LIMITED' ? 429
        : classified.category === 'schema_failure' ? 422
          : 500;
  res.status(status).json({
    ok: false,
    error: classified,
    validationReport: classified.validationReport
  });
}

function attachProjectModelMeta(project, modelMeta) {
  if (!project || !modelMeta) return project;
  project.modelMeta = modelMeta;
  if (project.generationReport && typeof project.generationReport === 'object') {
    project.generationReport.modelMeta = modelMeta;
  }
  if (Array.isArray(project.codeFiles)) {
    const reportFile = project.codeFiles.find(file => file.path === 'generation-report.json');
    if (reportFile && project.generationReport) {
      reportFile.content = JSON.stringify(project.generationReport, null, 2);
    }
  }
  return project;
}

app.get('/api/ready', (req, res) => {
  const { models, defaultModel } = publicModels();
  res.json({
    ok: true,
    service: BACKEND_SERVICE,
    generationMode: GENERATION_MODE,
    backendContractVersion: BACKEND_CONTRACT_VERSION,
    frontendContractVersion: BACKEND_CONTRACT_VERSION,
    storage: 'local-tmp-memory-index',
    models: models.map(model => `${model.providerId}:${model.modelId}`),
    defaultModel: defaultModel ? {
      providerId: defaultModel.providerId,
      modelId: defaultModel.modelId
    } : null,
    storedProjects: listStoredProjects().length
  });
});

app.get('/api/models', (req, res) => {
  const { models, defaultModel } = publicModels();
  res.json({
    ok: true,
    models,
    defaultProvider: defaultModel?.providerId || '',
    defaultModel: defaultModel?.modelId || ''
  });
});

app.get('/api/session', (req, res) => {
  res.json({
    loggedIn: false,
    email: '',
    isAdmin: false,
    accountType: 'admin_config',
    googleConfigured: false
  });
});

app.get('/api/user/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(userSessionPayload(req));
});

app.get('/auth/user/google', (req, res) => {
  const config = getUserGoogleConfig();
  if (!hasUserGoogleConfig()) {
    res.status(501).json({
      ok: false,
      error: 'USER_AUTH_NOT_CONFIGURED',
      accountType: 'user',
      message: 'Google user sign-in is not configured on this backend yet.'
    });
    return;
  }

  const returnTo = normalizeReturnTo(req, req.query.returnTo);
  const state = createOAuthState(returnTo);
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', getUserGoogleRedirectUri(req));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'select_account');
  res.redirect(authUrl.toString());
});

app.get('/auth/user/google/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const oauthState = readOAuthState(state);
  if (!oauthState || Date.now() > oauthState.expiresAt) {
    res.status(400).send('Google sign-in expired. Please return to Gamia and try again.');
    return;
  }
  if (!code) {
    res.redirect(oauthState.returnTo);
    return;
  }
  try {
    const token = await exchangeGoogleCode(req, code);
    const user = await fetchGoogleUser(token.access_token);
    if (!user.email) throw new Error('Google account did not return an email address.');
    createUserSession(req, res, user);
    res.redirect(oauthState.returnTo);
  } catch (error) {
    const url = new URL(oauthState.returnTo, getPublicBackendOrigin(req));
    url.searchParams.set('authError', 'google_sign_in_failed');
    res.redirect(url.toString());
  }
});

app.post('/auth/user/logout', (req, res) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[USER_SESSION_COOKIE] || '';
  if (sessionId) userSessions.delete(sessionId);
  clearUserSessionCookie(req, res);
  res.json({ ok: true, loggedIn: false, accountType: 'user' });
});

app.get('/api/user/payment-methods', (req, res) => {
  res.status(501).json({
    ok: false,
    error: 'PAYMENTS_NOT_CONFIGURED',
    accountType: 'user',
    paymentProvider: null,
    message: 'User payment methods are not configured on this backend yet.'
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const result = await callSelectedModel(messages, {
      provider: req.body.provider,
      model: req.body.model || req.body.modelId,
      maxTokens: req.body.maxTokens || 8192,
      timeoutMs: Number(req.body.timeoutMs || process.env.MODEL_REQUEST_TIMEOUT_MS || 60000)
    }, req.body);
    res.json({
      ok: true,
      content: result.content,
      usage: result.usage || {},
      provider: result.providerId,
      model: result.model,
      modelMeta: result.modelMeta
    });
  } catch (error) {
    sendError(res, error, 'Model call');
  }
});

app.post('/api/ai/analyze-game-request', async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const result = await callJsonModel(messages, {
      provider: req.body.provider,
      model: req.body.model || req.body.modelId,
      maxTokens: req.body.maxTokens || 4096,
      timeoutMs: Number(process.env.ANALYSIS_TIMEOUT_MS || 45000),
      responseMimeType: 'application/json'
    }, req.body, 'Game request analysis');
    res.json({
      ok: true,
      content: result.content,
      usage: result.usage || {},
      provider: result.providerId,
      model: result.model,
      modelMeta: result.modelMeta
    });
  } catch (error) {
    sendError(res, error, 'Game request analysis');
  }
});

app.post('/api/ai/generate-game-plan', async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const result = await callJsonModel(messages, {
      provider: req.body.provider,
      model: req.body.model || req.body.modelId,
      maxTokens: req.body.maxTokens || 4096,
      timeoutMs: Number(process.env.PLAN_TIMEOUT_MS || 60000),
      responseMimeType: 'application/json'
    }, req.body, 'Game plan summary');
    res.json({
      ok: true,
      content: result.content,
      usage: result.usage || {},
      provider: result.providerId,
      model: result.model,
      modelMeta: result.modelMeta
    });
  } catch (error) {
    sendError(res, error, 'Game plan summary');
  }
});

app.post('/api/ai/generate-game-project', async (req, res) => {
  try {
    const result = await withModelFallback(req.body, {
      provider: req.body.provider,
      model: req.body.model || req.body.modelId
    }, async (selected, attempts) => {
      const modelMeta = createModelMeta(selected, attempts.map(attempt => ({
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        ok: false,
        error: attempt.error
      })));
      const project = await generateAIDirectGameProject({
        requestBody: req.body,
        modelMeta,
        callModel: (messages, options) => callConcreteModel(selected, messages, options)
      });
      return {
        project,
        modelMeta: project.modelMeta || modelMeta
      };
    });
    const project = result.project;
    const modelMeta = {
      ...(project.modelMeta || result.modelMeta),
      ...result.modelMeta
    };
    attachProjectModelMeta(project, modelMeta);

    const projectId = createProjectId();
    await saveGeneratedProject(projectId, project.codeFiles);
    res.json({
      ok: true,
      generationMode: 'ai_direct',
      projectId,
      previewUrl: `/generated/${projectId}/index.html`,
      codeFiles: project.codeFiles,
      generationReport: project.generationReport,
      validationReport: project.validationReport,
      modelMeta: {
        ...modelMeta,
        usage: project.usage || {}
      }
    });
  } catch (error) {
    sendError(res, error, 'AI direct game generation');
  }
});

app.post('/api/ai/edit-game-project', async (req, res) => {
  try {
    const result = await withModelFallback(req.body, {
      provider: req.body.provider,
      model: req.body.model || req.body.modelId
    }, async (selected, attempts) => {
      const modelMeta = createModelMeta(selected, attempts.map(attempt => ({
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        ok: false,
        error: attempt.error
      })));
      const project = await editAIDirectGameProject({
        requestBody: req.body,
        modelMeta,
        callModel: (messages, options) => callConcreteModel(selected, messages, options)
      });
      return {
        project,
        modelMeta: project.modelMeta || modelMeta
      };
    });
    const project = result.project;
    const modelMeta = {
      ...(project.modelMeta || result.modelMeta),
      ...result.modelMeta
    };
    attachProjectModelMeta(project, modelMeta);

    const projectId = createProjectId();
    await saveGeneratedProject(projectId, project.codeFiles);
    res.json({
      ok: true,
      generationMode: 'ai_direct_edit',
      projectId,
      previewUrl: `/generated/${projectId}/index.html`,
      codeFiles: project.codeFiles,
      generationReport: project.generationReport,
      validationReport: project.validationReport,
      modelMeta: {
        ...modelMeta,
        usage: project.usage || {}
      }
    });
  } catch (error) {
    sendError(res, error, 'AI direct game edit');
  }
});

app.get('/generated/:projectId/index.html', async (req, res) => {
  const file = await readGeneratedFile(req.params.projectId, 'index.html');
  if (!file) {
    res.status(404).send('Generated project not found');
    return;
  }
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.content);
});

app.get('/generated/:projectId/:file', async (req, res) => {
  const file = await readGeneratedFile(req.params.projectId, req.params.file);
  if (!file) {
    res.status(404).send('Generated file not found');
    return;
  }
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.content);
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      category: 'generation_service_failure',
      title: 'Endpoint not found',
      message: `${req.method} ${req.path} is not implemented by the AI Direct backend.`,
      technicalMessage: req.path,
      actions: ['retry', 'manual_queue']
    }
  });
});

app.listen(PORT, HOST, () => {
  const { models, defaultModel } = publicModels();
  console.log(`Droi AI Direct backend listening on http://${HOST}:${PORT}`);
  console.log(`Models: ${models.map(model => `${model.providerId}:${model.modelId}`).join(', ') || '(none configured)'}`);
  console.log(`Default model: ${defaultModel ? `${defaultModel.providerId}:${defaultModel.modelId}` : '(none)'}`);
});
