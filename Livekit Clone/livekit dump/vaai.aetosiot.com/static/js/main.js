// LiveKit Dashboard Client-Side JavaScript

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('LiveKit Dashboard initialized');

    // Fix text colors for dark theme
    fixTextColors();

    // Auto-dismiss alerts after 15 seconds — EXCEPT warnings (alert-warning)
    // and anything marked alert-permanent. Warnings carry information the
    // operator must act on (Troy 2026-08-20: never auto-hide the yellow/orange
    // ones); they stay until manually dismissed or the page changes. Success/
    // info flashes keep the auto-dismiss.
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent):not(.alert-warning)');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 15000);
    });

    // Auto-init URL-hash navigation on any tablist marked with data-hash-nav.
    document.querySelectorAll('ul.nav-tabs[data-hash-nav]').forEach(initTabHashNav);
});

/**
 * Wire URL-hash navigation to a Bootstrap nav-tabs tablist.
 *
 * Behaviour:
 *   - On page load, if window.location.hash matches a tab in this tablist
 *     (either directly via data-bs-target id, or via the optional alias map),
 *     that tab is shown.
 *   - When the user clicks a tab in this tablist, the URL hash is updated
 *     using history.replaceState (so tab clicks don't pile up back-button
 *     entries). Friendly aliases are preferred when defined.
 *
 * Usage — mark the tablist with `data-hash-nav` (optional `data-hash-aliases`
 * JSON for friendly hash names) and this is wired automatically:
 *
 *   <ul class="nav nav-tabs" data-hash-nav
 *       data-hash-aliases='{"rules-tab-pane":"rules","time-profiles-tab-pane":"time-profiles"}'>
 *
 * Hash matching is case-insensitive.
 */
function initTabHashNav(tablist) {
    if (!tablist) return;
    // Parse aliases (JSON map: target-id → friendly-hash-name)
    let aliases = {};
    try {
        const raw = tablist.getAttribute('data-hash-aliases');
        if (raw) aliases = JSON.parse(raw);
    } catch (e) { /* malformed JSON — fall back to no aliases */ }
    // Reverse lookup: friendly hash → target id
    const hashToTarget = {};
    for (const [target, hashName] of Object.entries(aliases)) {
        hashToTarget[hashName.toLowerCase()] = target;
    }

    // Apply URL hash on page load if it matches a tab in this tablist
    const hash = window.location.hash;
    if (hash) {
        const hashId = hash.substring(1).toLowerCase();
        const target = hashToTarget[hashId] || hashId;
        const safeTarget = (window.CSS && CSS.escape) ? CSS.escape(target) : target;
        const tabButton = tablist.querySelector(
            `[data-bs-toggle="tab"][data-bs-target="#${safeTarget}"]`
        );
        if (tabButton && window.bootstrap && bootstrap.Tab) {
            try {
                new bootstrap.Tab(tabButton).show();
                // Prevent browser auto-scrolling to an element with the hash id
                setTimeout(() => window.scrollTo(0, 0), 50);
            } catch (e) { /* ignore */ }
        }
    }

    // Update URL hash when any tab in this tablist is shown
    tablist.querySelectorAll('[data-bs-toggle="tab"]').forEach(btn => {
        btn.addEventListener('shown.bs.tab', (e) => {
            const target = (e.target.getAttribute('data-bs-target') || '').replace(/^#/, '');
            if (!target) return;
            const hashName = aliases[target] || target;
            const url = window.location.pathname + window.location.search + '#' + hashName;
            try { history.replaceState(null, '', url); } catch (err) { /* ignore */ }
        });
    });
}

/**
 * Fix text color issues in dark theme
 */
function fixTextColors() {
    // Text color fixes are now handled entirely via CSS (style.css).
    // Retained as no-op for backward compatibility with dashboardUtils export.
}

// HTMX event handlers
document.body.addEventListener('htmx:beforeRequest', function(event) {
    console.log('HTMX request starting:', event.detail.path);
});

document.body.addEventListener('htmx:afterRequest', function(event) {
    console.log('HTMX request completed:', event.detail.path);
});

document.body.addEventListener('htmx:responseError', function(event) {
    console.error('HTMX error:', event.detail);
    showNotification('Error loading data. Please refresh the page.', 'danger');
});

// Utility Functions

/**
 * Show a temporary notification
 */
function showNotification(message, type = 'info') {
    const container = document.querySelector('.container-fluid') || document.querySelector('.container');
    if (!container) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alertDiv);
        bsAlert.close();
    }, 5000);
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showNotification('Copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Failed to copy:', err);
                fallbackCopyToClipboard(text);
            });
    } else {
        fallbackCopyToClipboard(text);
    }
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('Copied to clipboard!', 'success');
        } else {
            showNotification('Failed to copy to clipboard', 'danger');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showNotification('Failed to copy to clipboard', 'danger');
    }
    
    document.body.removeChild(textArea);
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Confirm action with custom message
 */
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

