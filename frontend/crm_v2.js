const V2 = (() => {
    const base = (() => {
        const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
        return localStorage.getItem('backendApiUrl') || (local ? 'http://localhost:5000/api' : location.origin + '/api');
    })();
    const q = value => String(value ?? '').replace(/[&<>\'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const money = value => '₹' + Number(String(value ?? 0).replace(/[,₹\s]/g, '') || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    async function get(path) {
        const response = await fetch(base + path, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
        return result.data;
    }

    function card(label, value, sub) {
        return `<div class="kpi"><div class="label">${q(label)}</div><div class="value">${value}</div><div class="sub">${q(sub || '')}</div></div>`;
    }

    function recordLink(page, parameter, value) {
        return `<a href="${page}?${parameter}=${encodeURIComponent(value)}" style="color:#0176d3;font-weight:700;text-decoration:none">${q(value)}</a>`;
    }

    function taskText(item) {
        const module = item.relatedModule || item.module || item.type || 'CRM';
        const reference = item.reference || item.referenceNo || item.enquiryNo || item.ticketNo || item.relatedId || item.id || '';
        const subject = item.subject || item.outcome || item.activityType || item.title || item.name;
        return subject && !['record', 'activity', 'task'].includes(String(subject).toLowerCase()) ? subject : `${module} follow-up${reference ? `: ${reference}` : ''}`;
    }

    function taskLink(item) {
        const module = String(item.relatedModule || item.module || item.type || '').toLowerCase();
        const id = item.relatedId || item.recordId || item.id || item.referenceNo || item.enquiryNo || item.ticketNo;
        const pageKey = ['enquiry', 'quotation', 'invoice', 'customer', 'supplier', 'ticket', 'support', 'follow'].find(key => module.includes(key));
        const pages = { enquiry: 'enquiry.html', quotation: 'quotation.html', invoice: 'invoice.html', customer: 'business360.html', supplier: 'business360.html', ticket: 'customer_support.html', support: 'customer_support.html', follow: 'follow_up.html' };
        if (!pageKey || !id) return q(taskText(item));
        const parameter = pageKey === 'quotation' ? `refNo=${encodeURIComponent(id)}` : pageKey === 'customer' || pageKey === 'supplier' ? `type=${pageKey}&id=${encodeURIComponent(id)}` : `id=${encodeURIComponent(id)}`;
        return `<a href="${pages[pageKey]}?${parameter}" style="color:#0176d3;font-weight:700;text-decoration:none">${q(taskText(item))}</a>`;
    }

    function render(data) {
        const summary = data.summary || {};
        document.getElementById('kpis').innerHTML = [
            card('Customers', summary.customers, 'Customer records'), card('Suppliers', summary.suppliers, 'Supplier records'),
            card('Open deals', summary.openEnquiries, money(summary.pipeline) + ' in pipeline'), card('Open quotes', summary.openQuotations, money(summary.quotationValue) + ' quoted'),
            card('Expected close', money(summary.weightedPipeline), 'Probability-based'), card('Payments due', money(summary.receivable), 'Invoices outstanding'),
            card('Collections', money(summary.paidValue), 'Recorded receipts'), card('Follow-ups', summary.overdueTasks, 'Need attention'), card('Support issues', summary.openTickets, 'Open cases')
        ].join('');

        const statuses = data.counts?.enquiryStatus || {};
        document.getElementById('pipeline').innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(statuses).map(([status, count]) => `<div class="module"><b>${q(status || 'New')}</b><span>${count} items</span></div>`).join('') || '<div class="empty">No enquiry data yet.</div>'}</div><div style="margin-top:12px;font-size:12px"><b>Pipeline:</b> ${money(summary.pipeline)} &nbsp; <b>Expected close:</b> ${money(summary.weightedPipeline)} &nbsp; <b>Won:</b> ${summary.wonEnquiries || 0} &nbsp; <b>Lost:</b> ${summary.lostEnquiries || 0}</div>`;

        const enquiries = data.recent?.enquiries || [];
        document.getElementById('enquiries').innerHTML = enquiries.length ? `<table class="table"><thead><tr><th>Enquiry</th><th>Customer</th><th>Status</th><th>Value</th></tr></thead><tbody>${enquiries.map(item => `<tr><td>${recordLink('enquiry.html', 'enquiryNo', item.enquiryNo || item.id)}</td><td>${q(item.customerName || '-')}</td><td><span class="pill">${q(item.status || 'New')}</span></td><td>${money(item.estimatedValue)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No enquiries found.</div>';

        const quotations = data.recent?.quotations || [];
        document.getElementById('quotes').innerHTML = quotations.length ? `<table class="table"><thead><tr><th>Quotation</th><th>Customer</th><th>Status</th><th>Value</th></tr></thead><tbody>${quotations.map(item => { const reference = item.refNo || item.quotationNo || item.id || '-'; const customer = item.custName || item.customerName || item.customer || '-'; const value = item.grandTotal ?? item.totalValue ?? item.total ?? item.amount ?? item.value ?? 0; return `<tr><td>${recordLink('quotation.html', 'refNo', reference)}</td><td>${q(customer)}</td><td><span class="pill">${q(item.status || 'Saved')}</span></td><td>${money(value)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No quotations found.</div>';

        const tasks = [...(data.recent?.activities || []), ...(data.recent?.followUps || [])].filter(item => !['done', 'completed', 'closed', 'cancelled'].includes(String(item.status || '').toLowerCase())).sort((left, right) => new Date(left.dueDate || left.createdAt || 0) - new Date(right.dueDate || right.createdAt || 0)).slice(0, 10);
        document.getElementById('tasks').innerHTML = tasks.length ? tasks.map(item => `<div style="padding:9px 0;border-bottom:1px solid #edf0f3"><div><b>${taskLink(item)}</b></div><div style="font-size:10px;color:#667085">${q(item.dueDate || item.nextFollowUp || item.activityDate || '')} · ${q(item.status || 'Open')} · ${q(item.priority || 'Medium')}</div></div>`).join('') : '<div class="empty">No open follow-ups or activities found.</div>';
    }

    async function search(term) {
        const results = document.getElementById('results');
        if (!term.trim()) { results.style.display = 'none'; return; }
        try {
            const rows = await get('/crm/v2/search?q=' + encodeURIComponent(term));
            results.innerHTML = rows.length ? rows.map(item => `<div class="result" data-type="${q(item.type)}" data-id="${q(item.id)}" data-ref="${q(item.ref || item.id)}"><b>${q(item.type)}</b> · ${q(item.ref || item.id)}<div style="font-size:11px;color:#667085">${q(item.name || '')}</div></div>`).join('') : '<div class="result">No records found.</div>';
            results.style.display = 'block';
        } catch (error) { results.innerHTML = `<div class="result">${q(error.message)}</div>`; results.style.display = 'block'; }
    }

    function bind() {
        const input = document.getElementById('globalSearch');
        const results = document.getElementById('results');
        let timer;
        input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), 220); });
        document.addEventListener('click', event => {
            const result = event.target.closest('.result');
            if (result?.dataset.id) {
                const type = result.dataset.type.toLowerCase();
                const value = result.dataset.ref || result.dataset.id;
                if (type === 'customer' || type === 'supplier') location.href = `business360.html?type=${type}&id=${encodeURIComponent(result.dataset.id)}`;
                else if (type === 'quotation') location.href = `quotation.html?refNo=${encodeURIComponent(value)}`;
                else if (type === 'enquiry') location.href = `enquiry.html?id=${encodeURIComponent(result.dataset.id)}`;
                else if (type === 'invoice') location.href = `invoice.html?id=${encodeURIComponent(result.dataset.id)}`;
            } else if (!event.target.closest('.search')) results.style.display = 'none';
        });
        document.getElementById('modules').innerHTML = [['Customers', 'customer.html', 'Customer records'], ['Suppliers', 'supplier.html', 'Supplier records'], ['Enquiries', 'enquiry.html', 'Sales intake'], ['Quotations', 'quotation.html', 'Commercial'], ['Customer 360°', 'business360.html', 'Business view'], ['Follow-ups', 'follow_up.html', 'Action items'], ['Customer support', 'customer_support.html', 'Service work'], ['Purchase', 'purchase.html', 'Buying work'], ['Invoices', 'invoice.html', 'Billing'], ['Reports', 'report.html', 'Management'], ['Business insights', 'crm_v2_phase3.html', 'Sales and finance'], ['Daily tasks', 'crm_v2_phase4.html', 'Action list']].map(item => `<div class="module" onclick="location.href='${item[1]}'"><b>${item[0]}</b><span>${item[2]}</span></div>`).join('');
    }

    return { async init() { bind(); try { render(await get('/crm/v2/overview')); } catch (error) { document.getElementById('kpis').innerHTML = `<div class="card" style="grid-column:1/-1;color:#b42318">Unable to load CRM data: ${q(error.message)}</div>`; } } };
})();
+
    +document.addEventListener('DOMContentLoaded', () => V2.init());
