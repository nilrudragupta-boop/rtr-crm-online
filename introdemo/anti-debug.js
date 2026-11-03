(function () {
    'use strict';

    // 1. Completely neutralize console output and dev tools inspections
    try {
        const noop = function () { };
        const consoleMethods = [
            'log', 'debug', 'info', 'warn', 'error', 'assert', 'dir', 'dirxml',
            'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog',
            'trace', 'profile', 'profileEnd', 'count', 'countReset', 'table',
            'clear'
        ];
        if (window.console) {
            consoleMethods.forEach(function (method) {
                try {
                    window.console[method] = noop;
                } catch (e) { }
            });
            try {
                Object.freeze(window.console);
            } catch (e) { }
        }
    } catch (e) { }

    // 2. Strict keyboard blocker on window and document capture
    function blockShortcuts(e) {
        const key = (e.key || '').toLowerCase();
        const code = e.keyCode || e.which;

        // F12
        if (key === 'f12' || code === 123) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }

        // Ctrl+Shift+I / J / C or Cmd+Alt+I / J / C
        const isInspect = (e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey) && (
            key === 'i' || key === 'j' || key === 'c' ||
            code === 73 || code === 74 || code === 67
        );

        // Ctrl+U / Cmd+U (View Source)
        const isViewSource = (e.ctrlKey || e.metaKey) && (key === 'u' || code === 85);

        if (isInspect || isViewSource) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }
    }

    window.addEventListener('keydown', blockShortcuts, true);
    document.addEventListener('keydown', blockShortcuts, true);

    // 3. Prevent Context Menu (Right Click Inspect)
    window.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }, true);
})();