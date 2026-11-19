const express = require('express');
const crypto = require('crypto');
const { UserPermission, PermissionAudit } = require('../models/permissions');

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

function registerPermissionRoutes(app, { getConfiguredAdminUsers, CustomPage, permissionGuards }) {
    const router = express.Router();
    const { requirePermissionAdmin, isPrivilegedUser } = permissionGuards;

    // 1. Fetch active sub-users from existing MongoDB AdminCreds collection
    router.get('/sub-users', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = String(req.query.user || 'System').trim();
            const includeInactive = req.query.includeInactive === 'true';
            const users = await getConfiguredAdminUsers();

            const subUsers = users
                .map((u, idx) => {
                    const userId = String(u.userId || u.id || u.username || `USR-${idx + 1}`).trim();
                    const username = String(u.username || '').trim();
                    const role = String(u.role || 'User').trim();
                    const isActive = u.active !== false && u.isActive !== false && String(u.status || 'Active').toLowerCase() !== 'inactive';
                    return {
                        userId,
                        username,
                        role,
                        status: isActive ? 'Active' : 'Inactive',
                        isActive,
                        isPrivileged: isPrivilegedUser(u, username)
                    };
                })
                .filter(u => u.username && !u.isPrivileged) // Exclude Developer/Super Admin from sub-user target list
                .filter(u => includeInactive || u.isActive);

            res.json({ success: true, tenantOwner, data: subUsers });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 2. Fetch dynamic module registry (Base modules + any custom pages registered in MongoDB)
    router.get('/modules', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = String(req.query.user || 'System').trim();
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
            const tenantOwner = String(req.query.user || 'System').trim();
            const targetUserId = decodeURIComponent(req.params.userId).trim();

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
            const actorUsername = String(req.actorUsername || req.headers['x-rtr-user'] || req.query.actor || req.query.user || '').trim();
            const tenantOwner = String(req.query.user || 'System').trim();
            const users = await getConfiguredAdminUsers();
            const actor = users.find(u => String(u.username || '').trim().toLowerCase() === actorUsername.toLowerCase());

            if (isPrivilegedUser(actor, actorUsername)) {
                return res.json({ success: true, privileged: true, permissions: {} });
            }

            const doc = await UserPermission.findOne({
                tenantOwner,
                userId: { $regex: `^${actorUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
            }).lean();

            res.json({
                success: true,
                privileged: false,
                permissions: doc ? doc.permissions : {}
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // 5. Save or update permissions for a sub-user + record immutable Audit Trail
    router.post('/user/:userId', requirePermissionAdmin, async (req, res) => {
        try {
            const tenantOwner = String(req.query.user || 'System').trim();
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
            const users = await getConfiguredAdminUsers();
            const targetAccount = users.find(u =>
                String(u.userId || u.id || u.username || '').trim().toLowerCase() === targetUserId.toLowerCase() ||
                String(u.username || '').trim().toLowerCase() === targetUserId.toLowerCase()
            );

            if (!targetAccount) {
                return res.status(404).json({
                    success: false,
                    message: `Sub-user '${targetUserId}' does not exist in the user database.`
                });
            }

            if (isPrivilegedUser(targetAccount, targetAccount.username)) {
                return res.status(403).json({
                    success: false,
                    message: 'Developer and Super Admin permissions cannot be restricted or overwritten.'
                });
            }

            const incomingPerms = req.body.permissions || {};
            const actionType = req.body.actionPerformed || 'BULK_SAVE';
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
            const tenantOwner = String(req.query.user || 'System').trim();
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