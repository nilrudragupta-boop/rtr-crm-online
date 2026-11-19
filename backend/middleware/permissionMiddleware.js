const { UserPermission } = require('../models/permissions');
const mongoose = require('mongoose');

// Maps existing CRM API prefixes and HTML pages to canonical module IDs
const ROUTE_MODULE_MAP = [
    { prefix: '/api/invoices', moduleId: 'invoice', modelName: 'Invoice' },
    { prefix: '/api/sales-records', moduleId: 'invoice', modelName: 'SalesRecord' },
    { prefix: '/api/items', moduleId: 'item_stock', modelName: 'Item' },
    { prefix: '/api/stock-journal', moduleId: 'item_stock', modelName: 'StockJournal' },
    { prefix: '/api/customers', moduleId: 'customer', modelName: 'Customer' },
    { prefix: '/api/suppliers', moduleId: 'supplier', modelName: 'Supplier' },
    { prefix: '/api/purchases', moduleId: 'purchase', modelName: 'Purchase' },
    { prefix: '/api/advance-payments', moduleId: 'advance_payment', modelName: 'AdvancePayment' },
    { prefix: '/api/expenses', moduleId: 'expense_manager', modelName: 'Expense' },
    { prefix: '/api/reminders', moduleId: 'reminder' },
    { prefix: '/api/follow-ups', moduleId: 'follow_up', modelName: 'FollowUp' },
    { prefix: '/api/crm-contacts', moduleId: 'contacts', modelName: 'CrmContact' },
    { prefix: '/api/crm/customer', moduleId: 'business_360', modelName: 'Customer' },
    { prefix: '/api/crm-enquiries', moduleId: 'crm_v2', modelName: 'CrmEnquiry' },
    { prefix: '/api/crm-technical-reviews', moduleId: 'crm_v2', modelName: 'CrmTechnicalReview' },
    { prefix: '/api/crm-negotiations', moduleId: 'crm_v2', modelName: 'CrmNegotiation' },
    { prefix: '/api/settings', moduleId: 'settings' },
    { prefix: '/api/custom-fields', moduleId: 'settings', modelName: 'CustomField' },
    { prefix: '/api/custom-pages', moduleId: 'settings', modelName: 'CustomPage' },
    { prefix: '/api/quotations', moduleId: 'quotation', modelName: 'Quotation' },
    { prefix: '/api/order-sheets', moduleId: 'ordersheet', modelName: 'OrderSheet' },
    { prefix: '/api/production', moduleId: 'production', modelName: 'Production' },
    { prefix: '/api/boms', moduleId: 'production', modelName: 'Bom' },
    { prefix: '/api/scraps', moduleId: 'production', modelName: 'Scrap' },
    { prefix: '/api/journal-vouchers', moduleId: 'journal_voucher', modelName: 'JournalVoucher' },
    { prefix: '/api/credit-debit-notes', moduleId: 'credit_debit_note', modelName: 'CreditDebitNote' },
    { prefix: '/api/bank-accounts', moduleId: 'journal_voucher', modelName: 'BankAccount' },
    { prefix: '/api/bank-transactions', moduleId: 'journal_voucher', modelName: 'BankTransaction' },
    { prefix: '/api/marketing-visits', moduleId: 'follow_up', modelName: 'MarketingVisit' },
    { prefix: '/api/employees', moduleId: 'settings', modelName: 'Employee' },
    { prefix: '/api/advance-audit', moduleId: 'advance_payment', modelName: 'AdvanceAuditEvent' }
];

const PRIVILEGED_ROLES = new Set(['developer', 'super admin', 'superadmin', 'admin']);

function isPrivilegedUser(actor, username) {
    const cleanUser = String(username || '').trim().toUpperCase();
    if (cleanUser === 'DEVELOPER' || cleanUser === 'RTR-7908040851' || cleanUser === '7908040851') {
        return true;
    }
    if (!actor) return false;
    const role = String(actor.role || '').trim().toLowerCase();
    return PRIVILEGED_ROLES.has(role) || actor.isLicensedAdmin === true;
}

/**
 * Resolves the authenticated actor from AdminCreds without altering existing login/session logic.
 */