/**
 * Handle form submission with loading state
 */
function handleFormSubmit(formElement, onSuccess) {
    const submitBtn = formElement.querySelector('[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
    
    const formData = new FormData(formElement);
    
    fetch(formElement.action, {
        method: formElement.method || 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error('Request failed');
        return response.json();
    })
    .then(data => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        if (onSuccess) onSuccess(data);
    })
    .catch(error => {
        console.error('Form submission error:', error);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        showNotification('An error occurred. Please try again.', 'danger');
    });
}

// Export functions for use in templates
window.dashboardUtils = {
    showNotification,
    copyToClipboard,
    formatDuration,
    formatRelativeTime,
    confirmAction,
    handleFormSubmit,
    fixTextColors
};


// ---------------------------------------------------------------------------
// Update-in-progress banner (every page). The self-update runs server-side
// and survives a closed browser; an operator reopening the dashboard lands on
// Overview with no other signal that an update is installing. One cheap
// in-memory probe per page load; 401/404 (sub-user, older server) = no banner.
// The Settings page has the full live console, so it skips the banner.
// ---------------------------------------------------------------------------
(function () {
    if (window.location.pathname.startsWith('/settings')) return;
    fetch('/api/system/update-status', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            if (!d || (d.status !== 'running' && d.status !== 'done')) return;
            var banner = document.createElement('div');
            banner.className = 'alert alert-info alert-permanent mb-0 text-center';
            banner.style.borderRadius = '0';
            var icon = document.createElement('i');
            icon.className = 'bi bi-arrow-repeat me-2';
            var text = document.createTextNode(
                'A dashboard update is installing. Closing the browser will not interrupt it. '
            );
            var link = document.createElement('a');
            link.href = '/settings';
            link.textContent = 'View progress';
            banner.appendChild(icon);
            banner.appendChild(text);
            banner.appendChild(link);
            document.body.prepend(banner);
        })
        .catch(function () { /* no banner on any failure */ });
})();

// ---------------------------------------------------------------------------
// Limit-reached popup. Disabled Create buttons (Community Edition limit or
// per-user quota) are wrapped in a span carrying data-limit-popup="<why>".
// Hovering shows the tooltip; clicking/tapping shows a modal with the same
// explanation (tooltips are invisible on touch devices, and a click on a
// disabled button otherwise does nothing, which reads as "broken").
// ---------------------------------------------------------------------------
document.addEventListener('click', function (e) {
    var wrap = e.target.closest('[data-limit-popup]');
    if (!wrap) return;
    var msg = wrap.getAttribute('data-limit-popup');
    if (!msg) return;
    var modal = document.getElementById('limitReachedModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'limitReachedModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
              '<div class="modal-content">' +
                '<div class="modal-header">' +
                  '<h5 class="modal-title"><i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>Agent Limit Reached</h5>' +
                  '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body"><p class="mb-0"></p></div>' +
                '<div class="modal-footer">' +
                  '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">OK</button>' +
                '</div>' +
              '</div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    // textContent, never innerHTML — the message is template-provided today
    // but this keeps any future dynamic text injection-safe.
    modal.querySelector('.modal-body p').textContent = msg;
    new bootstrap.Modal(modal).show();
});
