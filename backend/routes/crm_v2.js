const mongoose = require('mongoose');

const relationshipSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    fromModule: { type: String, required: true, index: true },
    fromId: { type: String, required: true, index: true },
    toModule: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    relationType: { type: String, default: 'RELATED_TO', index: true },
    source: { type: String, default: 'CRM_V2' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: String, default: 'System' }
}, { timestamps: true, strict: false });
relationshipSchema.index({ fromModule: 1, fromId: 1, toModule: 1, toId: 1, relationType: 1 }, { unique: true });

const activitySchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    activityType: { type: String, default: 'Task', index: true },
    subject: { type: String, required: true },
    details: String,
    status: { type: String, default: 'Open', index: true },
    priority: { type: String, default: 'Medium', index: true },
    dueDate: String,
    completedAt: String,
    assignedTo: String,
    customerId: { type: String, index: true },
    supplierId: { type: String, index: true },
    plantId: String,
    enquiryId: String,
    quotationId: String,
    poId: String,
    invoiceId: String,
    ticketId: String,
    relatedModule: String,
    relatedId: String,
    createdBy: { type: String, default: 'System' }
}, { timestamps: true, strict: false });

const auditSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    module: { type: String, required: true, index: true },
    recordId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    user: { type: String, default: 'System' },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    reason: String
}, { timestamps: true, strict: false });

const Relationship = mongoose.models.CrmV2Relationship || mongoose.model('CrmV2Relationship', relationshipSchema);
const V2Activity = mongoose.models.CrmV2Activity || mongoose.model('CrmV2Activity', activitySchema);
const AuditLog = mongoose.models.CrmV2AuditLog || mongoose.model('CrmV2AuditLog', auditSchema);

