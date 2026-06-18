const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || process.env.FRONTEND_PORT || 5530);
const HOST = process.env.HOST || '127.0.0.1';
const CONFIG_PATH = path.join(ROOT, 'droi-config.json');
const FRONTEND_APP_ID = 'droi-ai-direct-frontend';
const FRONTEND_CONTRACT_VERSION = 'ai-direct-v1';
const REQUIRED_BACKEND_SERVICE = 'droi-ai-direct-backend';
const REQUIRED_GENERATION_MODE = 'ai_direct';

function readBackendUrl() {
    const explicit = process.env.DROI_BACKEND_URL || process.env.DROI_API_BASE || '';
    if (explicit) return explicit.replace(/\/+$/, '');
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        return String(config.apiBaseUrl || config.apiBase || config.backendUrl || '').replace(/\/+$/, '');
    } catch (error) {
        return '';
    }
}

const BACKEND_URL = readBackendUrl();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function isBlockedStaticPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    const segments = normalized.split('/').filter(Boolean);
    if (segments.some(segment => segment === '.env' || segment.startsWith('.env.'))) return true;
    if (segments.some(segment => segment.startsWith('.git'))) return true;
    if (segments[0] === 'backend') return true;
    if (segments[0] === 'knowledge-base-private') return true;
    if (segments[0] === 'product-rules-internal') return true;
    if (segments.includes('api-keys')) return true;
    return /(^|\/)[^/]*(secret|credential|api-key)[^/]*($|\/)/i.test(normalized);
}

function sendJson(res, status, data) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function sendStatic(req, res) {
    const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    if (requestUrl.pathname === '/droi-config.json') {
        const requestHost = req.headers.host || `${HOST}:${PORT}`;
        const requestOrigin = `http://${requestHost}`;
        sendJson(res, 200, {
            appId: FRONTEND_APP_ID,
            frontendContractVersion: FRONTEND_CONTRACT_VERSION,
            requiredBackendService: REQUIRED_BACKEND_SERVICE,
            requiredGenerationMode: REQUIRED_GENERATION_MODE,
            apiBaseUrl: requestOrigin,
            backendTarget: BACKEND_URL
        });
        return;
    }

    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    if (isBlockedStaticPath(relativePath)) {
        res.writeHead(403, { 'Cache-Control': 'no-store' });
        res.end('Forbidden');
        return;
    }

    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(content);
    });
}

async function proxyToBackend(req, res) {
    if (!BACKEND_URL) {
        sendJson(res, 502, {
            ok: false,
            error: 'DROI_BACKEND_URL is not configured and droi-config.json has no apiBaseUrl.'
        });
        return;
    }

    const target = new URL(req.url, BACKEND_URL);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = {};
    ['content-type', 'authorization', 'cookie', 'accept'].forEach(key => {
        if (req.headers[key]) headers[key] = req.headers[key];
    });

    try {
        const response = await fetch(target, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            redirect: 'manual'
        });
        const responseBody = Buffer.from(await response.arrayBuffer());
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
                responseHeaders[key] = value;
            }
        });
        responseHeaders['cache-control'] = 'no-store';
        res.writeHead(response.status, responseHeaders);
        res.end(responseBody);
    } catch (error) {
        sendJson(res, 502, {
            ok: false,
            error: error.message || String(error),
            cause: error.cause && (error.cause.message || String(error.cause)),
            target: target.href
        });
    }
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    if (requestUrl.pathname === '/api/showcase/games') {
        sendJson(res, 200, { ok: true, games: [] });
        return;
    }
    if (!BACKEND_URL && requestUrl.pathname === '/api/user/session') {
        sendJson(res, 200, {
            ok: true,
            loggedIn: false,
            user: null,
            accountType: 'user',
            authConfigured: false,
            loginUrl: null,
            capabilities: {
                googleContact: false,
                crossDeviceSync: false,
                paymentMethods: false
            },
            message: 'User account auth is not configured in this local preview.'
        });
        return;
    }
    if (!BACKEND_URL && requestUrl.pathname === '/auth/user/google') {
        sendJson(res, 501, {
            ok: false,
            error: 'USER_AUTH_NOT_CONFIGURED',
            accountType: 'user',
            message: 'Google user sign-in is not configured in this local preview.'
        });
        return;
    }
    if (!BACKEND_URL && requestUrl.pathname === '/api/user/payment-methods') {
        sendJson(res, 501, {
            ok: false,
            error: 'PAYMENTS_NOT_CONFIGURED',
            accountType: 'user',
            paymentProvider: null,
            message: 'User payment methods are not configured in this local preview.'
        });
        return;
    }
    if (
        requestUrl.pathname.startsWith('/api/') ||
        requestUrl.pathname.startsWith('/auth/') ||
        requestUrl.pathname.startsWith('/generated/')
    ) {
        proxyToBackend(req, res);
        return;
    }
    sendStatic(req, res);
});

server.listen(PORT, HOST, () => {
    console.log(`Droi AI dev proxy: http://${HOST}:${PORT}`);
    console.log(`Backend target: ${BACKEND_URL || '(not configured)'}`);
});
