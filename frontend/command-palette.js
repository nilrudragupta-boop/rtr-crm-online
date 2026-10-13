(function () {
    // 1. Static Module Routes mapped to UI_PERMISSION_REGISTRY IDs
    const SYSTEM_MODULES = [
        { id: 'mod-quickentry', title: 'Quick Daily Entry', group: 'Modules', type: 'module', icon: '⚡', url: 'quick_entry.html', permission: 'perm_quick_entry' },
        { id: 'mod-smartinvoice', title: 'Smart Invoices', group: 'Modules', type: 'module', icon: '🧾', url: 'invoice.html', permission: 'perm_make_invoice' },
        { id: 'mod-regularinvoice', title: 'Invoice', group: 'Modules', type: 'module', icon: '🧾', url: 'invoiceB.html', permission: 'perm_regular_invoice' },
        { id: 'mod-kitchen', title: 'Restaurant POS', group: 'Modules', type: 'module', icon: '🍽️', url: 'restaurant_pos.html', permission: 'perm_restaurant_pos' },
        { id: 'mod-kitchen', title: 'Kitchen Display (KDS)', group: 'Modules', type: 'module', icon: '🥘', url: 'restaurant_kds.html', permission: 'perm_restaurant_kds' },
        { id: 'mod-quotation', title: 'Quotations', group: 'Modules', type: 'module', icon: '📝', url: 'quotation.html', permission: 'perm_quotation' },
        { id: 'mod-business360', title: 'Business 360°', group: 'Modules', type: 'module', icon: '🌐', url: 'business360.html', permission: 'perm_business360' },
        { id: 'mod-crm', title: 'CRM v2 Dashboard', group: 'Modules', type: 'module', icon: '📊', url: 'crm_v2.html', permission: 'perm_crm_v2' },
        { id: 'mod-enquiry', title: 'Enquiry Management', group: 'Modules', type: 'module', icon: '🎯', url: 'enquiry.html', permission: 'perm_enquiry' },
        { id: 'mod-customer', title: 'Customers', group: 'Modules', type: 'module', icon: '👥', url: 'customer.html', permission: 'perm_manage_customers' },
        { id: 'mod-contacts', title: 'Contacts Directory', group: 'Modules', type: 'module', icon: '📞', url: 'contacts.html', permission: 'perm_manage_contacts' },
        { id: 'mod-supplier', title: 'Suppliers', group: 'Modules', type: 'module', icon: '🚚', url: 'supplier.html', permission: 'perm_supplier' },
        { id: 'mod-item', title: 'Items', group: 'Modules', type: 'module', icon: '📦', url: 'item.html', permission: 'perm_manage_items' },
        { id: 'mod-purchase', title: 'Purchase', group: 'Modules', type: 'module', icon: '🛒', url: 'purchase.html', permission: 'perm_purchase_entries' },
        { id: 'mod-stockjournal', title: 'Stock Entry & Exit', group: 'Modules', type: 'module', icon: '🔄', url: 'stock_journal.html', permission: 'perm_stock_journal' },
        { id: 'mod-bom', title: 'Bill of Materials', group: 'Modules', type: 'module', icon: '⚙️', url: 'bom.html', permission: 'perm_manage_bom' },
        { id: 'mod-production', title: 'Production Entry', group: 'Modules', type: 'module', icon: '🛠️', url: 'production.html', permission: 'perm_production_entry' },
        { id: 'mod-order', title: 'Order Sheet', group: 'Modules', type: 'module', icon: '📑', url: 'order-sheet.html', permission: 'perm_order_sheet' },
        { id: 'mod-expense', title: 'Expense Manager', group: 'Modules', type: 'module', icon: '💸', url: 'expense.html', permission: 'perm_expense_manager' },
        { id: 'mod-medicine', title: 'Medicine Depts', group: 'Modules', type: 'module', icon: '💊', url: 'dashboardD.html', permission: 'perm_medicine_depts' },
        { id: 'mod-return', title: 'Returns', group: 'Modules', type: 'module', icon: '↩️', url: 'return.html', permission: 'perm_return_management' },
        { id: 'mod-creditdebit', title: 'Credit/Debit Notes', group: 'Modules', type: 'module', icon: '💳', url: 'credit_debit_notes.html', permission: 'perm_credit_debit_notes' },
        { id: 'mod-banking', title: 'Banking', group: 'Modules', type: 'module', icon: '🧾', url: 'banking.html', permission: 'perm_banking' },
        { id: 'mod-journalvoucher', title: 'Journal Voucher', group: 'Modules', type: 'module', icon: '📒', url: 'journal_voucher.html', permission: 'perm_journal_voucher' },
        { id: 'mod-reminder', title: 'Reminders', group: 'Modules', type: 'module', icon: '🧾', url: 'reminder.html', permission: 'perm_reminder' },
        { id: 'mod-followup', title: 'Follow-Ups', group: 'Modules', type: 'module', icon: '📅', url: 'follow_up.html', permission: 'perm_follow_up' },
        { id: 'mod-employee', title: 'Employees', group: 'Modules', type: 'module', icon: '👥', url: 'employee.html', permission: 'perm_employee_manager' },
        { id: 'mod-custom', title: 'Custom Sheet', group: 'Modules', type: 'module', icon: '📋', url: 'custom_dash.html', permission: 'perm_custom_sheet' },
        { id: 'mod-invoicereport', title: 'Invoice Report', group: 'Modules', type: 'module', icon: '🧾', url: 'report.html', permission: 'perm_invoice_report' },        
        { id: 'mod-stockreport', title: 'Stock Report', group: 'Modules', type: 'module', icon: '📦', url: 'stock_report.html', permission: 'perm_stock_report' },
        { id: 'mod-stockledger', title: 'Stock Ledger', group: 'Modules', type: 'module', icon: '📒', url: 'stock_ledger.html', permission: 'perm_stock_ledger' },
        { id: 'mod-productionstockreport', title: 'Production Stock Report', group: 'Modules', type: 'module', icon: '📦', url: 'production_stock_report.html', permission: 'perm_production_stock_report' },
        { id: 'mod-productionreport', title: 'Production Report', group: 'Modules', type: 'module', icon: '📦', url: 'production_report.html', permission: 'perm_production_report' },
        { id: 'mod-ledger', title: 'Account Ledger', group: 'Modules', type: 'module', icon: '⚖️', url: 'ledger.html', permission: 'perm_ledger_report' },
        { id: 'mod-profitloss', title: 'Profit & Loss', group: 'Modules', type: 'module', icon: '⚖️', url: 'profit_loss_report.html', permission: 'perm_profit_loss' },
        { id: 'mod-balancesheet', title: 'Balance Sheet', group: 'Modules', type: 'module', icon: '📈', url: 'balance_sheet.html', permission: 'perm_balance_sheet' },
        { id: 'mod-cashflow', title: 'Cash Flow Statement', group: 'Modules', type: 'module', icon: '💵', url: 'cash_flow.html', permission: 'perm_cash_flow' },        
        { id: 'mod-gst', title: 'GST Return Report', group: 'Modules', type: 'module', icon: '📑', url: 'gst_return_report.html', permission: 'perm_gst_report' },
        { id: 'mod-dataanalysis', title: 'Data Analysis', group: 'System', type: 'action', icon: '📊', url: 'data_analysis.html', permission: 'perm_data_analysis' },
        { id: 'mod-invoicealysis', title: 'Invoice Analytics', group: 'System', type: 'action', icon: '📊', url: 'invoice_dashboard.html', permission: 'perm_invoice_analytics' },
        { id: 'mod-purchasealysis', title: 'Purchase Analytics', group: 'System', type: 'action', icon: '📊', url: 'purchase_dashboard.html', permission: 'perm_purchase_analytics' },
        { id: 'mod-marketingreport', title: 'Marketing Report', group: 'Modules', type: 'module', icon: '📑', url: 'marketing_report.html', permission: 'perm_marketing_report' },
        { id: 'mod-chatter', title: 'Team Chatter', group: 'Modules', type: 'module', icon: '📖', url: 'chatter.html', permission: 'perm_chatter' },
        { id: 'mod-email', title: 'Email Sender', group: 'Modules', type: 'module', icon: '📖', url: 'email.html', permission: 'perm_email_sender' },
        { id: 'mod-imagetotext', title: 'PDF to Text', group: 'Modules', type: 'module', icon: '📖', url: 'image_to_text.html', permission: 'perm_image_to_text' },
        { id: 'mod-pdf', title: 'RTR PDF Studio', group: 'Tools', type: 'action', icon: '🖨️', url: 'rtr_pdf_studio.html', permission: 'perm_rtr_pdf_studio' },
        { id: 'mod-daybook', title: 'Day Book', group: 'Modules', type: 'module', icon: '📖', url: 'day_book.html', permission: 'perm_day_book' }
    ];

    // Permission Verification Engine matching settings.js
    function hasModulePermission(permId) {
        if (!permId) return true;

        // 1. If settings.js is loaded, use its native functions
        if (typeof getUIPermissions === 'function') {
            const userPerms = getUIPermissions();
            if (userPerms && userPerms[permId] === false) return false;

            if (typeof FeatureManager !== 'undefined' && typeof FeatureManager.getFlags === 'function' && typeof UI_PERMISSION_REGISTRY !== 'undefined') {
                const flags = FeatureManager.getFlags();
                const permDef = UI_PERMISSION_REGISTRY.find(p => p.id === permId);
                if (permDef && permDef.feature && flags[permDef.feature] === false) {
                    return false;
                }
            }
            return true;
        }

        // 2. Fallback directly to localStorage if settings.js is not present on the current page
        const currentUser = localStorage.getItem('currentUser') || 'admin';
        try {
            // Check remote permissions first (enforced in settings.js)
            const remoteStr = localStorage.getItem(`remotePermissions_${currentUser}`);
            if (remoteStr) {
                const remote = JSON.parse(remoteStr);
                if (remote[permId] === false) return false;
            }

            // Check user-specific or legacy permissions
            const userPermStr = localStorage.getItem(`ui_permissions_${currentUser}`) || localStorage.getItem('ui_permissions');
            if (userPermStr) {
                const perms = JSON.parse(userPermStr);
                if (perms[permId] === false) return false;
            }
        } catch (e) {
            console.error('[CommandPalette] Error validating permissions:', e);
        }

        return true;
    }

    // Returns only modules the user has active permission to access
    function getAllowedModules() {
        return SYSTEM_MODULES.filter(mod => hasModulePermission(mod.permission));
    }

    let dynamicCustomers = [];
    let dynamicInvoices = [];
    let activeIndex = 0;
    let filteredItems = [];
    let searchDebounce = null;

    // 2. Fetch or load customer and invoice index from Storage/API
    async function refreshSearchIndexes() {
        // Respect module permissions for search record types
        const canViewCustomers = hasModulePermission('perm_manage_customers');
        const canViewInvoices = hasModulePermission('perm_make_invoice');

        try {
            if (canViewCustomers) {
                const cachedCust = localStorage.getItem('rtr_customers') || localStorage.getItem('customers');
                if (cachedCust) dynamicCustomers = JSON.parse(cachedCust);
            } else {
                dynamicCustomers = [];
            }

            if (canViewInvoices) {
                const cachedInv = localStorage.getItem('rtr_invoices') || localStorage.getItem('invoices');
                if (cachedInv) dynamicInvoices = JSON.parse(cachedInv);
            } else {
                dynamicInvoices = [];
            }
        } catch (e) {
            console.warn('[CommandPalette] Local cache read skipped:', e);
        }

        // Fetch latest from backend API if online
        try {
            if (window.apiClient && typeof window.apiClient.get === 'function') {
                const promises = [];
                if (canViewCustomers) promises.push(window.apiClient.get('/api/customers'));
                if (canViewInvoices) promises.push(window.apiClient.get('/api/invoices'));

                const results = await Promise.allSettled(promises);
                let idx = 0;
                if (canViewCustomers && results[idx]?.status === 'fulfilled') {
                    dynamicCustomers = results[idx].value?.data || dynamicCustomers;
                    idx++;
                }
                if (canViewInvoices && results[idx]?.status === 'fulfilled') {
                    dynamicInvoices = results[idx].value?.data || dynamicInvoices;
                }
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

    // 4. Combined Search Filter: Filter only authorized routes & records
    function filterAll(query) {
        const q = (query || '').trim().toLowerCase();
        const allowedModules = getAllowedModules();

        if (!q) {
            filteredItems = [...allowedModules.slice(0, 8)];
            activeIndex = 0;
            renderList();
            return;
        }

        const results = [];

        // (A) Matches in Invoices (only if permitted)
        if (hasModulePermission('perm_make_invoice')) {
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
                        url: `report.html?id=${encodeURIComponent(inv.id || inv.invoice_no)}`
                    });
                }
            });
        }

        // (B) Matches in Customers (only if permitted)
        if (hasModulePermission('perm_manage_customers')) {
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
        }

        // (C) Matches in Allowed System Modules
        allowedModules.forEach(mod => {
            if (mod.title.toLowerCase().includes(q) || mod.group.toLowerCase().includes(q)) {
                results.push(mod);
            }
        });

        filteredItems = results.slice(0, 30);
        activeIndex = 0;
        renderList();
    }

    // 5. Render Modal Items
    function renderList() {
        const list = document.getElementById('cmdPaletteList');
        if (!list) return;

        if (filteredItems.length === 0) {
            list.innerHTML = `<li class="cmd-empty-state">No matching accessible modules, customers, or invoices found.</li>`;
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

    // 6. Navigation & Execution Guards
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
        // Enforce access permission guard before redirecting
        if (item.permission && !hasModulePermission(item.permission)) {
            alert('Access Denied: You do not have permission to access this module.');
            return;
        }

        closePalette();

        if (!item.url) return;

        // 1. If currently inside dashboardB with openWindow available, load via SPA
        if (typeof window.openWindow === 'function') {
            window.openWindow(item.url, 1200, 800);
            return;
        }

        // 2. If inside an iframe on dashboardB, tell the parent dashboard to open it in SPA mode
        if (window.parent && window.parent !== window && typeof window.parent.openWindow === 'function') {
            window.parent.openWindow(item.url, 1200, 800);
            return;
        }

        // 3. If on a standalone screen, route to dashboardB with the target SPA URL
        window.location.href = `dashboardB.html?spa=${encodeURIComponent(item.url)}`;
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

    // 7. Global Keyboard Shortcut Listener (Capture Phase Prevents Chrome Defaults)
    window.addEventListener('keydown', function (e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isModifier = isMac ? e.metaKey : e.ctrlKey;
        const key = e.key.toLowerCase();

        const isCmdK = isModifier && key === 'k';
        const isSlashShortcut = isModifier && key === '/';

        if (isCmdK || isSlashShortcut) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const backdrop = document.getElementById('cmdPaletteBackdrop');
            if (backdrop && backdrop.classList.contains('open')) {
                closePalette();
            } else {
                openPalette();
            }
            return false;
        }
    }, true);

    window.openCommandPalette = openPalette;
    window.closeCommandPalette = closePalette;

    document.addEventListener('DOMContentLoaded', () => {
        const keyBadge = document.getElementById('topbarShortcutKey');
        if (keyBadge && navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
            keyBadge.textContent = '⌘';
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPaletteDOM);
    } else {
        injectPaletteDOM();
    }
})();