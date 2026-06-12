/*
 * versions.js — workspace edit version snapshots (CHAT_REBUILD_PLAN T2.1).
 * In-memory store mirrored to localStorage (capped); powers the version
 * chain + "Revert to vN" on edit receipt cards.
 */

const STORE_PREFIX = 'droi-chat-versions:';
const MAX_VERSIONS = 10;
const MAX_PERSIST_CHARS = 3_500_000; // ~3.5MB guard; beyond that keep memory-only

const memory = new Map();

function emptyState() {
    return { nextVersion: 1, current: 0, entries: [] };
}

function load(projectKey) {
    if (memory.has(projectKey)) return memory.get(projectKey);
    let state = emptyState();
    try {
        const raw = window.localStorage.getItem(STORE_PREFIX + projectKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.entries)) state = parsed;
        }
    } catch (error) {
        /* localStorage unavailable or corrupt — memory-only */
    }
    memory.set(projectKey, state);
    return state;
}

function persist(projectKey, state) {
    try {
        const json = JSON.stringify(state);
        if (json.length <= MAX_PERSIST_CHARS) {
            window.localStorage.setItem(STORE_PREFIX + projectKey, json);
            state.persisted = true;
        } else {
            window.localStorage.removeItem(STORE_PREFIX + projectKey);
            state.persisted = false;
        }
    } catch (error) {
        state.persisted = false;
    }
}

function normalizeFiles(files) {
    return (Array.isArray(files) ? files : [])
        .filter(file => file && (file.path || file.name) && file.content != null)
        .map(file => ({ path: String(file.path || file.name), content: String(file.content) }));
}

/** Record a snapshot; returns the entry (with assigned version number). */
export function record(projectKey, { files, prompt = '', target = '', changeSummary = null }) {
    const state = load(projectKey);
    const entry = {
        version: state.nextVersion,
        createdAt: new Date().toISOString(),
        prompt,
        target,
        changeSummary,
        files: normalizeFiles(files)
    };
    state.nextVersion += 1;
    state.entries.push(entry);
    while (state.entries.length > MAX_VERSIONS) state.entries.shift();
    state.current = entry.version;
    persist(projectKey, state);
    return entry;
}

/** Ensure a v1 baseline exists before the first edit. Returns baseline version. */
export function ensureBaseline(projectKey, files) {
    const state = load(projectKey);
    if (state.entries.length > 0) return state.entries[0].version;
    return record(projectKey, { files, prompt: '', target: '', changeSummary: null }).version;
}

export function get(projectKey, version) {
    const state = load(projectKey);
    return state.entries.find(entry => entry.version === Number(version)) || null;
}

export function list(projectKey) {
    const state = load(projectKey);
    return state.entries.map(({ files, ...meta }) => ({ ...meta, fileCount: files.length }));
}

export function setCurrent(projectKey, version) {
    const state = load(projectKey);
    if (state.entries.some(entry => entry.version === Number(version))) {
        state.current = Number(version);
        persist(projectKey, state);
    }
    return state.current;
}

export function currentVersion(projectKey) {
    return load(projectKey).current;
}

export function isPersisted(projectKey) {
    return load(projectKey).persisted !== false;
}
