(() => {
    const base = localStorage.getItem('backendApiUrl') || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:') ? 'http://localhost:5000/api' : location.origin + '/api');
    const app = document.getElementById('app');
    const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    async function get(p) {
        const r = await fetch(base + p, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || !j.success) throw Error(j.message || 'Request failed');
        return j.data;
    }

    async function post(p, b) {
        const r = await fetch(base + p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b)
        });
        const j = await r.json();
        if (!r.ok || !j.success) throw Error(j.message || 'Request failed');
        return j.data;
    }

    function card(t, v) {
        return `<div class="card"><div class="k">${esc(t)}</div><div class="v">${v}</div></div>`;
    }

    function err(e) {
        app.innerHTML = `<div class="card bad">${esc(e.message)}</div>`;
    }

    function tableLink(page, id, label) {
        if (!page || !id) return esc(label || '-');
        return `<a href="${page}${page.includes('?') ? '&' : '?'}id=${encodeURIComponent(id)}" title="Open record">${esc(label || id)}</a>`;
    }

    function linkFromRecord(record) {
        const module = String(record?.module || record?.relatedModule || record?.type || '').toLowerCase();
        const id = record?.id || record?.relatedId || record?.recordId || record?.ticketId || record?.referenceNo || record?.reference || record?.recordRef || record?.ticketNo;
        const text = record?.subject || record?.title || record?.ticketNo || record?.recordRef || record?.name || record?.id || 'View';

        const pages = {
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

        const page = pages[module] || pages[Object.keys(pages).find(k => module.includes(k))];
        if (!page || !id) return esc(text);
        return tableLink(page, id, text);
    }

    async function dashboard() {
        const [n, r] = await Promise.all([
            get('/crm/v2/phase4/notifications'),
            get('/crm/v2/phase4/rules')
        ]);

        app.innerHTML = `
            <div class="card">
                <h2>Easy daily view</h2>
                <p class="muted">This screen helps the team focus on the next 3 questions: what needs attention today, what is at risk, and which rules are active.</p>
            </div>
            <div class="grid">
                ${card('Open tasks', n.activities.length)}
                ${card('Pending approvals', n.approvals.length)}
                ${card('Rules enabled', r.filter(x => x.enabled).length)}
                ${card('Total rules', r.length)}
            </div>
            <div class="two">
                <div class="card">
                    <h2>Today’s action list</h2>
                    <p class="muted">The system creates follow-ups automatically when work is overdue or waiting on a decision.</p>
                    <button class="btn primary" id="run2">Start daily task run</button>
                    <div style="margin-top:14px">
                        ${n.activities.slice(0, 8).map(x => `
                            <p><b>${linkFromRecord(x)}</b><br><span class="muted">${esc(x.details || '')} · ${esc(x.priority || 'Medium')}</span></p>
                        `).join('') || '<div class="empty">No tasks right now.</div>'}
                    </div>
                </div>
                <div class="card">
                    <h2>How it works</h2>
                    <p>1. Find what is late or waiting.</p>
                    <p>2. Create a simple follow-up task.</p>
                    <p>3. Show the right people the next action.</p>
                    <p>4. Watch service issues before they become escalations.</p>
                    <p>5. Keep rule settings simple and easy to change.</p>
                </div>
            </div>
        `;

        document.getElementById('run2').onclick = runAutomation;
    }

    async function runAutomation() {
        const b = document.activeElement?.id === 'run2' ? document.getElementById('run2') : document.getElementById('run');
        if (b) b.disabled = true;
        try {
            const d = await post('/crm/v2/phase4/run', {});
            alert(`Daily task run completed: ${d.created} task(s) created and ${d.skipped} were already handled.`);
            await load('dashboard');
        } catch (e) {
            err(e);
        } finally {
            if (b) b.disabled = false;
        }
    }

    async function notifications() {
        const d = await get('/crm/v2/phase4/notifications');
        app.innerHTML = `
            <div class="card">
                <h2>Action list</h2>
                <table class="table">
                    <tr><th>Priority</th><th>Task</th><th>Related</th><th>Status</th><th>Due</th></tr>
                    ${d.activities.map(x => `
                        <tr>
                            <td><span class="pill ${x.priority === 'High' ? 'bad' : ''}">${esc(x.priority)}</span></td>
                            <td><b>${linkFromRecord(x)}</b><br><span class="muted">${esc(x.details || '')}</span></td>
                            <td>${esc(x.relatedModule || '-')} · ${tableLink((String(x.relatedModule || '').toLowerCase().includes('enquiry') ? 'enquiry.html' : String(x.relatedModule || '').toLowerCase().includes('quotation') ? 'quotation.html' : String(x.relatedModule || '').toLowerCase().includes('ticket') || String(x.relatedModule || '').toLowerCase().includes('support') ? 'customer_support.html' : String(x.relatedModule || '').toLowerCase().includes('follow') ? 'follow_up.html' : String(x.relatedModule || '').toLowerCase().includes('customer') ? 'customer.html' : String(x.relatedModule || '').toLowerCase().includes('supplier') ? 'supplier.html' : ''), x.relatedId || x.id, x.relatedId || x.id || '-')}</td>
                            <td>${esc(x.status)}</td>
                            <td>${esc(x.dueDate || '-')}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="5">No actions to show.</td></tr>'}
                </table>
            </div>
            <div class="card" style="margin-top:14px">
                <h2>Approvals waiting</h2>
                <table class="table">
                    <tr><th>Module</th><th>Reference</th><th>Amount</th><th>Requested by</th></tr>
                    ${d.approvals.map(x => `
                        <tr>
                            <td>${esc(x.module)}</td>
                            <td>${tableLink((String(x.module || '').toLowerCase().includes('enquiry') ? 'enquiry.html' : String(x.module || '').toLowerCase().includes('quotation') ? 'quotation.html' : String(x.module || '').toLowerCase().includes('invoice') ? 'invoice.html' : String(x.module || '').toLowerCase().includes('customer') ? 'customer.html' : String(x.module || '').toLowerCase().includes('supplier') ? 'supplier.html' : ''), x.recordId || x.id, x.recordRef || x.recordId || x.id || 'View')}</td>
                            <td>${money(x.amount)}</td>
                            <td>${esc(x.requestedBy)}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4">No approvals waiting.</td></tr>'}
                </table>
            </div>
        `;
    }

    async function sla() {
        const d = await get('/crm/v2/phase4/sla');
        app.innerHTML = `
            <div class="grid">
                ${card('On time', d.summary.within)}
                ${card('At risk', d.summary.atRisk)}
                ${card('Late', d.summary.breached)}
                ${card('Open tickets', d.tickets.length)}
            </div>
            <div class="card">
                <h2>Service watch</h2>
                <table class="table">
                    <tr><th>Ticket</th><th>Status</th><th>Age</th><th>SLA</th><th>Condition</th></tr>
                    ${d.tickets.map(x => `
                        <tr>
                            <td>${tableLink('customer_support.html', x.id || x.ticketNo, x.ticketNo || x.id || 'Open ticket')}</td>
                            <td>${esc(x.status || '-')}</td>
                            <td>${x.ageDays} day(s)</td>
                            <td>${x.slaDays} day(s)</td>
                            <td class="${x.slaStatus === 'Breached' ? 'bad' : x.slaStatus === 'At Risk' ? 'warn' : 'good'}"><b>${esc(x.slaStatus)}</b></td>
                        </tr>
                    `).join('') || '<tr><td colspan="5">No service issues right now.</td></tr>'}
                </table>
            </div>
        `;
    }

    async function rules() {
        const d = await get('/crm/v2/phase4/rules');
        app.innerHTML = `
            <div class="card">
                <h2>Smart rules</h2>
                <p class="muted">These rules decide when the system creates a task or alert. You can switch them on or off as needed.</p>
                ${d.map(x => `
                    <div class="rule">
                        <div>
                            <b>${esc(x.name)}</b>
                            <div class="muted">${esc(x.description || x.trigger)}</div>
                        </div>
                        <div>${esc(x.trigger)}</div>
                        <div>${x.thresholdDays || 0} day(s)</div>
                        <div><span class="pill">${x.enabled ? 'On' : 'Off'}</span></div>
                        <button class="btn switch" data-id="${esc(x.id)}" data-name="${esc(x.name)}" data-trigger="${esc(x.trigger)}" data-enabled="${x.enabled}">${x.enabled ? 'Turn off' : 'Turn on'}</button>
                    </div>
                `).join('')}
            </div>
        `;

        document.querySelectorAll('.switch').forEach(b => {
            b.onclick = async () => {
                try {
                    b.disabled = true;
                    await post('/crm/v2/phase4/rules', {
                        id: b.dataset.id,
                        name: b.dataset.name,
                        trigger: b.dataset.trigger,
                        enabled: b.dataset.enabled !== 'true'
                    });
                    await rules();
                } catch (e) {
                    err(e);
                } finally {
                    b.disabled = false;
                }
            };
        });
    }

    async function runs() {
        const a = await get('/crm/v2/activities?limit=200');
        app.innerHTML = `
            <div class="card">
                <h2>Daily log</h2>
                <p class="muted">Every system-generated task is recorded here so the team can review what happened and when.</p>
                <table class="table">
                    <tr><th>Subject</th><th>Module</th><th>Reference</th><th>Created</th></tr>
                    ${a.filter(x => x.automation).map(x => `
                        <tr>
                            <td>${linkFromRecord(x)}</td>
                            <td>${esc(x.relatedModule || '-')}</td>
                            <td>${tableLink((String(x.relatedModule || '').toLowerCase().includes('enquiry') ? 'enquiry.html' : String(x.relatedModule || '').toLowerCase().includes('quotation') ? 'quotation.html' : String(x.relatedModule || '').toLowerCase().includes('invoice') ? 'invoice.html' : String(x.relatedModule || '').toLowerCase().includes('ticket') || String(x.relatedModule || '').toLowerCase().includes('support') ? 'customer_support.html' : String(x.relatedModule || '').toLowerCase().includes('follow') ? 'follow_up.html' : String(x.relatedModule || '').toLowerCase().includes('customer') ? 'customer.html' : String(x.relatedModule || '').toLowerCase().includes('supplier') ? 'supplier.html' : ''), x.relatedId || x.id, x.relatedId || x.id || '-')}</td>
                            <td>${esc(x.createdAt || '-')}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4">No daily log entries yet.</td></tr>'}
                </table>
            </div>
        `;
    }

    async function load(tab) {
        try {
            if (tab === 'dashboard') return dashboard();
            if (tab === 'notifications') return notifications();
            if (tab === 'sla') return sla();
            if (tab === 'rules') return rules();
            if (tab === 'runs') return runs();
        } catch (e) {
            err(e);
        }
    }

    document.querySelectorAll('.tab').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            load(b.dataset.tab);
        };
    });

    const runBtn = document.getElementById('run');
    if (runBtn) runBtn.onclick = runAutomation;

    load('dashboard');
})();
