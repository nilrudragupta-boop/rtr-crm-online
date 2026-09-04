(() => {
    const base = localStorage.getItem('backendApiUrl') || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:') ? 'http://localhost:5000/api' : location.origin + '/api');
    const app = document.getElementById('app');
    const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    const friendlyBucket = b => {
        const map = {
            '0-30': 'This month',
            '31-60': '1-2 months',
            '61-90': '2-3 months',
            '90+': '3+ months',
            Current: 'Current',
            Overdue: 'Overdue',
            '1-30': 'This month',
            '31-60 Days': '1-2 months',
            '61-90 Days': '2-3 months',
            '90+ Days': '3+ months'
        };
        return map[String(b)] || String(b || 'Unknown');
    };

    async function get(p) {
        const r = await fetch(base + p, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || !j.success) throw Error(j.message || 'Request failed');
        return j.data;
    }

    async function post(p, body) {
        const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok || !j.success) throw Error(j.message || 'Request failed');
        return j.data;
    }

    function pageFor(type) {
        return { customer: 'business360.html', supplier: 'business360.html', enquiry: 'enquiry.html', quotation: 'quotation.html', invoice: 'invoice.html' }[String(type || '').toLowerCase()];
    }

    function openSearchResult(item) {
        const type = String(item.type || '').toLowerCase();
        const page = pageFor(type);
        if (!page) return;
        if (type === 'customer' || type === 'supplier') location.href = `${page}?type=${type}&id=${encodeURIComponent(item.id)}`;
        else location.href = `${page}?id=${encodeURIComponent(item.id)}`;
    }

    function bindGlobalSearch() {
        const input = document.getElementById('phase3Search');
        const results = document.getElementById('phase3SearchResults');
        let timer;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const term = input.value.trim();
            if (!term) { results.style.display = 'none'; return; }
            timer = setTimeout(async () => {
                try {
                    const rows = await get('/crm/v2/search?q=' + encodeURIComponent(term));
                    results.innerHTML = rows.length ? rows.map((x, index) => `<button class="global-result" data-index="${index}"><b>${esc(x.type)}</b> · ${esc(x.ref || x.id)}<br><span class="muted">${esc(x.name || '')}</span></button>`).join('') : '<div class="global-result">No matching records.</div>';
                    results._rows = rows;
                    results.style.display = 'block';
                } catch (e) { results.innerHTML = `<div class="global-result">${esc(e.message)}</div>`; results.style.display = 'block'; }
            }, 220);
        });
        results.addEventListener('click', event => {
            const result = event.target.closest('.global-result');
            if (!result || !results._rows) return;
            const item = results._rows[Number(result.dataset.index)];
            if (item) openSearchResult(item);
        });
        document.addEventListener('click', event => { if (!event.target.closest('.global-search')) results.style.display = 'none'; });
    }

    function k(t, v, isMoney = true) {
        const value = isMoney ? money(v) : v;
        return `<div class="card"><div class="k">${esc(t)}</div><div class="v">${value}</div></div>`;
    }

    async function dashboard() {
        const [pipe, age, prof] = await Promise.all([
            get('/crm/v2/pipeline'),
            get('/crm/v2/ageing'),
            get('/crm/v2/profitability')
        ]);

        app.innerHTML = `
            <div class="card">
                <h2>Simple business overview</h2>
                <p class="muted">Use this page to answer 3 questions in under a minute: what is moving, what is due, and what needs approval.</p>
            </div>
            <div class="grid">
                ${k('Sales in motion', pipe.total)}
                ${k('Expected close', pipe.weighted)}
                ${k('Payments due', age.total)}
                ${k('Sales booked', prof.sales)}
                ${k('Gross profit', prof.profit)}
                ${k('Margin', `${prof.margin.toFixed(1)}%`, false)}
            </div>
            <div class="two">
                <div class="card">
                    <h3>Sales stages</h3>
                    ${pipe.stages.map(x => `
                        <p><b>${esc(x.status)}</b> · ${x.count} deals · ${money(x.value)}
                        <div class="bar"><i style="width:${pipe.total ? Math.min(100, x.value / pipe.total * 100) : 0}%"></i></div>
                        </p>
                    `).join('') || 'No sales activity yet.'}
                </div>
                <div class="card">
                    <h3>Payment follow-up</h3>
                    ${Object.entries(age.buckets).map(([b, v]) => `<p><b>${esc(friendlyBucket(b))}</b> — ${money(v)}</p>`).join('') || 'No payment data yet.'}
                </div>
            </div>
        `;
    }

    async function pipeline() {
        const d = await get('/crm/v2/pipeline');
        app.innerHTML = `
            <div class="card">
                <h2>Sales view</h2>
                <p class="muted">This shows the current sales funnel in plain numbers without the internal jargon.</p>
                <table class="table">
                    <tr><th>Stage</th><th>Deals</th><th>Value</th><th>Expected</th></tr>
                    ${d.stages.map(x => `
                        <tr>
                            <td>${esc(x.status)}</td>
                            <td>${x.count}</td>
                            <td>${money(x.value)}</td>
                            <td>${money(x.weightedValue)}</td>
                        </tr>
                    `).join('')}
                </table>
                <p><b>Total sales:</b> ${money(d.total)} &nbsp; <b>Expected close:</b> ${money(d.weighted)} &nbsp; <b>Win rate:</b> ${d.winRate || 0}%</p>
            </div>
        `;
    }

    async function ageing() {
        const d = await get('/crm/v2/ageing');
        app.innerHTML = `
            <div class="grid">
                ${Object.entries(d.buckets).map(([b, v]) => k(friendlyBucket(b), v)).join('')}
            </div>
            <div class="card">
                <h2>Payment tracker</h2>
                <table class="table">
                    <tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Age</th><th>Balance</th></tr>
                    ${d.rows.map(x => `
                        <tr>
                            <td>${esc(x.invoiceNo || x.id)}</td>
                            <td>${esc(x.customerName || '-')}</td>
                            <td>${esc(x.dueDate || '-')}</td>
                            <td><span class="pill">${esc(friendlyBucket(x.bucket))}</span></td>
                            <td>${money(x.balance)}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }

    async function profit() {
        const d = await get('/crm/v2/profitability');
        app.innerHTML = `
            <div class="grid">
                ${k('Sales booked', d.sales)}
                ${k('Cost', d.cost)}
                ${k('Gross profit', d.profit)}
                ${k('Margin', `${d.margin.toFixed(1)}%`, false)}
            </div>
            <div class="card">
                <h2>Profit by customer</h2>
                <table class="table">
                    <tr><th>Customer</th><th>Sales</th><th>Cost</th><th>Profit</th></tr>
                    ${d.byCustomer.map(x => `
                        <tr>
                            <td>${esc(x.customer)}</td>
                            <td>${money(x.sales)}</td>
                            <td>${money(x.cost)}</td>
                            <td>${money(x.profit)}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }

    async function approvals() {
        const d = await get('/crm/v2/approvals');
        app.innerHTML = `
            <div class="card">
                <h2>Approval queue</h2>
                <p class="muted">This is where discount, quotation, purchase and other controlled approvals are reviewed.</p>
                <table class="table">
                    <tr><th>Module</th><th>Reference</th><th>Amount</th><th>Requested by</th><th>Status</th></tr>
                    ${d.map(x => `
                        <tr>
                            <td>${esc(x.module)}</td>
                            <td>${esc(x.recordRef || x.recordId)}</td>
                            <td>${money(x.amount)}</td>
                            <td>${esc(x.requestedBy)}</td>
                            <td><span class="pill">${esc(x.status)}</span>${x.status === 'Pending' ? `<br><button class="btn approval-decision" data-id="${esc(x.id)}" data-status="Approved" style="padding:4px 7px;margin-top:6px;color:#067647">Approve</button> <button class="btn approval-decision" data-id="${esc(x.id)}" data-status="Rejected" style="padding:4px 7px;margin-top:6px;color:#b42318">Reject</button>` : ''}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="5">No approvals waiting.</td></tr>'}
                </table>
            </div>
        `;
        document.querySelectorAll('.approval-decision').forEach(button => {
            button.onclick = async () => {
                const decision = button.dataset.status;
                if (!confirm(`${decision} this approval?`)) return;
                button.disabled = true;
                try { await post(`/crm/v2/approvals/${encodeURIComponent(button.dataset.id)}/decision`, { status: decision, decidedBy: localStorage.getItem('currentUser') || 'System' }); await approvals(); }
                catch (e) { app.innerHTML = `<div class="card" style="color:#b42318">${esc(e.message)}</div>`; }
            };
        });
    }

    async function lookup() {
        app.innerHTML = `
            <div class="card">
                <h2>Customer / supplier view</h2>
                <div class="searchrow">
                    <select id="typ">
                        <option value="customer">Customer</option>
                        <option value="supplier">Supplier</option>
                    </select>
                    <input id="recordSearch" placeholder="Search by name or ID">
                    <select id="recordSelect" disabled><option value="">Choose a record</option></select>
                    <button class="btn primary" id="go">Open view</button>
                </div>
                <p class="muted">Type a few letters, choose the person or supplier, then open their business view.</p>
                <div id="out" style="margin-top:14px"></div>
            </div>
        `;

        const recordSearch = document.getElementById('recordSearch');
        const recordSelect = document.getElementById('recordSelect');
        let lookupTimer;
        recordSearch.addEventListener('input', () => {
            clearTimeout(lookupTimer);
            const term = recordSearch.value.trim();
            if (!term) { recordSelect.innerHTML = '<option value="">Choose a record</option>'; recordSelect.disabled = true; return; }
            lookupTimer = setTimeout(async () => {
                try {
                    const rows = (await get('/crm/v2/search?q=' + encodeURIComponent(term))).filter(x => x.type.toLowerCase() === document.getElementById('typ').value);
                    recordSelect.innerHTML = '<option value="">Choose a record</option>' + rows.map(x => `<option value="${esc(x.id)}">${esc(x.name || x.ref || x.id)} · ${esc(x.ref || x.id)}</option>`).join('');
                    recordSelect.disabled = !rows.length;
                } catch (e) { recordSelect.innerHTML = `<option value="">${esc(e.message)}</option>`; recordSelect.disabled = true; }
            }, 220);
        });
        document.getElementById('typ').addEventListener('change', () => { recordSearch.dispatchEvent(new Event('input')); });
        document.getElementById('go').onclick = async () => {
            const type = document.getElementById('typ').value;
            const id = recordSelect.value;
            if (!id) return;

            const d = await get(`/crm/v2/360/${type}/${encodeURIComponent(id)}`);
            const x = d.kpis;
            document.getElementById('out').innerHTML = `
                <div class="grid">
                    ${type === 'customer' ? `${k('Sales', x.sales)}${k('Payments due', x.receivable)}${k('Quotes', x.quoteValue)}` : `${k('Purchase value', x.purchaseValue)}${k('PO count', x.poCount)}${k('On-time rate', `${x.onTimeRate ?? '-'}%`, false)}`}
                </div>
                <div class="card">
                    <b>${esc(d[type].name || d[type].customerName || '')}</b>
                    <p class="muted">Health check: ${x.healthScore ?? x.qualityScore ?? '-'}</p>
                </div>
            `;
        };
    }

    async function roles() {
        const d = await get('/crm/v2/roles');
        app.innerHTML = `
            <div class="card">
                <h2>Team access</h2>
                <table class="table">
                    <tr><th>Role</th><th>Active</th><th>Permissions</th></tr>
                    ${d.map(r => `
                        <tr>
                            <td>${esc(r.name)}</td>
                            <td>${r.active ? 'Yes' : 'No'}</td>
                            <td>${esc(Object.values(r.permissions || {}).join(', ') || '-')}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }

    async function load(tab) {
        try {
            if (tab === 'dashboard') return dashboard();
            if (tab === 'pipeline') return pipeline();
            if (tab === 'ageing') return ageing();
            if (tab === 'profit') return profit();
            if (tab === 'approvals') return approvals();
            if (tab === '360') return lookup();
            if (tab === 'roles') return roles();
        } catch (e) {
            app.innerHTML = `<div class="card" style="color:#b42318">${esc(e.message)}</div>`;
        }
    }

    document.querySelectorAll('.tab').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            load(b.dataset.tab);
        };
    });

    bindGlobalSearch();
    load('dashboard');
})();
