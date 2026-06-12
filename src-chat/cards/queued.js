/*
 * queued.js — inline manual queue card with embedded email form.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function renderQueuedCard(data = {}, handlers = {}) {
    const card = el('section', 'flow-queued-card');
    const title = el('h3', 'flow-queued-title', data.title || 'We can queue this request');
    const message = el('p', 'flow-queued-message', data.message || 'Leave an email and we will follow up when this request is ready.');
    const form = el('form', 'flow-queued-form');
    const input = el('input', 'flow-queued-input');
    input.type = 'email';
    input.required = true;
    input.autocomplete = 'email';
    input.placeholder = data.placeholder || 'Enter your email address';
    const submit = el('button', 'flow-card-btn primary', data.submitLabel || 'Send');
    submit.type = 'submit';
    const skip = el('button', 'flow-card-btn', data.skipLabel || 'Skip');
    skip.type = 'button';
    const status = el('p', 'flow-queued-status');
    status.setAttribute('aria-live', 'polite');

    form.append(input, submit, skip);
    card.append(title, message, form, status);

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (typeof handlers.onSubmit === 'function') {
            handlers.onSubmit(input.value.trim(), { card, input, submit, skip, status });
        }
    });
    skip.addEventListener('click', () => {
        if (typeof handlers.onSkip === 'function') handlers.onSkip({ card, status });
    });

    return card;
}
