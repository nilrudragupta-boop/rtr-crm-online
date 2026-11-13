(function () {
    'use strict';

    // This renderer-side handler is a fallback for pages opened outside Electron.
    // Electron also blocks these accelerators in the main process.
    function blockDevToolsShortcuts(event) {
        const key = String(event.key || '').toLowerCase();
        const code = event.keyCode || event.which;
        const modifier = event.ctrlKey || event.metaKey;
        const inspectShortcut = modifier && (
            (event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
            (event.altKey && ['i', 'j', 'c'].includes(key))
        );
        const viewSourceShortcut = modifier && (key === 'u' || code === 85);

        if (key === 'f12' || code === 123 || inspectShortcut || viewSourceShortcut) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }

    window.addEventListener('keydown', blockDevToolsShortcuts, true);
    document.addEventListener('keydown', blockDevToolsShortcuts, true);
})();

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
