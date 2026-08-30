/**
 * RISE CRM — Business 360° Relational Intelligence Engine
 *
 * One normalized data layer for Customer 360° and Supplier 360°.
 * No demo/fallback financial figures are injected: all KPIs are derived
 * from the records available in the application datastore/localStorage.
 */
const Business360Engine = {
    getStore(key) {
        try {
            const raw = localStorage.getItem(key);
            const data = raw ? JSON.parse(raw) : [];
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn(`Business360: cannot read ${key}`, e);
            return [];
        }
    },

    setStore(key, value) {
        try { localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); } catch (e) {}
    },

    text(value) { return String(value ?? '').trim(); },
    lower(value) { return this.text(value).toLowerCase(); },
    num(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        const n = parseFloat(String(value ?? '').replace(/[,₹\s]/g, ''));
        return Number.isFinite(n) ? n : 0;
    },
    first(...values) { return values.find(v => this.text(v)) || ''; },

    identity(p) {
        return {
            id: this.first(p.id, p.customerId, p.supplierId, p._id, p.code, p.customerCode, p.supplierCode),
            name: this.first(p.name, p.customerName, p.supplierName, p.companyName),
            code: this.first(p.code, p.customerCode, p.supplierCode, p.id),
            gstin: this.first(p.gstin, p.gst, p.gstNo, p.gstNumber),
            pan: this.first(p.pan, p.panNo),
            phone: this.first(p.phone, p.contact, p.mobile, p.mobileNo),
            email: this.first(p.email, p.emailId),
            location: this.first(
                [p.city || p.district, p.state, p.pin || p.pincode].filter(Boolean).join(', '),
                p.address,
                p.location
            ),
            industry: this.first(p.industry, p.category, p.businessType, 'Industrial & Power Sector'),
            grade: this.first(p.grade, 'A'),
            owner: this.first(p.owner, p.salesOwner, p.purchaseOwner, '—')
        };
    },

    searchParties(type, term = '') {
        const q = this.lower(term);
        let source = this.getStore(type === 'customer' ? 'customers' : 'suppliers');
        if (!source.length) source = this.getStore(type === 'customer' ? 'crm_customers' : 'crm_suppliers');

        return source
            .filter(p => p && this.text(p.name || p.customerName || p.supplierName))
            .map(p => {
                const x = this.identity(p);
                return {
                    ...x,
                    id: String(x.id || `${type}_${x.name}`),
                    type: type === 'customer' ? 'Customer' : 'Supplier'
                };
            })
            .filter(p => this.lower(p.name) !== 'anonymous')
            .filter(p => !q || [p.name, p.code, p.gstin, p.pan, p.phone, p.email, p.location]
                .some(v => this.lower(v).includes(q)));
    },

    matches(record, party) {
        if (!record || !party) return false;
        const ids = [record.customerId, record.supplierId, record.partyId, record.customer_id, record.supplier_id,
            record.customer?.id, record.supplier?.id, record.party?.id, record.idCustomer, record.idSupplier]
            .filter(v => this.text(v)).map(v => this.lower(v));
        const names = [record.customerName, record.customer_name, record.custName, record.customer,
            record.supplierName, record.supplier_name, record.vendorName, record.vendor,
            record.partyName, record.party, record.customer?.name, record.supplier?.name, record.party?.name]
            .filter(v => typeof v === 'string' && this.text(v)).map(v => this.lower(v));
        const codes = [record.customerCode, record.supplierCode, record.partyCode, record.code]
            .filter(v => this.text(v)).map(v => this.lower(v));
        const gstins = [record.gstin, record.gst, record.customerGST, record.customer_gst, record.supplierGST]
            .filter(v => this.text(v)).map(v => this.lower(v));
        const partyIds = [party.id, party.code].filter(v => this.text(v)).map(v => this.lower(v));
        const partyName = this.lower(party.name);
        const partyGstin = this.lower(party.gstin);
        return ids.some(v => partyIds.includes(v)) ||
            names.includes(partyName) ||
            codes.some(v => partyIds.includes(v)) ||
            (!!partyGstin && gstins.includes(partyGstin));
    },

    dateOf(r) { return this.first(r.date, r.invoiceDate, r.invoice_date, r.purchaseDate, r.enquiryDate, r.createdAt, r.updatedAt); },
    amountOf(r) {
        return this.num(this.first(r.grandTotal, r.invoiceTotal, r.invoice_total, r.total, r.totalPaid,
            r.totalValue, r.estimatedValue, r.total, r.amount, r.netAmount, r.value, r.purchaseValue, r.totalPaid));
    },

    buildCustomer360(party) {
        const all = key => this.getStore(key);
        const invoices = [...all('invoices'), ...all('crm_invoices')].filter(r => this.matches(r, party));
        const sales = [...all('sales_records')].filter(r => this.matches(r, party));
        const enquiries = all('crm_enquiries').filter(r => this.matches(r, party));
        const quotations = [...all('quotations'), ...all('crm_quotations')].filter(r => this.matches(r, party));
        const contacts = all('crm_contacts').filter(r => this.matches(r, party));
        const plants = all('crm_plants').filter(r => this.matches(r, party));
        const equipment = all('crm_equipment').filter(r => this.matches(r, party));
        const tickets = all('crm_tickets').filter(r => this.matches(r, party));
        const activities = all('crm_activities').filter(r => this.matches(r, party));
        const followups = all('follow_ups').filter(r => this.matches(r, party));
        const reminders = all('reminders').filter(r => this.matches(r, party));
        const returns = all('returns').filter(r => this.matches(r, party));
        const creditDebitNotes = all('credit_debit_notes').filter(r => this.matches(r, party));
        const marketingVisits = all('marketing-visits').filter(r => this.matches(r, party));

        const uniqueById = rows => Array.from(new Map(rows.map((r, i) => [String(r.id || r._id || r.invoiceNo || r.refNo || i), r])).values());
        const transactionInvoices = uniqueById([...invoices, ...sales]);
        const totalInvoiced = transactionInvoices.reduce((s, r) => s + this.amountOf(r), 0);
        const totalReceived = transactionInvoices.reduce((s, r) => {
            const paid = this.first(r.total_paid, r.paid_amount, r.paid, r.receivedAmount, r.amountReceived);
            if (paid !== '') return s + this.num(paid);
            return this.lower(r.status) === 'paid' ? s + this.amountOf(r) : s;
        }, 0);
        const outstanding = Math.max(0, totalInvoiced - totalReceived);
        const overdue = transactionInvoices.reduce((s, r) => {
            const status = this.lower(r.status);
            const due = this.first(r.dueAmount, r.outstanding, r.balanceDue);
            return s + (status.includes('overdue') ? this.num(due || this.amountOf(r)) : 0);
        }, 0);
        const quotationValue = quotations.reduce((s, r) => s + this.amountOf(r), 0);
        const orderValue = [...sales].reduce((s, r) => s + this.amountOf(r), 0);
        const openTickets = tickets.filter(t => !['closed', 'resolved', 'completed'].includes(this.lower(t.status))).length;
        const pendingFollowups = followups.filter(f => !['completed', 'closed', 'done'].includes(this.lower(f.status))).length;
        const score = Math.round(Math.min(100,
            (totalInvoiced > 0 ? 40 : 0) +
            (outstanding <= 0 ? 25 : outstanding < totalInvoiced * 0.25 ? 18 : 8) +
            (openTickets === 0 ? 20 : Math.max(5, 20 - openTickets * 4)) +
            (pendingFollowups === 0 ? 15 : 8)
        ));

        return {
            party,
            kpis: {
                enquiriesCount: enquiries.length,
                quotationsVal: quotationValue,
                ordersVal: orderValue,
                invoicedVal: totalInvoiced,
                outstandingVal: outstanding,
                receivedVal: totalReceived,
                openTickets,
                pendingFollowups,
                score
            },
            financialSummary: {
                totalInvoiced, totalReceived, outstanding, overdue,
                ageing: this.ageing(transactionInvoices, outstanding)
            },
            plants, contacts, equipment, enquiries, quotations,
            invoices: transactionInvoices, tickets, activities, followups, reminders, returns,
            creditDebitNotes, marketingVisits,
            insights: [
                `${enquiries.length} enquiry record(s), ${quotations.length} quotation record(s) and ${transactionInvoices.length} invoice/sales record(s) are linked to this customer.`,
                `Outstanding receivable: ₹${outstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`
            ],
            alerts: overdue > 0 ? [{ type: 'danger', icon: '⚠️', text: `Overdue receivable: ₹${overdue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.` }] : []
        };
    },

    buildSupplier360(party) {
        const all = key => this.getStore(key);
        const purchases = [...all('purchases'), ...all('crm_purchases')].filter(r => this.matches(r, party));
        const quotations = [...all('quotations'), ...all('crm_quotations')].filter(r => this.matches(r, party));
        const contacts = all('crm_contacts').filter(r => this.matches(r, party));
        const activities = all('crm_activities').filter(r => this.matches(r, party));
        const followups = all('follow_ups').filter(r => this.matches(r, party));
        const returns = all('returns').filter(r => this.matches(r, party));
        const notes = all('credit_debit_notes').filter(r => this.matches(r, party));
        const rejections = purchases.filter(r => {
            const s = this.lower(`${r.status || ''} ${r.remarks || ''} ${r.note || ''} ${r.rejectionStatus || ''}`);
            return s.includes('reject');
        });
        const totalPurchases = purchases.reduce((s, r) => s + this.amountOf(r), 0);
        const totalPaid = purchases.reduce((s, r) => {
            const paid = this.first(r.totalPaid, r.paid, r.paidAmount, r.amountPaid);
            return s + this.num(paid);
        }, 0);
        const payable = Math.max(0, totalPurchases - totalPaid);
        const overduePayable = purchases.reduce((s, r) => {
            const status = this.lower(r.status);
            return s + (status.includes('overdue') ? this.num(this.first(r.dueAmount, r.balanceDue, r.outstanding, this.amountOf(r))) : 0);
        }, 0);
        const deliveryIssues = purchases.filter(r => ['delayed', 'late', 'rejected', 'partial'].includes(this.lower(r.status))).length;
        const qualityScore = Math.max(0, Math.min(100, Math.round(100 - rejections.length * 12 - deliveryIssues * 5)));

        return {
            party,
            kpis: {
                enquiriesCount: quotations.length,
                quotationsVal: quotations.reduce((s, r) => s + this.amountOf(r), 0),
                poVal: totalPurchases,
                grnVal: purchases.filter(r => ['grn', 'received', 'delivered', 'completed'].includes(this.lower(r.status))).reduce((s, r) => s + this.amountOf(r), 0),
                invoicedVal: totalPurchases,
                payableVal: payable,
                rejectionsCount: rejections.length,
                openIssues: deliveryIssues,
                score: qualityScore
            },
            financialSummary: {
                totalPurchases, totalPaid, payable, overduePayable,
                rejectionValue: rejections.reduce((s, r) => s + this.amountOf(r), 0),
                ageing: this.ageing(purchases, payable)
            },
            contacts, purchases, quotations, activities, followups, returns, creditDebitNotes: notes, rejections,
            insights: [
                `${purchases.length} purchase record(s) are linked to this supplier.`,
                `Supplier quality score is ${qualityScore}/100 based on linked rejection/delivery records.`
            ],
            alerts: overduePayable > 0 ? [{ type: 'warning', icon: '⚠️', text: `Overdue supplier payable: ₹${overduePayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.` }] : []
        };
    },

    ageing(rows, total) {
        const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b91_180: 0, b180_plus: 0 };
        if (!total) return buckets;
        const now = Date.now();
        rows.forEach(r => {
            const due = this.num(this.first(r.dueAmount, r.balanceDue, r.outstanding, r.payable));
            const value = due || this.amountOf(r);
            if (!value) return;
            const d = new Date(this.dateOf(r)).getTime();
            const days = Number.isFinite(d) ? Math.max(0, Math.floor((now - d) / 86400000)) : 0;
            if (days <= 30) buckets.b0_30 += value;
            else if (days <= 60) buckets.b31_60 += value;
            else if (days <= 90) buckets.b61_90 += value;
            else if (days <= 180) buckets.b91_180 += value;
            else buckets.b180_plus += value;
        });
        const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
        if (sum === 0) buckets.b0_30 = total;
        return buckets;
    }
};

window.Business360Engine = Business360Engine;
