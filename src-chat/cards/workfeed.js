/*
 * workfeed.js - user-facing AI work progress card.
 * This stays separate from the debug execution timeline.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function stepIcon(status) {
    if (status === 'done') return 'OK';
    if (status === 'failed') return '!';
    if (status === 'warning') return '!';
    if (status === 'skipped') return '-';
    if (status === 'canceled') return 'x';
    return '';
}

function appendSteps(card, steps = []) {
    const list = el('ol', 'workfeed-steps');
    steps.forEach(step => {
        const item = el('li', 'workfeed-step');
        item.dataset.status = step.status || 'queued';
        item.appendChild(el('span', 'workfeed-dot', stepIcon(step.status)));
        const main = el('span', 'workfeed-step-main');
        const line = el('span', 'workfeed-step-line');
        line.appendChild(el('strong', null, step.label || 'Working'));
        if (step.area) line.appendChild(el('em', null, step.area));
        main.appendChild(line);
        if (step.summary) main.appendChild(el('small', null, step.summary));
        item.appendChild(main);
        list.appendChild(item);
    });
    card.appendChild(list);
}

export function renderWorkfeedCard(job) {
    const card = el('section', 'workfeed-card');
    card.dataset.workfeedId = job.id;
    card.dataset.status = job.status || 'running';
    const head = el('div', 'workfeed-head');
    head.appendChild(el('span', 'workfeed-pulse'));
    const title = el('div', 'workfeed-title');
    title.appendChild(el('strong', null, job.title || 'Working on your game'));
    if (job.subtitle) title.appendChild(el('small', null, job.subtitle));
    head.appendChild(title);
    if (job.cancelable !== false && job.status === 'running') {
        const cancel = el('button', 'workfeed-cancel-btn', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
            card.dispatchEvent(new CustomEvent('workfeed-cancel-request', {
                bubbles: true,
                detail: { jobId: job.id }
            }));
        });
        head.appendChild(cancel);
    }
    card.appendChild(head);
    appendSteps(card, job.steps || []);
    return card;
}

export function updateWorkfeedCard(card, job) {
    if (!card || !job) return card;
    const next = renderWorkfeedCard(job);
    card.replaceChildren(...Array.from(next.childNodes));
    card.dataset.status = job.status || 'running';
    return card;
}

export function renderCompletionReceipt(data = {}, handlers = {}) {
    const card = el('section', 'completion-receipt-card');
    card.dataset.status = data.previewStatus || data.status || 'done';
    const head = el('div', 'completion-receipt-head');
    head.appendChild(el('span', 'completion-receipt-badge', data.badge || 'Done'));
    if (data.durationMs) {
        const seconds = data.durationMs < 1000 ? `${Math.round(data.durationMs)}ms` : `${(data.durationMs / 1000).toFixed(1)}s`;
        head.appendChild(el('small', null, seconds));
    }
    card.appendChild(head);
    card.appendChild(el('p', 'completion-receipt-title', data.title || 'Game updated.'));
    if (data.summary) card.appendChild(el('p', 'completion-receipt-summary', data.summary));

    const areas = [
        ...(Array.isArray(data.changedAreas) && data.changedAreas.length
            ? [{ label: 'Changed', values: data.changedAreas }]
            : []),
        ...(Array.isArray(data.preservedAreas) && data.preservedAreas.length
            ? [{ label: 'Preserved', values: data.preservedAreas }]
            : [])
    ];
    if (areas.length) {
        const list = el('div', 'completion-receipt-areas');
        areas.forEach(group => {
            const row = el('p');
            row.appendChild(el('strong', null, `${group.label}: `));
            row.appendChild(document.createTextNode(group.values.join(' / ')));
            list.appendChild(row);
        });
        card.appendChild(list);
    }

    const meta = [
        data.previewStatus ? `Preview: ${data.previewStatus}` : '',
        data.ranBackend === true ? 'AI model used' : data.ranBackend === false ? 'Local change' : '',
        Array.isArray(data.filesUpdated) && data.filesUpdated.length ? `${data.filesUpdated.length} files` : ''
    ].filter(Boolean);
    if (meta.length) card.appendChild(el('p', 'completion-receipt-meta', meta.join(' / ')));

    const actions = Array.isArray(data.nextActions) ? data.nextActions : [];
    if (actions.length) {
        const actionRow = el('div', 'completion-receipt-actions');
        actions.forEach(action => {
            const button = el('button', action.primary ? 'completion-receipt-btn primary' : 'completion-receipt-btn', action.label || action);
            button.type = 'button';
            button.dataset.receiptAction = action.id || String(action.label || action).toLowerCase().replace(/\s+/g, '_');
            button.addEventListener('click', () => {
                if (typeof handlers.onAction === 'function') handlers.onAction(button.dataset.receiptAction, button);
            });
            actionRow.appendChild(button);
        });
        card.appendChild(actionRow);
    }

    if (data.details) {
        const details = el('details', 'completion-receipt-details');
        details.appendChild(el('summary', null, 'Details'));
        details.appendChild(el('pre', null, typeof data.details === 'string' ? data.details : JSON.stringify(data.details, null, 2)));
        card.appendChild(details);
    }
    return card;
}
