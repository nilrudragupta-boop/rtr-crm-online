/**
 * RISE CRM — Business 360° Interactive UI Controller
 */
const B360UI = {
    currentType: 'customer',
    currentPartyId: null,
    currentTab: 'overview',
    activeData: null,

    init: async function () {
        // 1. Sync live backend customer data if available
        if (typeof apiClient !== 'undefined' && apiClient.getCustomers) {
            try {
                const res = await apiClient.getCustomers();
                const remote = Array.isArray(res) ? res : (res && res.data ? res.data : null);
                if (remote && remote.length) {
                    localStorage.setItem('customers', JSON.stringify(remote));
                }
            } catch (err) {
                console.warn('apiClient sync bypassed:', err);
            }
        }

        this.bindSearch();

        // 2. Select initial party
        const initialList = Business360Engine.searchParties(this.currentType, '');
        if (initialList.length) {
            this.currentPartyId = initialList[0].id;
            this.loadParty(this.currentType, this.currentPartyId);
        }
    },

    toast: function (msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `slds-toast slds-toast-${type}`;
        toast.innerHTML = `<span>${msg}</span><span style="cursor:pointer; margin-left:12px;" onclick="this.parentElement.remove()">✕</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    onPartyTypeChange: function () {
        this.currentType = document.getElementById('partyTypeSelect').value;
        const searchInput = document.getElementById('partySearchInput');
        if (searchInput) searchInput.value = '';

        const pool = Business360Engine.searchParties(this.currentType, '');
        if (pool.length > 0) {
            this.loadParty(this.currentType, pool[0].id);
        } else {
            document.getElementById('b360TabViewport').innerHTML = `<div style="padding:20px; text-align:center; color:#888;">No ${this.currentType} records available.</div>`;
        }
    },

    showDropdownList: function () {
        const input = document.getElementById('partySearchInput');
        const results = document.getElementById('partySearchResults');
        const q = input.value || '';
        const matches = Business360Engine.searchParties(this.currentType, q);

        if (!matches.length) {
            results.innerHTML = `<div style="padding:10px; color:#888;">No ${this.currentType} records found.</div>`;
        } else {
            results.innerHTML = matches.map(m => `
        <div class="slds-search-item" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; background:#fff;" 
             onmousedown="B360UI.selectParty('${m.id}')">
          <strong style="color:var(--slds-brand);">${m.name}</strong> 
          <span style="font-size:11px; color:#666;">(${m.code})</span>
          <div style="font-size:11px; color:#888;">GSTIN: ${m.gstin} | ${m.location}</div>
        </div>
      `).join('');
        }
        results.style.display = 'block';
    },

    bindSearch: function () {
        const input = document.getElementById('partySearchInput');
        const results = document.getElementById('partySearchResults');

        input.addEventListener('input', () => this.showDropdownList());
        input.addEventListener('focus', () => this.showDropdownList());
        input.addEventListener('click', () => this.showDropdownList());

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.slds-search-box')) {
                results.style.display = 'none';
            }
        });
    },

    selectParty: function (id) {
        const results = document.getElementById('partySearchResults');
        if (results) results.style.display = 'none';
        const input = document.getElementById('partySearchInput');
        if (input) input.value = '';
        this.loadParty(this.currentType, id);
    },

    loadParty: function (type, id) {
        this.currentType = type;
        this.currentPartyId = id;

        if (type === 'customer') {
            this.activeData = Business360Engine.getCustomer360Data(id);
            const plantBtn = document.getElementById('tabPlantsBtn');
            const srvBtn = document.getElementById('tabServiceBtn');
            if (plantBtn) plantBtn.style.display = 'inline-block';
            if (srvBtn) srvBtn.style.display = 'inline-block';
        } else {
            this.activeData = Business360Engine.getSupplier360Data(id);
            const plantBtn = document.getElementById('tabPlantsBtn');
            const srvBtn = document.getElementById('tabServiceBtn');
            if (plantBtn) plantBtn.style.display = 'none';
            if (srvBtn) srvBtn.style.display = 'none';
        }

        if (!this.activeData) return;

        this.renderHeader();
        this.renderKPIs();
        this.renderCurrentTab();
    },

    renderHeader: function () {
        const p = this.activeData.party;
        const bcName = document.getElementById('bcPartyName');
        if (bcName) bcName.innerText = p.name;

        const actionButtons = this.currentType === 'customer' ? `
      <button class="slds-btn" onclick="window.location.href='quotation.html';">💰 New Quotation</button>
      <button class="slds-btn slds-btn-brand" onclick="window.location.href='direct_sale.html';">⚡ Direct Sale</button>
      <button class="slds-btn" onclick="B360UI.logCallModal('${p.id}')">📞 Log Activity</button>
    ` : `
      <button class="slds-btn" onclick="window.location.href='purchase.html';">📦 New Purchase PO</button>
      <button class="slds-btn slds-btn-brand" onclick="B360UI.toast('Payment recording opened');">💳 Record Payment</button>
    `;

        document.getElementById('partyHeaderContainer').innerHTML = `
      <div class="b360-header-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px; font-weight:700;">${p.name}</span>
              <span class="slds-badge slds-badge-success">● Active</span>
              <span class="slds-badge slds-badge-info">${p.type}</span>
            </div>
            <div style="color:var(--slds-text-muted); font-size:12px; margin-top:4px;">
              <strong>Code:</strong> ${p.code} | <strong>GSTIN:</strong> ${p.gstin} | <strong>PAN:</strong> ${p.pan} | <strong>Location:</strong> ${p.location}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;
    },

    renderKPIs: function () {
        const k = this.activeData.kpis;
        const isCust = this.currentType === 'customer';

        const kpiHtml = isCust ? `
      <div class="b360-kpi-card" onclick="B360UI.switchTab('transactions')">
        <div style="font-size:11px; color:var(--slds-text-muted);">ACTIVE ENQUIRIES</div>
        <strong style="font-size:18px; color:var(--slds-brand);">${k.enquiriesCount} Enquiries</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('transactions')">
        <div style="font-size:11px; color:var(--slds-text-muted);">QUOTATION PIPELINE</div>
        <strong style="font-size:18px;">₹${(k.quotationsVal / 100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">TOTAL INVOICED</div>
        <strong style="font-size:18px;">₹${(k.invoicedVal / 100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">OUTSTANDING BALANCE</div>
        <strong style="font-size:18px; color:${k.outstandingVal > 0 ? 'var(--slds-danger)' : 'var(--slds-success)'};">₹${(k.outstandingVal / 100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('service')">
        <div style="font-size:11px; color:var(--slds-text-muted);">OPEN SERVICE TICKETS</div>
        <strong style="font-size:18px; color:${k.openTickets > 0 ? 'var(--slds-warning)' : 'var(--slds-success)'};">${k.openTickets} Open</strong>
      </div>
      <div class="b360-kpi-card">
        <div style="font-size:11px; color:var(--slds-text-muted);">CUSTOMER HEALTH SCORE</div>
        <strong style="font-size:18px; color:var(--slds-success);">${k.score} / 100 (Grade ${this.activeData.party.grade})</strong>
      </div>
    ` : `
      <div class="b360-kpi-card" onclick="B360UI.switchTab('transactions')">
        <div style="font-size:11px; color:var(--slds-text-muted);">PURCHASE ORDERS</div>
        <strong style="font-size:18px; color:var(--slds-brand);">₹${(k.poVal / 100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">TOTAL PAYABLE</div>
        <strong style="font-size:18px; color:var(--slds-danger);">₹${(k.payableVal / 100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">REJECTIONS LOGGED</div>
        <strong style="font-size:18px; color:var(--slds-warning);">${k.rejectionsCount} Items</strong>
      </div>
      <div class="b360-kpi-card">
        <div style="font-size:11px; color:var(--slds-text-muted);">SUPPLIER QUALITY SCORE</div>
        <strong style="font-size:18px; color:var(--slds-success);">${k.score} / 100 (Grade A)</strong>
      </div>
    `;

        document.getElementById('kpiStripContainer').innerHTML = kpiHtml;
    },

    switchTab: function (tabName, btnElement) {
        this.currentTab = tabName;
        if (btnElement) {
            document.querySelectorAll('.b360-tab-btn').forEach(b => b.classList.remove('active'));
            btnElement.classList.add('active');
        }
        this.renderCurrentTab();
    },

    renderCurrentTab: function () {
        const vp = document.getElementById('b360TabViewport');
        const d = this.activeData;
        if (!d) return;

        if (this.currentTab === 'overview') {
            vp.innerHTML = `
        <div style="margin-bottom: 16px;">
          ${(d.alerts || []).map(a => `<div class="b360-alert-banner b360-alert-${a.type}">${a.icon} ${a.text}</div>`).join('')}
        </div>
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
          <div class="slds-card">
            <div class="slds-card-header">Factual Business Insights</div>
            <div class="slds-card-body">
              <ul style="padding-left:18px; line-height:1.8;">
                ${(d.insights || []).map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div class="slds-card">
            <div class="slds-card-header">Key Contacts (${d.contacts ? d.contacts.length : 0})</div>
            <div class="slds-card-body">
              ${(d.contacts || []).map(c => `
                <div style="padding:6px 0; border-bottom:1px solid var(--slds-border-subtle);">
                  <div class="b360-link">${c.name}</div>
                  <div style="font-size:11px; color:#666;">${c.designation} (${c.department})</div>
                  <div style="font-size:11px;">📞 ${c.mobile} | ✉️ ${c.email}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
        } else if (this.currentTab === 'transactions') {
            if (this.currentType === 'customer') {
                vp.innerHTML = `
          <div class="slds-card">
            <div class="slds-card-header"><span>Enquiries &amp; Quotations</span></div>
            <div class="slds-card-body" style="padding:0;">
              <table class="slds-table">
                <thead><tr><th>Record ID</th><th>Requirement</th><th>Value</th><th>Status</th></tr></thead>
                <tbody>
                  ${(d.enquiries || []).map(e => `
                    <tr>
                      <td><span class="b360-link">${e.id}</span></td>
                      <td>${e.subject}</td>
                      <td>₹${(e.estimatedValue || 0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-warning">${e.status}</span></td>
                    </tr>
                  `).join('')}
                  ${(d.quotations || []).map(q => `
                    <tr style="background:#fafcff;">
                      <td><span class="b360-link">${q.id}</span></td>
                      <td>Linked Enquiry: ${q.enquiryId}</td>
                      <td>₹${(q.totalValue || 0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-success">${q.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
            } else {
                vp.innerHTML = `
          <div class="slds-card">
            <div class="slds-card-header">Purchase Orders</div>
            <div class="slds-card-body" style="padding:0;">
              <table class="slds-table">
                <thead><tr><th>PO Number</th><th>Date</th><th>Item Description</th><th>Value</th><th>Status</th></tr></thead>
                <tbody>
                  ${(d.pos || []).map(po => `
                    <tr>
                      <td><span class="b360-link">${po.id}</span></td>
                      <td>${po.date}</td>
                      <td>${po.desc}</td>
                      <td>₹${po.value.toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-info">${po.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
            }
        } else if (this.currentTab === 'financials') {
            const f = d.financialSummary;
            vp.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:12px; margin-bottom:16px;">
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">0–30 DAYS</div><strong>₹${(f.ageing.b0_30 / 1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">31–60 DAYS</div><strong>₹${(f.ageing.b31_60 / 1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">61–90 DAYS</div><strong>₹${(f.ageing.b61_90 / 1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">91–180 DAYS</div><strong style="color:var(--slds-warning);">₹${(f.ageing.b91_180 / 1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">180+ DAYS OVERDUE</div><strong style="color:var(--slds-danger);">₹${(f.ageing.b180_plus / 1000).toFixed(0)}k</strong></div></div>
        </div>
      `;
        } else if (this.currentTab === 'plants') {
            vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Operating Plants</div>
          <div class="slds-card-body" style="padding:0;">
            <table class="slds-table">
              <thead><tr><th>Plant Name</th><th>Code</th><th>Capacity</th></tr></thead>
              <tbody>
                ${(d.plants || []).map(p => `
                  <tr><td><strong>${p.plantName}</strong></td><td>${p.code}</td><td>${p.capacity}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
        } else if (this.currentTab === 'service') {
            vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Service &amp; Complaint Tickets</div>
          <div class="slds-card-body" style="padding:0;">
            <table class="slds-table">
              <thead><tr><th>Ticket ID</th><th>Subject</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                ${(d.tickets || []).map(t => `
                  <tr><td>${t.id}</td><td>${t.subject}</td><td>${t.priority}</td><td>${t.status}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
        } else if (this.currentTab === 'timeline') {
            vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Activity Timeline</div>
          <div class="slds-card-body">
            ${(d.activities || []).map(a => `
              <div style="margin-bottom:12px; border-left:3px solid var(--slds-brand); padding-left:10px;">
                <div style="font-weight:600; color:var(--slds-brand);">${a.type} — ${a.date}</div>
                <div>${a.outcome}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
        } else if (this.currentTab === 'documents') {
            vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Attached Documents</div>
          <div class="slds-card-body">
            <div style="padding:12px; border:1px dashed #ccc; text-align:center; color:#666;">
              No documents uploaded for this party.
            </div>
          </div>
        </div>
      `;
        }
    },

    logCallModal: function (partyId) {
        const notes = prompt("Enter conversation notes:");
        if (notes) {
            this.activeData.activities.unshift({ id: `ACT-${Date.now()}`, type: 'Call', outcome: notes, date: new Date().toLocaleDateString('en-GB') });
            this.toast("Activity recorded.");
            this.renderCurrentTab();
        }
    },

    exportCSV: function () {
        const p = this.activeData.party;
        const csvContent = "data:text/csv;charset=utf-8," + `Party Type,${this.currentType}\nParty Name,${p.name}\nCode,${p.code}\nGSTIN,${p.gstin}\n`;
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `Business360_${p.code}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
};

window.addEventListener('DOMContentLoaded', () => B360UI.init());