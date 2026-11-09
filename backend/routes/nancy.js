const { runNancyAgent } = require('../services/nancyAgent');
const { getNancySession } = require('../services/nancyAuth');

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function createNancyDataStore({ Customer, Invoice, Item, Supplier, Purchase }) {
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
            if (name) terms.push({ name: matchingText(name) });
            if (phone) terms.push({ contact: matchingText(phone) }, { phone: matchingText(phone) });
            if (terms.length) query.$or = terms;
            return Customer.find(query).sort({ name: 1 }).limit(10).lean();
        },

        async findStock({ userId, item }) {
            const query = ownerQuery(userId);
            if (item) {
                const match = matchingText(item);
                query.$or = [{ name: match }, { itemCode: match }, { description: match }];
            }
            return Item.find(query).sort({ name: 1 }).limit(10).lean();
        },

        async getLedgerBalance({ userId, party }) {
            const match = matchingText(party);
            const [customers, suppliers] = await Promise.all([
                Customer.find({ ...ownerQuery(userId), name: match }).limit(1).lean(),
                Supplier.find({ ...ownerQuery(userId), name: match }).limit(1).lean()
            ]);
            if (customers.length) {
                const customer = customers[0];
                const invoices = await Invoice.find({
                    ...ownerQuery(userId),
                    customerName: matchingText(customer.name),
                    status: { $nin: ['PAID', 'CANCELLED'] }
                }).lean();
                const outstanding = invoices.reduce((sum, invoice) =>
                    sum + Math.max(0, number(invoice.invoiceTotal) - number(invoice.amountPaid)), 0);
                return { party: customer.name, type: 'customer', openingBalance: number(customer.openingBalance), outstanding };
            }
            if (suppliers.length) {
                const supplier = suppliers[0];
                const purchases = await Purchase.find({
                    ...ownerQuery(userId),
                    supplierName: matchingText(supplier.name)
                }).lean();
                const outstanding = purchases.reduce((sum, purchase) =>
                    sum + Math.max(0, number(purchase.totalAmount) - number(purchase.amountPaid)), 0);
                return { party: supplier.name, type: 'supplier', openingBalance: number(supplier.openingBalance), outstanding };
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
                totalSales: invoices.reduce((sum, invoice) => sum + number(invoice.invoiceTotal), 0)
            };
        },

        async getUnpaidInvoices({ userId }) {
            const invoices = await Invoice.find({
                ...ownerQuery(userId),
                status: { $nin: ['PAID', 'CANCELLED'] }
            }).sort({ date: -1 }).limit(20).lean();
            return invoices.map(invoice => ({
                invoiceNo: invoice.invoiceNo || invoice.invoice_no,
                customerName: invoice.customerName,
                date: invoice.date,
                status: invoice.status,
                outstanding: Math.max(0, number(invoice.invoiceTotal) - number(invoice.amountPaid))
            }));
        }
    };
}

module.exports = function registerNancyRoutes(app, models) {
    const dataStore = createNancyDataStore(models);

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
                conversationHistory: req.body.conversationHistory,
                dataStore
            });
            res.json(result);
        } catch (error) {
            console.error('Nancy request failed:', error.message);
            const status = error.code === 'NANCY_KEY_UNAVAILABLE' ? 403 :
                ['NANCY_NOT_CONFIGURED', 'NANCY_LOOKUP_UNAVAILABLE'].includes(error.code) ? 503 : 500;
            res.status(status).json({ error: error.message || 'Nancy is temporarily unavailable.' });
        }
    });
};