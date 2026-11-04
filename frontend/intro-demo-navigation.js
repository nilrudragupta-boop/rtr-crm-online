(function () {
    const isDemoPage = location.pathname.includes('/introdemo/');

    if (!isDemoPage) {
        let overlay;
        let frame;

        function showIntro() {
            if (overlay) overlay.remove();
            overlay = null;
            frame = null;
        }

        function showDemo(url, updateHistory) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff';
                frame = document.createElement('iframe');
                frame.title = 'Demo page';
                frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
                overlay.appendChild(frame);
                document.body.appendChild(overlay);
            }

            frame.src = url.href;

            if (updateHistory) {
                const route = `#demo=${encodeURIComponent(url.pathname + url.search + url.hash)}`;
                history.pushState({ introDemo: true }, '', route);
            }
        }

        function restoreFromLocation() {
            if (!location.hash.startsWith('#demo=')) {
                showIntro();
                return;
            }

            try {
                const url = new URL(decodeURIComponent(location.hash.slice(6)), location.href);
                if (url.origin === location.origin && url.pathname.includes('/introdemo/')) {
                    showDemo(url, false);
                } else {
                    showIntro();
                }
            } catch (error) {
                showIntro();
            }
        }

        function backToIntro() {
            if (history.state && history.state.introDemo) {
                history.back();
            } else {
                showIntro();
                history.replaceState(null, '', location.pathname + location.search);
            }
        }

        document.addEventListener('click', function (event) {
            const link = event.target.closest('a[href]');
            if (!link) return;

            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || !url.pathname.includes('/introdemo/')) return;

            event.preventDefault();
            showDemo(url, true);
        });

        window.addEventListener('popstate', restoreFromLocation);
        window.addEventListener('message', function (event) {
            const isLocalFile = location.protocol === 'file:' && event.origin === 'null';
            if (!frame || ((!isLocalFile && event.origin !== location.origin) || event.source !== frame.contentWindow)) return;
            if (event.data && event.data.type === 'intro-demo-back') backToIntro();
        });

        restoreFromLocation();
        return;
    }

    if (location.pathname.includes('/introdemo/')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'intro-demo-back';
        button.textContent = 'Back to Intro';
        button.setAttribute('aria-label', 'Back to intro page');
        button.style.cssText = 'position:fixed;top:12px;left:12px;z-index:2147483647;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#1f2937;font:600 14px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)';
        button.addEventListener('click', function () {
            if (window.parent !== window) {
                const targetOrigin = location.origin === 'null' ? '*' : location.origin;
                window.parent.postMessage({ type: 'intro-demo-back' }, targetOrigin);
            } else {
                location.href = '../intro_rtr.html';
            }
        });
        document.body.appendChild(button);
    }
})();