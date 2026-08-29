/**
 * RISE CRM — Business 360° Interactive UI Controller
 */
const B360UI = {
  currentType: 'customer',
  currentPartyId: 'CUST-000101',
  currentTab: 'overview',
  activeData: null,

  init: function() {
    this.bindSearch();
    this.loadParty(this.currentType, this.currentPartyId);
  },

  toast: function(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `slds-toast slds-toast-${type}`;
    toast.innerHTML = `<span>${msg}</span><span style="cursor:pointer" onclick="this.parentElement.remove()">✕</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  onPartyTypeChange: function() {
    this.currentType = document.getElementById('partyTypeSelect').value;
    const pool = Business360Engine.searchParties(this.currentType, '');
    if (pool.length > 0) {
      this.loadParty(this.currentType, pool[0].id);
    }
  },

  bindSearch: function() {
    const input = document.getElementById('partySearchInput');
    const results = document.getElementById('partySearchResults');

    input.addEventListener('input', (e) => {
      const q = e.target.value;
      if (!q.trim()) { results.style.display = 'none'; return; }

      const matches = Business360Engine.searchParties(this.currentType, q);
      if (!matches.length) {
        results.innerHTML = `<div style="padding:10px; color:#888;">No ${this.currentType} matching search.</div>`;
      } else {
        results.innerHTML = matches.map(m => `
          <div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee;" onclick="B360UI.selectParty('${m.id}')">
            <strong>${m.name}</strong> <span style="font-size:11px; color:#666;">(${m.code})</span>
            <div style="font-size:11px; color:#888;">GSTIN: ${m.gstin} | ${m.location}</div>
          </div>
        `).join('');
      }
      results.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.slds-search-box')) results.style.display = 'none';
    });
  },

  selectParty: function(id) {
    document.getElementById('partySearchResults').style.display = 'none';
    document.getElementById('partySearchInput').value = '';
    this.loadParty(this.currentType, id);
  },

  loadParty: function(type, id) {
    this.currentType = type;
    this.currentPartyId = id;

    if (type === 'customer') {
      this.activeData = Business360Engine.getCustomer360Data(id);
      document.getElementById('tabPlantsBtn').style.display = 'inline-block';
      document.getElementById('tabServiceBtn').style.display = 'inline-block';
    } else {
      this.activeData = Business360Engine.getSupplier360Data(id);
      document.getElementById('tabPlantsBtn').style.display = 'none';
      document.getElementById('tabServiceBtn').style.display = 'none';
    }

    if (!this.activeData) return;

    this.renderHeader();
    this.renderKPIs();
    this.renderCurrentTab();
  },

  renderHeader: function() {
    const p = this.activeData.party;
    document.getElementById('bcPartyName').innerText = p.name;

    const actionButtons = this.currentType === 'customer' ? `
      <button class="slds-btn" onclick="B360UI.openQuickEnquiryModal('${p.id}')">📩 New Enquiry</button>
      <button class="slds-btn" onclick="B360UI.toast('Navigating to Quotation generator...'); window.location.href='quotation.html';">💰 New Quotation</button>
      <button class="slds-btn slds-btn-brand" onclick="window.location.href='direct_sale.html';">⚡ Direct Sale</button>
      <button class="slds-btn" onclick="B360UI.logCallModal('${p.id}')">📞 Log Activity</button>
    ` : `
      <button class="slds-btn" onclick="B360UI.toast('Purchase order form loaded'); window.location.href='purchase.html';">📦 New Purchase PO</button>
      <button class="slds-btn slds-btn-brand" onclick="B360UI.toast('Supplier payment ledger opened');">💳 Record Payment</button>
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

  renderKPIs: function() {
    const k = this.activeData.kpis;
    const isCust = this.currentType === 'customer';

    const kpiHtml = isCust ? `
      <div class="b360-kpi-card" onclick="B360UI.switchTab('transactions')">
        <div style="font-size:11px; color:var(--slds-text-muted);">ACTIVE ENQUIRIES</div>
        <strong style="font-size:18px; color:var(--slds-brand);">${k.enquiriesCount} Enquiries</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('transactions')">
        <div style="font-size:11px; color:var(--slds-text-muted);">QUOTATION PIPELINE</div>
        <strong style="font-size:18px;">₹${(k.quotationsVal/100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">TOTAL INVOICED</div>
        <strong style="font-size:18px;">₹${(k.invoicedVal/100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">OUTSTANDING BALANCE</div>
        <strong style="font-size:18px; color:${k.outstandingVal > 0 ? 'var(--slds-danger)' : 'var(--slds-success)'};">₹${(k.outstandingVal/100000).toFixed(2)} L</strong>
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
        <strong style="font-size:18px; color:var(--slds-brand);">₹${(k.poVal/100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card" onclick="B360UI.switchTab('financials')">
        <div style="font-size:11px; color:var(--slds-text-muted);">TOTAL PAYABLE</div>
        <strong style="font-size:18px; color:var(--slds-danger);">₹${(k.payableVal/100000).toFixed(2)} L</strong>
      </div>
      <div class="b360-kpi-card">
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

  switchTab: function(tabName, btnElement) {
    this.currentTab = tabName;
    if (btnElement) {
      document.querySelectorAll('.b360-tab-btn').forEach(b => b.classList.remove('active'));
      btnElement.classList.add('active');
    }
    this.renderCurrentTab();
  },

  renderCurrentTab: function() {
    const vp = document.getElementById('b360TabViewport');
    const d = this.activeData;

    if (this.currentTab === 'overview') {
      vp.innerHTML = `
        <!-- Active Alerts Strip -->
        <div style="margin-bottom: 16px;">
          ${d.alerts.map(a => `<div class="b360-alert-banner b360-alert-${a.type}">${a.icon} ${a.text}</div>`).join('')}
        </div>

        <!-- Pipeline Bar -->
        <div class="slds-card" style="margin-bottom:16px;">
          <div class="slds-card-header">Commercial Flow Pipeline Stage Tracking</div>
          <div class="slds-card-body" style="display:flex; gap:10px; overflow-x:auto;">
            <div class="b360-pipeline-step" onclick="B360UI.switchTab('transactions')"><div>Enquiry</div><strong>${d.kpis.enquiriesCount || 2} Records</strong></div>
            <div class="b360-pipeline-step" onclick="B360UI.switchTab('transactions')"><div>Quotation</div><strong>₹${((d.kpis.quotationsVal||0)/100000).toFixed(1)} L</strong></div>
            <div class="b360-pipeline-step" onclick="B360UI.switchTab('transactions')"><div>PO / Order</div><strong>₹${((d.kpis.ordersVal||d.kpis.poVal||0)/100000).toFixed(1)} L</strong></div>
            <div class="b360-pipeline-step" onclick="B360UI.switchTab('financials')"><div>Invoiced</div><strong>₹${((d.financialSummary.totalInvoiced||d.financialSummary.totalPurchases||0)/100000).toFixed(1)} L</strong></div>
            <div class="b360-pipeline-step" onclick="B360UI.switchTab('financials')"><div>Settlement</div><strong>₹${((d.financialSummary.totalReceived||d.financialSummary.totalPaid||0)/100000).toFixed(1)} L</strong></div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
          <div class="slds-card">
            <div class="slds-card-header">Smart Factual Business Insights</div>
            <div class="slds-card-body">
              <ul style="padding-left:18px; line-height:1.8;">
                ${d.insights.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>

          <div class="slds-card">
            <div class="slds-card-header">Key Contacts (${d.contacts.length})</div>
            <div class="slds-card-body">
              ${d.contacts.map(c => `
                <div style="padding:6px 0; border-bottom:1px solid var(--slds-border-subtle);">
                  <div class="b360-link" onclick="B360UI.viewContactModal('${c.name}')">${c.name}</div>
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
            <div class="slds-card-header"><span>📩 Enquiries &amp; 💰 Quotations (Two-Way Linked)</span></div>
            <div class="slds-card-body" style="padding:0;">
              <table class="slds-table">
                <thead><tr><th>Record ID</th><th>Type</th><th>Requirement / Description</th><th>Value</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  ${d.enquiries.map(e => `
                    <tr>
                      <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Enquiry', '${e.id}', '${e.subject}')">${e.id}</span></td>
                      <td><span class="slds-badge slds-badge-info">Enquiry</span></td>
                      <td>${e.subject}</td>
                      <td>₹${(e.estimatedValue||0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-warning">${e.status}</span></td>
                      <td><button class="slds-btn" style="padding:2px 6px; font-size:11px;" onclick="window.location.href='quotation.html'">View In Quotations</button></td>
                    </tr>
                  `).join('')}
                  ${d.quotations.map(q => `
                    <tr style="background:#fafcff;">
                      <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Quotation', '${q.id}', 'Linked Enquiry: ' + q.enquiryId)">${q.id}</span></td>
                      <td><span class="slds-badge slds-badge-success">Quotation (Rev ${q.revision})</span></td>
                      <td>Linked Enquiry: <a class="b360-link" onclick="B360UI.viewRecordDetail('Enquiry', '${q.enquiryId}', 'Linked Spec')">${q.enquiryId}</a></td>
                      <td>₹${(q.totalValue||0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-success">${q.status}</span></td>
                      <td><button class="slds-btn slds-btn-brand" style="padding:2px 6px; font-size:11px;" onclick="window.location.href='direct_sale.html'">Convert to Sale</button></td>
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
            <div class="slds-card-header">Purchase Orders (${d.pos.length})</div>
            <div class="slds-card-body" style="padding:0;">
              <table class="slds-table">
                <thead><tr><th>PO Number</th><th>Date</th><th>Item Description</th><th>Value</th><th>Status</th></tr></thead>
                <tbody>
                  ${d.pos.map(po => `
                    <tr>
                      <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Purchase Order', '${po.id}', '${po.desc}')">${po.id}</span></td>
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
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">0–30 DAYS</div><strong>₹${(f.ageing.b0_30/1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">31–60 DAYS</div><strong>₹${(f.ageing.b31_60/1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">61–90 DAYS</div><strong>₹${(f.ageing.b61_90/1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">91–180 DAYS</div><strong style="color:var(--slds-warning);">₹${(f.ageing.b91_180/1000).toFixed(0)}k</strong></div></div>
          <div class="slds-card" style="margin:0;"><div class="slds-card-body" style="text-align:center;"><div style="font-size:11px; color:#888;">180+ DAYS OVERDUE</div><strong style="color:var(--slds-danger);">₹${(f.ageing.b180_plus/1000).toFixed(0)}k</strong></div></div>
        </div>

        <div class="slds-card">
          <div class="slds-card-header"><span>Interactive Party Ledger &amp; Invoices</span> <button class="slds-btn" onclick="window.location.href='invoice.html'">Open Invoice Module</button></div>
          <div class="slds-card-body" style="padding:0;">
            <table class="slds-table">
              <thead><tr><th>Date</th><th>Document Ref</th><th>Debit (₹)</th><th>Credit (₹)</th><th>Balance (₹)</th><th>Status</th></tr></thead>
              <tbody>
                <tr>
                  <td>10-Aug-2026</td>
                  <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Tax Invoice', 'INV/26-27/021', 'PA Fan Impeller Spares Set')">INV/26-27/021</span></td>
                  <td>18,50,000</td>
                  <td>—</td>
                  <td>18,50,000</td>
                  <td><span class="slds-badge slds-badge-warning">PARTIALLY PAID</span></td>
                </tr>
                <tr>
                  <td>22-Aug-2026</td>
                  <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Payment Receipt', 'PAY-9921', 'RTGS Transaction Ref: HDFC990011')">PAY-9921</span></td>
                  <td>—</td>
                  <td>10,00,000</td>
                  <td>8,50,000</td>
                  <td><span class="slds-badge slds-badge-success">SETTLED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'plants') {
      vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Operating Plants (${d.plants.length}) &amp; Tagged Heavy Machinery (${d.equipment.length})</div>
          <div class="slds-card-body" style="padding:0;">
            <table class="slds-table">
              <thead><tr><th>Plant Name</th><th>Code</th><th>Capacity</th><th>Installed Spares</th><th>Action</th></tr></thead>
              <tbody>
                ${d.plants.map(p => `
                  <tr>
                    <td><strong>${p.plantName}</strong></td>
                    <td>${p.code}</td>
                    <td>${p.capacity}</td>
                    <td>${d.equipment.filter(e => e.plantId === p.id).map(e => `<span class="slds-badge slds-badge-info">${e.equipmentType}</span>`).join(' ') || 'Standard Spares'}</td>
                    <td><button class="slds-btn" style="padding:2px 6px; font-size:11px;" onclick="B360UI.viewRecordDetail('Plant Record', '${p.code}', '${p.plantName}')">Plant 360°</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'service') {
      vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Technical Support &amp; Complaint Tickets (${d.tickets.length})</div>
          <div class="slds-card-body" style="padding:0;">
            <table class="slds-table">
              <thead><tr><th>Ticket ID</th><th>Subject</th><th>Priority</th><th>SLA Target</th><th>Status</th></tr></thead>
              <tbody>
                ${d.tickets.map(t => `
                  <tr>
                    <td><span class="b360-link" onclick="B360UI.viewRecordDetail('Service Ticket', '${t.id}', '${t.subject}')">${t.id}</span></td>
                    <td>${t.subject}</td>
                    <td><span class="slds-badge slds-badge-danger">${t.priority}</span></td>
                    <td>${t.slaTarget}</td>
                    <td><span class="slds-badge slds-badge-warning">${t.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'timeline') {
      vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Universal Activity &amp; Communication Stream</div>
          <div class="slds-card-body">
            ${d.activities.map(a => `
              <div style="margin-bottom:14px; border-left:3px solid var(--slds-brand); padding-left:12px;">
                <div style="font-weight:600; color:var(--slds-brand); font-size:13px;">${a.type} — ${a.date}</div>
                <div style="font-size:12px; margin-top:2px;">${a.outcome}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (this.currentTab === 'documents') {
      vp.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header"><span>Attached Industrial Specifications &amp; MTC Certificates</span> <button class="slds-btn slds-btn-brand" onclick="B360UI.toast('Document upload dialog ready')">+ Upload Document</button></div>
          <div class="slds-card-body">
            <div style="padding:8px; border:1px dashed var(--slds-border); text-align:center; border-radius:4px; color:#777;">
              📄 Technical Drawing — PA Fan Impeller Assembly (DWG-240-Rev2.pdf) — <a class="b360-link" onclick="B360UI.toast('Downloading document...')">Download</a>
            </div>
          </div>
        </div>
      `;
    }
  },

  viewRecordDetail: function(entityType, id, desc) {
    const modal = document.getElementById('b360ModalContainer');
    modal.innerHTML = `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;">
        <div class="slds-card" style="width:500px; max-width:90vw; margin:0; box-shadow:var(--slds-shadow-modal);">
          <div class="slds-card-header">
            <span>${entityType} — Detailed Record</span>
            <button style="border:none; background:none; font-size:16px; cursor:pointer;" onclick="document.getElementById('b360ModalContainer').innerHTML=''">✕</button>
          </div>
          <div class="slds-card-body">
            <div style="font-size:18px; font-weight:700; color:var(--slds-brand); margin-bottom:8px;">${id}</div>
            <div style="margin-bottom:12px;">${desc}</div>
            <div style="font-size:11px; color:#666;">Party Reference: ${this.activeData.party.name} (${this.activeData.party.code})</div>
          </div>
          <div style="padding:12px 18px; background:var(--slds-surface-header); border-top:1px solid var(--slds-border); display:flex; justify-content:flex-end; gap:8px;">
            <button class="slds-btn" onclick="document.getElementById('b360ModalContainer').innerHTML=''">Close</button>
            <button class="slds-btn slds-btn-brand" onclick="B360UI.toast('Opening native editor...'); document.getElementById('b360ModalContainer').innerHTML=''">Open Module</button>
          </div>
        </div>
      </div>
    `;
  },

  viewContactModal: function(name) {
    this.viewRecordDetail('Contact Personnel', name, 'Direct communication channel & authorization matrix');
  },

  logCallModal: function(partyId) {
    const notes = prompt("Enter conversation notes with party:");
    if (notes) {
      this.activeData.activities.unshift({
        id: `ACT-${Date.now()}`,
        type: 'Call',
        outcome: notes,
        date: new Date().toISOString().split('T')[0]
      });
      this.toast("Activity recorded in 360° stream.");
      this.renderCurrentTab();
    }
  },

  openQuickEnquiryModal: function(partyId) {
    const subj = prompt("Enter new industrial enquiry subject (e.g., ID Fan Impeller Hub Assembly):");
    if (subj) {
      const newEnq = {
        id: `ENQ-26-27-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: partyId,
        subject: subj,
        estimatedValue: 750000,
        status: 'NEW'
      };
      this.activeData.enquiries.unshift(newEnq);
      this.activeData.kpis.enquiriesCount++;
      this.toast(`Enquiry ${newEnq.id} registered.`);
      this.renderKPIs();
      this.renderCurrentTab();
    }
  },

  exportCSV: function() {
    const p = this.activeData.party;
    const csvContent = "data:text/csv;charset=utf-8," + 
      `Party Type,${this.currentType}\n` +
      `Party Name,${p.name}\n` +
      `Code,${p.code}\n` +
      `GSTIN,${p.gstin}\n` +
      `Total Business,₹${this.activeData.kpis.invoicedVal || this.activeData.kpis.poVal}\n` +
      `Outstanding,₹${this.activeData.kpis.outstandingVal || this.activeData.kpis.payableVal}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Business360_${p.code}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.toast("CSV Export downloaded.");
  }
};

window.addEventListener('DOMContentLoaded', () => B360UI.init());