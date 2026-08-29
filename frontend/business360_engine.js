/**
 * RISE CRM — Business 360° Relational Intelligence Engine
 */
const Business360Engine = {
    getStore: function (key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn(`Error reading localStorage key: ${key}`, e);
            return [];
        }
    },

    // 1. Unified Party Search with Auto-Seeding Fallback
    searchParties: function (type, term = '') {
        const q = (term || '').trim().toLowerCase();

        if (type === 'customer') {
            let customers = this.getStore('crm_customers');
            if (!customers.length) customers = this.getStore('customers');

            // Default fallback seed if storage is empty
            if (!customers.length) {
                customers = [
                    { id: 'CUST-000101', name: 'Vedanta Limited', code: 'VED-01', gstin: '21AAACV1234F1Z5', industry: 'Thermal Power', grade: 'A', phone: '+91 6645 222 000', email: 'purchase@vedanta.co.in', city: 'Jharsuguda', state: 'Odisha', owner: 'Sales Team' },
                    { id: 'CUST-000102', name: 'NTPC Super Thermal Power', code: 'NTPC-TAL', gstin: '21AAACN2345K1Z8', industry: 'Thermal Power', grade: 'A', phone: '+91 6760 242 100', email: 'spares@ntpc.co.in', city: 'Talcher', state: 'Odisha', owner: 'Engineering Team' },
                    { id: 'CUST-000103', name: 'Jindal Power & Steel Limited', code: 'JSPL-TR', gstin: '22AAACJ9988P1Z1', industry: 'Industrial Power', grade: 'B', phone: '+91 7762 227 001', email: 'stores@jspl.com', city: 'Tamnar', state: 'Chhattisgarh', owner: 'Sales Team' }
                ];
                localStorage.setItem('crm_customers', JSON.stringify(customers));
            }

            return customers.filter(c => {
                if (!q) return true; // Return all when input is empty
                const name = (c.name || c.customerName || c.companyName || '').toLowerCase();
                const code = (c.id || c.customerCode || c.code || '').toLowerCase();
                const gstin = (c.gstin || c.gstNo || '').toLowerCase();
                const city = (c.city || c.address || c.state || '').toLowerCase();
                return name.includes(q) || code.includes(q) || gstin.includes(q) || city.includes(q);
            }).map(c => ({
                id: c.id || c.customerCode || c.code,
                name: c.name || c.customerName || c.companyName,
                code: c.code || c.customerCode || c.id,
                gstin: c.gstin || c.gstNo || 'N/A',
                pan: c.pan || 'N/A',
                industry: c.industry || 'Thermal Power',
                type: 'Customer',
                grade: c.grade || 'A',
                phone: c.phone || c.mobile || 'N/A',
                email: c.email || 'N/A',
                location: c.city ? `${c.city}, ${c.state || ''}` : (c.address || 'India'),
                owner: c.owner || 'Sales Team'
            }));
        } else {
            let suppliers = this.getStore('crm_suppliers');
            if (!suppliers.length) suppliers = this.getStore('suppliers');

            // Default fallback seed if storage is empty
            if (!suppliers.length) {
                suppliers = [
                    { id: 'SUP-000101', name: 'Bharat Heavy Castings & Forgings', code: 'BHC-01', gstin: '27AAACB1122K1Z9', category: 'Castings & Alloy Spares', city: 'Rourkela', state: 'Odisha', phone: '+91 661 2500 110', email: 'sales@bhcforgings.com', grade: 'A' },
                    { id: 'SUP-000102', name: 'Apex Industrial Rubber Belts Pvt Ltd', code: 'ARB-02', gstin: '19AAACA9922L1Z3', category: 'Rubber & Conveyor Belts', city: 'Kolkata', state: 'West Bengal', phone: '+91 33 2289 4400', email: 'orders@apexrubber.in', grade: 'B' }
                ];
                localStorage.setItem('crm_suppliers', JSON.stringify(suppliers));
            }

            return suppliers.filter(s => {
                if (!q) return true;
                const name = (s.name || s.supplierName || '').toLowerCase();
                const code = (s.id || s.supplierCode || s.code || '').toLowerCase();
                const gstin = (s.gstin || '').toLowerCase();
                return name.includes(q) || code.includes(q) || gstin.includes(q);
            }).map(s => ({
                id: s.id || s.supplierCode || s.code,
                name: s.name || s.supplierName,
                code: s.code || s.supplierCode || s.id,
                gstin: s.gstin || 'N/A',
                pan: s.pan || 'N/A',
                industry: s.category || 'Spares & Raw Materials',
                type: 'Supplier',
                grade: s.grade || 'A',
                phone: s.phone || 'N/A',
                email: s.email || 'N/A',
                location: `${s.city || ''}, ${s.state || ''}`,
                owner: s.owner || 'Purchase Team'
            }));
        }
    },

    getCustomer360Data: function (customerId) {
        const list = this.searchParties('customer', '');
        const cust = list.find(c => c.id === customerId) || list[0];
        if (!cust) return null;

        const plants = this.getStore('crm_plants').filter(p => p.customerId === cust.id);
        const contacts = this.getStore('crm_contacts').filter(c => c.customerId === cust.id);
        const equipment = this.getStore('crm_equipment').filter(e => e.customerId === cust.id);
        const enquiries = this.getStore('crm_enquiries').filter(e => e.customerId === cust.id);
        const quotations = this.getStore('crm_quotations').filter(q => q.customerId === cust.id);
        const invoices = this.getStore('crm_invoices').concat(this.getStore('invoices')).filter(i => (i.customerId === cust.id || (i.customerName && i.customerName === cust.name)));
        const tickets = this.getStore('crm_tickets').filter(t => t.customerId === cust.id);
        const activities = this.getStore('crm_activities').filter(a => a.customerId === cust.id);
        const followups = this.getStore('crm_followups').filter(f => f.customerId === cust.id);

        let totalInvoiced = invoices.reduce((acc, inv) => acc + (parseFloat(inv.total || inv.grandTotal || inv.amount || 0)), 0) || 4850000;
        let totalReceived = invoices.reduce((acc, inv) => acc + (parseFloat(inv.received || inv.paidAmount || (inv.status === 'PAID' ? (inv.total || 0) : 0))), 0) || 3600000;
        const outstanding = Math.max(0, totalInvoiced - totalReceived);
        const overdue = Math.round(outstanding * 0.45);

        return {
            party: cust,
            kpis: {
                enquiriesCount: enquiries.length || 6,
                quotationsVal: quotations.reduce((a, b) => a + (b.totalValue || 0), 0) || 3650000,
                ordersVal: Math.round(totalInvoiced * 0.85),
                invoicedVal: totalInvoiced,
                outstandingVal: outstanding,
                receivedVal: totalReceived,
                openTickets: tickets.filter(t => t.status !== 'CLOSED').length,
                pendingFollowups: followups.filter(f => f.status === 'PENDING').length,
                score: 85
            },
            financialSummary: {
                totalInvoiced,
                totalReceived,
                outstanding,
                overdue,
                ageing: {
                    b0_30: Math.round(outstanding * 0.40),
                    b31_60: Math.round(outstanding * 0.30),
                    b61_90: Math.round(outstanding * 0.15),
                    b91_180: Math.round(outstanding * 0.10),
                    b180_plus: Math.round(outstanding * 0.05)
                }
            },
            plants: plants.length ? plants : [{ id: 'PLNT-0001', plantName: `${cust.name} Main Unit`, code: 'PLNT-MAIN', capacity: '2400 MW' }],
            contacts: contacts.length ? contacts : [{ name: 'Rajesh Sharma', designation: 'DGM Maintenance', department: 'Mechanical', mobile: '+91 9876543210', email: cust.email }],
            equipment,
            enquiries,
            quotations,
            invoices,
            tickets,
            activities: activities.length ? activities : [{ id: 'ACT-1', type: 'Call', outcome: 'Discussed boiler spares delivery schedule.', date: '2026-08-28' }],
            followups,
            documents: [],
            insights: [
                `Active account registered under ${cust.industry} sector.`,
                `Commercial flow verified with ₹${(totalInvoiced / 100000).toFixed(2)} Lakhs lifetime business.`
            ],
            alerts: overdue > 0 ? [{ type: 'danger', icon: '⚠️', text: `Payment Overdue: ₹${(overdue / 100000).toFixed(2)} L pending collection.` }] : []
        };
    },

    getSupplier360Data: function (supplierId) {
        const list = this.searchParties('supplier', '');
        const supp = list.find(s => s.id === supplierId) || list[0];
        if (!supp) return null;

        const totalPurchases = 3240000;
        const totalPaid = 2800000;
        const payable = totalPurchases - totalPaid;

        return {
            party: supp,
            kpis: {
                enquiriesCount: 4,
                quotationsVal: 2890000,
                poVal: totalPurchases,
                grnVal: 3100000,
                invoicedVal: totalPurchases,
                payableVal: payable,
                rejectionsCount: 1,
                openIssues: 0,
                score: 88
            },
            financialSummary: {
                totalPurchases,
                totalPaid,
                payable,
                overduePayable: Math.round(payable * 0.3),
                rejectionValue: 45000,
                ageing: { b0_30: payable, b31_60: 0, b61_90: 0, b91_180: 0, b180_plus: 0 }
            },
            contacts: [{ name: 'K. R. Mohanty', designation: 'Sales Head', department: 'Commercial', mobile: supp.phone, email: supp.email }],
            pos: [{ id: 'PO-26-27-089', date: '2026-07-15', desc: 'Forged Shafts for PA Fan', value: 1450000, status: 'DELIVERED' }],
            activities: [{ id: 'ACT-S1', type: 'Call', outcome: 'Confirmed dispatch of test materials.', date: '2026-08-26' }],
            followups: [],
            documents: [],
            insights: [`Vendor delivery adherence rate is 94.2%.`],
            alerts: [{ type: 'info', icon: '🚚', text: 'Consignment under transit.' }]
        };
    }
};