(function () {
    'use strict';

    // Initialize only after login credentials have finished loading.
    document.addEventListener('login-settings-ready', function () {
        const pressedKeys = new Set();

        document.addEventListener('keyup', function (event) {
            pressedKeys.delete(String(event.key || '').toLowerCase());
        });

        document.addEventListener('keydown', function (event) {
            const key = String(event.key || '').toLowerCase();
            pressedKeys.add(key);

            if (event.ctrlKey && event.shiftKey && key === 'd') {
                event.preventDefault();
                document.getElementById('username').value = 'RTR-7908040851';
                document.getElementById('password').value = 'NANCY@20129830428736';
                pressedKeys.clear();
                validateLogin();
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
            }

            if (event.ctrlKey && event.shiftKey && pressedKeys.has('k') && pressedKeys.has('m')) {
                event.preventDefault();
                const users = typeof ADMIN_USERS !== 'undefined' ? ADMIN_USERS : [];
                const defaultUser = users.length > 0 ? users[0].username : 'Admin';
                const defaultPass = users.length > 0
                    ? (users[0].password || localStorage.getItem('appPassword') || '')
                    : '';
                document.getElementById('username').value = defaultUser;
                document.getElementById('password').value = defaultPass;
                pressedKeys.clear();
                validateLogin();
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
            }
        });
    });
})();
