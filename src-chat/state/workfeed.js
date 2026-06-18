/*
 * workfeed.js — one active AI work job, updated in place.
 * The UI can narrate progress, but statuses should be driven by real signals.
 */

const VALID_STATUS = new Set(['queued', 'running', 'done', 'warning', 'failed', 'skipped', 'canceled']);

export function normalizeWorkfeedStep(step, index = 0) {
    if (typeof step === 'string') {
        return {
            id: `step-${index + 1}`,
            label: step,
            status: index === 0 ? 'running' : 'queued',
            area: '',
            summary: ''
        };
    }
    const source = step && typeof step === 'object' ? step : {};
    const status = VALID_STATUS.has(source.status) ? source.status : (index === 0 ? 'running' : 'queued');
    return {
        id: String(source.id || `step-${index + 1}`),
        label: String(source.label || source.title || `Step ${index + 1}`),
        status,
        area: String(source.area || ''),
        summary: String(source.summary || source.detail || '')
    };
}

export function createWorkfeedJob(options = {}) {
    const steps = (Array.isArray(options.steps) ? options.steps : []).map(normalizeWorkfeedStep);
    return {
        id: String(options.id || `workfeed-${Date.now()}`),
        type: String(options.type || 'generation'),
        title: String(options.title || 'Working on your game'),
        subtitle: String(options.subtitle || ''),
        status: String(options.status || 'running'),
        startedAt: Number(options.startedAt || Date.now()),
        completedAt: null,
        cancelable: options.cancelable !== false,
        steps,
        receipt: null,
        meta: options.meta && typeof options.meta === 'object' ? { ...options.meta } : {}
    };
}

export function updateWorkfeedStep(job, stepId, updates = {}) {
    if (!job || !Array.isArray(job.steps)) return job;
    const index = job.steps.findIndex(step => step.id === stepId);
    if (index < 0) return job;
    const next = { ...job.steps[index], ...updates };
    if (!VALID_STATUS.has(next.status)) next.status = job.steps[index].status;
    job.steps[index] = next;
    return job;
}

export function advanceWorkfeedStep(job, stepId, updates = {}) {
    if (!job || !Array.isArray(job.steps)) return job;
    const index = job.steps.findIndex(step => step.id === stepId);
    if (index < 0) return job;
    job.steps[index] = {
        ...job.steps[index],
        ...updates,
        status: updates.status || 'done'
    };
    const next = job.steps[index + 1];
    if (next && next.status === 'queued') next.status = 'running';
    return job;
}

export function failWorkfeedJob(job, stepId, summary = '') {
    if (!job) return job;
    job.status = 'failed';
    job.completedAt = Date.now();
    if (stepId) updateWorkfeedStep(job, stepId, { status: 'failed', summary });
    return job;
}

export function cancelWorkfeedJob(job, summary = 'Generation canceled.') {
    if (!job) return job;
    job.status = 'canceled';
    job.completedAt = Date.now();
    job.cancelable = false;
    job.steps = (job.steps || []).map(step => {
        if (step.status === 'done' || step.status === 'warning' || step.status === 'skipped') return step;
        return {
            ...step,
            status: step.status === 'running' ? 'canceled' : 'skipped',
            summary: step.status === 'running' ? summary : step.summary
        };
    });
    return job;
}

export function completeWorkfeedJob(job, receipt = null) {
    if (!job) return job;
    job.status = 'done';
    job.completedAt = Date.now();
    job.steps = (job.steps || []).map(step => ({
        ...step,
        status: step.status === 'queued' || step.status === 'running' ? 'done' : step.status
    }));
    job.receipt = receipt || null;
    return job;
}
