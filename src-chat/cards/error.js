/*
 * error.js — inline generation error card.
 * Player-facing summary stays short; technical detail is collapsed.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

const ACTION_LABELS = {
    retry: 'Retry',
    switch_model: 'Switch model',
    check_config: 'Check config',
    edit_request: 'Modify request',
    manual_queue: 'Leave email'
};

export function renderErrorCard(error = {}, handlers = {}) {
    const card = el('section', 'flow-error-card');
    card.dataset.errorCode = error.code || '';

    const title = el('h3', 'flow-error-title', error.title || 'Generation needs attention');
    const message = el('p', 'flow-error-message', error.message || 'The current generation step could not continue.');
    card.append(title, message);

    const actions = Array.isArray(error.actions) ? error.actions.slice(0, 3) : [];
    if (actions.length) {
        const actionRow = el('div', 'flow-error-actions');
        actions.forEach(action => {
            const label = error.actionLabels && error.actionLabels[action]
                ? error.actionLabels[action]
                : ACTION_LABELS[action] || action;
            const button = el('button', action === 'retry' || action === 'edit_request'
                ? 'flow-card-btn primary'
                : 'flow-card-btn', label);
            button.type = 'button';
            button.dataset.flowErrorAction = action;
            button.addEventListener('click', () => {
                if (typeof handlers.onAction === 'function') handlers.onAction(action, button);
            });
            actionRow.appendChild(button);
        });
        card.appendChild(actionRow);
    }

    if (error.technicalMessage) {
        const details = el('details', 'flow-error-details');
        details.appendChild(el('summary', null, 'Details'));
        details.appendChild(el('pre', null, error.technicalMessage));
        card.appendChild(details);
    }

    return card;
}
