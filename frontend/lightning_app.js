/**
 * Salesforce Lightning-Inspired UI Controller
 */
const CRM = {
  currentTab: 'dashboard',
  currentCustomerId: 'CUST-000101',

  init: function() {
    this.bindSidebar();
    this.bindGlobalSearch();
    this.navigate('customer360');
  },

  toast: function(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `slds-toast slds-toast-${type}`;
    toast.innerHTML = `<span>${msg}</span><span style="cursor:pointer" onclick="this.parentElement.remove()">✕</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  bindSidebar: function() {
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      document.getElementById('appSidebar').classList.toggle('collapsed');
    });
  },

  bindGlobalSearch: function() {
    const input = document.getElementById('globalSearchInput');
    const resultsBox = document.getElementById('globalSearchResults');

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) { resultsBox.style.display = 'none'; return; }

      const custs = CRMStore.getCustomers().filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
      const enqs = CRMStore.getEnquiries().filter(en => en.id.toLowerCase().includes(q) || en.subject.toLowerCase().includes(q));
      const quots = CRMStore.getQuotations().filter(qt => qt.id.toLowerCase().includes(q));
      
      let html = '<div style="padding: 8px;">';
      if (custs.length) {
        html += '<div style="font-size:11px; font-weight:700; color:#777; margin:4px 0;">CUSTOMERS</div>';
        custs.forEach(c => html += `<div style="padding:4px 8px; cursor:pointer;" onclick="CRM.openCustomer360('${c.id}')">👥 ${c.name} (${c.id})</div>`);
      }
      if (enqs.length) {
        html += '<div style="font-size:11px; font-weight:700; color:#777; margin:4px 0;">ENQUIRIES</div>';
        enqs.forEach(en => html += `<div style="padding:4px 8px; cursor:pointer;" onclick="CRM.openCustomer360('${en.customerId}')">📩 ${en.id} - ${en.subject}</div>`);
      }
      if (quots.length) {
        html += '<div style="font-size:11px; font-weight:700; color:#777; margin:4px 0;">QUOTATIONS</div>';
        quots.forEach(qt => html += `<div style="padding:4px 8px; cursor:pointer;" onclick="CRM.openCustomer360('${qt.customerId}')">💰 ${qt.id} (₹${(qt.totalValue||0).toLocaleString('en-IN')})</div>`);
      }
      if (!custs.length && !enqs.length && !quots.length) {
        html += '<div style="padding:8px; color:#888;">No records matching search criteria</div>';
      }
      html += '</div>';

      resultsBox.innerHTML = html;
      resultsBox.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.slds-search-box')) resultsBox.style.display = 'none';
    });
  },

  navigate: function(module) {
    this.currentTab = module;
    document.querySelectorAll('.slds-nav-item').forEach(el => el.classList.remove('active'));
    
    // Set breadcrumbs & titles
    const breadcrumb = document.getElementById('breadcrumbBar');
    const title = document.getElementById('pageTitle');
    const actions = document.getElementById('pageActions');
    const content = document.getElementById('workspaceContent');

    if (module === 'customer360') {
      this.renderCustomer360(this.currentCustomerId);
    } else if (module === 'enquiries') {
      breadcrumb.innerText = 'CRM > Enquiries Pipeline';
      title.innerText = 'Enquiry Pipeline (Kanban)';
      actions.innerHTML = `<button class="slds-btn slds-btn-brand" onclick="CRM.openNewEnquiryModal()">+ New Enquiry</button>`;
      this.renderEnquiryKanban(content);
    } else if (module === 'direct_sale' || module === 'invoices') {
      breadcrumb.innerText = `CRM > ${module === 'direct_sale' ? 'Direct Sale' : 'Invoices'}`;
      title.innerText = module === 'direct_sale' ? 'Customer Direct Sale' : 'Invoices & Ageing';
      actions.innerHTML = ``;
      content.innerHTML = `
        <div class="slds-card">
          <div class="slds-card-header">Legacy Module Container (${module}.html)</div>
          <div class="slds-card-body">
            <iframe src="${module === 'direct_sale' ? 'direct_sale.html' : 'invoice.html'}" style="width:100%; height:75vh; border:none;"></iframe>
          </div>
        </div>
      `;
    } else {
      breadcrumb.innerText = `CRM > ${module.toUpperCase()}`;
      title.innerText = module.charAt(0).toUpperCase() + module.slice(1);
      actions.innerHTML = ``;
      content.innerHTML = `<div class="slds-card"><div class="slds-card-body">Workspace View for <strong>${module}</strong> ready.</div></div>`;
    }
  },

  openCustomer360: function(customerId) {
    this.currentCustomerId = customerId;
    document.getElementById('globalSearchResults').style.display = 'none';
    this.navigate('customer360');
  },

  renderCustomer360: function(customerId) {
    const cust = CRMStore.getCustomers().find(c => c.id === customerId) || CRMStore.getCustomers()[0];
    const score = CRMStore.calculateCustomerScore(cust.id);
    const plants = CRMStore.getPlants().filter(p => p.customerId === cust.id);
    const contacts = CRMStore.getContacts().filter(c => c.customerId === cust.id);
    const equipment = CRMStore.getEquipment().filter(e => e.customerId === cust.id);
    const enquiries = CRMStore.getEnquiries().filter(e => e.customerId === cust.id);
    const quotations = CRMStore.getQuotations().filter(q => q.customerId === cust.id);
    const activities = CRMStore.getActivities().filter(a => a.customerId === cust.id);
    const followups = CRMStore.getFollowUps().filter(f => f.customerId === cust.id);

    document.getElementById('breadcrumbBar').innerText = `Customers > ${cust.name} (${cust.id})`;
    document.getElementById('pageTitle').innerText = `${cust.name} — Customer 360°`;
    document.getElementById('pageActions').innerHTML = `
      <button class="slds-btn" onclick="CRM.logQuickCall('${cust.id}')">📞 Log Call</button>
      <button class="slds-btn" onclick="CRM.openNewEnquiryModal('${cust.id}')">📩 New Enquiry</button>
      <button class="slds-btn slds-btn-brand" onclick="CRM.toast('Navigating to Direct Sale...'); CRM.navigate('direct_sale')">⚡ Direct Sale</button>
    `;

    const content = document.getElementById('workspaceContent');
    content.innerHTML = `
      <!-- Customer Record Highlights Card -->
      <div class="slds-card" style="border-top: 3px solid var(--slds-brand);">
        <div class="slds-card-body" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--slds-text-muted);">Industrial Customer</div>
            <div style="font-size: 18px; font-weight: 700;">${cust.name}</div>
            <div style="color: var(--slds-text-muted); font-size: 12px;">GSTIN: ${cust.gstin} | PAN: ${cust.code} | State: ${cust.state}</div>
          </div>
          <div style="display: flex; gap: 24px; text-align: center;">
            <div>
              <div style="font-size: 11px; color: var(--slds-text-muted);">CUSTOMER GRADE</div>
              <span class="slds-badge slds-badge-success">${cust.grade} — Strategic</span>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--slds-text-muted);">HEALTH SCORE</div>
              <strong style="font-size: 16px; color: ${score > 70 ? 'var(--slds-success)' : 'var(--slds-warning)'};">${score}/100</strong>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--slds-text-muted);">ACCOUNT OWNER</div>
              <div style="font-weight: 600;">${cust.owner}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Split 360 Workspace -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
        <!-- Left: Related Lists & Details -->
        <div>
          <!-- Plants & Equipment -->
          <div class="slds-card">
            <div class="slds-card-header">
              <span>🏭 Operating Plants (${plants.length}) & Installed Equipment (${equipment.length})</span>
            </div>
            <div class="slds-card-body" style="padding: 0;">
              <table class="slds-table">
                <thead>
                  <tr><th>Plant Name</th><th>Location</th><th>Equipment Types</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  ${plants.map(p => `
                    <tr>
                      <td><strong>${p.plantName}</strong> (${p.code})</td>
                      <td>${p.state}</td>
                      <td>${equipment.filter(e => e.plantId === p.id).map(e => `<span class="slds-badge slds-badge-info">${e.equipmentType}</span>`).join(' ') || 'No equipment tagged'}</td>
                      <td><button class="slds-btn" style="padding:2px 6px; font-size:11px;" onclick="CRM.toast('Service schedule generated')">Log Service</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Linked Enquiries & Quotations -->
          <div class="slds-card">
            <div class="slds-card-header">
              <span>📩 Active Enquiries (${enquiries.length}) & Quotations (${quotations.length})</span>
            </div>
            <div class="slds-card-body" style="padding: 0;">
              <table class="slds-table">
                <thead>
                  <tr><th>Ref / Number</th><th>Requirement Subject</th><th>Value</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  ${enquiries.map(e => `
                    <tr>
                      <td><strong>${e.id}</strong></td>
                      <td>${e.subject}</td>
                      <td>₹${(e.estimatedValue||0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-warning">${e.status}</span></td>
                      <td>
                        <button class="slds-btn slds-btn-brand" style="padding:2px 6px; font-size:11px;" onclick="CRM.convertEnquiry('${e.id}')">Convert to Quotation</button>
                      </td>
                    </tr>
                  `).join('')}
                  ${quotations.map(q => `
                    <tr style="background: #fafcff;">
                      <td><strong>${q.id}</strong> (Rev ${q.revision})</td>
                      <td>Linked to ${q.enquiryId}</td>
                      <td>₹${(q.totalValue||0).toLocaleString('en-IN')}</td>
                      <td><span class="slds-badge slds-badge-success">${q.status}</span></td>
                      <td>
                        <button class="slds-btn" style="padding:2px 6px; font-size:11px;" onclick="CRM.logNegotiationModal('${q.id}')">Negotiate</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Right: Activity Timeline & Follow-Ups -->
        <div>
          <div class="slds-card">
            <div class="slds-card-header">
              <span>📅 Pending Follow-ups (${followups.length})</span>
            </div>
            <div class="slds-card-body">
              ${followups.map(f => `
                <div style="padding: 8px; border-bottom: 1px solid var(--slds-border-subtle); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div><strong>${f.subject}</strong></div>
                    <div style="font-size:11px; color:var(--slds-danger);">Due: ${f.dueDate}</div>
                  </div>
                  <button class="slds-btn" style="padding:2px 6px; font-size:11px;" onclick="CRM.toast('Follow-up closed'); this.parentElement.remove();">Done</button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="slds-card">
            <div class="slds-card-header">
              <span>Universal Activity Timeline</span>
            </div>
            <div class="slds-card-body" style="font-size: 12px;">
              ${activities.map(a => `
                <div style="margin-bottom: 12px; border-left: 2px solid var(--slds-brand); padding-left: 8px;">
                  <div style="font-weight: 600; color: var(--slds-brand);">${a.type} — ${a.date}</div>
                  <div>${a.outcome}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderEnquiryKanban: function(container) {
    const enqs = CRMStore.getEnquiries();
    const stages = ['NEW', 'TECHNICAL REVIEW', 'QUOTATION', 'NEGOTIATION', 'PO RECEIVED'];

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(${stages.length}, 1fr); gap: 12px; height: 75vh;">
        ${stages.map(stage => {
          const list = enqs.filter(e => e.status === stage);
          const totalVal = list.reduce((acc, curr) => acc + (curr.estimatedValue || 0), 0);
          return `
            <div class="slds-card" style="display:flex; flex-direction:column; background: #eef2f6;">
              <div class="slds-card-header" style="background:#e2e8f0; font-size:12px;">
                <span>${stage} (${list.length})</span>
                <span style="font-size:11px; color:#555;">₹${(totalVal/100000).toFixed(1)}L</span>
              </div>
              <div class="slds-card-body" style="flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:8px;">
                ${list.map(item => `
                  <div class="slds-card" style="margin:0; padding:10px; cursor:pointer;" onclick="CRM.openCustomer360('${item.customerId}')">
                    <div style="font-weight:700; color:var(--slds-brand);">${item.id}</div>
                    <div style="font-size:12px; margin:4px 0;">${item.subject}</div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#666;">
                      <span>Prob: ${item.probability}%</span>
                      <strong>₹${(item.estimatedValue||0).toLocaleString('en-IN')}</strong>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  convertEnquiry: function(enqId) {
    try {
      const q = CRMStore.createQuotationFromEnquiry(enqId);
      this.toast(`✓ Created Quotation ${q.id} linked to Enquiry ${enqId}`);
      this.renderCustomer360(this.currentCustomerId);
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  logQuickCall: function(custId) {
    const outcome = prompt("Enter call notes / minutes with customer:");
    if (outcome) {
      CRMStore.logActivity({ customerId: custId, type: 'Call', outcome });
      this.toast("Call activity logged successfully");
      this.renderCustomer360(custId);
    }
  },

  openNewEnquiryModal: function(custId = this.currentCustomerId) {
    const subject = prompt("Enquiry Subject / Requirement (e.g. ID Fan Impeller Blades):");
    const val = prompt("Estimated Value in INR:", "500000");
    if (subject) {
      const newEnq = {
        id: `ENQ-26-27-${String(Math.floor(1000 + Math.random() * 9000))}`,
        customerId: custId,
        plantId: 'PLNT-00001',
        subject: subject,
        requirement: subject,
        estimatedValue: parseFloat(val) || 0,
        probability: 60,
        status: 'NEW',
        assignedTo: 'Sales Eng.',
        createdDate: new Date().toISOString().split('T')[0]
      };
      const enqs = CRMStore.getEnquiries();
      enqs.push(newEnq);
      localStorage.setItem('crm_enquiries', JSON.stringify(enqs));
      CRMStore.logActivity({ customerId: custId, type: 'Enquiry', outcome: `New Enquiry created: ${newEnq.id}` });
      this.toast(`Enquiry ${newEnq.id} logged`);
      this.renderCustomer360(custId);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => CRM.init());