const money = v => {
    if (typeof v === 'string') v = v.replace(/[₹,\s]/g, '');
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
};
const norm = v => String(v ?? '').trim().toLowerCase();
const idFor = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const exact = (value) => new RegExp('^' + String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

module.exports = function registerCrmV2(app, deps) {
    const { Customer, Supplier, CrmContact, CrmPlant, CrmEnquiry, Invoice, Purchase, FollowUp, Quotation } = deps;

    app.get('/api/crm/v2/health', async (req, res) => {
        res.json({ success: true, version: '2.0', message: 'RISE Tech CRM V2 API is ready' });
    });

    app.get('/api/crm/v2/search', async (req, res) => {
        try {
            const q = norm(req.query.q);
            if (!q) return res.json({ success: true, data: [] });
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const [customers, suppliers, enquiries, quotations, invoices] = await Promise.all([
                Customer.find({ $or: [{ name: rx }, { gstin: rx }, { id: rx }] }).limit(10).lean(),
                Supplier.find({ $or: [{ name: rx }, { gstin: rx }, { id: rx }] }).limit(10).lean(),
                CrmEnquiry.find({ $or: [{ enquiryNo: rx }, { customerName: rx }, { subject: rx }] }).limit(10).lean(),
                Quotation.find({ $or: [{ refNo: rx }, { custName: rx }, { enquiryNo: rx }] }).limit(10).lean(),
                Invoice.find({ $or: [{ invoiceNo: rx }, { customerName: rx }, { customerId: rx }] }).limit(10).lean()
            ]);
            const data = [
                ...customers.map(x => ({ type: 'Customer', id: x.id, ref: x.id, name: x.name, page: 'customer.html' })),
                ...suppliers.map(x => ({ type: 'Supplier', id: x.id, ref: x.id, name: x.name, page: 'supplier.html' })),
                ...enquiries.map(x => ({ type: 'Enquiry', id: x.id, ref: x.enquiryNo, name: x.subject || x.customerName, page: 'enquiry.html' })),
                ...quotations.map(x => ({ type: 'Quotation', id: x.id, ref: x.refNo || x.id, name: x.custName || 'Quotation', page: 'quotation.html' })),
                ...invoices.map(x => ({ type: 'Invoice', id: x.id, ref: x.invoiceNo || x.id, name: x.customerName || 'Invoice', page: 'invoice.html' }))
            ];
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.post('/api/crm/v2/relationships', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.fromModule || !b.fromId || !b.toModule || !b.toId) return res.status(400).json({ success: false, message: 'fromModule, fromId, toModule and toId are required' });
            const payload = { ...b, id: b.id || idFor('REL') };
            const data = await Relationship.findOneAndUpdate(
                { fromModule: b.fromModule, fromId: b.fromId, toModule: b.toModule, toId: b.toId, relationType: b.relationType || 'RELATED_TO' },
                payload, { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            res.json({ success: true, data });
        } catch (err) { res.status(400).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/relationships', async (req, res) => {
        try {
            const q = {};
            if (req.query.module) q.$or = [{ fromModule: req.query.module }, { toModule: req.query.module }];
            if (req.query.id) q.$or = [{ fromId: req.query.id }, { toId: req.query.id }];
            const data = await Relationship.find(q).sort({ createdAt: -1 }).limit(500).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/record/:module/:id/relationships', async (req, res) => {
        try {
            const { module, id } = req.params;
            const data = await Relationship.find({ $or: [{ fromModule: module, fromId: id }, { toModule: module, toId: id }] }).sort({ createdAt: -1 }).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.delete('/api/crm/v2/relationships/:id', async (req, res) => {
        try { await Relationship.deleteOne({ id: req.params.id }); res.json({ success: true }); }
        catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/activities', async (req, res) => {
        try {
            const q = {};
            ['customerId', 'supplierId', 'assignedTo', 'status', 'priority', 'activityType'].forEach(k => { if (req.query[k]) q[k] = req.query[k]; });
            const data = await V2Activity.find(q).sort({ dueDate: 1, createdAt: -1 }).limit(500).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.post('/api/crm/v2/activities', async (req, res) => {
        try {
            const payload = { ...req.body, id: req.body.id || idFor('ACT'), createdBy: req.body.createdBy || req.query.user || 'System' };
            const data = await V2Activity.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true, setDefaultsOnInsert: true });
            res.json({ success: true, data });
        } catch (err) { res.status(400).json({ success: false, message: err.message }); }
    });

    app.delete('/api/crm/v2/activities/:id', async (req, res) => {
        try { await V2Activity.deleteOne({ id: req.params.id }); res.json({ success: true }); }
        catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.post('/api/crm/v2/audit', async (req, res) => {
        try {
            const data = await AuditLog.create({ ...req.body, id: req.body.id || idFor('AUD'), user: req.body.user || req.query.user || 'System' });
            res.json({ success: true, data });
        } catch (err) { res.status(400).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/audit', async (req, res) => {
        try {
            const q = {};
            if (req.query.module) q.module = req.query.module;
            if (req.query.recordId) q.recordId = req.query.recordId;
            const data = await AuditLog.find(q).sort({ createdAt: -1 }).limit(500).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.post('/api/crm/v2/migrate-links', async (req, res) => {
        try {
            const [customers, suppliers, enquiries, quotations, invoices, purchases] = await Promise.all([
                Customer.find({}).lean(), Supplier.find({}).lean(), CrmEnquiry.find({}).lean(), Quotation.find({}).lean(), Invoice.find({}).lean(), Purchase.find({}).lean()
            ]);
            const created = [];
            const add = async (fromModule, fromId, toModule, toId, relationType, metadata = {}) => {
                if (!fromId || !toId || String(fromId) === String(toId)) return;
                const data = await Relationship.findOneAndUpdate(
                    { fromModule, fromId: String(fromId), toModule, toId: String(toId), relationType },
                    { $setOnInsert: { id: idFor('REL') }, $set: { metadata, source: 'CRM_V2_MIGRATION', createdBy: req.query.user || 'System' } },
                    { new: true, upsert: true, setDefaultsOnInsert: true }
                );
                created.push({ fromModule, fromId: String(fromId), toModule, toId: String(toId), relationType, id: data.id });
            };
            const customerByName = new Map(customers.map(c => [norm(c.name), c]));
            const supplierByName = new Map(suppliers.map(s => [norm(s.name), s]));
            const enquiryById = new Map(enquiries.map(e => [String(e.id), e]));
            const enquiryByNo = new Map(enquiries.filter(e => e.enquiryNo).map(e => [norm(e.enquiryNo), e]));
            for (const q of quotations) {
                const e = (q.enquiryId && enquiryById.get(String(q.enquiryId))) || (q.enquiryNo && enquiryByNo.get(norm(q.enquiryNo)));
                if (e) await add('enquiry', e.id, 'quotation', q.id || q._id, 'GENERATED_QUOTATION', { enquiryNo: e.enquiryNo });
                const c = (q.customerId && customers.find(x => String(x.id) === String(q.customerId))) || (q.custName && customerByName.get(norm(q.custName)));
                if (c) await add('customer', c.id, 'quotation', q.id || q._id, 'HAS_QUOTATION', { customerName: c.name });
            }
            for (const i of invoices) {
                const c = (i.customerId && customers.find(x => String(x.id) === String(i.customerId))) || (i.customerName && customerByName.get(norm(i.customerName)));
                if (c) await add('customer', c.id, 'invoice', i.id || i._id, 'HAS_INVOICE', { invoiceNo: i.invoiceNo });
                if (i.enquiryId && enquiryById.has(String(i.enquiryId))) await add('enquiry', i.enquiryId, 'invoice', i.id || i._id, 'BILLED_TO_INVOICE', {});
            }
            for (const p of purchases) {
                const s = (p.supplierId && suppliers.find(x => String(x.id) === String(p.supplierId))) || (p.supplierName && supplierByName.get(norm(p.supplierName)));
                if (s) await add('supplier', s.id, 'purchase', p.id || p._id, 'HAS_PURCHASE', { supplierName: s.name });
            }
            res.json({ success: true, message: 'Relationship migration completed', count: created.length, data: created.slice(-500) });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    // Phase 2: resolve relationship records into a single connected view.
    app.get('/api/crm/v2/record/:module/:id/related', async (req, res) => {
        try {
            const { module, id } = req.params;
            const rels = await Relationship.find({ $or: [{ fromModule: module, fromId: id }, { toModule: module, toId: id }] }).sort({ createdAt: -1 }).limit(500).lean();
            const modelMap = { customer: Customer, supplier: Supplier, enquiry: CrmEnquiry, quotation: Quotation, invoice: Invoice, purchase: Purchase, followup: FollowUp };
            const idsByModule = {};
            for (const r of rels) {
                const otherModule = r.fromModule === module && String(r.fromId) === String(id) ? r.toModule : r.fromModule;
                const otherId = r.fromModule === module && String(r.fromId) === String(id) ? r.toId : r.fromId;
                if (!idsByModule[otherModule]) idsByModule[otherModule] = new Set();
                idsByModule[otherModule].add(String(otherId));
            }
            const resolved = {};
            for (const [m, set] of Object.entries(idsByModule)) {
                const Model = modelMap[m];
                if (!Model) continue;
                resolved[m] = await Model.find({ id: { $in: [...set] } }).lean();
            }
            res.json({ success: true, data: { relationships: rels, records: resolved } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/overview', async (req, res) => {
        try {
            const [customers, suppliers, enquiries, quotations, invoices, purchases, followUps, activities, tickets] = await Promise.all([
                Customer.find({}).lean(), Supplier.find({}).lean(), CrmEnquiry.find({}).lean(), Quotation.find({}).lean(), Invoice.find({}).lean(), Purchase.find({}).lean(), FollowUp.find({}).lean(), V2Activity.find({}).lean(), mongoose.models.CrmTicket ? mongoose.models.CrmTicket.find({}).lean() : []
            ]);
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const openEnquiries = enquiries.filter(e => !['completed', 'lost', 'cancelled', 'won'].includes(String(e.status || '').trim().toLowerCase()));
            const openQuotes = quotations.filter(q => !['CLOSED', 'LOST', 'CANCELLED'].includes(String(q.status || '').toUpperCase()));
            const quotationValue = quotations.reduce((a, q) => a + money(q.grandTotal ?? q.totalValue), 0);
            const invoicedValue = invoices.reduce((a, i) => a + money(i.invoiceTotal ?? i.grandTotal), 0);
            const paidValue = invoices.reduce((a, i) => a + money(i.amountPaid), 0);
            const receivable = invoices.reduce((a, i) => a + Math.max(0, money(i.invoiceTotal ?? i.grandTotal) - money(i.amountPaid)), 0);
            const purchaseValue = purchases.reduce((a, p) => a + money(p.totalAmount), 0);
            const overdue = followUps.filter(f => {
                const d = new Date(f.dueDate || f.date || ''); return d instanceof Date && !isNaN(d) && d < now && !['DONE', 'COMPLETED', 'CLOSED'].includes(String(f.status || '').toUpperCase());
            }).length + activities.filter(a => { const d = new Date(a.dueDate || ''); return !isNaN(d) && d < now && !['DONE', 'COMPLETED', 'CLOSED'].includes(String(a.status || '').toUpperCase()); }).length;
            const statusCount = (arr, field = 'status') => arr.reduce((o, x) => { const k = String(x[field] || 'Unknown'); o[k] = (o[k] || 0) + 1; return o; }, {});
            const pipeline = enquiries.filter(e => !['Lost', 'Cancelled', 'Completed'].includes(String(e.status || ''))).reduce((a, e) => a + money(e.estimatedValue), 0);
            const weightedPipeline = enquiries.filter(e => !['Lost', 'Cancelled', 'Completed'].includes(String(e.status || ''))).reduce((a, e) => a + money(e.estimatedValue) * (money(e.probability) / 100), 0);
            const summary = {
                customers: customers.length, suppliers: suppliers.length, enquiries: enquiries.length, openEnquiries: openEnquiries.length,
                quotations: quotations.length, openQuotations: openQuotes.length, quotationValue, pipeline, weightedPipeline,
                invoices: invoices.length, invoicedValue, paidValue, receivable, purchaseValue,
                overdueTasks: overdue, openTickets: tickets.filter(t => !['Closed', 'Resolved'].includes(t.status)).length,
                wonEnquiries: enquiries.filter(e => ['Won', 'Completed'].includes(e.status)).length,
                lostEnquiries: enquiries.filter(e => e.status === 'Lost').length
            };
            res.json({ success: true, data: { summary, counts: { enquiryStatus: statusCount(enquiries), quotationStatus: statusCount(quotations), invoiceStatus: statusCount(invoices) }, recent: { enquiries: enquiries.slice(-10).reverse(), quotations: quotations.slice(-10).reverse(), activities: activities.slice(0, 10), followUps: followUps.slice(0, 10) } } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/customer/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const customer = await Customer.findOne({ id }).lean();
            if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
            const rx = exact(customer.name);
            const [contacts, plants, enquiries, quotations, invoices, followUps, activities, relationships] = await Promise.all([
                CrmContact.find({ customerId: id }).lean(), CrmPlant.find({ customerId: id }).lean(),
                CrmEnquiry.find({ $or: [{ customerId: id }, { customerName: rx }] }).lean(),
                Quotation.find({ $or: [{ customerId: id }, { custName: rx }] }).lean(),
                Invoice.find({ $or: [{ customerId: id }, { customerName: rx }] }).lean(),
                FollowUp.find({ $or: [{ partyId: id }, { customerId: id }] }).lean(),
                V2Activity.find({ customerId: id }).sort({ createdAt: -1 }).limit(100).lean(),
                Relationship.find({ $or: [{ fromModule: 'customer', fromId: id }, { toModule: 'customer', toId: id }] }).lean()
            ]);
            const invTotal = invoices.reduce((a, i) => a + money(i.invoiceTotal ?? i.grandTotal), 0);
            const paid = invoices.reduce((a, i) => a + money(i.amountPaid), 0);
            const quoteValue = quotations.reduce((a, q) => a + money(q.grandTotal ?? q.totalValue), 0);
            const health = Math.max(0, Math.min(100, Math.round(50 + Math.min(20, quoteValue / 100000) + Math.min(15, enquiries.length * 3) + Math.min(15, paid / Math.max(invTotal, 1) * 15))));
            res.json({ success: true, data: { customer, contacts, plants, enquiries, quotations, invoices, followUps, activities, relationships, kpis: { quotationValue: quoteValue, invoicedValue: invTotal, paidValue: paid, receivable: Math.max(0, invTotal - paid), enquiryCount: enquiries.length, openTickets: 0, healthScore: health } } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    app.get('/api/crm/v2/supplier/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const supplier = await Supplier.findOne({ id }).lean();
            if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
            const rx = exact(supplier.name);
            const [purchases, relationships] = await Promise.all([
                Purchase.find({ $or: [{ supplierId: id }, { supplierName: rx }] }).lean(),
                Relationship.find({ $or: [{ fromModule: 'supplier', fromId: id }, { toModule: 'supplier', toId: id }] }).lean()
            ]);
            const purchaseValue = purchases.reduce((a, p) => a + money(p.totalAmount), 0);
            res.json({ success: true, data: { supplier, purchases, relationships, kpis: { purchaseValue, openPOs: 0, rejectionRate: 0, qualityScore: 100 } } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    // ========================= RISE TECH CRM V2 PHASE 3 =========================
    // Customer/Supplier 360, pipeline, ageing, profitability, approvals and RBAC.
    const phase3Id = p => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const P3Role = mongoose.models.CrmV2Role || mongoose.model('CrmV2Role', new mongoose.Schema({
        id: { type: String, unique: true, index: true }, name: { type: String, unique: true }, permissions: { type: Object, default: {} }, active: { type: Boolean, default: true }
    }, { timestamps: true, strict: false }));
    const P3Approval = mongoose.models.CrmV2Approval || mongoose.model('CrmV2Approval', new mongoose.Schema({
        id: { type: String, unique: true, index: true }, module: String, recordId: String, recordRef: String, requestedBy: String,
        approverRole: String, amount: Number, reason: String, status: { type: String, default: 'Pending' }, decidedBy: String, decidedAt: String, decisionNote: String
    }, { timestamps: true, strict: false }));
    const DEFAULT_PERMISSIONS = {
        Admin: ['*'], Management: ['dashboard.view', 'customer.view', 'supplier.view', 'sales.view', 'accounts.view', 'reports.view', 'approval.approve'],
        Sales: ['customer.view', 'customer.edit', 'enquiry.*', 'quotation.*', 'pipeline.*', 'activity.*', 'business360.view'],
        Purchase: ['supplier.view', 'purchase.*', 'activity.*', 'business360.view'], Accounts: ['invoice.*', 'payment.*', 'accounts.view', 'reports.view'],
        Service: ['ticket.*', 'warranty.*', 'rejection.*', 'activity.*', 'business360.view'], Viewer: ['dashboard.view', 'customer.view', 'supplier.view', 'sales.view', 'reports.view']
    };
    app.get('/api/crm/v2/roles', async (req, res) => {
        try {
            let rows = await P3Role.find({}).lean();
            if (!rows.length) { rows = await Promise.all(Object.entries(DEFAULT_PERMISSIONS).map(async ([name, permissions]) => P3Role.findOneAndUpdate({ name }, { id: phase3Id('ROLE'), name, permissions, active: true }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean())); }
            res.json({ success: true, data: rows });
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });
    app.post('/api/crm/v2/roles', async (req, res) => { try { const b = req.body || {}; const d = await P3Role.findOneAndUpdate({ name: b.name }, { id: b.id || phase3Id('ROLE'), name: b.name, permissions: b.permissions || {}, active: b.active !== false }, { upsert: true, new: true, setDefaultsOnInsert: true }); res.json({ success: true, data: d }) } catch (e) { res.status(400).json({ success: false, message: e.message }) } });
    app.get('/api/crm/v2/permissions/check', async (req, res) => { try { const role = req.query.role || 'Viewer', permission = req.query.permission || 'dashboard.view'; const r = await P3Role.findOne({ name: role }).lean(); const p = r?.permissions || DEFAULT_PERMISSIONS[role] || []; res.json({ success: true, data: { role, permission, allowed: p.includes('*') || p.includes(permission) || p.some(x => x.endsWith('.*') && permission.startsWith(x.slice(0, -1))) } }) } catch (e) { res.status(500).json({ success: false, message: e.message }) } });

    app.get('/api/crm/v2/pipeline', async (req, res) => {
        try {
            const enquiries = await CrmEnquiry.find({}).lean();
            const groups = {};
            for (const e of enquiries) { const status = String(e.status || 'New'); const value = money(e.estimatedValue); const prob = Math.max(0, Math.min(100, money(e.probability) || 0)); if (!groups[status]) groups[status] = { status, count: 0, value: 0, weightedValue: 0 }; groups[status].count++; groups[status].value += value; groups[status].weightedValue += value * prob / 100; }
            const total = Object.values(groups).reduce((a, x) => a + x.value, 0), weighted = Object.values(groups).reduce((a, x) => a + x.weightedValue, 0);
            res.json({ success: true, data: { stages: Object.values(groups), total, weighted, winRate: enquiries.length ? Math.round(enquiries.filter(e => ['Won', 'Completed'].includes(e.status)).length / enquiries.length * 100) : 0 } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/ageing', async (req, res) => {
        try {
            const invoices = await Invoice.find({}).lean(); const today = new Date(); today.setHours(0, 0, 0, 0);
            const buckets = { notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_180: 0, d180Plus: 0 }; const rows = [];
            for (const i of invoices) { const total = money(i.invoiceTotal ?? i.grandTotal), paid = money(i.amountPaid), bal = Math.max(0, total - paid); if (!bal) continue; const due = new Date(i.dueDate || i.paymentDueDate || i.date || i.createdAt || today); due.setHours(0, 0, 0, 0); const days = Math.floor((today - due) / 86400000); let bucket = 'notDue'; if (days > 0 && days <= 30) bucket = 'd0_30'; else if (days <= 60) bucket = 'd31_60'; else if (days <= 90) bucket = 'd61_90'; else if (days <= 180) bucket = 'd91_180'; else if (days > 180) bucket = 'd180Plus'; buckets[bucket] += bal; rows.push({ id: i.id, invoiceNo: i.invoiceNo, total, paid, balance: bal, dueDate: i.dueDate || i.paymentDueDate || i.date, bucket, customerName: i.customerName }); }
            res.json({ success: true, data: { buckets, total: Object.values(buckets).reduce((a, b) => a + b, 0), rows: rows.sort((a, b) => b.balance - a.balance) } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/profitability', async (req, res) => {
        try {
            const [invoices, quotations, purchases] = await Promise.all([Invoice.find({}).lean(), Quotation.find({}).lean(), Purchase.find({}).lean()]);
            const sales = invoices.reduce((a, x) => a + money(x.invoiceTotal ?? x.grandTotal), 0), purchaseCost = purchases.reduce((a, x) => a + money(x.totalAmount), 0);
            const explicitCost = invoices.reduce((a, x) => a + money(x.costAmount ?? x.materialCost ?? x.cost), 0); const cost = explicitCost || purchaseCost; const profit = sales - cost;
            const byCustomer = {}; for (const i of invoices) { const n = i.customerName || i.customerId || 'Unknown'; if (!byCustomer[n]) byCustomer[n] = { customer: n, sales: 0, cost: 0, profit: 0 }; byCustomer[n].sales += money(i.invoiceTotal ?? i.grandTotal); byCustomer[n].cost += money(i.costAmount ?? i.materialCost ?? 0); byCustomer[n].profit = byCustomer[n].sales - byCustomer[n].cost; }
            res.json({ success: true, data: { sales, cost, profit, margin: sales ? profit / sales * 100 : 0, quotationValue: quotations.reduce((a, x) => a + money(x.grandTotal ?? x.totalValue), 0), byCustomer: Object.values(byCustomer).sort((a, b) => b.profit - a.profit) } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/360/customer/:id', async (req, res) => {
        try {
            const id = req.params.id, c = await Customer.findOne({ id }).lean(); if (!c) return res.status(404).json({ success: false, message: 'Customer not found' }); const rx = exact(c.name);
            const [plants, contacts, enquiries, quotations, invoices, activities, tickets] = await Promise.all([CrmPlant.find({ customerId: id }).lean(), CrmContact.find({ customerId: id }).lean(), CrmEnquiry.find({ $or: [{ customerId: id }, { customerName: rx }] }).lean(), Quotation.find({ $or: [{ customerId: id }, { custName: rx }] }).lean(), Invoice.find({ $or: [{ customerId: id }, { customerName: rx }] }).lean(), V2Activity.find({ customerId: id }).sort({ createdAt: -1 }).limit(20).lean(), mongoose.models.CrmTicket ? mongoose.models.CrmTicket.find({ customerId: id }).lean() : []]);
            const sales = invoices.reduce((a, x) => a + money(x.invoiceTotal ?? x.grandTotal), 0), paid = invoices.reduce((a, x) => a + money(x.amountPaid), 0), quotes = quotations.reduce((a, x) => a + money(x.grandTotal ?? x.totalValue), 0), openTickets = tickets.filter(x => !['Closed', 'Resolved'].includes(x.status)).length;
            const score = Math.max(0, Math.min(100, Math.round(50 + Math.min(20, quotes / 100000) + Math.min(15, enquiries.length * 3) + Math.min(15, sales ? paid / sales * 15 : 0) - Math.min(20, openTickets * 4))));
            res.json({ success: true, data: { customer, plants, contacts, enquiries, quotations, invoices, activities, tickets, kpis: { sales, paid, receivable: Math.max(0, sales - paid), quoteValue: quotes, enquiries: enquiries.length, openTickets, healthScore: score } } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/360/supplier/:id', async (req, res) => {
        try {
            const id = req.params.id, s = await Supplier.findOne({ id }).lean(); if (!s) return res.status(404).json({ success: false, message: 'Supplier not found' }); const rx = exact(s.name); const purchases = await Purchase.find({ $or: [{ supplierId: id }, { supplierName: rx }] }).lean(); const total = purchases.reduce((a, x) => a + money(x.totalAmount), 0); const delivered = purchases.filter(x => ['Completed', 'Received', 'Delivered'].includes(String(x.status || ''))).length; res.json({ success: true, data: { supplier, purchases, kpis: { purchaseValue: total, poCount: purchases.length, onTimeRate: purchases.length ? delivered / purchases.length * 100 : 0, qualityScore: 100 } } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/approvals', async (req, res) => { try { const q = {}; if (req.query.status) q.status = req.query.status; if (req.query.module) q.module = req.query.module; res.json({ success: true, data: await P3Approval.find(q).sort({ createdAt: -1 }).limit(500).lean() }) } catch (e) { res.status(500).json({ success: false, message: e.message }) } });
    app.post('/api/crm/v2/approvals', async (req, res) => { try { const b = req.body || {}; if (!b.module || !b.recordId) return res.status(400).json({ success: false, message: 'module and recordId are required' }); const d = await P3Approval.findOneAndUpdate({ id: b.id || phase3Id('APR') }, { ...b, id: b.id || phase3Id('APR'), status: b.status || 'Pending' }, { new: true, upsert: true, setDefaultsOnInsert: true }); res.json({ success: true, data: d }) } catch (e) { res.status(400).json({ success: false, message: e.message }) } });
    app.post('/api/crm/v2/approvals/:id/decision', async (req, res) => { try { const b = req.body || {}, status = ['Approved', 'Rejected'].includes(b.status) ? b.status : null; if (!status) return res.status(400).json({ success: false, message: 'status must be Approved or Rejected' }); const d = await P3Approval.findOneAndUpdate({ id: req.params.id }, { status, decidedBy: b.decidedBy || 'System', decidedAt: new Date().toISOString(), decisionNote: b.decisionNote || '' }, { new: true }); if (!d) return res.status(404).json({ success: false, message: 'Approval not found' }); res.json({ success: true, data: d }) } catch (e) { res.status(400).json({ success: false, message: e.message }) } });

    app.get('/api/crm/v2/management', async (req, res) => {
        try {
            const [p, a, age, profit] = await Promise.all([fetchInternal('/api/crm/v2/pipeline', req), fetchInternal('/api/crm/v2/ageing', req), fetchInternal('/api/crm/v2/ageing', req), fetchInternal('/api/crm/v2/profitability', req)]); res.json({ success: true, data: { pipeline: p, ageing: a, profitability: profit } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });
    async function fetchInternal(path, req) { return new Promise((resolve, reject) => { const fake = { query: req.query }; let body; const rr = { json: o => resolve(o.data), status: () => rr }; try { if (path.includes('/pipeline')) { CrmEnquiry.find({}).lean().then(es => { const stages = {}; es.forEach(e => { const k = String(e.status || 'New'); stages[k] ??= { status: k, count: 0, value: 0, weightedValue: 0 }; stages[k].count++; stages[k].value += money(e.estimatedValue); stages[k].weightedValue += money(e.estimatedValue) * money(e.probability) / 100 }); resolve({ stages: Object.values(stages), total: Object.values(stages).reduce((a, x) => a + x.value, 0), weighted: Object.values(stages).reduce((a, x) => a + x.weightedValue, 0) }) }).catch(reject) } else if (path.includes('/profitability')) { Promise.all([Invoice.find({}).lean(), Purchase.find({}).lean()]).then(([is, ps]) => { const sales = is.reduce((a, x) => a + money(x.invoiceTotal ?? x.grandTotal), 0), cost = is.reduce((a, x) => a + money(x.costAmount ?? x.materialCost ?? 0), 0) || ps.reduce((a, x) => a + money(x.totalAmount), 0); resolve({ sales, cost, profit: sales - cost, margin: sales ? ((sales - cost) / sales * 100) : 0 }) }).catch(reject) } else { Invoice.find({}).lean().then(is => { const today = new Date(); const b = { notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_180: 0, d180Plus: 0 }; is.forEach(i => { const bal = Math.max(0, money(i.invoiceTotal ?? i.grandTotal) - money(i.amountPaid)); if (!bal) return; const due = new Date(i.dueDate || i.paymentDueDate || i.date || today); const d = Math.floor((today - due) / 86400000); let k = 'notDue'; if (d > 0 && d <= 30) k = 'd0_30'; else if (d <= 60) k = 'd31_60'; else if (d <= 90) k = 'd61_90'; else if (d <= 180) k = 'd91_180'; else if (d > 180) k = 'd180Plus'; b[k] += bal }); resolve({ buckets: b, total: Object.values(b).reduce((a, x) => a + x, 0) }) }).catch(reject) } } catch (e) { reject(e) } }); }


    // ==================== CRM V2 PHASE 4 ====================
    // Workflow Automation · SLA Monitoring · Task Generation · Notification Centre
    const p4RuleSchema = new mongoose.Schema({
        id: { type: String, unique: true, index: true }, name: { type: String, required: true },
        trigger: { type: String, required: true, index: true }, enabled: { type: Boolean, default: true, index: true },
        thresholdDays: { type: Number, default: 0 }, priority: { type: String, default: 'Medium' },
        assignedTo: { type: String, default: '' }, description: String, createdBy: { type: String, default: 'System' }
    }, { timestamps: true, strict: false });
    const p4RunSchema = new mongoose.Schema({
        id: { type: String, unique: true, index: true }, ruleId: { type: String, index: true }, eventKey: { type: String, unique: true, index: true },
        module: String, recordId: String, reference: String, action: String, status: { type: String, default: 'Created' }, details: String
    }, { timestamps: true, strict: false });
    const P4Rule = mongoose.models.CrmV2WorkflowRule || mongoose.model('CrmV2WorkflowRule', p4RuleSchema);
    const P4Run = mongoose.models.CrmV2AutomationRun || mongoose.model('CrmV2AutomationRun', p4RunSchema);

    const p4Defaults = [
        ['invoice_overdue', 'Overdue Invoice Alert', 'Invoice becomes overdue', 1, 'High'],
        ['enquiry_quote_missing', 'Enquiry Quote Follow-up', 'Enquiry has no quotation after threshold days', 3, 'High'],
        ['quotation_followup_due', 'Quotation Follow-up Due', 'Quotation needs follow-up', 7, 'Medium'],
        ['open_ticket_sla', 'Open Ticket SLA Alert', 'Open service ticket exceeds SLA', 2, 'High']
    ];
    async function ensureP4Rules() {
        for (const [trigger, name, description, thresholdDays, priority] of p4Defaults) {
            const exists = await P4Rule.findOne({ trigger });
            if (!exists) await P4Rule.create({ id: idFor('RULE'), trigger, name, description, thresholdDays, priority, enabled: true });
        }
    }
    app.get('/api/crm/v2/phase4/rules', async (req, res) => { try { await ensureP4Rules(); res.json({ success: true, data: await P4Rule.find({}).sort({ createdAt: 1 }).lean() }) } catch (e) { res.status(500).json({ success: false, message: e.message }) } });
    app.post('/api/crm/v2/phase4/rules', async (req, res) => {
        try {
            const b = req.body || {};
            const ruleId = b.id || idFor('RULE');
            const existing = await P4Rule.findOne({ id: ruleId }).lean();
            const update = { ...(existing || {}), ...b, id: ruleId };
            if (!update.name || !update.trigger) return res.status(400).json({ success: false, message: 'Rule name and trigger are required' });
            const d = await P4Rule.findOneAndUpdate({ id: ruleId }, update, { new: true, upsert: true, setDefaultsOnInsert: true });
            res.json({ success: true, data: d });
        } catch (e) { res.status(400).json({ success: false, message: e.message }) }
    });

    async function p4CreateActivity(payload) {
        const key = payload.eventKey;
        const exists = await P4Run.findOne({ eventKey: key });
        if (exists) return { created: false, run: exists };
        const a = await V2Activity.findOneAndUpdate({ id: payload.activityId || idFor('ACT') }, {
            id: payload.activityId || idFor('ACT'), activityType: 'Task', subject: payload.subject, details: payload.details, status: 'Open', priority: payload.priority || 'Medium',
            dueDate: payload.dueDate || new Date().toISOString().slice(0, 10), assignedTo: payload.assignedTo || '', customerId: payload.customerId || '', supplierId: payload.supplierId || '',
            relatedModule: payload.module, relatedId: payload.recordId, createdBy: 'CRM V2 Phase 4', automation: true
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        const run = await P4Run.create({ id: idFor('RUN'), ruleId: payload.ruleId, eventKey: key, module: payload.module, recordId: payload.recordId, reference: payload.reference, action: 'CREATE_ACTIVITY', details: payload.details });
        return { created: true, activity: a, run };
    }
    app.post('/api/crm/v2/phase4/run', async (req, res) => {
        try {
            await ensureP4Rules(); const rules = await P4Rule.find({ enabled: true }).lean(); const today = new Date(); today.setHours(0, 0, 0, 0); let created = 0, skipped = 0; const results = [];
            const invoices = await Invoice.find({}).lean();
            const invoiceRule = rules.find(r => r.trigger === 'invoice_overdue');
            if (invoiceRule) { for (const i of invoices) { const total = money(i.invoiceTotal ?? i.grandTotal), paid = money(i.amountPaid), bal = Math.max(0, total - paid); if (!bal) continue; const due = new Date(i.dueDate || i.paymentDueDate || i.date || i.createdAt || today); due.setHours(0, 0, 0, 0); const days = Math.floor((today - due) / 86400000); if (days < invoiceRule.thresholdDays) continue; const ref = i.invoiceNo || i.id; const r = await p4CreateActivity({ ruleId: invoiceRule.id, eventKey: `${invoiceRule.id}:invoice:${i.id}:${due.toISOString().slice(0, 10)}`, module: 'Invoice', recordId: i.id, reference: ref, subject: `Payment follow-up: ${ref}`, details: `Invoice ${ref} is overdue by ${days} day(s). Outstanding ₹${bal.toLocaleString('en-IN')}.`, priority: invoiceRule.priority, assignedTo: invoiceRule.assignedTo, customerId: i.customerId || '' }); r.created ? created++ : skipped++; results.push({ trigger: invoiceRule.trigger, reference: ref, created: r.created }); } }
            const enquiries = await CrmEnquiry.find({}).lean(), quotations = await Quotation.find({}).lean();
            const quoteByEnq = new Set(quotations.map(q => String(q.enquiryId || '')).filter(Boolean));
            const quoteNoByEnq = new Set(quotations.map(q => String(q.enquiryNo || '')).filter(Boolean));
            const enqRule = rules.find(r => r.trigger === 'enquiry_quote_missing');
            if (enqRule) { for (const e of enquiries) { const createdAt = new Date(e.createdAt || e.enquiryDate || today); const days = Math.floor((today - createdAt) / 86400000); if (days < enqRule.thresholdDays) continue; const linked = quoteByEnq.has(String(e.id)) || (e.enquiryNo && quoteNoByEnq.has(String(e.enquiryNo))); if (linked) continue; const ref = e.enquiryNo || e.id; const r = await p4CreateActivity({ ruleId: enqRule.id, eventKey: `${enqRule.id}:enquiry:${e.id}`, module: 'Enquiry', recordId: e.id, reference: ref, subject: `Quotation follow-up: ${ref}`, details: `Enquiry ${ref} has no linked quotation after ${days} day(s).`, priority: enqRule.priority, assignedTo: enqRule.assignedTo, customerId: e.customerId || '' }); r.created ? created++ : skipped++; results.push({ trigger: enqRule.trigger, reference: ref, created: r.created }); } }
            const qRule = rules.find(r => r.trigger === 'quotation_followup_due');
            if (qRule) { for (const q of quotations) { const d = new Date(q.followUpDate || q.nextFollowUp || q.targetDate || q.createdAt || today); d.setHours(0, 0, 0, 0); if (d > today) continue; const ref = q.refNo || q.quotationNo || q.id; const r = await p4CreateActivity({ ruleId: qRule.id, eventKey: `${qRule.id}:quotation:${q.id}:${d.toISOString().slice(0, 10)}`, module: 'Quotation', recordId: q.id, reference: ref, subject: `Quotation follow-up due: ${ref}`, details: `Quotation ${ref} requires follow-up.`, priority: qRule.priority, assignedTo: qRule.assignedTo, customerId: q.customerId || '' }); r.created ? created++ : skipped++; results.push({ trigger: qRule.trigger, reference: ref, created: r.created }); } }
            const tRule = rules.find(r => r.trigger === 'open_ticket_sla'); const Ticket = mongoose.models.CrmTicket;
            if (tRule && Ticket) { const tickets = await Ticket.find({}).lean(); for (const t of tickets) { if (['Closed', 'Resolved'].includes(String(t.status || ''))) continue; const d = new Date(t.createdAt || t.date || today); const days = Math.floor((today - d) / 86400000); if (days < tRule.thresholdDays) continue; const ref = t.ticketNo || t.id; const r = await p4CreateActivity({ ruleId: tRule.id, eventKey: `${tRule.id}:ticket:${t.id}`, module: 'Ticket', recordId: t.id, reference: ref, subject: `SLA attention: ${ref}`, details: `Open service ticket ${ref} has exceeded the ${tRule.thresholdDays}-day SLA threshold.`, priority: tRule.priority, assignedTo: tRule.assignedTo, customerId: t.customerId || '', ticketId: t.id }); r.created ? created++ : skipped++; results.push({ trigger: tRule.trigger, reference: ref, created: r.created }); } }
            res.json({ success: true, data: { created, skipped, results, ranAt: new Date().toISOString() } });
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    app.get('/api/crm/v2/phase4/notifications', async (req, res) => {
        try {
            const [activities, approvals] = await Promise.all([V2Activity.find({ $or: [{ automation: true }, { priority: 'High' }], status: { $nin: ['Completed', 'Closed'] } }).sort({ createdAt: -1 }).limit(200).lean(), P3Approval.find({ status: 'Pending' }).sort({ createdAt: -1 }).limit(100).lean()]);
            res.json({ success: true, data: { activities, approvals, count: activities.length + approvals.length } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });
    app.get('/api/crm/v2/phase4/sla', async (req, res) => {
        try {
            const today = new Date(); today.setHours(0, 0, 0, 0); const Ticket = mongoose.models.CrmTicket; let tickets = [];
            if (Ticket) { tickets = (await Ticket.find({}).lean()).filter(t => !['Closed', 'Resolved'].includes(String(t.status || ''))).map(t => { const d = new Date(t.createdAt || t.date || today); const age = Math.max(0, Math.floor((today - d) / 86400000)); const sla = Number(t.slaDays || t.sla || 2); return { ...t, ageDays: age, slaDays: sla, slaStatus: age > sla ? 'Breached' : age >= Math.max(0, sla - 1) ? 'At Risk' : 'Within SLA' } }) }
            const summary = { within: tickets.filter(t => t.slaStatus === 'Within SLA').length, atRisk: tickets.filter(t => t.slaStatus === 'At Risk').length, breached: tickets.filter(t => t.slaStatus === 'Breached').length }; res.json({ success: true, data: { summary, tickets } })
        } catch (e) { res.status(500).json({ success: false, message: e.message }) }
    });

    // Lightweight server-side scheduler. It is idempotent through CrmV2AutomationRun.eventKey.
    if (!global.__RISE_CRM_V2_P4_TIMER) {
        global.__RISE_CRM_V2_P4_TIMER = setInterval(() => { app._riseP4AutoRun?.().catch(() => { }); }, 15 * 60 * 1000);
    }
    app._riseP4AutoRun = async () => { try { await ensureP4Rules(); const r = await P4Rule.findOne({ enabled: true }); if (r) { /* execution endpoint remains explicit to avoid duplicate heavy scans */ } } catch (e) { } }

};
