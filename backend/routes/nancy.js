const { runNancyAgent } = require('../services/nancyAgent');
const { getNancySession } = require('../services/nancyAuth');

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function createNancyDataStore({ Customer, Invoice, Item, Supplier, Purchase, CreditDebitNote }) {
    const ownerQuery = userId => ({ createdBy: userId, deletedAt: null });
    const matchingText = value => new RegExp(escapeRegex(value), 'i');

    return {
        async findInvoices({ userId, search, status }) {
            const query = ownerQuery(userId);
            if (search) {
                const match = matchingText(search);
                query.$or = [
                    { invoiceNo: match },
                    { invoice_no: match },
                    { customerName: match },
                    { customerId: match }
                ];
            }
            if (status) query.status = matchingText(status);
            return Invoice.find(query).sort({ date: -1, createdAt: -1 }).limit(10).lean();
        },

        async findCustomers({ userId, name, phone }) {
            const query = ownerQuery(userId);
            const terms = [];
            if (name) {
                const match = matchingText(name);
                terms.push({ name: match }, { email: match }, { address: match }, { gst: match }, { gstin: match }, { gst_no: match }, { gstNo: match });
            }
            if (phone) {
                const match = matchingText(phone);
                terms.push({ contact: match }, { phone: match }, { mobile: match });
            }
            if (terms.length) query.$or = terms;
            return Customer.find(query).sort({ name: 1 }).limit(10).lean();
        },

        async findStock({ userId, item }) {
            const query = ownerQuery(userId);
            if (item) {
                const match = matchingText(item);
                query.$or = [
                    { name: match }, { itemName: match }, { item_name: match },
                    { itemCode: match }, { item_code: match }, { code: match },
                    { description: match }, { indexNo: match }
                ];
            }
            return Item.find(query).sort({ name: 1 }).limit(10).lean();
        },

        async findSuggestions({ userId, type, query }) {
            const match = matchingText(query);
            if (type === 'customer') {
                const records = await Customer.find({ ...ownerQuery(userId), $or: [
                    { name: match }, { contact: match }, { phone: match }, { mobile: match }, { email: match },
                    { address: match }, { gst: match }, { gstin: match }, { gst_no: match }, { gstNo: match }
                ] }).sort({ name: 1 }).limit(8).lean();
                return records.map(record => ({ label: record.name, detail: [record.contact || record.phone || record.mobile, record.email, record.gst || record.gstin || record.gst_no || record.gstNo].filter(Boolean).join(' · ') }));
            }
            if (type === 'supplier') {
                const records = await Supplier.find({ ...ownerQuery(userId), $or: [
                    { name: match }, { contact: match }, { phone: match }, { mobile: match }, { email: match },
                    { address: match }, { gst: match }, { gstin: match }, { gst_no: match }, { gstNo: match }
                ] }).sort({ name: 1 }).limit(8).lean();
                return records.map(record => ({ label: record.name, detail: [record.contact || record.phone || record.mobile, record.email, record.gstin || record.gst_no || record.gstNo].filter(Boolean).join(' · ') }));
            }
            if (type === 'item') {
                const records = await Item.find({
                    ...ownerQuery(userId),
                    $or: [
                        { name: match }, { itemName: match }, { item_name: match },
                        { itemCode: match }, { item_code: match }, { code: match },
                        { description: match }, { indexNo: match }
                    ]
                }).sort({ name: 1 }).limit(8).lean();
                return records.map(record => ({
                    label: record.name || record.itemName || record.item_name || record.itemCode || record.item_code || record.code || record.description,
                    detail: [record.itemCode || record.item_code || record.code,
                        (record.currentStock ?? record.stock ?? record.quantity) !== undefined
                            ? `Stock: ${record.currentStock ?? record.stock ?? record.quantity} ${record.uom || record.unit || ''}` : '']
                        .filter(Boolean).join(' · ')
                }));
            }
            return [];
        },

        async getRecordDetails({ userId, type, name }) {
            const query = matchingText(name);
            const owner = ownerQuery(userId);
            if (type === 'customer') {
                return Customer.find({ ...owner, $or: [
                    { name: query }, { contact: query }, { phone: query }, { mobile: query }, { email: query },
                    { address: query }, { gst: query }, { gstin: query }, { gst_no: query }, { gstNo: query }
                ] }).sort({ name: 1 }).limit(5).lean();
            }
            if (type === 'supplier') {
                return Supplier.find({ ...owner, $or: [
                    { name: query }, { contact: query }, { phone: query }, { mobile: query }, { email: query },
                    { address: query }, { gst: query }, { gstin: query }, { gst_no: query }, { gstNo: query }
                ] }).sort({ name: 1 }).limit(5).lean();
            }
            if (type === 'item') {
                return Item.find({
                    ...owner,
                    $or: [
                        { name: query }, { itemName: query }, { item_name: query },
                        { itemCode: query }, { item_code: query }, { code: query },
                        { description: query }, { indexNo: query }
                    ]
                }).sort({ name: 1 }).limit(5).lean();
            }
            return [];
        },

        async getLedgerBalance({ userId, party, partyType }) {
            const match = matchingText(party);
            const [customers, suppliers] = await Promise.all([
                partyType === 'supplier' ? Promise.resolve([]) : Customer.find({ ...ownerQuery(userId), name: match }).limit(1).lean(),
                partyType === 'customer' ? Promise.resolve([]) : Supplier.find({ ...ownerQuery(userId), name: match }).limit(1).lean()
            ]);
            if (customers.length) {
                const customer = customers[0];
                const customerIdentity = [
                    { customerName: matchingText(customer.name) },
                    { customer_name: matchingText(customer.name) },
                    { 'customer.name': matchingText(customer.name) }
                ];
                if (customer.id) customerIdentity.unshift({ customerId: customer.id });
                const invoices = await Invoice.find({
                    ...ownerQuery(userId),
                    $or: customerIdentity
                }).lean();
                const invoiceBalance = invoices.reduce((sum, invoice) =>
                    sum + ((number(invoice.invoice_total) || number(invoice.invoiceTotal) || number(invoice.grandTotal) || number(invoice.total)) -
                        (number(invoice.total_paid) || number(invoice.amountPaid) || number(invoice.paid_amount) || number(invoice.paid))), 0);
                const adjustments = CreditDebitNote ? await CreditDebitNote.find({
                    ...ownerQuery(userId),
                    $or: [
                        { customerName: matchingText(customer.name) },
                        { customer_name: matchingText(customer.name) }
                    ],
                    status: { $nin: ['CANCELLED', 'Cancelled', 'cancelled'] }
                }).lean() : [];
                const noteBalance = adjustments.reduce((sum, note) => sum +
                    (String(note.type || '').toUpperCase() === 'DEBIT' ? 1 : -1) * (number(note.total_amount) || number(note.totalAmount)), 0);
                const opening = number(customer.openingBalance);
                const openingSigned = customer.openingBalanceType === 'Cr' ? -opening : opening;
                const customerPageBalance = openingSigned + invoiceBalance + noteBalance;
                const closing = customerPageBalance;
                return {
                    party: customer.name, type: 'customer', openingBalance: opening,
                    openingBalanceType: customer.openingBalanceType || 'Dr', outstanding: customerPageBalance,
                    closingBalance: closing,
                    closingBalanceType: closing < 0 ? 'Cr' : 'Dr'
                };
            }
            if (suppliers.length) {
                const supplier = suppliers[0];
                const supplierIdentity = [
                    { supplierName: matchingText(supplier.name) },
                    { supplier_name: matchingText(supplier.name) }
                ];
                if (supplier._id) supplierIdentity.unshift({ supplierId: supplier._id });
                const purchases = await Purchase.find({
                    ...ownerQuery(userId),
                    $or: supplierIdentity
                }).lean();
                const purchaseBalance = purchases.reduce((sum, purchase) =>
                    sum + (() => {
                        const base = number(purchase.qty) * number(purchase.price);
                        const discountValue = number(purchase.discount);
                        const discount = (purchase.discType || '%') === 'flat'
                            ? discountValue : base * discountValue / 100;
                        const charges = number(purchase.freightCharges) + number(purchase.packingCharges) + number(purchase.loadingCharges);
                        const taxable = base - discount + charges;
                        const computedTotal = taxable + taxable * number(purchase.gst) / 100 + number(purchase.roundOff);
                        const paid = number(purchase.paid) || number(purchase.total_paid) || number(purchase.paid_amount) || number(purchase.amountPaid);
                        return computedTotal - paid;
                    })(), 0);
                const outstanding = Math.max(0, purchaseBalance);
                const adjustments = CreditDebitNote ? await CreditDebitNote.find({
                    ...ownerQuery(userId),
                    $or: [
                        { customerName: matchingText(supplier.name) },
                        { customer_name: matchingText(supplier.name) }
                    ],
                    status: { $nin: ['CANCELLED', 'Cancelled', 'cancelled'] }
                }).lean() : [];
                const noteBalance = adjustments.reduce((sum, note) => sum +
                    (String(note.type || '').toUpperCase() === 'CREDIT' ? 1 : -1) * (number(note.total_amount) || number(note.totalAmount)), 0);
                const opening = number(supplier.openingBalance);
                const openingSigned = supplier.openingBalanceType === 'Dr' ? -opening : opening;
                const closing = openingSigned + purchaseBalance + noteBalance;
                return {
                    party: supplier.name, type: 'supplier', openingBalance: opening,
                    openingBalanceType: supplier.openingBalanceType || 'Cr', outstanding,
                    closingBalance: closing,
                    closingBalanceType: closing < 0 ? 'Dr' : 'Cr'
                };
            }
            return null;
        },

        async getSalesSummary({ userId, period }) {
            const now = new Date();
            const start = period === 'today'
                ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
                : new Date(now.getFullYear(), now.getMonth(), 1);
            const invoices = await Invoice.find({
                ...ownerQuery(userId),
                date: { $gte: start, $lte: now },
                status: { $ne: 'CANCELLED' }
            }).lean();
            return {
                period: period === 'today' ? 'today' : 'this month',
                invoiceCount: invoices.length,
                totalSales: invoices.reduce((sum, invoice) => sum + (number(invoice.invoice_total) || number(invoice.invoiceTotal) || number(invoice.grandTotal) || number(invoice.total)), 0)
            };
        },

        async getUnpaidInvoices({ userId }) {
            const invoices = await Invoice.find(ownerQuery(userId)).sort({ date: -1 }).lean();
            // Match report.html's Summary bar definition of Unpaid: nothing paid,
            // with a positive invoice total. Partial invoices are excluded.
            return invoices.map(invoice => ({
                invoice,
                total: number(invoice.invoice_total) || number(invoice.invoiceTotal) || number(invoice.grandTotal) || number(invoice.total),
                paid: number(invoice.total_paid) || number(invoice.amountPaid) || number(invoice.paid_amount) || number(invoice.paid)
            }))
                .filter(({ total, paid }) => paid === 0 && total > 0).map(({ invoice, total, paid }) => ({
                invoiceNo: invoice.invoiceNo || invoice.invoice_no,
                customerName: invoice.customerName || invoice.customer_name,
                date: invoice.date,
                status: invoice.status,
                outstanding: Math.max(0, total - paid)
            }));
        }
    };
}

