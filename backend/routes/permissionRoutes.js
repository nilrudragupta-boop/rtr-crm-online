const express = require('express');
const crypto = require('crypto');
const { UserPermission, PermissionAudit } = require('../models/permissions');

const permissionLoginAttempts = new Map();

function canonicalFlags(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Permission flags must be an object.');
    const keys = Object.keys(input);
    if (keys.length > 200) throw new Error('Too many permission flags.');
    const result = {};
    keys.sort().forEach(key => {
        if (!/^perm_[a-z0-9_-]{1,100}$/i.test(key) || typeof input[key] !== 'boolean') {
            throw new Error('Permission flags contain an invalid entry.');
        }
        result[key] = input[key];
    });
    return result;
}

function createRemotePermissionSignature(method, actor, target, timestamp, nonce, flags, secret) {
    const canonical = `${method}\n${actor}\n${target}\n${timestamp}\n${nonce}\n${JSON.stringify(flags)}`;
    return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// Canonical CRM Module Registry aligned with existing HTML pages and UI_PERMISSION_REGISTRY
const BASE_CRM_MODULES = [
    { id: 'dashboard', name: 'Dashboard', page: 'dashboardB.html', legacyPermId: 'perm_summary_chart', category: 'Core' },
    { id: 'invoice', name: 'Invoice', page: 'invoice.html', legacyPermId: 'perm_make_invoice', category: 'Sales' },
    { id: 'item_stock', name: 'Item / Stock', page: 'item.html', legacyPermId: 'perm_manage_items', category: 'Inventory' },
    { id: 'customer', name: 'Customer', page: 'customer.html', legacyPermId: 'perm_manage_customers', category: 'Masters' },
    { id: 'supplier', name: 'Supplier', page: 'supplier.html', legacyPermId: 'perm_supplier', category: 'Masters' },
    { id: 'purchase', name: 'Purchase', page: 'purchase.html', legacyPermId: 'perm_purchase_entries', category: 'Purchase' },
    { id: 'advance_payment', name: 'Advance Payment', page: 'advance_pay.html', legacyPermId: 'perm_advance_pay', category: 'Accounts' },
    { id: 'daybook', name: 'Daybook', page: 'day_book.html', legacyPermId: 'perm_day_book', category: 'Accounts' },
    { id: 'ledger', name: 'Ledger', page: 'ledger.html', legacyPermId: 'perm_ledger_report', category: 'Accounts' },
    { id: 'expense_manager', name: 'Expense Manager', page: 'expense_manager.html', legacyPermId: 'perm_expense_manager', category: 'Accounts' },
    { id: 'profit_loss', name: 'Profit & Loss', page: 'profit_loss_report.html', legacyPermId: 'perm_profit_loss', category: 'Reports' },
    { id: 'stock_report', name: 'Stock Report', page: 'stock_report.html', legacyPermId: 'perm_stock_report', category: 'Reports' },
    { id: 'reminder', name: 'Reminder', page: 'reminder.html', legacyPermId: 'perm_reminder', category: 'Operations' },
    { id: 'follow_up', name: 'Follow-up Management', page: 'follow_up.html', legacyPermId: 'perm_follow_up', category: 'CRM' },
    { id: 'contacts', name: 'Contacts', page: 'contacts.html', legacyPermId: 'perm_manage_customers', category: 'CRM' },
    { id: 'business_360', name: 'Business 360', page: 'business360.html', legacyPermId: 'perm_business360', category: 'CRM' },
    { id: 'crm_v2', name: 'CRM V2', page: 'crm_v2.html', legacyPermId: 'perm_crm_v2', category: 'CRM' },
    { id: 'reports', name: 'Reports', page: 'report.html', legacyPermId: 'perm_sales_report', category: 'Reports' },
    { id: 'settings', name: 'Settings', page: 'settings.html', legacyPermId: 'perm_settings', category: 'Administration' },
    { id: 'quotation', name: 'Quotation', page: 'quotation.html', legacyPermId: 'perm_quotation', category: 'Sales' },
    { id: 'ordersheet', name: 'Ordersheet', page: 'order-sheet.html', legacyPermId: 'perm_order_sheet', category: 'Purchase' },
    { id: 'production', name: 'Production', page: 'production.html', legacyPermId: 'perm_production_entry', category: 'Manufacturing' },
    { id: 'journal_voucher', name: 'Journal Voucher', page: 'journal_voucher.html', legacyPermId: 'perm_journal_voucher', category: 'Accounts' },
    { id: 'credit_debit_note', name: 'Credit / Debit Note', page: 'credit_debit_notes.html', legacyPermId: 'perm_credit_debit_notes', category: 'Accounts' },
    { id: 'pdf_ocr_studio', name: 'PDF OCR Studio', page: 'pdf_ocr_studio.html', legacyPermId: 'perm_rtr_pdf_studio', category: 'Tools' }
];

const PERMISSION_KEYS = ['view', 'add', 'edit', 'delete', 'print', 'pdfDownload', 'excelDownload', 'import', 'export'];

function sanitizePermissionSet(raw = {}) {
    const clean = {};
    PERMISSION_KEYS.forEach(k => {
        clean[k] = Boolean(raw[k]);
    });
    return clean;
}

function registerPermissionRoutes(app, { getConfiguredAdminUsers, verifyAdminPassword, requestDeveloperOtp, verifyDeveloperOtp, googleScriptTargetUrl, CustomPage, permissionGuards }) {
    const router = express.Router();
    const { requirePermissionAdmin, isPrivilegedUser, createManagerSession } = permissionGuards;
    let remoteAccountsCache = { accounts: [], expiresAt: 0, loaded: false };

    router.post('/session', async (req, res) => {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        const isDeveloper = username.toLowerCase() === 'developer' || username === '7908040851';
        const attemptKey = String(req.ip || req.socket?.remoteAddress || 'unknown');
        const now = Date.now();
        const attempt = permissionLoginAttempts.get(attemptKey);
        if (attempt && attempt.blockedUntil > now) {
            return res.status(429).json({ success: false, message: 'Too many attempts. Try again in a few minutes.' });
        }
        if (!username || username.length > 200 || password.length > 512) {
            return res.status(400).json({ success: false, message: 'Account verification details are required.' });
        }
        try {
            if (isDeveloper && req.body?.action === 'request_developer_otp') {
                const challengeId = crypto.randomBytes(18).toString('hex');
                const result = await requestDeveloperOtp(req, challengeId);
                if (!result.success) return res.status(result.status || 502).json(result);
                return res.json({ success: true, challengeId, message: result.message || 'Developer OTP sent.' });
            }

            let account;
            if (isDeveloper) {
                const challengeId = String(req.body?.challengeId || '');
                if (!/^[a-f0-9]{36}$/.test(challengeId)) {
                    return res.status(400).json({ success: false, message: 'Developer verification session is missing. Request a new code.' });
                }
                const otpIsValid = await verifyDeveloperOtp(req, challengeId, String(req.body?.otp || ''));
                if (otpIsValid) account = { username: username.toLowerCase() === 'developer' ? 'developer' : username, role: 'Developer', isLicensedAdmin: true };
            } else {
                account = await verifyAdminPassword(username, password);
            }
            const inactive = account && (account.active === false || account.isActive === false || ['inactive', 'disabled', 'suspended'].includes(String(account.status || '').toLowerCase()));
            if (!account || inactive || !isPrivilegedUser(account, username)) {
                const next = attempt && attempt.windowStarted > now - 10 * 60 * 1000 ? attempt : { failures: 0, windowStarted: now };
                next.failures += 1;
                if (next.failures >= 8) next.blockedUntil = now + 10 * 60 * 1000;
                permissionLoginAttempts.set(attemptKey, next);
                return res.status(401).json({ success: false, message: isDeveloper ? 'Developer verification code is invalid or expired.' : 'Account verification failed.' });
            }
            permissionLoginAttempts.delete(attemptKey);
            const tenantOwner = username.toLowerCase() === 'developer' || username === '7908040851' ? '7908040851' : String(account.username || username).trim();
            const token = createManagerSession(String(account.username || username).trim(), tenantOwner);
            res.set('Cache-Control', 'no-store');
            return res.json({ success: true, token, expiresIn: 1800, username: String(account.username || username).trim(), tenantOwner });
        } catch (err) {
            return res.status(503).json({ success: false, message: err.message || 'Permission manager authentication is unavailable.' });
        }
    });

    function getTenantOwner(req) {
        return String(req.permissionTenantOwner || 'System').trim();
    }

    function normalizedContacts(account) {
        return String(account?.contactNumber || '').split(',').map(value => value.replace(/\D/g, '').slice(-10)).filter(Boolean);
    }

    async function getPermissionTargets(req) {
        const configuredUsers = await getConfiguredAdminUsers();
        let sheetUsers = remoteAccountsCache.accounts;
        if (Date.now() >= remoteAccountsCache.expiresAt) {
            try {
                const response = await callSignedRemotePermissions('list_remote_permission_accounts', req.permissionActor.username, '*');
                sheetUsers = response.data?.accounts || [];
                remoteAccountsCache = { accounts: sheetUsers, expiresAt: Date.now() + 30000, loaded: true };
            } catch (_) {
                // Preserve the existing backend account flow if the optional sheet sync is unavailable.
                sheetUsers = remoteAccountsCache.accounts.length ? remoteAccountsCache.accounts : [];
            }
        }
        const usersByName = new Map();
        (remoteAccountsCache.loaded ? sheetUsers : configuredUsers).forEach(user => {
            const key = String(user.username || '').trim().toLowerCase();
            if (key) usersByName.set(key, { ...(usersByName.get(key) || {}), ...user });
        });
        const configuredActor = configuredUsers.find(user => String(user.username || '').trim().toLowerCase() === req.permissionActor.username.toLowerCase());
        if (configuredActor && !usersByName.has(req.permissionActor.username.toLowerCase())) usersByName.set(req.permissionActor.username.toLowerCase(), configuredActor);
        const users = [...usersByName.values()];
        const actor = users.find(user => String(user.username || '').trim().toLowerCase() === req.permissionActor.username.toLowerCase());
        if (req.permissionActor.role.toLowerCase() === 'developer') return users;
        const ownerName = getTenantOwner(req).toLowerCase();
        const owner = users.find(user => String(user.username || '').trim().toLowerCase() === ownerName) || actor;
        const ownerContacts = normalizedContacts(owner);
        if (!ownerContacts.length) return actor ? [actor] : [];
        return users.filter(user => normalizedContacts(user).some(contact => ownerContacts.includes(contact)));
    }

    function findPermissionTarget(targetId, targets) {
        const normalizedId = String(targetId || '').trim().toLowerCase();
        return targets.find(user => [user.username, user.userId, user.id].some(value => String(value || '').trim().toLowerCase() === normalizedId)) || null;
    }

    async function callSignedRemotePermissions(method, actor, targetUsername, flags = {}) {
        const secret = String(process.env.REMOTE_PERMISSION_HMAC_SECRET || '');
        if (secret.length < 32) throw new Error('Remote permission signing is not configured on the backend. Set REMOTE_PERMISSION_HMAC_SECRET before using the Licenses sync.');
        let target;
        try { target = new URL(googleScriptTargetUrl || ''); }
        catch (_) { throw new Error('Google Apps Script service is not configured.'); }
        if (target.protocol !== 'https:' || target.hostname !== 'script.google.com' || !target.pathname.startsWith('/macros/s/')) {
            throw new Error('Google Apps Script service configuration is invalid.');
        }
        const timestamp = Date.now();
        const nonce = crypto.randomBytes(18).toString('hex');
        const signature = createRemotePermissionSignature(method, actor, targetUsername, timestamp, nonce, flags, secret);
        const response = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, actor, targetUsername, timestamp, nonce, permissionFlags: flags, signature }),
            redirect: 'follow'
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.message || 'Google Sheet permission update failed.');
        return data;
    }

    router.get('/remote/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const target = decodeURIComponent(req.params.userId).trim();
            const actor = req.permissionActor.username;
            const targetAccount = findPermissionTarget(target, await getPermissionTargets(req));
            if (!targetAccount) return res.status(404).json({ success: false, message: 'The selected account is outside this Admin’s tenant.' });
            // Targets have already been restricted to the signed-in Admin's tenant.
            // Allow managing another licensed Admin in that tenant from this manager.
            const result = await callSignedRemotePermissions('get_remote_permissions', actor, String(targetAccount.username).trim());
            res.set('Cache-Control', 'no-store');
            return res.json({ success: true, data: result.data || { permFlags: {} } });
        } catch (err) {
            return res.status(502).json({ success: false, message: err.message });
        }
    });

    router.post('/remote/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const target = decodeURIComponent(req.params.userId).trim();
            const actor = req.permissionActor.username;
            const targetAccount = findPermissionTarget(target, await getPermissionTargets(req));
            if (!targetAccount) return res.status(404).json({ success: false, message: 'The selected account is outside this Admin’s tenant.' });
            // Targets have already been restricted to the signed-in Admin's tenant.
            // Allow managing another licensed Admin in that tenant from this manager.
            const flags = canonicalFlags(req.body?.permFlags);
            const result = await callSignedRemotePermissions('set_remote_permissions', actor, String(targetAccount.username).trim(), flags);
            const previousFlags = result.data?.previousPermFlags || {};
            const auditEntries = Object.keys(flags).filter(id => previousFlags[id] !== flags[id]).map(id => ({
                auditId: `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                tenantOwner: getTenantOwner(req),
                subUserId: targetAccount.username.toLowerCase() === actor.toLowerCase() ? actor : targetAccount.userId || targetAccount.id || targetAccount.username,
                subUserName: targetAccount.username,
                moduleId: id,
                moduleName: id,
                previousPermissions: typeof previousFlags[id] === 'boolean' ? { value: previousFlags[id] } : null,
                newPermissions: { value: flags[id] },
                actionPerformed: typeof previousFlags[id] === 'boolean' ? 'UPDATE' : 'CREATE',
                changedBy: actor,
                changedByRole: req.permissionActor.role,
                ipAddress: req.ip || req.socket?.remoteAddress || '',
                timestamp: new Date()
            }));
            if (auditEntries.length) await PermissionAudit.insertMany(auditEntries);
            return res.json({ success: true, message: result.message || 'Remote permissions saved to the Licenses sheet.', data: result.data || { permFlags: flags }, auditCount: auditEntries.length });
        } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
    });

    const allowedDashboards = new Set(['dashboardB.html', 'dashboardC.html', 'dashboardD.html', 'dashboardE.html', 'dashboardF1.html', 'dashboardF2.html', 'dashboardF3.html', 'dashboardF4.html', 'dashboardF5.html', 'dashboardF6.html']);
    router.get('/dashboard/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const target = decodeURIComponent(req.params.userId).trim();
            const targetAccount = findPermissionTarget(target, await getPermissionTargets(req));
            if (!targetAccount) return res.status(404).json({ success: false, message: 'The selected account is outside this Admin’s tenant.' });
            const result = await callSignedRemotePermissions('get_dashboard_assignment', req.permissionActor.username, String(targetAccount.username).trim());
            res.set('Cache-Control', 'no-store');
            return res.json({ success: true, data: result.data || { dashboardFile: '' } });
        } catch (err) {
            return res.status(502).json({ success: false, message: err.message });
        }
    });

    router.post('/dashboard/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const target = decodeURIComponent(req.params.userId).trim();
            const targetAccount = findPermissionTarget(target, await getPermissionTargets(req));
            if (!targetAccount) return res.status(404).json({ success: false, message: 'The selected account is outside this Admin’s tenant.' });
            const dashboardFile = String(req.body?.dashboardFile || '');
            if (!allowedDashboards.has(dashboardFile)) return res.status(400).json({ success: false, message: 'Select a supported dashboard.' });
            const dashboardId = dashboardFile.replace(/\.html$/i, '').toLowerCase();
            const result = await callSignedRemotePermissions('set_dashboard_assignment', req.permissionActor.username, String(targetAccount.username).trim(), { [`perm_dashboard_${dashboardId}`]: true });
            return res.json({ success: true, message: result.message || 'Dashboard assignment saved.', data: result.data || { dashboardFile } });
        } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
    });

    // 1. Fetch active sub-users from existing MongoDB AdminCreds collection
    router.get('/sub-users', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = getTenantOwner(req);
            const includeInactive = req.query.includeInactive === 'true';
            const users = await getPermissionTargets(req);

            const subUsers = users
                .map(u => {
                    const userId = String(u.userId || u.id || u.username || '').trim();
                    const username = String(u.username || '').trim();
                    const role = String(u.role || 'User').trim();
                    const accountStatus = String(u.status || ((u.active === false || u.isActive === false) ? 'Inactive' : 'Active')).trim();
                    const isActive = u.active !== false && u.isActive !== false && !['inactive', 'disabled', 'suspended'].includes(accountStatus.toLowerCase());
                    return {
                        userId,
                        username,
                        role,
                        status: accountStatus,
                        isActive,
                        isPrivileged: isPrivilegedUser(u, username),
                        isLicensedAdmin: u.isLicensedAdmin === true || String(u.role || '').trim().toLowerCase() === 'admin'
                    };
                })
                .filter(u => u.username && u.username.toLowerCase() !== req.permissionActor.username.toLowerCase())
                .filter(u => !u.isPrivileged || u.isLicensedAdmin) // Include tenant Admins; exclude Developer/Super Admin
                .filter(u => includeInactive || u.isActive);

            res.json({
                success: true,
                tenantOwner,
                source: remoteAccountsCache.loaded ? 'Google Sheet' : 'Backend fallback',
                warning: remoteAccountsCache.loaded ? '' : 'Google Sheet account list could not be loaded; showing configured backend accounts.',
                data: subUsers
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 2. Fetch dynamic module registry (Base modules + any custom pages registered in MongoDB)
    router.get('/modules', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = getTenantOwner(req);
            const modules = [...BASE_CRM_MODULES];

            if (CustomPage) {
                const customPages = await CustomPage.find({ createdBy: tenantOwner }).sort({ order: 1 }).lean();
                customPages.forEach(cp => {
                    const modId = String(cp.pageId || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    if (modId && !modules.some(m => m.id === modId)) {
                        modules.push({
                            id: modId,
                            name: cp.label || cp.pageId,
                            page: `custom_module.html?page=${encodeURIComponent(cp.pageId)}`,
                            legacyPermId: `perm_custom_${modId}`,
                            category: 'Custom Objects'
                        });
                    }
                });
            }

            res.json({ success: true, data: modules });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 3. Get saved permissions for a specific sub-user
    router.get('/user/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = getTenantOwner(req);
            const targetUserId = decodeURIComponent(req.params.userId).trim();
            const targetAccount = findPermissionTarget(targetUserId, await getPermissionTargets(req));
            if (!targetAccount || isPrivilegedUser(targetAccount, targetAccount.username)) {
                return res.status(404).json({ success: false, message: 'Sub-user not found in this Admin’s tenant.' });
            }

            const doc = await UserPermission.findOne({ tenantOwner, userId: targetUserId }).lean();
            res.json({
                success: true,
                data: doc || {
                    userId: targetUserId,
                    username: targetUserId,
                    tenantOwner,
                    permissions: {},
                    updatedAt: null,
                    updatedBy: null
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 4. Read-only endpoint for any logged-in user to fetch their own effective permissions (for UI / URL guard)
    router.get('/my-permissions', async (req, res) => {
        try {
            const actorUsername = String(req.headers['x-rtr-user'] || req.query.actor || req.actorUsername || req.query.user || '').trim();
            const tenantOwner = String(req.query.user || 'System').trim();
            const users = await getConfiguredAdminUsers();
            const actor = users.find(u => String(u.username || '').trim().toLowerCase() === actorUsername.toLowerCase());
            if (!actor || !actorUsername) {
                return res.status(401).json({ success: false, message: 'A registered CRM account is required.' });
            }
            if (actor.active === false || actor.isActive === false || ['inactive', 'disabled', 'suspended'].includes(String(actor.status || '').toLowerCase())) {
                return res.status(403).json({ success: false, message: 'Account is inactive.' });
            }
            if (isPrivilegedUser(actor, actorUsername)) {
                return res.json({ success: true, privileged: true, permissions: {} });
            }
            const requestedModule = String(req.query.module || '').trim();
            const doc = await permissionGuards.findUserPermission(tenantOwner, actor, requestedModule);
            const permissions = permissionGuards.toPermissionObject(doc?.permissions);

            res.json({
                success: true,
                privileged: false,
                permissions
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 5. Save or update permissions for a sub-user + record immutable Audit Trail
    router.post('/user/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = getTenantOwner(req);
            const targetUserId = decodeURIComponent(req.params.userId).trim();
            const actor = req.permissionActor;

            // Strict Rule: Never allow any user to modify their own permissions
            if (targetUserId.toLowerCase() === actor.username.toLowerCase()) {
                return res.status(403).json({
                    success: false,
                    message: 'Security Policy Violation: You cannot modify your own permissions.'
                });
            }

            // Verify target sub-user exists in AdminCreds (do not create duplicate users)
            const users = await getPermissionTargets(req);
            const targetAccount = findPermissionTarget(targetUserId, users);

            if (!targetAccount) {
                return res.status(404).json({
                    success: false,
                    message: `Sub-user '${targetUserId}' does not exist in the user database.`
                });
            }

            const actorIds = [actor.username, actor.userId, actor.id].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
            const targetIds = [targetUserId, targetAccount.username, targetAccount.userId, targetAccount.id].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
            if (actorIds.some(id => targetIds.includes(id))) {
                return res.status(403).json({ success: false, message: 'You cannot modify your own permissions.' });
            }
            if (targetAccount.active === false || targetAccount.isActive === false || ['inactive', 'disabled', 'suspended'].includes(String(targetAccount.status || '').trim().toLowerCase())) {
                return res.status(403).json({ success: false, message: 'Inactive sub-users cannot be assigned permissions.' });
            }
            if (isPrivilegedUser(targetAccount, targetAccount.username)) {
                return res.status(403).json({
                    success: false,
                    message: 'Developer and Super Admin permissions cannot be restricted or overwritten.'
                });
            }

            const incomingPerms = req.body.permissions || {};
            const actionType = req.body.actionPerformed === 'COPY' ? 'COPY' : 'BULK_SAVE';
            const moduleLabels = req.body.moduleLabels || {};

            const existingDoc = await UserPermission.findOne({ tenantOwner, userId: targetUserId }).lean();
            const prevMap = (existingDoc && existingDoc.permissions) ? existingDoc.permissions : {};

            const sanitizedMap = {};
            const allModuleIds = new Set([...Object.keys(prevMap), ...Object.keys(incomingPerms)]);
            const auditEntries = [];
            const clientIp = req.ip || req.socket?.remoteAddress || '';
            const now = new Date();

            allModuleIds.forEach(modId => {
                const prevMod = prevMap[modId] ? sanitizePermissionSet(prevMap[modId]) : null;
                const nextRaw = incomingPerms[modId];
                const nextMod = nextRaw ? sanitizePermissionSet(nextRaw) : null;

                // Only store module if at least one permission is enabled, or remove if cleared
                const hasAnyEnabled = nextMod && Object.values(nextMod).some(Boolean);
                if (hasAnyEnabled) {
                    sanitizedMap[modId] = nextMod;
                }

                const prevStr = JSON.stringify(prevMod);
                const nextStr = JSON.stringify(hasAnyEnabled ? nextMod : null);

                if (prevStr !== nextStr) {
                    let derivedAction = actionType;
                    if (!prevMod && hasAnyEnabled) derivedAction = 'CREATE';
                    else if (prevMod && !hasAnyEnabled) derivedAction = 'REMOVE';
                    else if (actionType === 'BULK_SAVE') derivedAction = 'UPDATE';

                    auditEntries.push({
                        auditId: `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                        tenantOwner,
                        subUserId: targetUserId,
                        subUserName: targetAccount.username,
                        moduleId: modId,
                        moduleName: moduleLabels[modId] || modId,
                        previousPermissions: prevMod,
                        newPermissions: hasAnyEnabled ? nextMod : null,
                        actionPerformed: derivedAction,
                        changedBy: actor.username,
                        changedByRole: actor.role,
                        ipAddress: clientIp,
                        timestamp: now
                    });
                }
            });

            const saved = await UserPermission.findOneAndUpdate(
                { tenantOwner, userId: targetUserId },
                {
                    $set: {
                        userId: targetUserId,
                        username: targetAccount.username,
                        tenantOwner,
                        permissions: sanitizedMap,
                        updatedAt: now,
                        updatedBy: actor.username
                    }
                },
                { new: true, upsert: true }
            ).lean();

            if (auditEntries.length > 0) {
                await PermissionAudit.insertMany(auditEntries);
            }

            res.json({
                success: true,
                message: `Permissions saved for ${targetAccount.username}.`,
                data: saved,
                auditCount: auditEntries.length
            });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    });

    // 6. Fetch immutable Audit Trail logs
    router.get('/audit', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = getTenantOwner(req);
            const query = { tenantOwner };
            if (req.query.subUserId) query.subUserId = String(req.query.subUserId).trim();

            const logs = await PermissionAudit.find(query)
                .sort({ timestamp: -1 })
                .limit(200)
                .lean();

            res.json({ success: true, data: logs });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.use('/api/permissions', router);
}

module.exports = registerPermissionRoutes;
