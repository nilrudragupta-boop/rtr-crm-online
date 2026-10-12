(function () {
    // 1. Static Module Routes
    const SYSTEM_MODULES = [
        { id: 'mod-crm', title: 'CRM v2 Dashboard', group: 'Modules', type: 'module', icon: '📊', url: 'crm_v2.html' },
        { id: 'mod-customer', title: 'Customer Master / Directory', group: 'Modules', type: 'module', icon: '👥', url: 'customer.html' },
        { id: 'mod-contacts', title: 'Contacts Directory', group: 'Modules', type: 'module', icon: '📇', url: 'contacts.html' },
        { id: 'mod-enquiry', title: 'Lead Enquiries & Follow Up', group: 'Modules', type: 'module', icon: '🎯', url: 'enquiry.html' },
        { id: 'mod-followup', title: 'Follow-Up Schedule', group: 'Modules', type: 'module', icon: '📅', url: 'follow_up.html' },
        { id: 'mod-invoice', title: 'Invoices & Billing', group: 'Modules', type: 'module', icon: '🧾', url: 'invoice.html' },
        { id: 'mod-daybook', title: 'Day Book', group: 'Modules', type: 'module', icon: '📖', url: 'day_book.html' },
        { id: 'mod-ledger', title: 'Account Ledger', group: 'Modules', type: 'module', icon: '⚖️', url: 'ledger.html' },
        { id: 'mod-balancesheet', title: 'Balance Sheet', group: 'Modules', type: 'module', icon: '📈', url: 'balance_sheet.html' },
        { id: 'mod-cashflow', title: 'Cash Flow Statement', group: 'Modules', type: 'module', icon: '💵', url: 'cash_flow.html' },
        { id: 'mod-purchase', title: 'Purchase Orders & Inward', group: 'Modules', type: 'module', icon: '🛒', url: 'purchase.html' },
        { id: 'mod-stockreport', title: 'Stock Report & Inventory', group: 'Modules', type: 'module', icon: '📦', url: 'stock_report.html' },
        { id: 'mod-stockjournal', title: 'Stock Journal', group: 'Modules', type: 'module', icon: '🔄', url: 'stock_journal.html' },
        { id: 'mod-production', title: 'Production & Manufacturing', group: 'Modules', type: 'module', icon: '🏭', url: 'production.html' },
        { id: 'mod-bom', title: 'Bill of Materials (BOM)', group: 'Modules', type: 'module', icon: '⚙️', url: 'bom.html' },
        { id: 'mod-gst', title: 'GST Return Report', group: 'Modules', type: 'module', icon: '📑', url: 'gst_return_report.html' },
        { id: 'mod-pdf', title: 'RTR PDF Studio', group: 'Tools', type: 'action', icon: '🖨️', url: 'rtr_pdf_studio.html' },
        { id: 'mod-settings', title: 'System Settings', group: 'System', type: 'action', icon: '⚙️', url: 'settings.html' }
    ];

    let dynamicCustomers = [];
    let dynamicInvoices = [];
    let activeIndex = 0;
    let filteredItems = [];
    let searchDebounce = null;

    // 2. Fetch or load customer and invoice index from Storage/API
    async function refreshSearchIndexes() {
        // Try local storage caches first (standard in RTR CRM clients)
        try {
            const cachedCust = localStorage.getItem('rtr_customers') || localStorage.getItem('customers');
            if (cachedCust) dynamicCustomers = JSON.parse(cachedCust);

            const cachedInv = localStorage.getItem('rtr_invoices') || localStorage.getItem('invoices');
            if (cachedInv) dynamicInvoices = JSON.parse(cachedInv);
        } catch (e) {
            console.warn('[CommandPalette] Local cache read skipped:', e);
        }

        // Fetch latest from backend API if online
        try {
            if (window.apiClient && typeof window.apiClient.get === 'function') {
                const [custRes, invRes] = await Promise.allSettled([
                    window.apiClient.get('/api/customers'),
                    window.apiClient.get('/api/invoices')
                ]);
                if (custRes.status === 'fulfilled' && custRes.value?.data) dynamicCustomers = custRes.value.data;
                if (invRes.status === 'fulfilled' && invRes.value?.data) dynamicInvoices = invRes.value.data;
            }
        } catch (_) { }
    }

    // 3. Inject Palette DOM
    function injectPaletteDOM() {
        if (document.getElementById('cmdPaletteBackdrop')) return;

        const html = `
            <div id="cmdPaletteBackdrop" class="cmd-palette-backdrop">
                <div class="cmd-palette-modal" onclick="event.stopPropagation()">
                    <div class="cmd-palette-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" id="cmdPaletteInput" class="cmd-palette-input" placeholder="Search module, customer name, phone, or invoice #..." autocomplete="off" />
                        <span class="cmd-palette-badge">ESC</span>
                    </div>
                    <ul id="cmdPaletteList" class="cmd-palette-list"></ul>
                    <div class="cmd-palette-footer">
                        <span><kbd>↑</kbd> <kbd>↓</kbd> Select</span>
                        <span><kbd>↵</kbd> Open Record</span>
                        <span><kbd>ESC</kbd> Close</span>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        const backdrop = document.getElementById('cmdPaletteBackdrop');
        const input = document.getElementById('cmdPaletteInput');

        backdrop.addEventListener('click', closePalette);
        input.addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => filterAll(e.target.value), 60);
        });
        input.addEventListener('keydown', handleKeyDown);
    }

    // 4. Combined Search Filter: Modules + Invoices + Customers
    function filterAll(query) {
        const q = (query || '').trim().toLowerCase();

        if (!q) {
            filteredItems = [...SYSTEM_MODULES.slice(0, 8)];
            activeIndex = 0;
            renderList();
            return;
        }

        const results = [];

        // (A) Matches in Invoices (e.g. INV-1002, customer name, amount)
        dynamicInvoices.forEach(inv => {
            const invNo = String(inv.invoice_no || inv.id || inv.number || '').toLowerCase();
            const custName = String(inv.customer_name || inv.party_name || '').toLowerCase();
            if (invNo.includes(q) || custName.includes(q)) {
                results.push({
                    id: `inv-${inv.id || inv.invoice_no}`,
                    title: `Invoice #${inv.invoice_no || inv.id}`,
                    subtitle: `${inv.customer_name || inv.party_name || 'Customer'} • ₹${inv.total_amount || inv.grand_total || '0'}`,
                    group: 'Invoices',
                    type: 'invoice',
                    icon: '🧾',
                    url: `invoice.html?id=${encodeURIComponent(inv.id || inv.invoice_no)}`
                });
            }
        });

        // (B) Matches in Customers (e.g. name, phone, email, GSTIN)
        dynamicCustomers.forEach(cust => {
            const name = String(cust.name || cust.company_name || '').toLowerCase();
            const phone = String(cust.phone || cust.mobile || '').toLowerCase();
            const gstin = String(cust.gstin || cust.gst_number || '').toLowerCase();
            if (name.includes(q) || phone.includes(q) || gstin.includes(q)) {
                results.push({
                    id: `cust-${cust.id || cust._id}`,
                    title: cust.name || cust.company_name || 'Unnamed Customer',
                    subtitle: [cust.phone || cust.mobile, cust.city].filter(Boolean).join(' • '),
                    group: 'Customers',
                    type: 'customer',
                    icon: '👤',
                    url: `customer.html?id=${encodeURIComponent(cust.id || cust._id)}`
                });
            }
        });

        // (C) Matches in System Modules
        SYSTEM_MODULES.forEach(mod => {
            if (mod.title.toLowerCase().includes(q) || mod.group.toLowerCase().includes(q)) {
                results.push(mod);
            }
        });

        filteredItems = results.slice(0, 30); // Cap list at 30 items for smooth rendering
        activeIndex = 0;
        renderList();
    }

    // 5. Render Modal Items
    function renderList() {
        const list = document.getElementById('cmdPaletteList');
        if (!list) return;

        if (filteredItems.length === 0) {
            list.innerHTML = `<li class="cmd-empty-state">No matching modules, customers, or invoices found.</li>`;
            return;
        }

        let html = '';
        let currentGroup = null;

        filteredItems.forEach((item, idx) => {
            if (item.group !== currentGroup) {
                currentGroup = item.group;
                html += `<div class="cmd-group-label">${currentGroup}</div>`;
            }

            const activeClass = idx === activeIndex ? 'active' : '';
            const tagBadge = item.type === 'invoice' ? 'Invoice' : item.type === 'customer' ? 'Customer' : 'Jump';

            html += `
                <li class="cmd-palette-item ${activeClass}" data-index="${idx}" onclick="window._cmdPaletteSelect(${idx})">
                    <div class="cmd-palette-item-left">
                        <span class="cmd-item-icon">${item.icon}</span>
                        <div class="cmd-item-text">
                            <span class="cmd-item-title">${item.title}</span>
                            ${item.subtitle ? `<span class="cmd-item-subtitle">${item.subtitle}</span>` : ''}
                        </div>
                    </div>
                    <span class="cmd-item-tag ${item.type}">${tagBadge} →</span>
                </li>
            `;
        });

        list.innerHTML = html;
        const activeElem = list.querySelector('.cmd-palette-item.active');
        if (activeElem) activeElem.scrollIntoView({ block: 'nearest' });
    }

    // 6. Navigation & Selection Controls
    function handleKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeIndex = (activeIndex + 1) % filteredItems.length;
                renderList();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
                renderList();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredItems[activeIndex]) {
                executeItem(filteredItems[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePalette();
        }
    }

    function executeItem(item) {
        closePalette();
        if (item.url) {
            window.location.href = item.url;
        }
    }

    window._cmdPaletteSelect = function (index) {
        if (filteredItems[index]) executeItem(filteredItems[index]);
    };

    function openPalette() {
        injectPaletteDOM();
        refreshSearchIndexes();
        const backdrop = document.getElementById('cmdPaletteBackdrop');
        const input = document.getElementById('cmdPaletteInput');

        input.value = '';
        filterAll('');
        backdrop.classList.add('open');
        setTimeout(() => input.focus(), 40);
    }

    function closePalette() {
        const backdrop = document.getElementById('cmdPaletteBackdrop');
        if (backdrop) backdrop.classList.remove('open');
    }

    // 7. Shortcut Listener (Cmd+K / Ctrl+K)
    window.addEventListener('keydown', function (e) {
        const isTrigger = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
        if (isTrigger) {
            e.preventDefault();
            const backdrop = document.getElementById('cmdPaletteBackdrop');
            if (backdrop && backdrop.classList.contains('open')) {
                closePalette();
            } else {
                openPalette();
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPaletteDOM);
    } else {
        injectPaletteDOM();
    }
})();