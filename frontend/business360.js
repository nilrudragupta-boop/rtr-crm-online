/**
 * RISE CRM — Business 360° UI Controller
 * All navigation is routed through the parent dashboard SPA when available.
 */
const B360UI = {
    currentType: 'customer',
    currentPartyId: null,
    currentTab: 'overview',
    activeData: null,
    _bound: false,

    async init() {
        this.readContext();
        await this.syncLiveData();
        this.bindSearch();

        const list = Business360Engine.searchParties(this.currentType, '');
        if (!list.length) {
            this.renderEmpty();
            return;
        }

        const requested = this.currentPartyId || this.contextPartyId;
        const match = requested ? list.find(p => String(p.id) === String(requested)) : null;
        this.currentPartyId = match?.id || list[0].id;
        await this.loadParty(this.currentType, this.currentPartyId);
    },

    readContext() {
        const p = new URLSearchParams(window.location.search);
        const saved = (() => { try { return JSON.parse(localStorage.getItem('business360Selection') || 'null'); } catch { return null; } })();
        this.contextPartyId = p.get('id') || p.get('customerId') || p.get('supplierId') || saved?.id || null;
        this.currentType = (p.get('type') || saved?.type || 'customer').toLowerCase() === 'supplier' ? 'supplier' : 'customer';
        const typeSelect = document.getElementById('partyTypeSelect');
        if (typeSelect) typeSelect.value = this.currentType;
    },

    async syncLiveData() {
        if (typeof apiClient === 'undefined') return;
        const jobs = [
            ['customers', apiClient.getCustomers],
            ['suppliers', apiClient.getSuppliers],
            ['quotations', apiClient.getQuotations],
            ['invoices', apiClient.getInvoices],
            ['purchases', apiClient.getPurchases],
            ['crm_enquiries', apiClient.getCrmEnquiries],
            ['crm_contacts', apiClient._getCollection ? () => apiClient._getCollection('crm-contacts') : null],
            ['crm_plants', apiClient._getCollection ? () => apiClient._getCollection('crm-plants') : null],
            ['crm_activities', apiClient._getCollection ? () => apiClient._getCollection('crm-activities') : null],
            ['crm_documents', apiClient._getCollection ? () => apiClient._getCollection('crm-documents') : null],
            ['follow_ups', apiClient.getFollowUps],
            ['reminders', apiClient.getReminders],
            ['credit_debit_notes', apiClient.getCreditDebitNotes],
            ['returns', apiClient._getCollection ? () => apiClient._getCollection('returns') : null],
            ['crm_tickets', apiClient._getCollection ? () => apiClient._getCollection('crm-tickets') : null]
        ];
        await Promise.all(jobs.map(async ([key, fn]) => {
            if (typeof fn !== 'function') return;
            try {
                const result = await fn();
                if (Array.isArray(result)) Business360Engine.setStore(key, result);
            } catch (e) { console.debug(`Business360 sync skipped: ${key}`, e); }
        }));
    },

    toast(msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `slds-toast slds-toast-${type}`;
        toast.innerHTML = `<span>${this.esc(msg)}</span><span style="cursor:pointer;margin-left:12px" onclick="this.parentElement.remove()">✕</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    },

    esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); },
    money(value) { return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; },
    lakhs(value) { return `₹${(Number(value || 0) / 100000).toFixed(2)} L`; },

    onPartyTypeChange() {
        this.currentType = document.getElementById('partyTypeSelect').value;
        const list = Business360Engine.searchParties(this.currentType, '');
        const input = document.getElementById('partySearchInput');
        if (input) input.value = '';
        if (list.length) this.loadParty(this.currentType, list[0].id);
        else this.renderEmpty();
    },

    showDropdownList() {
        const input = document.getElementById('partySearchInput');
        const results = document.getElementById('partySearchResults');
        if (!input || !results) return;
        const matches = Business360Engine.searchParties(this.currentType, input.value || '').slice(0, 30);
        results.innerHTML = matches.length ? matches.map(m => `
            <div class="slds-search-item" data-party-id="${this.esc(m.id)}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #eee;background:#fff">
                <strong style="color:var(--slds-brand)">${this.esc(m.name)}</strong> <span style="font-size:11px;color:#666">(${this.esc(m.code)})</span>
                <div style="font-size:11px;color:#888">GSTIN: ${this.esc(m.gstin || 'N/A')} · ${this.esc(m.location || '—')}</div>
            </div>`).join('') : `<div style="padding:10px;color:#888">No ${this.currentType} records found.</div>`;
        results.style.display = 'block';
    },

    bindSearch() {
        if (this._bound) return;
        this._bound = true;
        const input = document.getElementById('partySearchInput');
        const results = document.getElementById('partySearchResults');
        if (!input || !results) return;
        input.addEventListener('input', () => this.showDropdownList());
        input.addEventListener('focus', () => this.showDropdownList());
        results.addEventListener('mousedown', e => {
            const item = e.target.closest('[data-party-id]');
            if (item) this.selectParty(item.dataset.partyId);
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('.slds-search-box')) results.style.display = 'none';
        });
    },

    selectParty(id) {
        document.getElementById('partySearchResults').style.display = 'none';
        this.loadParty(this.currentType, id);
    },

    async loadParty(type, id) {
        this.currentType = type;
        this.currentPartyId = String(id);
        localStorage.setItem('business360Selection', JSON.stringify({ type, id: String(id) }));
        this.activeData = type === 'customer'
            ? Business360Engine.buildCustomer360(Business360Engine.searchParties('customer', '').find(p => String(p.id) === String(id)))
            : Business360Engine.buildSupplier360(Business360Engine.searchParties('supplier', '').find(p => String(p.id) === String(id)));
        if (!this.activeData?.party) return this.renderEmpty();

        const typeSelect = document.getElementById('partyTypeSelect');
        if (typeSelect) typeSelect.value = type;
        const service = document.getElementById('tabServiceBtn');
        const plants = document.getElementById('tabPlantsBtn');
        if (plants) plants.style.display = type === 'customer' ? 'inline-block' : 'none';
        if (service) service.style.display = type === 'customer' ? 'inline-block' : 'none';

        this.currentTab = 'overview';
        document.querySelectorAll('.b360-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        this.renderHeader();
        this.renderKPIs();
        this.renderCurrentTab();
    },

    renderEmpty() {
        document.getElementById('partyHeaderContainer').innerHTML = '';
        document.getElementById('kpiStripContainer').innerHTML = '';
        document.getElementById('b360TabViewport').innerHTML = `<div class="b360-empty">No ${this.currentType} records are available. Create the party in the ${this.currentType} master first.</div>`;
        document.getElementById('bcPartyName').textContent = 'No record selected';
    },

    navigate(page, params = {}) {
        const url = new URL(page, window.location.href);
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, v); });
        url.searchParams.set('embedded', '1');

        try {
            if (window.parent && window.parent !== window && typeof window.parent.openWindow === 'function') {
                window.parent.openWindow(url.pathname.split('/').pop() + url.search, 1100, 760);
                return;
            }
        } catch (e) {}
        window.location.href = url.pathname.split('/').pop() + url.search;
    },

    partyParams() {
        const p = this.activeData.party;
        return {
            type: this.currentType,
            id: p.id,
            ...(this.currentType === 'customer' ? { customerId: p.id, customer: p.name, customerName: p.name } : { supplierId: p.id, supplier: p.name, supplierName: p.name })
        };
    },

    openRelated(page, extra = {}) { this.navigate(page, { ...this.partyParams(), ...extra }); },

    renderHeader() {
        const p = this.activeData.party;
        document.getElementById('bcPartyName').textContent = p.name;
        const actions = this.currentType === 'customer' ? `
            <button class="slds-btn" onclick="B360UI.openRelated('customer.html')">👤 Customer Master</button>
            <button class="slds-btn" onclick="B360UI.openRelated('quotation.html')">💰 New Quotation</button>
            <button class="slds-btn slds-btn-brand" onclick="B360UI.openRelated('direct_sale.html')">⚡ Direct Sale</button>
            <button class="slds-btn" onclick="B360UI.logCallModal()">📞 Log Activity</button>` : `
            <button class="slds-btn" onclick="B360UI.openRelated('supplier.html')">🏭 Supplier Master</button>
            <button class="slds-btn" onclick="B360UI.openRelated('purchase.html')">📦 New Purchase</button>`;
        document.getElementById('partyHeaderContainer').innerHTML = `
            <div class="b360-header-card">
                <div class="b360-header-main">
                    <div>
                        <div class="b360-party-title">${this.esc(p.name)} <span class="slds-badge slds-badge-success">● Active</span> <span class="slds-badge slds-badge-info">${this.esc(p.type)}</span></div>
                        <div class="b360-party-meta"><b>Code:</b> ${this.esc(p.code || '—')} · <b>GSTIN:</b> ${this.esc(p.gstin || '—')} · <b>PAN:</b> ${this.esc(p.pan || '—')} · <b>Location:</b> ${this.esc(p.location || '—')}</div>
                    </div><div class="b360-actions">${actions}</div>
                </div>
            </div>`;
    },

    kpiCard(label, value, hint, action, tone = '') {
        return `<button class="b360-kpi-card ${tone}" onclick="${action}"><span>${this.esc(label)}</span><strong>${value}</strong><small>${this.esc(hint || 'Open related records →')}</small></button>`;
    },

    renderKPIs() {
        const k = this.activeData.kpis;
        const isCustomer = this.currentType === 'customer';
        const html = isCustomer ? [
            this.kpiCard('ACTIVE ENQUIRIES', k.enquiriesCount, 'Enquiry Management', `B360UI.openRelated('enquiry.html')`),
            this.kpiCard('QUOTATION PIPELINE', this.lakhs(k.quotationsVal), 'Quotation records', `B360UI.openRelated('quotation.html')`),
            this.kpiCard('TOTAL ORDERS / SALES', this.lakhs(k.ordersVal), 'Sales Register', `B360UI.openRelated('sales_report.html')`),
            this.kpiCard('TOTAL INVOICED', this.lakhs(k.invoicedVal), 'Invoices', `B360UI.openRelated('invoice_dashboard.html')`),
            this.kpiCard('OUTSTANDING RECEIVABLE', this.lakhs(k.outstandingVal), 'Customer Ledger', `B360UI.openRelated('ledger.html')`, k.outstandingVal > 0 ? 'danger' : ''),
            this.kpiCard('OPEN SERVICE TICKETS', k.openTickets, 'Customer Support', `B360UI.openRelated('customer_support.html')`, k.openTickets > 0 ? 'warning' : ''),
            this.kpiCard('PENDING FOLLOW-UPS', k.pendingFollowups, 'Follow-up Management', `B360UI.openRelated('follow_up.html')`),
            this.kpiCard('CUSTOMER HEALTH SCORE', `${k.score}/100`, `${k.scoreGrade || '—'} · View score breakdown`, `B360UI.showScoreBreakdown()`)
        ].join('') : [
            this.kpiCard('PURCHASE ORDERS', this.lakhs(k.poVal), 'Purchase records', `B360UI.openRelated('purchase.html')`),
            this.kpiCard('TOTAL PAYABLE', this.lakhs(k.payableVal), 'Supplier Ledger', `B360UI.openRelated('ledger.html')`, k.payableVal > 0 ? 'danger' : ''),
            this.kpiCard('REJECTIONS LOGGED', k.rejectionsCount, 'Rejected / quality records', `B360UI.openRelated('purchase.html')`, k.rejectionsCount > 0 ? 'warning' : ''),
            this.kpiCard('GRN / RECEIVED VALUE', this.lakhs(k.grnVal), 'Purchase records', `B360UI.openRelated('purchase_dashboard.html')`),
            this.kpiCard('SUPPLIER QUALITY SCORE', `${k.score}/100`, `${k.scoreGrade || '—'} · View score breakdown`, `B360UI.showScoreBreakdown()`)
        ].join('');
        document.getElementById('kpiStripContainer').innerHTML = html;
    },

    showScoreBreakdown() {
        const hs = this.activeData?.kpis?.healthScore;
        if (!hs) return;
        const title = this.currentType === 'customer' ? 'Customer Health Score' : 'Supplier Performance Score';
        const subtitle = this.currentType === 'customer'
            ? 'Calculated from this customer’s actual receivables, sales activity, conversion, service, returns, follow-ups and relationship activity.'
            : 'Calculated from this supplier’s actual delivery, quality/rejections, receipt completion, follow-ups and purchase relationship activity.';
        const rows = (hs.components || []).map(c => {
            const pct = c.max ? Math.round((c.score / c.max) * 100) : 0;
            return `<div class=\"b360-score-row\">
                <div class=\"b360-score-row-head\"><span>${this.esc(c.label)}</span><b>${c.score}/${c.max}</b></div>
                <div class=\"b360-score-bar\"><span style=\"width:${pct}%\"></span></div>
                <small>${this.esc(c.detail || '')}</small>
            </div>`;
        }).join('');
        document.getElementById('b360ModalContainer').innerHTML = `
            <div class=\"b360-modal-backdrop\" onclick=\"if(event.target===this)B360UI.closeModal()\">
                <div class=\"b360-score-modal\" role=\"dialog\" aria-modal=\"true\">
                    <div class=\"b360-score-modal-head\"><div><h2>${title}: ${hs.total}/100</h2><p>${this.esc(this.activeData.party.name)} · <strong>${this.esc(hs.grade)}</strong></p></div><button class=\"b360-modal-close\" onclick=\"B360UI.closeModal()\">✕</button></div>
                    <div class=\"b360-score-explainer\">${this.esc(subtitle)}</div>
                    <div class=\"b360-score-total\"><strong>${hs.total}</strong><span>/ 100</span><small>${this.esc(hs.grade)}</small></div>
                    <div class=\"b360-score-components\">${rows}</div>
                    <div class=\"b360-score-legend\"><span>90–100 Excellent</span><span>75–89 Good</span><span>60–74 Watch</span><span>40–59 At Risk</span><span>0–39 Critical</span></div>
                </div>
            </div>`;
    },

    closeModal() {
        const el = document.getElementById('b360ModalContainer');
        if (el) el.innerHTML = '';
    },

    switchTab(tab, btn) {
        if (!this.activeData) return;
        this.currentTab = tab;
        document.querySelectorAll('.b360-tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        else document.querySelector(`.b360-tab-btn[onclick*="'${tab}'"]`)?.classList.add('active');
        this.renderCurrentTab();
    },

    linkRecord(page, idKey, id) {
        const params = this.partyParams();
        params.recordId = id;
        this.openRelated(page, params);
    },

    renderCurrentTab() {
        const d = this.activeData, vp = document.getElementById('b360TabViewport');
        if (!d || !vp) return;
        if (this.currentTab === 'overview') return this.renderOverview(vp);
        if (this.currentTab === 'transactions') return this.renderTransactions(vp);
        if (this.currentTab === 'financials') return this.renderFinancials(vp);
        if (this.currentTab === 'plants') return this.renderPlants(vp);
        if (this.currentTab === 'service') return this.renderService(vp);
        if (this.currentTab === 'timeline') return this.renderTimeline(vp);
        if (this.currentTab === 'documents') return this.renderDocuments(vp);
    },

    renderOverview(vp) {
        const d = this.activeData;
        const modules = this.currentType === 'customer' ? [
            ['👤 Customer Master','customer.html'],['🎯 Enquiries','enquiry.html'],['💰 Quotations','quotation.html'],['⚡ Sales Register','sales_report.html'],['📒 Account Ledger','ledger.html'],['🛠️ Customer Support','customer_support.html'],['🔁 Follow-ups','follow_up.html'],['⏰ Reminders','reminder.html'],['↩️ Returns','returns_report.html'],['🧾 Credit/Debit Notes','credit_debit_notes.html'],['📊 Marketing Report','marketing_report.html']
        ] : [
            ['🏭 Supplier Master','supplier.html'],['📦 Purchases','purchase.html'],['📊 Purchase Dashboard','purchase_dashboard.html'],['📒 Account Ledger','ledger.html'],['🔁 Follow-ups','follow_up.html'],['↩️ Returns','returns_report.html'],['🧾 Credit/Debit Notes','credit_debit_notes.html']
        ];
        vp.innerHTML = `${(d.alerts || []).map(a => `<div class="b360-alert-banner b360-alert-${this.esc(a.type)}">${a.icon} ${this.esc(a.text)}</div>`).join('')}
            <div class="b360-overview-grid">
                <div class="slds-card"><div class="slds-card-header">Business Intelligence</div><div class="slds-card-body"><ul class="b360-insights">${(d.insights || []).map(x => `<li>${this.esc(x)}</li>`).join('')}</ul></div></div>
                <div class="slds-card"><div class="slds-card-header">Key Contacts (${d.contacts?.length || 0})</div><div class="slds-card-body">${this.contactsHtml(d.contacts)}</div></div>
            </div>
            <div class="slds-card"><div class="slds-card-header">Integrated Related Modules</div><div class="slds-card-body"><div class="b360-module-grid">${modules.map(([label,page]) => `<button class="b360-module-link" onclick="B360UI.openRelated('${page}')">${label}<span>↗</span></button>`).join('')}</div></div></div>`;
    },

    contactsHtml(rows = []) {
        if (!rows.length) return `<div class="b360-empty-small">No linked contacts.</div>`;
        return rows.map(c => `<div class="b360-contact"><b>${this.esc(c.name || c.contactName || 'Contact')}</b><span>${this.esc(c.designation || '')}${c.department ? ` · ${this.esc(c.department)}` : ''}</span><small>📞 ${this.esc(c.mobile || c.phone || c.contact || '—')} · ✉️ ${this.esc(c.email || '—')}</small></div>`).join('');
    },

    renderTransactions(vp) {
        const d = this.activeData;
        const rows = this.currentType === 'customer' ? [
            ...(d.enquiries || []).map(r => ({ page:'enquiry.html', id:r.id || r.enquiryNo, ref:r.enquiryNo || r.id, desc:r.subject || r.requirement, value:r.estimatedValue, status:r.status, date:r.enquiryDate })),
            ...(d.quotations || []).map(r => ({ page:'quotation.html', id:r.id || r.refNo, ref:r.refNo || r.id, desc:'Quotation', value:r.grandTotal || r.totalValue, status:r.status, date:r.date }))
        ] : (d.purchases || []).map(r => ({ page:'purchase.html', id:r.id, ref:r.id || r.supplierInv, desc:r.itemName || r.description, value:r.total || r.totalPaid || (Number(r.qty || 0) * Number(r.price || 0)), status:r.status, date:r.date }));
        vp.innerHTML = `<div class="slds-card"><div class="slds-card-header">${this.currentType === 'customer' ? 'Enquiries & Quotations' : 'Purchase Orders / Records'}</div><div class="slds-card-body" style="padding:0"><div class="b360-table-wrap"><table class="slds-table"><thead><tr><th>Record</th><th>Date</th><th>Description</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td><button class="b360-link-btn" onclick="B360UI.linkRecord('${r.page}','id',${JSON.stringify(String(r.id || ''))})">${this.esc(r.ref || '—')}</button></td><td>${this.esc(r.date || '—')}</td><td>${this.esc(r.desc || '—')}</td><td>${this.money(r.value)}</td><td><span class="slds-badge slds-badge-info">${this.esc(r.status || '—')}</span></td></tr>`).join('') : `<tr><td colspan="5" class="b360-empty-small">No linked records found.</td></tr>`}</tbody></table></div></div></div>`;
    },

    renderFinancials(vp) {
        const f = this.activeData.financialSummary;
        const customer = this.currentType === 'customer';
        const cards = customer ? [
            ['TOTAL INVOICED', f.totalInvoiced],['RECEIVED', f.totalReceived],['OUTSTANDING', f.outstanding],['OVERDUE', f.overdue]
        ] : [['TOTAL PURCHASES',f.totalPurchases],['PAID',f.totalPaid],['PAYABLE',f.payable],['OVERDUE PAYABLE',f.overduePayable],['REJECTION VALUE',f.rejectionValue]];
        const ageing = [['0–30 DAYS',f.ageing.b0_30],['31–60 DAYS',f.ageing.b31_60],['61–90 DAYS',f.ageing.b61_90],['91–180 DAYS',f.ageing.b91_180],['180+ DAYS',f.ageing.b180_plus]];
        vp.innerHTML = `<div class="b360-fin-grid">${cards.map(([l,v]) => `<button class="slds-card b360-fin-card" onclick="B360UI.openRelated('ledger.html')"><span>${l}</span><strong>${this.lakhs(v)}</strong><small>Open Ledger ↗</small></button>`).join('')}</div><div class="slds-card"><div class="slds-card-header">Ageing Analysis</div><div class="slds-card-body"><div class="b360-ageing-grid">${ageing.map(([l,v]) => `<div><span>${l}</span><strong>${this.lakhs(v)}</strong></div>`).join('')}</div></div></div>`;
    },

    renderPlants(vp) {
        const rows = this.activeData.plants || [];
        vp.innerHTML = `<div class="slds-card"><div class="slds-card-header">Operating Plants & Installed Equipment</div><div class="slds-card-body" style="padding:0"><div class="b360-table-wrap"><table class="slds-table"><thead><tr><th>Plant</th><th>Code</th><th>Capacity</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map(p => `<tr><td>${this.esc(p.plantName || p.name || '—')}</td><td>${this.esc(p.code || p.id || '—')}</td><td>${this.esc(p.capacity || '—')}</td><td><button class="b360-link-btn" onclick="B360UI.openRelated('customer.html')">Open Customer ↗</button></td></tr>`).join('') : `<tr><td colspan="4" class="b360-empty-small">No plant records linked.</td></tr>`}</tbody></table></div></div></div>`;
    },

    renderService(vp) {
        const rows = this.activeData.tickets || [];
        vp.innerHTML = `<div class="slds-card"><div class="slds-card-header">Service & Complaint Tickets</div><div class="slds-card-body" style="padding:0"><div class="b360-table-wrap"><table class="slds-table"><thead><tr><th>Ticket</th><th>Subject</th><th>Priority</th><th>Status</th></tr></thead><tbody>${rows.length ? rows.map(t => `<tr><td><button class="b360-link-btn" onclick="B360UI.openRelated('customer_support.html')">${this.esc(t.id || '—')}</button></td><td>${this.esc(t.subject || t.issueSubject || '—')}</td><td>${this.esc(t.priority || '—')}</td><td>${this.esc(t.status || '—')}</td></tr>`).join('') : `<tr><td colspan="4" class="b360-empty-small">No service tickets linked.</td></tr>`}</tbody></table></div></div></div>`;
    },

    renderTimeline(vp) {
        const rows = [...(this.activeData.activities || []), ...(this.activeData.followups || [])].sort((a,b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
        vp.innerHTML = `<div class="slds-card"><div class="slds-card-header">Activity & Follow-up Timeline</div><div class="slds-card-body">${rows.length ? rows.map(a => `<div class="b360-timeline-item"><b>${this.esc(a.type || a.partyType || 'Activity')} — ${this.esc(a.date || a.createdAt || '—')}</b><div>${this.esc(a.outcome || a.notes || a.remarks || a.subject || a.partyName || '—')}</div></div>`).join('') : `<div class="b360-empty-small">No activity records linked.</div>`}</div></div>`;
    },

    renderDocuments(vp) {
        const rows = this.activeData.documents || Business360Engine.getStore('crm_documents').filter(r => Business360Engine.matches(r, this.activeData.party));
        vp.innerHTML = `<div class="slds-card"><div class="slds-card-header">Documents</div><div class="slds-card-body">${rows.length ? rows.map(r => `<div class="b360-document"><span>📄 ${this.esc(r.name || r.fileName || r.title || 'Document')}</span><small>${this.esc(r.type || r.documentType || '')}</small></div>`).join('') : `<div class="b360-empty-small">No documents linked to this party.</div>`}</div></div>`;
    },

    logCallModal() {
        const notes = prompt(`Enter activity notes for ${this.activeData?.party?.name || 'this party'}:`);
        if (!notes) return;
        const row = { id:`ACT-${Date.now()}`, customerId:this.currentType === 'customer' ? this.currentPartyId : undefined, supplierId:this.currentType === 'supplier' ? this.currentPartyId : undefined, type:'Call', outcome:notes, date:new Date().toLocaleDateString('en-GB'), partyName:this.activeData.party.name };
        const key = 'crm_activities';
        const data = Business360Engine.getStore(key); data.unshift(row); Business360Engine.setStore(key, data);
        if (typeof apiClient !== 'undefined' && apiClient._saveCollection) apiClient._saveCollection('crm-activities', row).catch(() => {});
        this.activeData.activities.unshift(row);
        this.toast('Activity recorded successfully.');
        this.renderCurrentTab();
    },

    exportCSV() {
        if (!this.activeData) return;
        const p = this.activeData.party, k = this.activeData.kpis;
        const lines = [
            ['Party Type',this.currentType],['Party Name',p.name],['Code',p.code],['GSTIN',p.gstin],
            ...(this.currentType === 'customer' ? [['Enquiries',k.enquiriesCount],['Quotation Value',k.quotationsVal],['Invoiced',k.invoicedVal],['Outstanding',k.outstandingVal],['Open Tickets',k.openTickets]] : [['Purchase Orders',k.poVal],['Payable',k.payableVal],['Rejections',k.rejectionsCount],['Quality Score',k.score]])
        ];
        const csv = lines.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Business360_${p.code || p.name}.csv`; a.click(); URL.revokeObjectURL(a.href);
    },

    backToDashboard() {
        try {
            if (window.parent && window.parent !== window && typeof window.parent.returnToDashboard === 'function') {
                window.parent.returnToDashboard(); return;
            }
        } catch (e) {}
        window.history.back();
    }
};

window.B360UI = B360UI;
window.addEventListener('DOMContentLoaded', () => B360UI.init());
