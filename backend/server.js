require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { Customer, CrmContact, CrmPlant, CrmActivity, CrmDocument, CrmEnquiry, CrmTechnicalReview, CrmNegotiation, Invoice, Item, Supplier, Purchase, CreditDebitNote, BankAccount, BankTransaction, JournalVoucher, Scrap, Production, Bom, Expense, Employee, CustomField, CustomRecord, Message, ChatterGroup } = require('./index');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;

const app = express();


// Render will supply process.env.PORT, otherwise it falls back to 5000 locally
const PORT = process.env.PORT || 5000;

// --- Middleware ---
// Allow cross-origin requests from your frontend
app.use(cors());
// Parse incoming JSON requests. Increased limit to 50mb to handle base64 attachments/images.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy to get accurate client IP addresses if hosted on platforms like Render or Heroku
app.set('trust proxy', true);

// Serve static files (HTML, CSS, JS, Images) from the frontend directory
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Redirect the root URL to your login page
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

// --- Database Connection ---
// Create a .env file in your root folder and add your MongoDB Atlas connection string:
// MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/rtr_database

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Successfully connected to MongoDB');
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
    });

// --- Admin Credentials Model ---
const adminCredsSchema = new mongoose.Schema({
    id: { type: String, default: 'global_creds', unique: true },
    adminUser: String,
    adminEmail: String,
    adminEmailPass: String,
    adminPass: String,
    adminUsers: { type: Array, default: [{ username: "Admin", password: "", role: "Admin" }] },
    emailProvider: String,
    smtpHost: String,
    smtpPort: String,
    imapHost: String,
    imapPort: String
});
const AdminCreds = mongoose.model('AdminCreds', adminCredsSchema);

// --- Marketing Visit Schema ---
const marketingVisitSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    visitNo: { type: String, required: true },
    visitDate: { type: String, required: true },
    customerName: { type: String, required: true },
    mainRemarks: { type: String, default: '' },
    purposeVisit: { type: String, default: '' },
    customerRequirement: { type: String, default: '' },
    contacts: { type: Array, default: [] },
    expenses: { type: Array, default: [] },
    createdBy: { type: String, default: 'System' }
}, { timestamps: true });
const MarketingVisit = mongoose.model('MarketingVisit', marketingVisitSchema);

// --- Quotation Schema ---
const quotationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    refNo: { type: String },
    date: { type: String },
    custName: { type: String },
    status: { type: String },
    custContact: { type: String },
    custAddress: { type: String },
    items: { type: Array, default: [] },
    grandTotal: { type: String },
    terms: { type: String },
    createdBy: { type: String, default: 'System' }
}, { timestamps: true, strict: false });
const Quotation = mongoose.model('Quotation', quotationSchema);

// --- Medicine Models ---
const medicineSchema = new mongoose.Schema({ id: { type: String, required: true, unique: true } }, { strict: false, timestamps: true });
const Medicine = mongoose.model('Medicine', medicineSchema);

const medPaymentSchema = new mongoose.Schema({ id: { type: String, required: true, unique: true } }, { strict: false, timestamps: true });
const MedPayment = mongoose.model('MedPayment', medPaymentSchema);

const medPurchaseInvoiceSchema = new mongoose.Schema({ id: { type: String, required: true, unique: true } }, { strict: false, timestamps: true });
const MedPurchaseInvoice = mongoose.model('MedPurchaseInvoice', medPurchaseInvoiceSchema);

// --- API Routes ---
app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'RTR Backend API is running successfully!' });
});

