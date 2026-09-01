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
        try { localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); } catch (e) { }
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
        record.partyName, record.party, record.company, record.companyName, record.contactCompany,
        record.customer?.name, record.supplier?.name, record.party?.name, record.name,
        record.contactName, record.contact, record.businessName, record.companyName, record.customer_company]
            .filter(v => typeof v === 'string' && this.text(v)).map(v => this.lower(v));
        const codes = [record.customerCode, record.supplierCode, record.partyCode, record.code]
            .filter(v => this.text(v)).map(v => this.lower(v));
        const gstins = [record.gstin, record.gst, record.customerGST, record.customer_gst, record.supplierGST]
            .filter(v => this.text(v)).map(v => this.lower(v));
        const partyIds = [party.id, party.code].filter(v => this.text(v)).map(v => this.lower(v));
        const partyName = this.lower(party.name);
        const partyGstin = this.lower(party.gstin);
        const partyNameCompact = this.text(party.name).replace(/[^a-z0-9]/gi, '').toLowerCase();
        const exactNameMatch = names.some(v => v === partyName || v === this.lower(party.code));
        const fuzzyNameMatch = names.some(v => {
            const compact = this.text(v).replace(/[^a-z0-9]/gi, '').toLowerCase();
            return !!compact && (compact === partyNameCompact || compact.includes(partyNameCompact) || partyNameCompact.includes(compact));
        });
        return ids.some(v => partyIds.includes(v)) ||
            exactNameMatch ||
            fuzzyNameMatch ||
            codes.some(v => partyIds.includes(v)) ||
            (!!partyGstin && gstins.includes(partyGstin));
    },

    getLinkedContacts(party) {
        const rows = [];
        const candidates = ['crm_contacts', 'CUSTOM_RECORDS_Contacts', 'custom-records', 'contacts'];
        candidates.forEach(key => {
            const store = this.getStore(key);
            if (!Array.isArray(store) || !store.length) return;
            if (key === 'custom-records' || key === 'contacts' || key === 'CUSTOM_RECORDS_Contacts') {
                rows.push(...store.filter(r => !r || String(r.moduleName || '').toLowerCase() === 'contacts' || !r.moduleName || r.company || r.companyName || r.name || r.contactName));
            } else {
                rows.push(...store);
            }
        });
        return rows.filter(r => r && this.matches(r, party));
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
        const contacts = this.getLinkedContacts(party);
        const plants = all('crm_plants').filter(r => this.matches(r, party));
        const equipment = all('crm_equipment').filter(r => this.matches(r, party));
        const tickets = [...all('crm_tickets'), ...all('support_tickets')].filter(r => this.matches(r, party));
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
        const now = Date.now();
        const activeRecords = [...enquiries, ...quotations, ...transactionInvoices, ...activities, ...followups];
        const recentActivityCount = activeRecords.filter(r => {
            const d = new Date(this.dateOf(r)).getTime();
            return Number.isFinite(d) && (now - d) <= 180 * 86400000;
        }).length;
        const paidRatio = totalInvoiced > 0 ? Math.min(1, totalReceived / totalInvoiced) : 0;
        const overdueRatio = totalInvoiced > 0 ? Math.min(1, overdue / totalInvoiced) : 0;

        // Customer Health Score — 100-point business-health model.
        // 25 Payment + 20 Sales Activity + 15 Conversion + 15 Service +
        // 10 Returns/Rejections + 10 Follow-up + 5 Relationship Activity.
        const paymentScore = totalInvoiced > 0
            ? Math.round(Math.max(0, Math.min(25, (paidRatio * 25) - (overdueRatio * 10))))
            : 0;
        const salesScore = Math.round(Math.min(20,
            (transactionInvoices.length > 0 ? 10 : 0) +
            Math.min(6, transactionInvoices.length * 2) +
            (recentActivityCount > 0 ? 4 : 0)
        ));
        const conversionBase = enquiries.length > 0 ? Math.min(10, (quotations.length / enquiries.length) * 10) : (quotations.length > 0 ? 8 : 0);
        const orderConversion = quotations.length > 0 ? Math.min(5, (sales.length / quotations.length) * 5) : (sales.length > 0 ? 4 : 0);
        const conversionScore = Math.round(conversionBase + orderConversion);
        const serviceScore = Math.round(Math.max(0, 15 - (openTickets * 5)));
        const returnsCount = returns.length + creditDebitNotes.filter(r => this.lower(r.type || r.noteType || r.category).includes('credit')).length;
        const returnsScore = Math.round(Math.max(0, 10 - Math.min(10, returnsCount * 2)));
        const followupScore = Math.round(Math.max(0, 10 - Math.min(10, pendingFollowups * 2)));
        const relationshipScore = Math.round(Math.min(5, recentActivityCount > 0 ? Math.max(2, Math.min(5, recentActivityCount)) : 0));
        const score = Math.max(0, Math.min(100, paymentScore + salesScore + conversionScore + serviceScore + returnsScore + followupScore + relationshipScore));
        const scoreGrade = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Watch' : score >= 40 ? 'At Risk' : 'Critical';

        const healthScore = {
            total: score, grade: scoreGrade, max: 100,
            components: [
                { key: 'payment', label: 'Payment / Receivable Health', score: paymentScore, max: 25, detail: totalInvoiced > 0 ? `${Math.round(paidRatio * 100)}% collected${overdue > 0 ? ` · ${this.num(overdue).toLocaleString('en-IN')} overdue` : ''}` : 'No invoicing history' },
                { key: 'sales', label: 'Sales / Order Activity', score: salesScore, max: 20, detail: `${transactionInvoices.length} invoice/sales record(s); ${recentActivityCount} recent linked activity record(s)` },
                { key: 'conversion', label: 'Enquiry & Quotation Conversion', score: conversionScore, max: 15, detail: `${enquiries.length} enquiries · ${quotations.length} quotations · ${sales.length} sales` },
                { key: 'service', label: 'Service / Support Health', score: serviceScore, max: 15, detail: `${openTickets} open service ticket(s)` },
                { key: 'returns', label: 'Return / Rejection Performance', score: returnsScore, max: 10, detail: `${returnsCount} return/credit-note issue record(s)` },
                { key: 'followup', label: 'Follow-up Responsiveness', score: followupScore, max: 10, detail: `${pendingFollowups} pending follow-up(s)` },
                { key: 'relationship', label: 'Relationship Activity', score: relationshipScore, max: 5, detail: `${recentActivityCount} linked record(s) in the last 180 days` }
            ]
        };

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
                score,
                scoreGrade,
                healthScore
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
        const contacts = this.getLinkedContacts(party);
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
        const receivedCount = purchases.filter(r => ['grn', 'received', 'delivered', 'completed'].includes(this.lower(r.status))).length;
        const purchaseCount = purchases.length;
        const onTimeRate = purchaseCount > 0 ? Math.max(0, 1 - (deliveryIssues / purchaseCount)) : 0;
        const rejectionRate = purchaseCount > 0 ? Math.min(1, rejections.length / purchaseCount) : 0;
        const deliveryScore = purchaseCount > 0 ? Math.round(onTimeRate * 35) : 0;
        const qualityScorePart = purchaseCount > 0 ? Math.round(Math.max(0, 35 - rejectionRate * 35)) : 0;
        const completionScore = purchaseCount > 0 ? Math.round((receivedCount / purchaseCount) * 15) : 0;
        const responseScore = Math.max(0, 10 - Math.min(10, followups.filter(f => !['completed', 'closed', 'done'].includes(this.lower(f.status))).length * 2));
        const supplierRelationshipScore = Math.min(5, purchases.length > 0 ? 5 : (quotations.length > 0 ? 3 : 0));
        const qualityScore = Math.max(0, Math.min(100, deliveryScore + qualityScorePart + completionScore + responseScore + supplierRelationshipScore));
        const qualityGrade = qualityScore >= 90 ? 'Excellent' : qualityScore >= 75 ? 'Good' : qualityScore >= 60 ? 'Watch' : qualityScore >= 40 ? 'At Risk' : 'Critical';
        const supplierScoreBreakdown = {
            total: qualityScore, grade: qualityGrade, max: 100,
            components: [
                { key: 'delivery', label: 'Delivery Performance', score: deliveryScore, max: 35, detail: `${deliveryIssues} delayed/late/partial/rejected purchase record(s)` },
                { key: 'quality', label: 'Quality / Rejection Performance', score: qualityScorePart, max: 35, detail: `${rejections.length} rejection record(s) across ${purchaseCount} purchase record(s)` },
                { key: 'completion', label: 'GRN / Receipt Completion', score: completionScore, max: 15, detail: `${receivedCount} of ${purchaseCount} purchase record(s) received/completed` },
                { key: 'response', label: 'Follow-up Responsiveness', score: responseScore, max: 10, detail: `${followups.filter(f => !['completed', 'closed', 'done'].includes(this.lower(f.status))).length} pending follow-up(s)` },
                { key: 'relationship', label: 'Purchase Relationship Activity', score: supplierRelationshipScore, max: 5, detail: `${purchases.length} purchase record(s) and ${quotations.length} quotation record(s)` }
            ]
        };

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
                score: qualityScore,
                scoreGrade: qualityGrade,
                healthScore: supplierScoreBreakdown
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
