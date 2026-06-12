/*
 * diff.js — frontend changeSummary fallback (CHAT_REBUILD_PLAN T2.2).
 * When the backend does not return a structured changeSummary, derive one
 * from before/after file snapshots so the edit receipt is never empty.
 */

function linesOf(content) {
    return String(content || '').split(/\r?\n/);
}

/** Multiset line diff: counts lines added/removed between two contents. */
function lineDelta(prevContent, nextContent) {
    const counts = new Map();
    for (const line of linesOf(prevContent)) counts.set(line, (counts.get(line) || 0) + 1);
    let added = 0;
    for (const line of linesOf(nextContent)) {
        const left = counts.get(line) || 0;
        if (left > 0) counts.set(line, left - 1);
        else added += 1;
    }
    let removed = 0;
    for (const value of counts.values()) removed += value;
    return { added, removed };
}

/**
 * @param {{path:string,content:string}[]} prevFiles
 * @param {{path:string,content:string}[]} nextFiles
 * @param {string} prompt           the user's edit instruction
 * @param {object|null} backendSummary  server-provided changeSummary, wins when present
 */
export function buildChangeSummary(prevFiles, nextFiles, prompt, backendSummary = null) {
    if (backendSummary && typeof backendSummary === 'object' && backendSummary.headline) {
        return { ...backendSummary, source: 'backend' };
    }
    const prevMap = new Map((prevFiles || []).map(f => [f.path, f.content]));
    const nextMap = new Map((nextFiles || []).map(f => [f.path, f.content]));

    const filesChanged = [];
    const untouchedFiles = [];

    for (const [path, nextContent] of nextMap) {
        if (!prevMap.has(path)) {
            filesChanged.push({ path, kind: 'added', added: linesOf(nextContent).length, removed: 0 });
        } else if (prevMap.get(path) !== nextContent) {
            const { added, removed } = lineDelta(prevMap.get(path), nextContent);
            filesChanged.push({ path, kind: 'modified', added, removed });
        } else {
            untouchedFiles.push(path);
        }
    }
    for (const [path, prevContent] of prevMap) {
        if (!nextMap.has(path)) {
            filesChanged.push({ path, kind: 'removed', added: 0, removed: linesOf(prevContent).length });
        }
    }
    filesChanged.sort((a, b) => (b.added + b.removed) - (a.added + a.removed));

    const trimmedPrompt = String(prompt || '').trim();
    const headline = trimmedPrompt
        ? `Applied: ${trimmedPrompt.length > 90 ? trimmedPrompt.slice(0, 87) + '...' : trimmedPrompt}`
        : 'Edit applied to the playable game';

    const changes = filesChanged.slice(0, 4).map(file => ({
        area: file.kind === 'added' ? 'New file' : file.kind === 'removed' ? 'Removed' : 'Updated',
        what: `${file.path} (+${file.added} −${file.removed})`
    }));

    return {
        source: 'frontend-diff',
        headline,
        changes,
        untouched: untouchedFiles.length
            ? [`${untouchedFiles.length} of ${nextMap.size} files unchanged`]
            : [],
        filesChanged
    };
}
