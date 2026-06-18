/*
 * src-chat/index.js — module entry (CHAT_REBUILD_PLAN §8.1).
 * Exposes the rebuild components to the classic script.js world via the
 * window.DroiChat namespace. All usage is event-driven, so by the time any
 * edit happens this module has long been evaluated.
 */

import * as versions from './state/versions.js';
import {
    advanceWorkfeedStep,
    cancelWorkfeedJob,
    completeWorkfeedJob,
    createWorkfeedJob,
    failWorkfeedJob,
    normalizeWorkfeedStep,
    updateWorkfeedStep
} from './state/workfeed.js';
import { buildChangeSummary } from './diff.js';
import { renderEditReceipt, renderRevertReceipt } from './cards/edit-receipt.js';
import { renderErrorCard } from './cards/error.js';
import { renderQueuedCard } from './cards/queued.js';
import { renderCompletionReceipt, renderWorkfeedCard, updateWorkfeedCard } from './cards/workfeed.js';

/**
 * Orchestrates one successful edit:
 * baseline → diff (backend summary wins) → snapshot → receipt data.
 */
function recordEditVersion({ projectKey, prevFiles, nextFiles, prompt, target, backendSummary, durationMs }) {
    const prevVersion = versions.ensureBaseline(projectKey, prevFiles);
    const lastVersion = versions.currentVersion(projectKey) || prevVersion;
    const changeSummary = buildChangeSummary(prevFiles, nextFiles, prompt, backendSummary);
    const entry = versions.record(projectKey, {
        files: nextFiles,
        prompt,
        target,
        changeSummary
    });
    return {
        version: entry.version,
        prevVersion: lastVersion,
        durationMs,
        changeSummary,
        target,
        prompt,
        persisted: versions.isPersisted(projectKey)
    };
}

window.DroiChat = {
    versions,
    buildChangeSummary,
    workfeed: {
        advanceWorkfeedStep,
        cancelWorkfeedJob,
        completeWorkfeedJob,
        createWorkfeedJob,
        failWorkfeedJob,
        normalizeWorkfeedStep,
        updateWorkfeedStep
    },
    renderEditReceipt,
    renderRevertReceipt,
    renderErrorCard,
    renderQueuedCard,
    renderWorkfeedCard,
    updateWorkfeedCard,
    renderCompletionReceipt,
    recordEditVersion
};