// --- Admin Creds Routes (Login Validation) ---
app.get('/api/admin-creds', async (req, res) => {
    try {
        const creds = await AdminCreds.findOne({ id: 'global_creds' });
        if (creds) {
            res.json({ success: true, ...creds.toObject() });
        } else {
            // Fallback for new databases
            res.json({ success: true, adminUsers: [{ username: "Admin", password: "", role: "Admin" }] });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin-creds', async (req, res) => {
    try {
        const payload = req.body;
        const updated = await AdminCreds.findOneAndUpdate({ id: 'global_creds' }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// --- General App Settings Schema ---
const settingSchema = new mongoose.Schema({
    id: { type: String, default: 'global_settings', unique: true },
    data: { type: mongoose.Schema.Types.Mixed }
}, { strict: false });
const Setting = mongoose.model('Setting', settingSchema);

// --- General App Settings Routes ---
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await Setting.findOne({ id: 'global_settings' });
        res.json({ success: true, data: settings ? settings.data : {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const current = await Setting.findOne({ id: 'global_settings' });
        const mergedData = { ...(current ? current.data : {}), ...req.body };
        const updated = await Setting.findOneAndUpdate(
            { id: 'global_settings' },
            { data: mergedData },
            { new: true, upsert: true }
        );
        res.json({ success: true, data: updated.data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Shadow Ledger / Vault Routes ---
app.get('/api/shadow_ledger', async (req, res) => {
    try {
        const user = req.query.user || 'System';
        const doc = await Setting.findOne({ id: `shadow_ledger_${user}` });
        res.json({ success: true, data: doc ? doc.data : [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/shadow_ledger', async (req, res) => {
    try {
        const user = req.query.user || req.body.user || 'System';
        const data = req.body.shadow_ledger_data;
        const updated = await Setting.findOneAndUpdate(
            { id: `shadow_ledger_${user}` },
            { data: data },
            { new: true, upsert: true }
        );
        res.json({ success: true, message: 'Vault Ledger synced successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Customer Routes ---
// Fetch all customers
app.get('/api/customers', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const customers = await Customer.find(query).sort({ createdAt: -1 }); // Newest first
        res.json({ success: true, data: customers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create a new customer
app.post('/api/customers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.name === "ANONYMOUS") {
            const query = { name: "ANONYMOUS" };
            if (payload.createdBy) query.createdBy = payload.createdBy;
            const updated = await Customer.findOneAndUpdate(query, payload, { new: true, upsert: true });
            return res.status(200).json({ success: true, data: updated });
        }
        if (payload.id) {
            const updated = await Customer.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newCustomer = new Customer(payload);
            await newCustomer.save();
            res.status(201).json({ success: true, data: newCustomer });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await Customer.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Quotation Routes ---
app.get('/api/quotations', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const quotations = await Quotation.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: quotations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/quotations', async (req, res) => {
    try {
        const payload = req.body;
        const updated = await Quotation.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/quotations/:id', async (req, res) => {
    try {
        await Quotation.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Invoice Routes ---
// Fetch all invoices
app.get('/api/invoices', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const invoices = await Invoice.find(query).sort({ date: -1 }); // Newest date first
        res.json({ success: true, data: invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create a new invoice
app.post('/api/invoices', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.invoice_no || payload.invoiceNo) {
            // Update existing invoice
            const updated = await Invoice.findOneAndUpdate({ invoiceNo: payload.invoice_no || payload.invoiceNo }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newInvoice = new Invoice(payload);
            await newInvoice.save();
            res.status(201).json({ success: true, data: newInvoice });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = decodeURIComponent(req.params.id);
        const deleted = await Invoice.findOneAndDelete({
            $or: [
                { id: invoiceId },
                { invoiceNo: invoiceId },
                { invoice_no: invoiceId }
            ]
        });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Invoice not found.' });
        }
        res.json({ success: true, data: deleted });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Supplier Routes ---
app.get('/api/suppliers', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const suppliers = await Supplier.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: suppliers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/suppliers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.name === "ANONYMOUS") {
            const query = { name: "ANONYMOUS" };
            if (payload.createdBy) query.createdBy = payload.createdBy;
            const updated = await Supplier.findOneAndUpdate(query, payload, { new: true, upsert: true });
            return res.status(200).json({ success: true, data: updated });
        }
        if (payload.id) {
            const updated = await Supplier.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newSupplier = new Supplier(payload);
            await newSupplier.save();
            res.status(201).json({ success: true, data: newSupplier });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        await Supplier.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Medicine Routes ---
app.get('/api/medicines', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const medicines = await Medicine.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: medicines });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/medicines', async (req, res) => {
    try {
        const updated = await Medicine.findOneAndUpdate({ id: req.body.id }, req.body, { new: true, upsert: true });
        res.json({ success: true, data: updated });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
app.delete('/api/medicines/:id', async (req, res) => {
    try { await Medicine.findOneAndDelete({ id: req.params.id }); res.json({ success: true }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Medicine Payments Routes ---
app.get('/api/med-payments', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const payments = await MedPayment.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: payments });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/med-payments', async (req, res) => {
    try {
        const updated = await MedPayment.findOneAndUpdate({ id: req.body.id }, req.body, { new: true, upsert: true });
        res.json({ success: true, data: updated });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// --- Medicine Purchase Invoices Routes ---
app.get('/api/med-purchase-invoices', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const invoices = await MedPurchaseInvoice.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: invoices });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/med-purchase-invoices', async (req, res) => {
    try {
        const updated = await MedPurchaseInvoice.findOneAndUpdate({ id: req.body.id }, req.body, { new: true, upsert: true });
        res.json({ success: true, data: updated });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});
app.delete('/api/med-purchase-invoices/:id', async (req, res) => {
    try { await MedPurchaseInvoice.findOneAndDelete({ id: req.params.id }); res.json({ success: true }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Database Maintenance Routes ---
app.post('/api/cleanup-anonymous', async (req, res) => {
    try {
        let deletedCustomerIds = [];
        let deletedSupplierIds = [];

        // Cleanup duplicate anonymous Customers (Keep the oldest one)
        const anonCustomers = await Customer.find({ name: "ANONYMOUS" }).sort({ createdAt: 1 });
        if (anonCustomers.length > 1) {
            const toDelete = anonCustomers.slice(1);
            deletedCustomerIds = toDelete.map(c => c.id);
            await Customer.deleteMany({ _id: { $in: toDelete.map(c => c._id) } });
        }

        // Cleanup duplicate anonymous Suppliers (Keep the oldest one)
        const anonSuppliers = await Supplier.find({ name: "ANONYMOUS" }).sort({ createdAt: 1 });
        if (anonSuppliers.length > 1) {
            const toDelete = anonSuppliers.slice(1);
            deletedSupplierIds = toDelete.map(s => s.id);
            await Supplier.deleteMany({ _id: { $in: toDelete.map(s => s._id) } });
        }

        res.json({
            success: true,
            message: `Cleaned up ${deletedCustomerIds.length} duplicate customers and ${deletedSupplierIds.length} duplicate suppliers.`,
            deletedCustomerIds,
            deletedSupplierIds
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Item Routes ---
app.get('/api/items', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const items = await Item.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Item.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newItem = new Item(payload);
            await newItem.save();
            res.status(201).json({ success: true, data: newItem });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Purchase Routes ---
app.get('/api/purchases', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const purchases = await Purchase.find(query).sort({ date: -1 });
        res.json({ success: true, data: purchases });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/purchases', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Purchase.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newPurchase = new Purchase(payload);
            await newPurchase.save();
            res.status(201).json({ success: true, data: newPurchase });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/purchases/:id', async (req, res) => {
    try {
        await Purchase.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Credit/Debit Note Routes ---
app.get('/api/credit-debit-notes', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const notes = await CreditDebitNote.find(query).sort({ date: -1 });
        res.json({ success: true, data: notes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/credit-debit-notes', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await CreditDebitNote.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newNote = new CreditDebitNote(payload);
            await newNote.save();
            res.status(201).json({ success: true, data: newNote });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/credit-debit-notes/:id', async (req, res) => {
    try {
        await CreditDebitNote.findOneAndDelete({ $or: [{ id: req.params.id }, { noteNo: req.params.id }, { note_no: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Bank Account Routes ---
app.get('/api/bank-accounts', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const accounts = await BankAccount.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: accounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/bank-accounts', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await BankAccount.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newAccount = new BankAccount(payload);
            await newAccount.save();
            res.status(201).json({ success: true, data: newAccount });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/bank-accounts/:id', async (req, res) => {
    try {
        await BankAccount.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Bank Transaction Routes ---
app.get('/api/bank-transactions', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const transactions = await BankTransaction.find(query).sort({ date: -1 });
        res.json({ success: true, data: transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/bank-transactions', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await BankTransaction.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newTx = new BankTransaction(payload);
            await newTx.save();
            res.status(201).json({ success: true, data: newTx });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/bank-transactions/:id', async (req, res) => {
    try {
        await BankTransaction.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Journal Voucher Routes ---
app.get('/api/journal-vouchers', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const vouchers = await JournalVoucher.find(query).sort({ date: -1 });
        res.json({ success: true, data: vouchers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/journal-vouchers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await JournalVoucher.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newVoucher = new JournalVoucher(payload);
            await newVoucher.save();
            res.status(201).json({ success: true, data: newVoucher });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/journal-vouchers/:id', async (req, res) => {
    try {
        await JournalVoucher.findOneAndDelete({ $or: [{ id: req.params.id }, { voucher_no: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Scrap Routes ---
app.get('/api/scraps', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const scraps = await Scrap.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: scraps });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/scraps', async (req, res) => {
    try {
        const payload = req.body;
        // Use upsert to create or update based on a unique 'id'
        const updated = await Scrap.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/scraps/:id', async (req, res) => {
    try {
        await Scrap.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Production Routes ---
// This is read-only for the scrap page's stock calculation
app.get('/api/production', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const productions = await Production.find(query).sort({ date: -1 });
        res.json({ success: true, data: productions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/production', async (req, res) => {
    try {
        const payload = req.body;
        const updated = await Production.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/production/:id', async (req, res) => {
    try {
        await Production.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- BOM Routes ---
app.get('/api/boms', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const boms = await Bom.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: boms });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/boms', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.id) {
            return res.status(400).json({ success: false, message: 'BOM id is required.' });
        }
        const updated = await Bom.findOneAndUpdate(
            { id: payload.id },
            payload,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/boms/:id', async (req, res) => {
    try {
        await Bom.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Expense Routes ---
app.get('/api/expenses', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const expenses = await Expense.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: expenses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const payload = req.body;
        const lookupId = payload.expense_id || payload.id;
        if (lookupId) {
            const updated = await Expense.findOneAndUpdate({ $or: [{ id: lookupId }, { expense_id: lookupId }] }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newExpense = new Expense(payload);
            await newExpense.save();
            res.status(201).json({ success: true, data: newExpense });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        await Expense.findOneAndDelete({ $or: [{ id: req.params.id }, { expense_id: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Employee Routes ---
app.get('/api/employees', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const employees = await Employee.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: employees });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/employees', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Employee.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newEmployee = new Employee(payload);
            await newEmployee.save();
            res.status(201).json({ success: true, data: newEmployee });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await Employee.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Marketing Visit Routes ---
app.get('/api/marketing-visits', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        if (req.query.startDate || req.query.endDate) {
            query.visitDate = {};
            if (req.query.startDate) query.visitDate.$gte = req.query.startDate;
            if (req.query.endDate) query.visitDate.$lte = req.query.endDate;
        }
        const visits = await MarketingVisit.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: visits });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/marketing-visits', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.createdBy && req.query.user) {
            payload.createdBy = req.query.user;
        }
        const updated = await MarketingVisit.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/marketing-visits/:id', async (req, res) => {
    try {
        await MarketingVisit.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// --- Follow-ups ---
const followUpSchema = new mongoose.Schema({ id: { type: String, required: true, unique: true } }, { strict: false, timestamps: true });
const FollowUp = mongoose.model('FollowUp', followUpSchema);

app.get('/api/follow-ups', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const followUps = await FollowUp.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: followUps });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/follow-ups', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.createdBy && req.query.user) payload.createdBy = req.query.user;
        const updated = await FollowUp.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/follow-ups/:id', async (req, res) => {
    try {
        await FollowUp.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// --- CRM Phase 1 Routes ---
function crmRoutes(app, Model, basePath) {
    app.get(basePath, async (req, res) => {
        try {
            const query = req.query.user ? { createdBy: req.query.user } : {};
            const data = await Model.find(query).sort({ createdAt: -1 });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });
    app.post(basePath, async (req, res) => {
        try {
            const payload = { ...req.body };
            if (!payload.createdBy && req.query.user) payload.createdBy = req.query.user;
            if (!payload.id) payload.id = `${basePath.replace('/api/','').replace(/-/g,'_')}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            const data = await Model.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true, setDefaultsOnInsert: true });
            res.status(200).json({ success: true, data });
        } catch (err) { res.status(400).json({ success: false, message: err.message }); }
    });
    app.delete(`${basePath}/:id`, async (req, res) => {
        try { await Model.findOneAndDelete({ id: req.params.id }); res.json({ success: true }); }
        catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });
}
crmRoutes(app, CrmContact, '/api/crm-contacts');
crmRoutes(app, CrmPlant, '/api/crm-plants');
crmRoutes(app, CrmActivity, '/api/crm-activities');
crmRoutes(app, CrmDocument, '/api/crm-documents');
crmRoutes(app, CrmEnquiry, '/api/crm-enquiries');
crmRoutes(app, CrmTechnicalReview, '/api/crm-technical-reviews');
crmRoutes(app, CrmNegotiation, '/api/crm-negotiations');

app.get('/api/crm/customer/:id/360', async (req, res) => {
    try {
        const id = req.params.id;
        const customer = await Customer.findOne({ id });
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        const [contacts, plants, activities, documents, followUps] = await Promise.all([
            CrmContact.find({ customerId: id }).sort({ createdAt: -1 }),
            CrmPlant.find({ customerId: id }).sort({ createdAt: -1 }),
            CrmActivity.find({ customerId: id }).sort({ activityDate: -1, createdAt: -1 }).limit(50),
            CrmDocument.find({ customerId: id }).select('-fileData').sort({ createdAt: -1 }),
            FollowUp.find({ partyType: 'Customer', partyId: id }).sort({ date: 1 }).limit(20)
        ]);
        res.json({ success: true, data: { customer, contacts, plants, activities, documents, followUps } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Integrated Customer 360 Business Timeline ---
// This read-only aggregation connects the existing transaction modules to the CRM customer.
app.get('/api/crm/customer/:id/business-360', async (req, res) => {
    try {
        const id = req.params.id;
        const customer = await Customer.findOne({ id }).lean();
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

        const customerName = String(customer.name || '').trim();
        const nameRegex = customerName ? new RegExp('^' + customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') : null;

        const nameOrId = [];
        if (id) {
            nameOrId.push({ customerId: id });
            nameOrId.push({ partyId: id });
        }
        if (nameRegex) {
            nameOrId.push({ customerName: nameRegex });
            nameOrId.push({ custName: nameRegex });
        }

        const [quotations, invoices, notes, customRecords] = await Promise.all([
            nameRegex ? Quotation.find({ custName: nameRegex }).sort({ date: -1, createdAt: -1 }).lean() : [],
            Invoice.find(nameOrId.filter(x => x.customerId || x.customerName)).sort({ date: -1, createdAt: -1 }).lean(),
            nameRegex ? CreditDebitNote.find({ customerName: nameRegex }).sort({ date: -1, createdAt: -1 }).lean() : [],
            CustomRecord.find({}).sort({ createdAt: -1 }).limit(1000).lean()
        ]);

        // Generic custom records are used by configurable modules. Include only records
        // that clearly identify this customer; this keeps the CRM future-proof without
        // changing existing custom-module logic.
        const customerRecords = customRecords.filter(r => {
            const values = [r.customerId, r.partyId, r.customerName, r.partyName, r.custName, r.customer, r.companyName]
                .filter(v => v !== undefined && v !== null).map(String);
            return values.some(v => v === id || (customerName && v.toLowerCase() === customerName.toLowerCase()));
        });

        const money = v => Number(v || 0) || 0;
        const summary = {
            quotations: quotations.length,
            quotationValue: quotations.reduce((a, q) => a + money(q.grandTotal), 0),
            invoices: invoices.length,
            invoicedValue: invoices.reduce((a, i) => a + money(i.invoiceTotal ?? i.grandTotal), 0),
            paidValue: invoices.reduce((a, i) => a + money(i.amountPaid), 0),
            outstandingValue: invoices.reduce((a, i) => a + Math.max(0, money(i.invoiceTotal ?? i.grandTotal) - money(i.amountPaid)), 0),
            creditDebitNotes: notes.length,
            customTransactions: customerRecords.length
        };

        const timeline = [];
        quotations.forEach(q => timeline.push({
            date: q.date || q.createdAt, type: 'Quotation', icon: 'fa-file-invoice-dollar',
            reference: q.refNo || q.id || '-', status: q.status || 'Saved',
            amount: money(q.grandTotal), description: 'Quotation created / updated', sourceId: q.id || q.refNo
        }));
        invoices.forEach(i => {
            timeline.push({ date: i.date || i.createdAt, type: 'Invoice', icon: 'fa-file-invoice',
                reference: i.invoiceNo || i.invoice_no || i.id || '-', status: i.status || 'UNPAID',
                amount: money(i.invoiceTotal ?? i.grandTotal), paid: money(i.amountPaid),
                description: 'Customer invoice', sourceId: i.id || i.invoiceNo
            });
            if (money(i.amountPaid) > 0) timeline.push({
                date: i.updatedAt || i.date || i.createdAt, type: 'Payment', icon: 'fa-money-bill-wave',
                reference: i.invoiceNo || i.invoice_no || '-', status: 'RECEIVED', amount: money(i.amountPaid),
                description: 'Payment recorded against invoice', sourceId: i.id || i.invoiceNo
            });
        });
        notes.forEach(n => timeline.push({ date: n.date || n.createdAt, type: n.type === 'CREDIT' ? 'Credit Note' : 'Debit Note',
            icon: n.type === 'CREDIT' ? 'fa-file-circle-minus' : 'fa-file-circle-plus', reference: n.noteNo || '-',
            status: n.status || 'ACTIVE', amount: money(n.totalAmount), description: n.reason || 'Credit / Debit note', sourceId: n.id || n.noteNo
        }));
        customerRecords.forEach(r => timeline.push({
            date: r.date || r.enquiryDate || r.createdAt, type: r.moduleName || 'Business Record', icon: 'fa-link',
            reference: r.refNo || r.enquiryNo || r.orderNo || r.poNo || r.id || r._id || '-',
            status: r.status || 'Recorded', amount: money(r.grandTotal ?? r.totalAmount ?? r.amount),
            description: r.subject || r.description || r.enquiryType || 'Linked business record', sourceId: r._id
        }));

        timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        res.json({ success: true, data: { customer, summary, quotations, invoices, notes, customRecords: customerRecords, timeline } });
    } catch (err) {
        console.error('Business 360 error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});


app.get('/api/crm/enquiry/:id/workflow', async (req, res) => {
    try {
        const enquiry = await CrmEnquiry.findOne({ id: req.params.id }).lean();
        if (!enquiry) return res.status(404).json({ success: false, message: 'Enquiry not found' });
        const [reviews, negotiations, quotations] = await Promise.all([
            CrmTechnicalReview.find({ enquiryId: req.params.id }).sort({ createdAt: -1 }).lean(),
            CrmNegotiation.find({ enquiryId: req.params.id }).sort({ negotiationDate: -1, createdAt: -1 }).lean(),
            // A quotation can be linked by Enquiry ID or by Enquiry No.
            // Match BOTH so older quotations (saved before enquiryId was stored)
            // are also counted in the enquiry workflow.
            Quotation.find({
                $or: [
                    { enquiryId: req.params.id },
                    { enquiryNo: enquiry.enquiryNo }
                ]
            }).sort({ date: -1, createdAt: -1 }).lean()
        ]);
        const invoiceQuery = { $or: [{ enquiryId: req.params.id }, { enquiryNo: enquiry.enquiryNo }] };
        const invoices = await Invoice.find(invoiceQuery).sort({ date: -1, createdAt: -1 }).lean();
        res.json({ success: true, data: { enquiry, reviews, negotiations, quotations, invoices } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Custom Field Routes ---
app.get('/api/custom-fields', async (req, res) => {
    try {
        const query = req.query.user ? { createdBy: req.query.user } : {};
        const fields = await CustomField.find(query).sort({ moduleName: 1, order: 1 });
        res.json({ success: true, data: fields });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-fields', async (req, res) => {
    try {
        const payload = req.body;
        // Inject user ownership
        if (!payload.createdBy && req.query.user) {
            payload.createdBy = req.query.user;
        }
        if (payload._id) {
            const updated = await CustomField.findByIdAndUpdate(payload._id, payload, { new: true, strict: false });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newField = new CustomField(payload);
            if (payload.createdBy) newField.set('createdBy', payload.createdBy, { strict: false });
            await newField.save();
            res.status(201).json({ success: true, data: newField });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/custom-fields/:id', async (req, res) => {
    try {
        await CustomField.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-fields/reorder', async (req, res) => {
    try {
        const updates = req.body; // Expecting array of [{_id, order}]
        const bulkOps = updates.map(update => ({
            updateOne: {
                filter: { _id: update._id },
                update: { $set: { order: update.order } }
            }
        }));
        await CustomField.bulkWrite(bulkOps);
        res.json({ success: true, message: 'Order updated successfully.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Generic Custom Records Routes (For entirely new UI Pages) ---
app.get('/api/custom-records/:module', async (req, res) => {
    try {
        const query = req.query.user ? { moduleName: req.params.module, createdBy: req.query.user } : { moduleName: req.params.module };
        const records = await CustomRecord.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-records', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.createdBy && req.query.user) {
            payload.createdBy = req.query.user;
        }
        if (payload._id) {
            const updated = await CustomRecord.findByIdAndUpdate(payload._id, payload, { new: true, upsert: true, strict: false });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newRecord = new CustomRecord(payload);
            if (payload.createdBy) newRecord.set('createdBy', payload.createdBy, { strict: false });
            await newRecord.save();
            res.status(201).json({ success: true, data: newRecord });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/custom-records/:id', async (req, res) => {
    try {
        await CustomRecord.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Backup Restore Route ---
app.post('/api/restore', async (req, res) => {
    try {
        const backupData = req.body;

        const restoreCollection = async (Model, dataStr, idField = 'id') => {
            if (!dataStr) return;
            try {
                const records = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
                for (const record of records) {
                    const query = {};
                    if (idField === 'invoiceNo') query['invoiceNo'] = record.invoiceNo || record.invoice_no;
                    else if (idField === 'noteNo') query['noteNo'] = record.noteNo || record.note_no;
                    else if (idField === 'voucher_no') query['voucher_no'] = record.voucher_no || record.voucherNo;
                    else query[idField] = record[idField] || record._id;

                    if (Object.values(query)[0]) {
                        await Model.findOneAndUpdate(query, record, { new: true, upsert: true });
                    } else {
                        await new Model(record).save();
                    }
                }
            } catch (e) { console.error("Error restoring collection", e); }
        };

        await restoreCollection(Customer, backupData['customers']);
        await restoreCollection(Quotation, backupData['quotations']);
        await restoreCollection(Invoice, backupData['invoices'], 'invoiceNo');
        await restoreCollection(Item, backupData['items']);
        await restoreCollection(Supplier, backupData['suppliers']);
        await restoreCollection(Purchase, backupData['purchases']);
        await restoreCollection(Expense, backupData['expenses']);
        await restoreCollection(CreditDebitNote, backupData['credit_debit_notes'], 'noteNo');
        await restoreCollection(BankAccount, backupData['bank-accounts']);
        await restoreCollection(BankTransaction, backupData['bank-transactions']);
        await restoreCollection(JournalVoucher, backupData['journal-vouchers'], 'voucher_no');
        await restoreCollection(CustomField, backupData['CUSTOM_FIELDS'], '_id');
        await restoreCollection(Medicine, backupData['medicines']);
        await restoreCollection(MedPayment, backupData['med_payments']);
        await restoreCollection(MedPurchaseInvoice, backupData['med_purchase_invoices']);
        await restoreCollection(FollowUp, backupData['follow_ups']);

        for (const key of Object.keys(backupData)) {
            if (key.startsWith('CUSTOM_RECORDS_')) await restoreCollection(CustomRecord, backupData[key], '_id');
        }

        res.json({ success: true, message: 'Cloud database restored successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Chatter Routes ---

// In-memory store for online heartbeats, separated by tenant
const activeChatterUsers = {};

// 1. Handle Online Heartbeat (Accepts Cross-Tenant)
app.post('/api/chatter/online', (req, res) => {
    const { user, tenant } = req.body;
    const actualTenant = req.query.tenant || tenant; // Allow explicit query override

    if (!activeChatterUsers[actualTenant]) activeChatterUsers[actualTenant] = {};
    activeChatterUsers[actualTenant][user] = Date.now();

    res.json({ success: true });
});

// 2. Retrieve Online Users (Merges the Developer globally)
app.get('/api/chatter/online', (req, res) => {
    const reqTenant = req.query.tenant;
    const now = Date.now();
    const online = [];

    // 1. Check local admins in their own workspace
    if (activeChatterUsers[reqTenant]) {
        for (const [user, lastSeen] of Object.entries(activeChatterUsers[reqTenant])) {
            if (now - lastSeen < 25000) online.push(user); // Active in last 25 seconds
        }
    }

    // 2. ALWAYS push 'DEVELOPER' to the Admins if the Developer is active in their workspace
    if (reqTenant !== '7908040851' && activeChatterUsers['7908040851']) {
        const devWorkspaceUsers = Object.values(activeChatterUsers['7908040851']);
        const isDevOnline = devWorkspaceUsers.some(lastSeen => (now - lastSeen) < 25000);

        if (isDevOnline && !online.includes('DEVELOPER')) {
            online.push('DEVELOPER');
        }
    }

    res.json({ success: true, online });
});


let typingUsers = {};

app.post('/api/chatter/typing', (req, res) => {
    const { user, isTyping, tenant } = req.body;
    if (user) {
        const key = tenant ? `${tenant}_${user}` : user;
        if (isTyping) typingUsers[key] = Date.now();
        else delete typingUsers[key];
    }
    res.json({ success: true });
});

app.get('/api/chatter/typing', (req, res) => {
    const tenant = req.query.tenant || '';
    const now = Date.now();
    const activeUsers = [];
    for (let u in typingUsers) {
        if (now - typingUsers[u] > 10000) {
            delete typingUsers[u]; // 10s expiry
        } else {
            if (tenant) {
                if (u.startsWith(tenant + '_')) {
                    activeUsers.push(u.replace(tenant + '_', ''));
                }
            } else {
                activeUsers.push(u);
            }
        }
    }
    res.json({ success: true, typing: activeUsers });
});

app.get('/api/chatter', async (req, res) => {
    try {
        const query = req.query.tenant ? { tenant: req.query.tenant } : {};
        const messages = await Message.find(query).sort({ createdAt: 1 }); // Sort chronologically
        res.json({ success: true, data: messages });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/chatter', async (req, res) => {
    try {
        const Message = mongoose.model('Message');
        const payload = req.body;
        
        // 1. Force target tenant if crossing environments
        const isCrossTenant = req.query.tenant === '7908040851' || (payload && payload.sender === 'DEVELOPER');
        if (isCrossTenant && req.query.tenant) {
            payload.tenant = req.query.tenant;
        }

        const existing = await Message.findOne({ id: payload.id });
        let savedMsg;
        if (existing) {
            savedMsg = await Message.findOneAndUpdate({ id: payload.id }, payload, { new: true });
        } else {
            const newMsg = new Message(payload);
            await newMsg.save();
            savedMsg = newMsg;
        }

        // 2. Auto-Sync Linked Messages (For Edits and Read Receipts across cross-tenant clones)
        if (payload.linkedId) {
            const syncData = { text: payload.text, isEdited: payload.isEdited, readBy: payload.readBy, reactions: payload.reactions, attachment: payload.attachment, attachmentName: payload.attachmentName };
            await Message.findOneAndUpdate({ id: payload.linkedId }, { $set: syncData });
        }

        res.status(existing ? 200 : 201).json({ success: true, data: savedMsg });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/chatter/:id', async (req, res) => {
    try {
        const deleted = await Message.findOneAndDelete({ id: req.params.id });
        // Auto-delete linked message across tenants
        if (deleted && deleted.linkedId) {
            await Message.findOneAndDelete({ id: deleted.linkedId });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/chatter-groups', async (req, res) => {
    try {
        const query = req.query.tenant ? { tenant: req.query.tenant } : {};
        const groups = await ChatterGroup.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: groups });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/chatter-groups', async (req, res) => {
    try {
        const payload = req.body;
        const existing = await ChatterGroup.findOne({ id: payload.id });
        if (existing) {
            const updated = await ChatterGroup.findOneAndUpdate({ id: payload.id }, payload, { new: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newGroup = new ChatterGroup(payload);
            await newGroup.save();
            res.status(201).json({ success: true, data: newGroup });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/chatter-groups/:id', async (req, res) => {
    try {
        await ChatterGroup.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- System Info & Security Fingerprinting ---
// Replaces Electron's os.cpus(), os.networkInterfaces() and MAC address tracking
app.post('/api/system-info', (req, res) => {
    // 1. IP Address
    const clientIp = req.ip || req.socket.remoteAddress;

    // 2. User-Agent (Browser, OS, and Device details)
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';

    // 3. Client-side details sent from the frontend (Screen size, Timezone, Language)
    const { screenWidth, screenHeight, timeZone, language } = req.body;

    // Create a unique fingerprint string
    const rawFingerprint = `${clientIp}-${userAgent}-${screenWidth}x${screenHeight}-${timeZone}-${language}`;

    // Optional: Hash the fingerprint for a clean ID
    const fingerprintId = require('crypto').createHash('sha256').update(rawFingerprint).digest('hex').substring(0, 16);

    res.json({
        success: true,
        data: {
            fingerprintId,
            ip: clientIp,
            userAgent,
            resolution: screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : 'Unknown',
            timeZone: timeZone || 'Unknown',
            language: language || 'Unknown'
        }
    });
});

// --- Web Authentication & OTP (Replaces Electron IPC) ---
app.post('/api/auth/login', (req, res) => {
    const { username } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Log to console or future DB collection
    console.log(`[AUTH] User '${username}' logged in from IP: ${clientIp}`);
    res.json({ success: true, message: "Login tracked" });
});

// --- Secure OTP Nodemailer Transporter ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// In-memory store for active OTPs (Use Redis or MongoDB if you scale to multiple servers)
const otpStore = new Map();

app.post('/api/request-otp', async (req, res) => {
    const { action, email } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP securely with a 10-minute expiration
    otpStore.set(email, { otp, action, expires: Date.now() + 10 * 60 * 1000 });

    try {
        await transporter.sendMail({
            from: `"Security Alert" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🔐 Security Verification: ${action}`,
            text: `Your security verification OTP for the action "${action}" is: ${otp}\n\nRequest Source: IP ${clientIp}\n\nThis OTP is valid for 10 minutes.`
        });
        console.log(`[OTP] Sent OTP ${otp} to ${email} (Action: ${action}, IP: ${clientIp})`);
        res.json({ success: true, targetEmail: email, message: "OTP sent successfully to your email." });
    } catch (error) {
        console.error("[OTP] Error sending email:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP email. Please check server configuration." });
    }
});

// Verify OTP Route
app.post('/api/verify-otp', (req, res) => {
    const { action, email, otp } = req.body;
    const record = otpStore.get(email);

    if (!record || record.action !== action) return res.status(400).json({ success: false, message: "Invalid or expired OTP request." });
    if (Date.now() > record.expires) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp === otp) {
        otpStore.delete(email); // Clear upon success
        return res.json({ success: true, message: "OTP verified successfully." });
    }
    res.status(400).json({ success: false, message: "Incorrect OTP." });
});

// --- Renewal OTP Routes ---
app.post('/api/request-renewal-otp', async (req, res) => {
    const { adminId, renewalCode, duration, amount, currentExpiry } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Hardcoded security check matching main.js
    if (adminId !== "NANCY@2012") {
        return res.status(400).json({ success: false, message: "Invalid Admin ID." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set('RENEWAL_' + clientIp, { otp, duration, currentExpiry, expires: Date.now() + 10 * 60 * 1000 });

    try {
        await transporter.sendMail({
            from: `"Security Alert" <${process.env.EMAIL_USER}>`,
            to: process.env.DEVELOPER_EMAIL || 'nilrudragupta@gmail.com',
            subject: `🔐 Renewal OTP Request: ${renewalCode}`,
            text: `Admin Renewal Request Initiated.\n\nOTP: ${otp}\n\nRenewal Code: ${renewalCode}\nDuration: ${duration} days\nAmount: ${amount}\nIP: ${clientIp}\nCurrent Expiry: ${currentExpiry}\n\nThis OTP is valid for 10 minutes.`
        });
        res.json({ success: true, message: "Renewal OTP sent to Developer." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to send Renewal OTP email." });
    }
});

app.post('/api/verify-renewal-otp', (req, res) => {
    const { otp } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;
    const record = otpStore.get('RENEWAL_' + clientIp);

    if (!record) return res.status(400).json({ success: false, message: "Invalid or expired OTP request." });
    if (Date.now() > record.expires) {
        otpStore.delete('RENEWAL_' + clientIp);
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp === otp) {
        otpStore.delete('RENEWAL_' + clientIp); // Clear upon success

        let baseDate = new Date();
        if (record.currentExpiry) {
            const parsedExpiry = new Date(record.currentExpiry);
            if (!isNaN(parsedExpiry.getTime()) && parsedExpiry > baseDate) {
                baseDate = parsedExpiry;
            }
        }

        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + parseInt(record.duration || 370));

        return res.json({ success: true, newExpiry: newExpiryDate.toISOString(), message: "License Renewed Successfully!" });
    }
    res.status(400).json({ success: false, message: "Incorrect OTP." });
});

// --- IMAP Email Routes ---
app.get('/api/emails/inbox', async (req, res) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
        return res.status(400).json({ success: false, error: "Server email configuration is missing." });
    }

    const client = new ImapFlow({
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: parseInt(process.env.IMAP_PORT) || 993,
        secure: (parseInt(process.env.IMAP_PORT) || 993) === 993,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
        logger: false
    });

    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        const emails = [];

        try {
            const exists = client.mailbox.exists;
            if (exists > 0) {
                const startSeq = Math.max(1, exists - 14); // Fetch the last 15 emails
                for await (let message of client.fetch(`${startSeq}:*`, { source: true, flags: true, uid: true })) {
                    const parsed = await simpleParser(message.source);

                    const emailAttachments = [];
                    if (parsed.attachments && parsed.attachments.length > 0) {
                        parsed.attachments.forEach(att => {
                            emailAttachments.push({
                                filename: att.filename || 'Unknown_File',
                                contentType: att.contentType || 'application/octet-stream',
                                size: att.size || 0,
                                content: att.content ? att.content.toString('base64') : null
                            });
                        });
                    }

                    emails.unshift({
                        id: message.seq,
                        uid: message.uid,
                        isUnread: !message.flags.has('\\Seen'),
                        subject: parsed.subject,
                        from: parsed.from ? parsed.from.text : 'Unknown',
                        fromAddress: parsed.from && parsed.from.value.length > 0 ? parsed.from.value[0].address : '',
                        to: parsed.to ? parsed.to.text : 'Me',
                        date: parsed.date,
                        html: parsed.html,
                        text: parsed.text,
                        attachments: emailAttachments
                    });
                }
            }
        } finally {
            lock.release();
        }
        await client.logout();
        res.json({ success: true, emails });
    } catch (error) {
        console.error("IMAP Fetch Error:", error);
        if (error.message && error.message.includes('AUTHENTICATIONFAILED')) {
            return res.status(401).json({ success: false, error: "Authentication failed. Check your server App Password." });
        }
        res.status(500).json({ success: false, error: "Failed to fetch Inbox: " + error.message });
    }
});

app.get('/api/emails/unread-count', async (req, res) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return res.json({ success: false });

    const client = new ImapFlow({ host: process.env.IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD }, logger: false });
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let unread = 0;
        try { const list = await client.search({ seen: false }); unread = list ? list.length : 0; } finally { lock.release(); }
        await client.logout();
        res.json({ success: true, unread });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/emails/mark-read', async (req, res) => {
    const { uid } = req.body;
    if (!uid || !process.env.EMAIL_USER) return res.json({ success: false });
    const client = new ImapFlow({ host: process.env.IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD }, logger: false });
    try {
        await client.connect(); let lock = await client.getMailboxLock('INBOX');
        try { await client.messageFlagsAdd({ uid: uid }, ['\\Seen'], { uid: true }); } finally { lock.release(); }
        await client.logout(); res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});