/*
 * diff.js - frontend changeSummary fallback (CHAT_REBUILD_PLAN T2.2).
 * Backend changeSummary wins when present; this module only fills gaps so
 * Workfeed and Receipt cards can stay grounded in real file/output signals.
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

function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
}

function promptMentions(prompt, pattern) {
    return pattern.test(String(prompt || '').toLowerCase());
}

function areaForPath(path) {
    const value = String(path || '').toLowerCase();
    if (value.includes('assets/') || value.match(/\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg)$/)) return 'Visual/audio assets';
    if (value.includes('runtime/') || value.endsWith('.js') || value.endsWith('.html') || value.endsWith('.css')) return 'Playable runtime';
    if (value.includes('spec/') || value.includes('game.json')) return 'Game rules';
    if (value.includes('manifest') || value.includes('generation-report')) return 'Project metadata';
    return 'Generated files';
}

function inferChangedAreas(filesChanged, prompt) {
    const fromFiles = (filesChanged || []).map(file => areaForPath(file.path));
    const fromPrompt = [
        promptMentions(prompt, /style|visual|art|palette|color|background|sprite|asset|theme/) ? 'Visual style' : '',
        promptMentions(prompt, /audio|music|sound|sfx|bgm/) ? 'Audio feel' : '',
        promptMentions(prompt, /speed|damage|hp|health|difficulty|wave|rate|number/) ? 'Tuning values' : '',
        promptMentions(prompt, /mechanic|control|collision|physics|enemy|boss|weapon|shoot|move/) ? 'Gameplay logic' : ''
    ];
    return unique([...fromPrompt, ...fromFiles]).slice(0, 4);
}

function inferPreservedAreas(prompt) {
    const preserved = [];
    if (!promptMentions(prompt, /control|input|keyboard|mouse|touch/)) preserved.push('Controls');
    if (!promptMentions(prompt, /win|lose|fail|restart|game over/)) preserved.push('Win/fail/restart flow');
    if (!promptMentions(prompt, /core loop|mechanic|rule|gameplay/)) preserved.push('Core gameplay loop');
    return preserved.length ? preserved : ['Existing playable behavior'];
}

function normalizeReceiptSummary(summary, prompt, filesChanged = []) {
    const source = summary && typeof summary === 'object' ? summary : {};
    return {
        ...source,
        changedAreas: Array.isArray(source.changedAreas) && source.changedAreas.length
            ? unique(source.changedAreas)
            : inferChangedAreas(filesChanged, prompt),
        preservedAreas: Array.isArray(source.preservedAreas) && source.preservedAreas.length
            ? unique(source.preservedAreas)
            : inferPreservedAreas(prompt),
        previewStatus: source.previewStatus || 'Loaded, not visually verified',
        ranBackend: source.ranBackend !== false,
        nextActions: Array.isArray(source.nextActions) && source.nextActions.length
            ? source.nextActions
            : ['Try it', 'Keep editing', 'Save ZIP']
    };
}

/**
 * @param {{path:string,content:string}[]} prevFiles
 * @param {{path:string,content:string}[]} nextFiles
 * @param {string} prompt           the user's edit instruction
 * @param {object|null} backendSummary  server-provided changeSummary, wins when present
 */
export function buildChangeSummary(prevFiles, nextFiles, prompt, backendSummary = null) {
    if (backendSummary && typeof backendSummary === 'object' && backendSummary.headline) {
        return normalizeReceiptSummary(
            { ...backendSummary, source: 'backend' },
            prompt,
            backendSummary.filesChanged || []
        );
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
        what: `${file.path} (+${file.added} -${file.removed})`
    }));

    return normalizeReceiptSummary({
        source: 'frontend-diff',
        headline,
        changes,
        untouched: untouchedFiles.length
            ? [`${untouchedFiles.length} of ${nextMap.size} files unchanged`]
            : [],
        filesChanged
    }, prompt, filesChanged);
}
