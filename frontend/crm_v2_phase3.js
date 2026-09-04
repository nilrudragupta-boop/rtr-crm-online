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
                            <td><span class="pill">${esc(x.status)}</span></td>
                        </tr>
                    `).join('') || '<tr><td colspan="5">No approvals waiting.</td></tr>'}
                </table>
            </div>
        `;
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
                    <input id="id" placeholder="Enter customer or supplier ID">
                    <button class="btn primary" id="go">Open view</button>
                </div>
                <div id="out" style="margin-top:14px"></div>
            </div>
        `;

        document.getElementById('go').onclick = async () => {
            const type = document.getElementById('typ').value;
            const id = document.getElementById('id').value.trim();
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

    load('dashboard');
})();
