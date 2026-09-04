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
      ['customerId','supplierId','assignedTo','status','priority','activityType'].forEach(k => { if (req.query[k]) q[k] = req.query[k]; });
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
      const now = new Date(); now.setHours(0,0,0,0);
      const openEnquiries = enquiries.filter(e => !['completed','lost','cancelled','won'].includes(String(e.status || '').trim().toLowerCase()));
      const openQuotes = quotations.filter(q => !['CLOSED','LOST','CANCELLED'].includes(String(q.status || '').toUpperCase()));
      const quotationValue = quotations.reduce((a,q) => a + money(q.grandTotal ?? q.totalValue), 0);
      const invoicedValue = invoices.reduce((a,i) => a + money(i.invoiceTotal ?? i.grandTotal), 0);
      const paidValue = invoices.reduce((a,i) => a + money(i.amountPaid), 0);
      const receivable = invoices.reduce((a,i) => a + Math.max(0, money(i.invoiceTotal ?? i.grandTotal) - money(i.amountPaid)), 0);
      const purchaseValue = purchases.reduce((a,p) => a + money(p.totalAmount), 0);
      const overdue = followUps.filter(f => {
        const d = new Date(f.dueDate || f.date || ''); return d instanceof Date && !isNaN(d) && d < now && !['DONE','COMPLETED','CLOSED'].includes(String(f.status || '').toUpperCase());
      }).length + activities.filter(a => { const d = new Date(a.dueDate || ''); return !isNaN(d) && d < now && !['DONE','COMPLETED','CLOSED'].includes(String(a.status || '').toUpperCase()); }).length;
      const statusCount = (arr, field='status') => arr.reduce((o,x) => { const k = String(x[field] || 'Unknown'); o[k] = (o[k] || 0) + 1; return o; }, {});
      const pipeline = enquiries.filter(e => !['Lost','Cancelled','Completed'].includes(String(e.status || ''))).reduce((a,e) => a + money(e.estimatedValue), 0);
      const weightedPipeline = enquiries.filter(e => !['Lost','Cancelled','Completed'].includes(String(e.status || ''))).reduce((a,e) => a + money(e.estimatedValue) * (money(e.probability) / 100), 0);
      const summary = {
        customers: customers.length, suppliers: suppliers.length, enquiries: enquiries.length, openEnquiries: openEnquiries.length,
        quotations: quotations.length, openQuotations: openQuotes.length, quotationValue, pipeline, weightedPipeline,
        invoices: invoices.length, invoicedValue, paidValue, receivable, purchaseValue,
        overdueTasks: overdue, openTickets: tickets.filter(t => !['Closed','Resolved'].includes(t.status)).length,
        wonEnquiries: enquiries.filter(e => ['Won','Completed'].includes(e.status)).length,
        lostEnquiries: enquiries.filter(e => e.status === 'Lost').length
      };
      res.json({ success: true, data: { summary, counts: { enquiryStatus: statusCount(enquiries), quotationStatus: statusCount(quotations), invoiceStatus: statusCount(invoices) }, recent: { enquiries: enquiries.slice(-10).reverse(), quotations: quotations.slice(-10).reverse(), activities: activities.slice(0,10), followUps: followUps.slice(0,10) } } });
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
      const invTotal = invoices.reduce((a,i) => a + money(i.invoiceTotal ?? i.grandTotal), 0);
      const paid = invoices.reduce((a,i) => a + money(i.amountPaid), 0);
      const quoteValue = quotations.reduce((a,q) => a + money(q.grandTotal ?? q.totalValue), 0);
      const health = Math.max(0, Math.min(100, Math.round(50 + Math.min(20, quoteValue / 100000) + Math.min(15, enquiries.length * 3) + Math.min(15, paid / Math.max(invTotal,1) * 15))));
      res.json({ success: true, data: { customer, contacts, plants, enquiries, quotations, invoices, followUps, activities, relationships, kpis: { quotationValue: quoteValue, invoicedValue: invTotal, paidValue: paid, receivable: Math.max(0, invTotal-paid), enquiryCount: enquiries.length, openTickets: 0, healthScore: health } } });
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
      const purchaseValue = purchases.reduce((a,p) => a + money(p.totalAmount), 0);
      res.json({ success: true, data: { supplier, purchases, relationships, kpis: { purchaseValue, openPOs: 0, rejectionRate: 0, qualityScore: 100 } } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });
};