module.exports = function registerNancyRoutes(app, models) {
    const dataStore = createNancyDataStore(models);

    app.get('/api/nancy/suggestions', async (req, res) => {
        const userId = getNancySession(req, process.env.NANCY_AUTH_SECRET);
        if (!userId) return res.status(401).json({ error: 'Please sign in again before using Nancy.' });
        const type = String(req.query.type || '').toLowerCase();
        const query = String(req.query.q || '').trim();
        if (!['customer', 'supplier', 'item'].includes(type)) return res.status(400).json({ error: 'Choose customer, supplier, or item suggestions.' });
        if (query.length < 1 || query.length > 100) return res.json({ suggestions: [] });
        try {
            const suggestions = await dataStore.findSuggestions({ userId, type, query });
            res.json({ suggestions });
        } catch (error) {
            console.error('Nancy suggestions failed:', error.message);
            res.status(500).json({ error: 'Could not load suggestions right now.' });
        }
    });

    app.post('/api/nancy/chat', async (req, res) => {
        const userId = getNancySession(req, process.env.NANCY_AUTH_SECRET);
        const prompt = String(req.body && req.body.message || '').trim();
        if (!userId) return res.status(401).json({ error: 'Please sign in again before using Nancy.' });
        if (!prompt) return res.status(400).json({ error: 'Enter a question for Nancy.' });
        if (prompt.length > 2000) return res.status(400).json({ error: 'Nancy questions must be 2,000 characters or fewer.' });

        try {
            const result = await runNancyAgent({
                userId,
                prompt,
                previousInteractionId: req.body.previousInteractionId,
                dataStore
            });
            res.json(result);
        } catch (error) {
            console.error('Nancy request failed:', error.message);
            const status = error.code === 'NANCY_UPSTREAM_TIMEOUT' ? 504 :
                error.code === 'NANCY_KEY_UNAVAILABLE' ? 403 :
                    ['NANCY_NOT_CONFIGURED', 'NANCY_LOOKUP_UNAVAILABLE'].includes(error.code) ? 503 : 500;
            res.status(status).json({ error: error.message || 'Nancy is temporarily unavailable.' });
        }
    });
};
