(function () {
    function isInternalLink(href) {
        try {
            const url = new URL(href, location.href);
            return url.origin === location.origin && url.pathname.endsWith('.html');
        } catch (e) { return false }
    }

    function setIframeSrc(src) {
        if (!src) return;
        const iframe = document.getElementById('spa-frame');
        if (!iframe) return;
        // ensure embedded param
        const url = new URL(src, location.href);
        if (!url.searchParams.has('embedded')) url.searchParams.set('embedded', '1');
        iframe.src = url.toString();
        // update hash so direct links/bookmarks work
        location.hash = encodeURIComponent(url.pathname + url.search + url.hash);
    }

    function handleClick(e) {
        if (e.defaultPrevented) return;
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href) return;
        if (a.target && a.target !== '_self') return; // respect targets
        if (href.startsWith('#')) return; // anchor
        if (isInternalLink(href)) {
            e.preventDefault();
            setIframeSrc(href);
        }
    }

    function loadFromHash() {
        const h = location.hash;
        if (!h) return;
        try {
            const decoded = decodeURIComponent(h.slice(1));
            if (decoded) setIframeSrc(decoded);
        } catch (e) { console.warn('Invalid hash', e) }
    }

    window.initSimpleSPA = function () {
        // find a main content area to host iframe
        const main = document.querySelector('.main-content') || document.querySelector('.container-fluid') || document.body;
        if (!main) return;
        // if iframe already present, do nothing
        if (document.getElementById('spa-frame')) return;
        const iframe = document.createElement('iframe');
        iframe.id = 'spa-frame';
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100vh - 120px)';
        iframe.style.border = '0';
        iframe.style.minHeight = '600px';
        // insert iframe after header inside main
        // preserve existing main content only when no hash
        const currentHash = location.hash;
        if (currentHash) {
            main.innerHTML = '';
            main.appendChild(iframe);
            loadFromHash();
        } else {
            // keep existing content visible and append iframe below it (hidden)
            main.appendChild(iframe);
        }

        document.addEventListener('click', handleClick, true);
        window.addEventListener('hashchange', loadFromHash);

        // expose helper
        window.spaNavigate = function (href) { setIframeSrc(href); };
    };

    // auto-init on pages that include this script
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => { if (window.initSimpleSPA) window.initSimpleSPA(); }, 50);
    } else {
        window.addEventListener('DOMContentLoaded', () => { if (window.initSimpleSPA) window.initSimpleSPA(); });
    }
})();
