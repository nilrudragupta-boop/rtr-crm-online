const V2 = (() => {
    const base = (() => { const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:'; return localStorage.getItem('backendApiUrl') || (local ? 'http://localhost:5000/api' : location.origin + '/api') })();
    const q = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const actionLink = (page, id, label, extra = '') => {
        if (!page || !id) return q(label || 'View');
        return `<a href="${page}${page.includes('?') ? '&' : '?'}id=${encodeURIComponent(id)}" style="color:#0176d3;font-weight:700;text-decoration:none;${extra}">${q(label || id)}</a>`;
    };
    const taskTarget = item => {
        const module = String(item?.module || item?.relatedModule || item?.type || '').toLowerCase();
        const id = item?.id || item?.relatedId || item?.recordId || item?.referenceNo || item?.reference || item?.enquiryNo || item?.ticketNo || item?.customerId || item?.partyId;
        const moduleName = item?.relatedModule || item?.module || item?.type || 'CRM';
        const reference = item?.reference || item?.referenceNo || item?.enquiryNo || item?.ticketNo || item?.recordRef || id;
        const rawLabel = item?.subject || item?.outcome || item?.activityType || item?.title || item?.name;
        const generic = !rawLabel || ['record', 'activity', 'task'].includes(String(rawLabel).trim().toLowerCase());
        const label = generic ? `${moduleName} follow-up${reference ? `: ${reference}` : ''}` : rawLabel;
        const map = {
            customer: 'customer.html',
            customers: 'customer.html',
            supplier: 'supplier.html',
            suppliers: 'supplier.html',
            enquiry: 'enquiry.html',
            enquiries: 'enquiry.html',
            quotation: 'quotation.html',
            quotations: 'quotation.html',
            invoice: 'invoice.html',
            invoices: 'invoice.html',
            followup: 'follow_up.html',
            'follow-up': 'follow_up.html',
            'follow-ups': 'follow_up.html',
            ticket: 'customer_support.html',
            tickets: 'customer_support.html',
            support: 'customer_support.html',
            'customer support': 'customer_support.html'
        };
        const page = map[module] || map[Object.keys(map).find(k => module.includes(k))];
        return actionLink(page, id, label);
    };
    async function get(path) { const r = await fetch(base + path, { cache: 'no-store' }); const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.message || 'Request failed'); return j.data }
    function card(label, value, sub) { return `<div class="kpi"><div class="label">${q(label)}</div><div class="value">${value}</div><div class="sub">${q(sub || '')}</div></div>` }
    function link(page, params, text) { return `<a href="${page}${params ? '?' + params : ''}" style="color:#0176d3;font-weight:700;text-decoration:none">${q(text)}</a>` }
    function render(data) {
        const s = data.summary || {};
        document.getElementById('kpis').innerHTML = [
            card('Customers', s.customers, 'Customer records'),
            card('Suppliers', s.suppliers, 'Supplier records'),
            card('Open deals', s.openEnquiries, money(s.pipeline) + ' in pipeline'),
            card('Open quotes', s.openQuotations, money(s.quotationValue) + ' quoted'),
            card('Expected close', money(s.weightedPipeline), 'Probability-based'),
            card('Payments due', money(s.receivable), 'Invoices outstanding'),
            card('Collections', money(s.paidValue), 'Recorded receipts'),
            card('Follow-ups', s.overdueTasks, 'Need attention'),
            card('Support issues', s.openTickets, 'Open cases')
        ].join('');

        const ec = data.counts?.enquiryStatus || {};
        document.getElementById('pipeline').innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(ec).map(([k, v]) => `<div class="module"><b>${q(k || 'New')}</b><span>${v} items</span></div>`).join('') || '<div class="empty">No enquiry data yet.</div>'}</div><div style="margin-top:12px;font-size:12px"><b>Pipeline:</b> ${money(s.pipeline)} &nbsp; <b>Expected close:</b> ${money(s.weightedPipeline)} &nbsp; <b>Won:</b> ${s.wonEnquiries || 0} &nbsp; <b>Lost:</b> ${s.lostEnquiries || 0}</div>`;

        const ens = data.recent?.enquiries || [];
        document.getElementById('enquiries').innerHTML = ens.length ? `<table class="table"><thead><tr><th>Enquiry</th><th>Customer</th><th>Status</th><th>Value</th></tr></thead><tbody>${ens.map(e => `<tr><td>${link('enquiry.html', 'enquiryNo=' + encodeURIComponent(e.enquiryNo || e.id), e.enquiryNo || e.id)}</td><td>${q(e.customerName || '-')}</td><td><span class="pill">${q(e.status || 'New')}</span></td><td>${money(e.estimatedValue)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No enquiries found.</div>';

        const qs = data.recent?.quotations || [];
        document.getElementById('quotes').innerHTML = qs.length ? `<table class="table"><thead><tr><th>Quotation</th><th>Customer</th><th>Status</th><th>Value</th></tr></thead><tbody>${qs.map(x => {
            const ref = x.refNo || x.quotationNo || x.id || '-';
            const customer = x.custName || x.customerName || x.customer || '-';
            const value = x.grandTotal ?? x.totalValue ?? x.total ?? x.amount ?? x.value ?? 0;
            return `<tr><td>${link('quotation.html', 'refNo=' + encodeURIComponent(ref), ref)}</td><td>${q(customer)}</td><td><span class="pill">${q(x.status || 'Saved')}</span></td><td>${money(value)}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="empty">No quotations found.</div>';

        const acts = [...(data.recent?.activities || []), ...(data.recent?.followUps || [])]
            .filter(a => !['done', 'completed', 'closed', 'cancelled'].includes(String(a.status || '').toLowerCase()))
            .sort((a, b) => new Date(a.dueDate || a.createdAt || 0) - new Date(b.dueDate || b.createdAt || 0))
            .slice(0, 10);
        document.getElementById('tasks').innerHTML = acts.length ? acts.map(a => `<div style="padding:9px 0;border-bottom:1px solid #edf0f3"><div><b>${taskTarget(a)}</b></div><div style="font-size:10px;color:#667085">${q(a.dueDate || a.nextFollowUp || a.activityDate || '')} · ${q(a.status || 'Open')} · ${q(a.priority || 'Medium')}</div></div>`).join('') : '<div class="empty">No follow-ups or activities found.</div>';
    }
    async function search(term) { if (!term.trim()) { document.getElementById('results').style.display = 'none'; return } try { const rows = await get('/crm/v2/search?q=' + encodeURIComponent(term)); const el = document.getElementById('results'); el.innerHTML = rows.length ? rows.map(x => `<div class="result" data-type="${q(x.type)}" data-id="${q(x.id)}"><b>${q(x.type)}</b> · ${q(x.ref)}<div style="font-size:11px;color:#667085">${q(x.name)}</div></div>`).join('') : '<div class="result">No records found.</div>'; el.style.display = 'block' } catch (e) { console.warn(e) } }
    function bind() { const input = document.getElementById('globalSearch'), results = document.getElementById('results'); let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), 220) }); document.addEventListener('click', e => { const r = e.target.closest('.result'); if (r && r.dataset.id) { const type = r.dataset.type.toLowerCase(); const page = { customer: 'customer.html', supplier: 'supplier.html', enquiry: 'enquiry.html', quotation: 'quotation.html', invoice: 'invoice.html' }[type]; if (type === 'customer' || type === 'supplier') location.href = `business360.html?type=${type}&id=${encodeURIComponent(r.dataset.id)}`; else if (page) location.href = page + '?id=' + encodeURIComponent(r.dataset.id); return } if (!e.target.closest('.search')) results.style.display = 'none' }); document.getElementById('modules').innerHTML = [['Customers', 'customer.html', 'Customer records'], ['Suppliers', 'supplier.html', 'Supplier records'], ['Enquiries', 'enquiry.html', 'Sales intake'], ['Quotations', 'quotation.html', 'Commercial'], ['Customer 360°', 'business360.html', 'Business view'], ['Follow-ups', 'follow_up.html', 'Action items'], ['Customer support', 'customer_support.html', 'Service work'], ['Purchase', 'purchase.html', 'Buying work'], ['Invoices', 'invoice.html', 'Billing'], ['Reports', 'report.html', 'Management'], ['Order execution', 'order-sheet.html', 'Operations'], ['Purchase dashboard', 'purchase_dashboard.html', 'Procurement'], ['Invoice dashboard', 'invoice_dashboard.html', 'Accounts']].map(x => `<div class="module" onclick="location.href='${x[1]}'"><b>${x[0]}</b><span>${x[2]}</span></div>`).join('') }
    return { async init() { try { const d = await get('/crm/v2/overview'); render(d); bind() } catch (e) { document.getElementById('kpis').innerHTML = '<div class="card" style="grid-column:1/-1;color:#b42318">Unable to load CRM V2 data: ' + q(e.message) + '</div>'; bind() } } }
})(); document.addEventListener('DOMContentLoaded', () => V2.init());
