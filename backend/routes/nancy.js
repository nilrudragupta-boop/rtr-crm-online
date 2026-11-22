const { runNancyAgent } = require('../services/nancyAgent');
const { getNancySession } = require('../services/nancyAuth');

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const number = value => {
    if (typeof value === 'string') value = value.replace(/[₹,\s]/g, '');
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const firstAmount = (...values) => values.map(number).find(value => value !== 0) || 0;
const invoiceTotal = invoice => {
    const savedTotal = firstAmount(invoice.invoice_total, invoice.total, invoice.invoiceTotal, invoice.grandTotal);
    if (savedTotal) return savedTotal;
    return Array.isArray(invoice.items)
        ? invoice.items.reduce((sum, item) => sum + number(item.total), 0)
        : 0;
};
const invoicePaid = invoice => firstAmount(invoice.total_paid, invoice.paid_amount, invoice.paid, invoice.amountPaid);
const invoiceDate = invoice => {
    const value = invoice.date || invoice.invoiceDate || invoice.invoice_date;
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) {
        const [, day, month, year] = match;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return parsed.getFullYear() === Number(year) && parsed.getMonth() === Number(month) - 1 && parsed.getDate() === Number(day)
            ? parsed : null;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function createNancyDataStore({ Customer, Invoice, Item, Supplier, Purchase, CreditDebitNote, Scrap, Production, AdvancePayment }) {
    const ownerQuery = userId => ({ createdBy: userId, deletedAt: null });
    const matchingText = value => new RegExp(escapeRegex(value), 'i');

    const itemSearchFields = match => [
        { name: match }, { itemName: match }, { item_name: match },
        { itemCode: match }, { item_code: match }, { code: match },
        { description: match }, { indexNo: match }, { hsn: match }, { hsnCode: match }
    ];

    async function attachStock(userId, items) {
        if (!items.length) return items;
        const [allItems, purchases, invoices, scraps, productions] = await Promise.all([
            Item.find(ownerQuery(userId)).lean(),
            Purchase.find(ownerQuery(userId)).lean(),
            Invoice.find(ownerQuery(userId)).lean(),
            Scrap ? Scrap.find(ownerQuery(userId)).lean() : [],
            Production ? Production.find(ownerQuery(userId)).lean() : []
        ]);
        const keyOf = (name, code = '', uom = '-') => `${String(name || '').trim().toLowerCase()}|${String(code || '').trim().toLowerCase()}|${String(uom || '-').trim().toLowerCase()}`;
        const stockMap = new Map();
        const ensure = (name, code = '', uom = '-') => {
            if (!name) return null;
            const key = keyOf(name, code, uom);
            if (!stockMap.has(key)) {
                const master = allItems.find(i => String(i.name || '').toLowerCase() === String(name).toLowerCase() && (!code || String(i.itemCode || '').toLowerCase() === String(code).toLowerCase()))
                    || allItems.find(i => String(i.name || '').toLowerCase() === String(name).toLowerCase()) || {};
                stockMap.set(key, {
                    name,
                    itemCode: code || master.itemCode || '',
                    uom: uom || '-',
                    opening: number(master.openingStock),
                    purchased: 0,
                    sold: 0,
                    consumed: 0
                });
            }
            return stockMap.get(key);
        };
        const findKey = (name, code = '', uom = '') => {
            const exact = keyOf(name, code, uom || '-');
            if (stockMap.has(exact)) return stockMap.get(exact);
            const lowerName = String(name || '').trim().toLowerCase();
            const lowerCode = String(code || '').trim().toLowerCase();
            const lowerUom = String(uom || '').trim().toLowerCase();
            for (const row of stockMap.values()) {
                if (row.name.toLowerCase() === lowerName && (!lowerCode || row.itemCode.toLowerCase() === lowerCode) && (!lowerUom || row.uom.toLowerCase() === lowerUom)) return row;
            }
            return null;
        };
        allItems.forEach(i => ensure(
            i.name || i.itemName || i.item_name,
            i.itemCode || i.item_code || i.code,
            i.uom || i.unit || '-'
        ));
        purchases.forEach(p => {
            // Purchase records are stored as one row per item by purchase.html.
            const row = ensure(p.itemName || p.item_name || p.name, p.itemCode || p.item_code || p.code, p.uom || p.unit || '-');
            if (row) row.purchased += number(p.totalQty) || number(p.qty);
        });
        invoices.forEach(inv => (Array.isArray(inv.items) ? inv.items : []).forEach(line => {
            const row = ensure(line.item || line.itemName || line.item_name || line.name, line.itemCode || line.item_code || line.code, line.uom || line.unit || '-');
            if (row) row.sold += number(line.qty);
        }));
        if (Scrap) scraps.forEach(s => {
            const row = findKey(s.itemName || s.item_name || s.name, s.itemCode || s.item_code || s.code, s.uom || s.unit);
            if (row) row.purchased -= number(s.qty);
        });
        if (Production) productions.forEach(prod => {
            if ((prod.stage || 'Completed') === 'Planned') return;
            const consumed = Array.isArray(prod.materialsConsumed) ? prod.materialsConsumed : [];
            consumed.forEach(line => {
                const row = findKey(line.item || line.itemName || line.name, line.code || line.itemCode, line.uom || line.unit);
                if (row) row.consumed += number(line.qty);
            });
        });
        return items.map(item => {
            const name = item.name || item.itemName || item.item_name;
            const code = item.itemCode || item.item_code || item.code;
            const unit = item.uom || item.unit;
            const matchingRows = [...stockMap.values()].filter(row => row.name.toLowerCase() === String(name || '').toLowerCase()
                && (!code || row.itemCode.toLowerCase() === String(code).toLowerCase())
                && (!unit || row.uom.toLowerCase() === String(unit).toLowerCase()));
            const currentStock = matchingRows.length
                ? matchingRows.reduce((sum, row) => sum + row.opening + row.purchased - row.sold - row.consumed, 0)
                : number(item.openingStock ?? item.currentStock ?? item.stock ?? item.quantity);
            const purchasedQuantity = matchingRows.reduce((sum, row) => sum + row.purchased, 0);
            return { ...item, currentStock, purchasedQuantity };
        });
    }

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
                query.$or = itemSearchFields(match);
            }
            const items = await Item.find(query).sort({ name: 1 }).limit(10).lean();
            return attachStock(userId, items);
        },

        async findLowStockItems({ userId }) {
            const items = await Item.find(ownerQuery(userId)).sort({ name: 1 }).lean();
            const stockItems = await attachStock(userId, items);
            return stockItems.map(item => {
                const stock = number(item.currentStock);
                const unit = String(item.uom || item.unit || '').toLowerCase().trim();
                const threshold = ['gm', 'ml', 'gram', 'grams'].includes(unit) ? 500 : 5;
                let status;
                if (stock < 0) status = 'Negative Stock';
                else if (stock === 0) status = 'Out of Stock';
                else if (stock < threshold) status = 'Low Stock';
                else status = 'In Stock';
                return { ...item, stockStatus: status, reorderThreshold: threshold };
            }).filter(item => item.stockStatus === 'Low Stock' || item.stockStatus === 'Out of Stock' || item.stockStatus === 'Negative Stock');
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
                    $or: itemSearchFields(match)
                }).sort({ name: 1 }).limit(8).lean();
                return records.map(record => ({
                    label: record.name || record.itemName || record.item_name || record.itemCode || record.item_code || record.code || record.description,
                    detail: [record.itemCode || record.item_code || record.code,
                        `Stock: ${record.currentStock ?? record.stock ?? record.quantity ?? 0} ${record.uom || record.unit || ''}`]
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
                const records = await Item.find({
                    ...owner,
                    $or: itemSearchFields(query)
                }).sort({ name: 1 }).limit(5).lean();
                return attachStock(userId, records);
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
                    status: { $nin: ['CANCELLED', 'Cancelled', 'cancelled'] },
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
                        // Purchase records are stored per item; use the same total and
                        // paid fields as the purchase screen when present.
                        if (purchase.totalAmount !== undefined && purchase.totalAmount !== null && Number.isFinite(Number(purchase.totalAmount)) && Number(purchase.totalAmount) > 0) {
                            const paidTotal = purchase.paid !== undefined && purchase.paid !== null
                                ? number(purchase.paid)
                                : (number(purchase.amountPaid) || number(purchase.total_paid) || number(purchase.paid_amount));
                            return number(purchase.totalAmount) - paidTotal;
                        }
                        const base = number(purchase.qty) * number(purchase.price);
                        const discountValue = number(purchase.discount);
                        const discount = (purchase.discType || '%') === 'flat'
                            ? discountValue : base * discountValue / 100;
                        const charges = number(purchase.freightCharges) + number(purchase.packingCharges) + number(purchase.loadingCharges);
                        const taxable = base - discount + charges;
                        const computedTotal = taxable + taxable * number(purchase.gst) / 100 + number(purchase.roundOff);
                        const paid = purchase.paid !== undefined && purchase.paid !== null
                            ? number(purchase.paid)
                            : (number(purchase.amountPaid) || number(purchase.total_paid) || number(purchase.paid_amount));
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
                status: { $nin: ['CANCELLED', 'Cancelled', 'cancelled'] }
            }).lean();
            const inPeriod = invoices.filter(invoice => {
                const date = invoiceDate(invoice);
                return date && date >= start && date <= now;
            });
            return {
                period: period === 'today' ? 'today' : 'this month',
                invoiceCount: inPeriod.length,
                totalSales: inPeriod.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0)
            };
        },

        async getUnpaidInvoices({ userId }) {
            const invoices = await Invoice.find({
                ...ownerQuery(userId),
                status: { $nin: ['CANCELLED', 'Cancelled', 'cancelled'] }
            }).sort({ date: -1 }).lean();
            const advances = AdvancePayment
                ? await AdvancePayment.find({ ...ownerQuery(userId), deletedAt: null }).lean()
                : [];
            // Match Invoice Reports' Total Due column, including applied advances.
            return invoices.map(invoice => {
                const invoiceNo = String(invoice.invoiceNo || invoice.invoice_no || '').trim().toLowerCase();
                const customerName = String(invoice.customerName || invoice.customer_name || invoice.customer?.name || '').trim().toLowerCase();
                const advanceApplied = invoiceNo && customerName
                    ? advances.reduce((sum, advance) => sum + (advance.allocations || [])
                        .filter(item => item && item.type === 'invoice_allocation'
                            && item.documentType === 'sales_invoice' && item.status !== 'reversed'
                            && String(item.invoiceNo || '').trim().toLowerCase() === invoiceNo
                            && String(item.partyName || advance.partyName || '').trim().toLowerCase() === customerName)
                        .reduce((part, item) => part + number(item.amount), 0), 0)
                    : 0;
                const paymentHistoryPaid = Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length
                    ? invoice.paymentHistory.reduce((sum, payment) => sum + number(payment.amount), 0)
                    : 0;
                const cashPaid = Math.max(
                    paymentHistoryPaid,
                    firstAmount(invoice.total_paid, invoice.paid_amount, invoice.paid),
                    number(invoice.paid_cash) + number(invoice.paid_bank)
                );
                const due = Math.max(0, invoiceTotal(invoice) - cashPaid - advanceApplied);
                return { invoice, due };
            })
                .filter(({ due }) => due > 0.01).map(({ invoice, due }) => ({
                invoiceNo: invoice.invoiceNo || invoice.invoice_no,
                customerName: invoice.customerName || invoice.customer_name,
                date: invoice.date,
                status: invoice.status,
                outstanding: Math.max(0, due)
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
