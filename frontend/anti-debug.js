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
