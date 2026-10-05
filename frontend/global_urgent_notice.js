(function () {
    const ACK_PREFIX = 'globalUrgentNoticeAck:';
    const POLL_INTERVAL_MS = 30000;
    let activeNoticeId = '';
    let overlay = null;

    function getNoticeUrl() {
        return localStorage.getItem('updateServerUrl') ||
            localStorage.getItem('cloudBackupUrl') ||
            (typeof GOOGLE_SCRIPT_URL !== 'undefined' ? GOOGLE_SCRIPT_URL : '');
    }

    function getAckKey(noticeId) {
        const username = localStorage.getItem('currentUser') || 'anonymous';
        return ACK_PREFIX + encodeURIComponent(username) + ':' + encodeURIComponent(noticeId);
    }

    function closeNotice() {
        if (overlay) overlay.remove();
        overlay = null;
        activeNoticeId = '';
    }

    function showNotice(notice) {
        closeNotice();
        activeNoticeId = notice.id;

        const style = document.createElement('style');
        style.textContent = `
            #globalUrgentNoticeOverlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,16,24,.78)}
            #globalUrgentNoticePanel{box-sizing:border-box;width:min(620px,100%);max-height:calc(100vh - 40px);overflow:auto;padding:28px;background:#fff;color:#18212b;border-top:6px solid #c62828;box-shadow:0 18px 60px rgba(0,0,0,.38);font-family:Arial,sans-serif}
            #globalUrgentNoticePanel h2{margin:0 0 16px;color:#a51f1f;font-size:24px}
            #globalUrgentNoticeMessage{margin:0 0 24px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
            #globalUrgentNoticeAcknowledge{display:block;width:100%;min-height:46px;border:0;background:#a51f1f;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
            #globalUrgentNoticeAcknowledge:focus-visible{outline:3px solid #18212b;outline-offset:3px}
        `;

        overlay = document.createElement('div');
        overlay.id = 'globalUrgentNoticeOverlay';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');

        const panel = document.createElement('section');
        panel.id = 'globalUrgentNoticePanel';
        panel.setAttribute('aria-labelledby', 'globalUrgentNoticeTitle');

        const title = document.createElement('h2');
        title.id = 'globalUrgentNoticeTitle';
        title.textContent = notice.title || 'Urgent Notice';

        const message = document.createElement('p');
        message.id = 'globalUrgentNoticeMessage';
        message.textContent = notice.message || '';

        const acknowledge = document.createElement('button');
        acknowledge.id = 'globalUrgentNoticeAcknowledge';
        acknowledge.type = 'button';
        acknowledge.textContent = 'I have read this notice';
        acknowledge.addEventListener('click', function () {
            localStorage.setItem(getAckKey(notice.id), 'true');
            closeNotice();
        });

        panel.append(title, message, acknowledge);
        overlay.appendChild(panel);
        document.head.appendChild(style);
        document.body.appendChild(overlay);
        acknowledge.focus();
    }

    async function checkGlobalUrgentNotice() {
        const scriptUrl = getNoticeUrl();
        if (!scriptUrl) return;

        try {
            const separator = scriptUrl.includes('?') ? '&' : '?';
            const response = await fetch(`${scriptUrl}${separator}action=check_update&t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            const notice = data.global_urgent_notice;

            if (!notice || !notice.enabled || !notice.id) {
                closeNotice();
                return;
            }

            if (localStorage.getItem(getAckKey(notice.id))) {
                closeNotice();
                return;
            }

            if (activeNoticeId !== notice.id) showNotice(notice);
        } catch (error) {
            console.warn('Global urgent notice check failed:', error);
        }
    }

    function startNoticeChecks() {
        checkGlobalUrgentNotice();
        window.setInterval(checkGlobalUrgentNotice, POLL_INTERVAL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startNoticeChecks, { once: true });
    } else {
        startNoticeChecks();
    }
})();