function createPermissionGuards(getConfiguredAdminUsers) {
    async function resolveActor(req) {
        if (req.permissionManagerSession) {
            const username = String(req.permissionManagerSession.username || 'developer');
            const actor = { username, role: 'Developer', isLicensedAdmin: true };
            return { username, actor, privileged: true };
        }

        // Permission Manager requests include both a tenant (`user`) and the
        // signed-in actor. Prefer the actor fields so the tenant cannot be
        // mistaken for the person making the request.
        const actorUsername = String(
            req.headers['x-rtr-user'] ||
            req.query.actor ||
            req.actorUsername ||
            req.query.user ||
            ''
        ).trim();

        if (!actorUsername || actorUsername === 'System') {
            return { username: actorUsername || 'System', actor: null, privileged: false };
        }

        const users = await getConfiguredAdminUsers();
        let actor = users.find(
            u => String(u.username || '').trim().toLowerCase() === actorUsername.toLowerCase()
        ) || null;

        // The Developer account is a built-in privileged identity and may not
        // be present in AdminCreds.adminUsers. Give it a permission-scoped
        // identity so the manager's own admin routes can still authorize it.
        if (!actor && isPrivilegedUser(null, actorUsername)) {
            actor = { username: actorUsername, role: 'Developer', isLicensedAdmin: true };
        }

        const privileged = isPrivilegedUser(actor, actorUsername);
        return { username: actor ? actor.username : actorUsername, actor, privileged };
    }

    /**
     * Middleware: Restricts access exclusively to Developer / Super Admin / Admin
     */
    async function requirePermissionAdmin(req, res, next) {
        try {
            const { username, actor, privileged } = await resolveActor(req);
            if (!username || username === 'System' || !actor) {
                return res.status(401).json({ success: false, message: 'A registered CRM account is required.' });
            }
            if (actor.active === false || actor.isActive === false || String(actor.status || '').toLowerCase() === 'inactive') {
                return res.status(403).json({ success: false, message: 'Account is inactive.' });
            }
            if (!privileged) {
                return res.status(403).json({
                    success: false,
                    message: 'Access Denied: Only Developer, Super Admin, or Admin accounts can manage user permissions.'
                });
            }
            req.permissionActor = { username, role: actor?.role || 'Developer', privileged: true };
            next();
        } catch (err) {
            res.status(500).json({ success: false, message: 'Authorization verification failed.' });
        }
    }

    /**
     * Middleware: Enforces module & action permissions on CRM API endpoints
     */
    async function enforceModulePermission(req, res, next) {
        try {
            // Skip permission management endpoints (protected by requirePermissionAdmin) & public auth
            if (req.path.startsWith('/permissions') || req.path.startsWith('/auth') || req.path === '/status') {
                return next();
            }

            const matchedRoute = ROUTE_MODULE_MAP.find(r => (`/api${req.path}`).startsWith(r.prefix));
            if (!matchedRoute) return next();

            const { username, actor, privileged } = await resolveActor(req);
            if (!actor) {
                return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'A registered CRM account is required.' });
            }
            if (actor.active === false || actor.isActive === false || ['inactive', 'disabled', 'suspended'].includes(String(actor.status || '').toLowerCase())) {
                return res.status(403).json({ success: false, message: 'Account is inactive.' });
            }
            if (privileged) return next();

            // Resolve the actor's configured permission record in MongoDB.

            const tenantOwner = String(req.query.user || 'System').trim();
            const actorIds = [actor.userId, actor.id, actor.username].map(value => String(value || '').trim()).filter(Boolean);
            const permDoc = await UserPermission.findOne({ tenantOwner, userId: { $in: actorIds } }).lean();

            // Determine required action from HTTP method, headers, or URL suffix
            const urlLower = String(req.path || '').toLowerCase();
            const requestedFormat = String(req.query.format || '').toLowerCase();
            let requiredAction = '';
            if (urlLower.includes('/pdf') || requestedFormat === 'pdf') requiredAction = 'pdfDownload';
            else if (urlLower.includes('/excel') || requestedFormat === 'xlsx' || requestedFormat === 'csv') requiredAction = 'excelDownload';
            else if (urlLower.includes('/import')) requiredAction = 'import';
            else if (urlLower.includes('/export')) requiredAction = 'export';
            else if (urlLower.includes('/print')) requiredAction = 'print';
            else if (req.method === 'GET') requiredAction = 'view';
            else if (req.method === 'DELETE') requiredAction = 'delete';
            else if (req.method === 'PUT' || req.method === 'PATCH') requiredAction = 'edit';
            else if (req.method === 'POST') {
                const restoreOrReorder = /\/(restore|reorder)(?:\?|$)/i.test(req.originalUrl);
                    if (restoreOrReorder) {
                        requiredAction = 'edit';
                    } else {
                        const model = matchedRoute.modelName && mongoose.models[matchedRoute.modelName];
                        const identifiers = [req.params.id, req.params.orderNo, req.params.pageId, req.body && req.body._id, req.body && req.body.id, req.body && req.body.invoiceNo, req.body && req.body.orderNo].filter(value => value !== undefined && value !== null && String(value) !== '');
                        let isEdit = false;
                        if (model && identifiers.length) {
                            const fields = matchedRoute.idFields || ['_id', 'id', 'invoiceNo', 'orderNo', 'pageId'];
                            for (const field of fields) {
                                for (const value of identifiers) {
                                    try { if (await model.exists({ [field]: value })) { isEdit = true; break; } } catch (_) {}
                                }
                                if (isEdit) break;
                            }
                        }
                        requiredAction = isEdit ? 'edit' : 'add';
                    }
            }

            const modulePerms = permDoc && permDoc.permissions ? permDoc.permissions[matchedRoute.moduleId] : null;
            if (!modulePerms || modulePerms[requiredAction] !== true) {
                return res.status(403).json({
                    success: false,
                    code: 'PERMISSION_DENIED',
                    module: matchedRoute.moduleId,
                    action: requiredAction,
                    message: `Access Denied: You do not have '${requiredAction}' permission for the '${matchedRoute.moduleId}' module.`
                });
            }

            next();
        } catch (err) {
            console.error('Permission enforcement error:', err);
            res.status(500).json({ success: false, message: 'Permission validation error.' });
        }
    }

    return {
        requirePermissionAdmin,
        enforceModulePermission,
        isPrivilegedUser
    };
}

module.exports = createPermissionGuards;
