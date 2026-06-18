/*
 * edit-receipt.js - Edit Receipt Card (CHAT_REBUILD_PLAN T2.3/T2.4).
 * Answers: what changed / what stayed stable / how to go back.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function appendAreaRows(card, summary) {
    const changedAreas = Array.isArray(summary.changedAreas) ? summary.changedAreas.filter(Boolean) : [];
    const preservedAreas = Array.isArray(summary.preservedAreas) ? summary.preservedAreas.filter(Boolean) : [];
    if (!changedAreas.length && !preservedAreas.length) return;
    const box = el('div', 'edit-receipt-areas');
    if (changedAreas.length) {
        const row = el('p');
        row.appendChild(el('strong', null, 'Changed: '));
        row.appendChild(document.createTextNode(changedAreas.join(' / ')));
        box.appendChild(row);
    }
    if (preservedAreas.length) {
        const row = el('p');
        row.appendChild(el('strong', null, 'Preserved: '));
        row.appendChild(document.createTextNode(preservedAreas.join(' / ')));
        box.appendChild(row);
    }
    card.appendChild(box);
}

/**
 * @param {object} data
 *   { version, prevVersion, durationMs, changeSummary, target, prompt, persisted }
 * @param {object} handlers  { onTryIt?, onRevert?(version) }
 * @returns {HTMLElement}
 */
export function renderEditReceipt(data, handlers = {}) {
    const summary = data.changeSummary || {};
    const card = el('section', 'edit-receipt-card');
    card.dataset.version = String(data.version);

    const head = el('div', 'edit-receipt-head');
    const badge = el('span', 'edit-receipt-badge', `Edit applied - v${data.version}`);
    head.appendChild(badge);
    const duration = formatDuration(data.durationMs);
    if (duration) head.appendChild(el('small', 'edit-receipt-duration', duration));
    card.appendChild(head);

    card.appendChild(el('p', 'edit-receipt-headline', summary.headline || 'Edit applied.'));
    appendAreaRows(card, summary);

    const meta = [
        summary.previewStatus ? `Preview: ${summary.previewStatus}` : '',
        summary.ranBackend === true ? 'AI model used' : summary.ranBackend === false ? 'Local change' : ''
    ].filter(Boolean);
    if (meta.length) card.appendChild(el('p', 'edit-receipt-meta', meta.join(' / ')));

    const changes = Array.isArray(summary.changes) ? summary.changes.slice(0, 5) : [];
    if (changes.length) {
        const list = el('ul', 'edit-receipt-changes');
        for (const change of changes) {
            const item = el('li');
            item.appendChild(el('span', 'edit-receipt-area', change.area || 'Change'));
            item.appendChild(el('span', null, change.what || ''));
            list.appendChild(item);
        }
        card.appendChild(list);
    }

    const untouched = Array.isArray(summary.untouched) ? summary.untouched.filter(Boolean) : [];
    if (untouched.length) {
        card.appendChild(el('p', 'edit-receipt-untouched', `Not touched: ${untouched.join(' / ')}`));
    }

    const actions = el('div', 'edit-receipt-actions');
    if (typeof handlers.onTryIt === 'function') {
        const tryBtn = el('button', 'edit-receipt-btn primary', 'Try it');
        tryBtn.type = 'button';
        tryBtn.addEventListener('click', handlers.onTryIt);
        actions.appendChild(tryBtn);
    }
    if (typeof handlers.onRevert === 'function' && data.prevVersion) {
        const revertBtn = el('button', 'edit-receipt-btn', `Revert to v${data.prevVersion}`);
        revertBtn.type = 'button';
        revertBtn.addEventListener('click', () => handlers.onRevert(data.prevVersion));
        actions.appendChild(revertBtn);
    }
    card.appendChild(actions);

    const filesChanged = Array.isArray(summary.filesChanged) ? summary.filesChanged : [];
    if (filesChanged.length) {
        const details = el('details', 'edit-receipt-files');
        details.appendChild(el('summary', null, `files (${filesChanged.length})`));
        const list = el('ul');
        for (const file of filesChanged.slice(0, 12)) {
            list.appendChild(el('li', null,
                `${file.path} - ${file.kind} +${file.added || 0} -${file.removed || 0}`));
        }
        details.appendChild(list);
        card.appendChild(details);
    }

    if (data.persisted === false) {
        card.appendChild(el('p', 'edit-receipt-note',
            'This project is large, so version history lives in memory only. Reloading the page clears it.'));
    }

    return card;
}

/** Small inline receipt used after a revert. */
export function renderRevertReceipt(version) {
    const card = el('section', 'edit-receipt-card is-revert');
    const head = el('div', 'edit-receipt-head');
    head.appendChild(el('span', 'edit-receipt-badge', `Reverted to v${version}`));
    card.appendChild(head);
    card.appendChild(el('p', 'edit-receipt-headline',
        'Preview, code panel and ZIP export now match that version.'));
    return card;
}
