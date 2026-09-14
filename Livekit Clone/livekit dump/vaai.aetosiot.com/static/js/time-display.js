/**
 * Shared client-side time formatters — the JS twin of
 * app/services/time_display.py.
 *
 * Every timestamp RENDERED by JavaScript must go through these helpers so
 * the timezone configured at Settings → Server → Time & Date applies
 * everywhere (the browser's own timezone is NOT the dashboard's).
 *
 * Rules (mirror the server side — see "Timestamps & Timezone" in CLAUDE.md):
 * - ISO strings without a timezone marker are treated as UTC (several
 *   writers persist naive-UTC strings; this matches the server filters).
 * - Machine-readable values (data-* attributes fed to new Date(), raw
 *   sort keys) must stay raw ISO — only visible text gets formatted.
 * - Never throws: any failure falls back to browser-local rendering so a
 *   bad timezone value can't blank a page.
 *
 * window.DASHBOARD_TZ (IANA name) is emitted by base.html.j2. Pages that
 * don't extend base fall back to browser-local automatically.
 */
(function () {
    'use strict';

    function pad(n, w) { return String(n).padStart(w || 2, '0'); }

    // Extract Y/M/D/H/M/S parts of `date` in the dashboard timezone.
    function tzParts(date) {
        var fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: window.DASHBOARD_TZ,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        var parts = {};
        fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
        // Intl can emit hour "24" for midnight in some engines — normalise.
        if (parts.hour === '24') parts.hour = '00';
        return parts;
    }

    // Parse an input into a Date. Strings without an explicit offset are
    // treated as UTC (append Z). Numbers are epoch SECONDS (multiply ms
    // yourself before calling if you have milliseconds).
    function toDate(value) {
        if (value instanceof Date) return value;
        if (typeof value === 'number') return new Date(value * 1000);
        if (typeof value === 'string' && value) {
            var s = value.trim();
            // Has explicit offset or Z already?
            if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
                s = s.replace(' ', 'T') + 'Z';
            }
            return new Date(s);
        }
        return new Date(NaN);
    }

    function formatDashboardDateTime(value, opts) {
        opts = opts || {};
        try {
            var d = toDate(value);
            if (isNaN(d.getTime())) return value ? String(value) : '-';
            var p = tzParts(d);
            var out = p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
            if (opts.seconds) out += ':' + p.second;
            return out;
        } catch (e) {
            try {
                var f = toDate(value);
                return isNaN(f.getTime()) ? String(value) : f.toLocaleString();
            } catch (e2) { return String(value); }
        }
    }

    function formatDashboardDate(value) {
        try {
            var d = toDate(value);
            if (isNaN(d.getTime())) return value ? String(value) : '-';
            var p = tzParts(d);
            return p.year + '-' + p.month + '-' + p.day;
        } catch (e) {
            try { return toDate(value).toLocaleDateString(); }
            catch (e2) { return String(value); }
        }
    }

    // Epoch SECONDS (server time.time() floats).
    function formatDashboardEpoch(ts, opts) {
        if (ts === null || ts === undefined || ts === '') return '-';
        var n = Number(ts);
        if (!isFinite(n)) return '-';
        return formatDashboardDateTime(new Date(n * 1000), opts);
    }

    // "Right now" in the dashboard timezone (e.g. 'last backup: just done').
    function formatDashboardNow() {
        return formatDashboardDateTime(new Date());
    }

    // Millisecond-precision, day-first variant: DD-MM-YYYY HH:MM:SS.mmm.
    // Used where sub-second precision is load-bearing (call-detail
    // transcript segments lined up against the audio track).
    function formatDashboardTimestampMs(value) {
        try {
            var d = toDate(value);
            if (isNaN(d.getTime())) return value ? String(value) : '';
            var p = tzParts(d);
            var ms = pad(d.getMilliseconds(), 3);
            return p.day + '-' + p.month + '-' + p.year + ' '
                + p.hour + ':' + p.minute + ':' + p.second + '.' + ms;
        } catch (e) {
            return value ? String(value) : '';
        }
    }

    window.parseDashboardDate = toDate;  // shared parse rule: no-marker = UTC
    window.formatDashboardDateTime = formatDashboardDateTime;
    window.formatDashboardDate = formatDashboardDate;
    window.formatDashboardEpoch = formatDashboardEpoch;
    window.formatDashboardNow = formatDashboardNow;
    window.formatDashboardTimestampMs = formatDashboardTimestampMs;
})();
