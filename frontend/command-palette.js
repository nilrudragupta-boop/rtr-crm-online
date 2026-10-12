(function () {
    // 1. Module Registry mapped to your software routes
    const COMMAND_ITEMS = [
        // Navigation: Sales & CRM
        { id: 'crm', title: 'CRM v2 Dashboard', group: 'Navigation', icon: '📊', url: 'crm_v2.html' },
        { id: 'enquiry', title: 'Lead Enquiries & Follow Up', group: 'Navigation', icon: '🎯', url: 'enquiry.html' },
        { id: 'followup', title: 'Follow-Up Schedule', group: 'Navigation', icon: '📅', url: 'follow_up.html' },
        { id: 'customers', title: 'Customer Directory', group: 'Navigation', icon: '👥', url: 'customer.html' },
        { id: 'contacts', title: 'Contacts Directory', group: 'Navigation', icon: '📇', url: 'contacts.html' },

        // Navigation: Finance & Accounts
        { id: 'invoice', title: 'Invoices & Billing', group: 'Navigation', icon: '🧾', url: 'invoice.html' },
        { id: 'daybook', title: 'Day Book', group: 'Navigation', icon: '📖', url: 'day_book.html' },
        { id: 'ledger', title: 'Account Ledger', group: 'Navigation', icon: '⚖️', url: 'ledger.html' },
        { id: 'balancesheet', title: 'Balance Sheet', group: 'Navigation', icon: '📈', url: 'balance_sheet.html' },
        { id: 'cashflow', title: 'Cash Flow Statement', group: 'Navigation', icon: '💵', url: 'cash_flow.html' },
        { id: 'gst', title: 'GST Return Report', group: 'Navigation', icon: '📑', url: 'gst_return_report.html' },

        // Navigation: Operations & Production
        { id: 'purchase', title: 'Purchase Orders & Bills', group: 'Navigation', icon: '🛒', url: 'purchase.html' },
        { id: 'stockreport', title: 'Stock Report & Inventory', group: 'Navigation', icon: '📦', url: 'stock_report.html' },
        { id: 'stockjournal', title: 'Stock Journal', group: 'Navigation', icon: '🔄', url: 'stock_journal.html' },
        { id: 'production', title: 'Production Management', group: 'Navigation', icon: '🏭', url: 'production.html' },
        { id: 'bom', title: 'Bill of Materials (BOM)', group: 'Navigation', icon: '⚙️', url: 'bom.html' },

        // Actions
        { id: 'act-new-invoice', title: 'Create New Invoice', group: 'Quick Actions', icon: '➕', action: () => { window.location.href = 'invoice.html?action=new'; } },
        { id: 'act-new-enquiry', title: 'Add New Lead / Enquiry', group: 'Quick Actions', icon: '➕', action: () => { window.location.href = 'enquiry.html?action=new'; } },
        { id: 'act-pdf-studio', title: 'Open RTR PDF Studio', group: 'Tools', icon: '🖨️', url: 'rtr_pdf_studio.html' },
        { id: 'act-print-cheque', title: 'Print Cheque', group: 'Tools', icon: '✍️', url: 'cheque_print.html' },
        { id: 'act-chatter', title: 'Internal Chatter / Feed', group: 'Tools', icon: '💬', url: 'chatter.html' },
        { id: 'act-settings', title: 'System Settings', group: 'System', icon: '⚙️', url: 'settings.html' }
    ];

    let activeIndex = 0;
    let filteredItems = [...COMMAND_ITEMS];

    // 2. Inject DOM into the current document
    function injectCommandPaletteDOM() {
        if (document.getElementById('cmdPaletteBackdrop')) return;

        const html = `
            <div id="cmdPaletteBackdrop" class="cmd-palette-backdrop">
                <div class="cmd-palette-modal" onclick="event.stopPropagation()">
                    <div class="cmd-palette-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" id="cmdPaletteInput" class="cmd-palette-input" placeholder="Type a module or action... (e.g., Invoice, Ledger, Lead)" autocomplete="off" />
                        <span class="cmd-palette-badge">ESC to close</span>
                    </div>
                    <ul id="cmdPaletteList" class="cmd-palette-list"></ul>
                    <div class="cmd-palette-footer">
                        <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
                        <span><kbd>↵</kbd> Select</span>
                        <span><kbd>ESC</kbd> Close</span>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Bind clicks on backdrop to close
        document.getElementById('cmdPaletteBackdrop').addEventListener('click', closeCommandPalette);

        // Bind search input filtering
        const input = document.getElementById('cmdPaletteInput');
        input.addEventListener('input', (e) => {
            filterItems(e.target.value);
        });

        // Keydown handling inside input
        input.addEventListener('keydown', handleKeyNavigation);
    }

    // 3. Render items
    function renderItems() {
        const list = document.getElementById('cmdPaletteList');
        if (!list) return;

        if (filteredItems.length === 0) {
            list.innerHTML = `<li style="padding: 24px; text-align: center; color: #94a3b8; font-size: 14px;">No matching modules or actions found.</li>`;
            return;
        }

        let html = '';
        let lastGroup = null;

        filteredItems.forEach((item, index) => {
            if (item.group !== lastGroup) {
                lastGroup = item.group;
                html += `<div class="cmd-group-label">${lastGroup}</div>`;
            }
            const isActive = index === activeIndex ? 'active' : '';
            html += `
                <li class="cmd-palette-item ${isActive}" data-index="${index}" onclick="window._executeCmdPaletteItem(${index})">
                    <div class="cmd-palette-item-left">
                        <span>${item.icon}</span>
                        <span>${item.title}</span>
                    </div>
                    <span class="cmd-item-shortcut">Jump →</span>
                </li>
            `;
        });

        list.innerHTML = html;
        scrollActiveIntoView();
    }

    function scrollActiveIntoView() {
        const activeElem = document.querySelector('.cmd-palette-item.active');
        if (activeElem) {
            activeElem.scrollIntoView({ block: 'nearest' });
        }
    }

    // 4. Filtering logic
    function filterItems(query) {
        const q = query.trim().toLowerCase();
        if (!q) {
            filteredItems = [...COMMAND_ITEMS];
        } else {
            filteredItems = COMMAND_ITEMS.filter(item => 
                item.title.toLowerCase().includes(q) || 
                item.group.toLowerCase().includes(q)
            );
        }
        activeIndex = 0;
        renderItems();
    }

    // 5. Keyboard Navigation & Execution
    function handleKeyNavigation(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeIndex = (activeIndex + 1) % filteredItems.length;
                renderItems();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
                renderItems();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredItems[activeIndex]) {
                executeItem(filteredItems[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeCommandPalette();
        }
    }

    function executeItem(item) {
        closeCommandPalette();
        if (item.action) {
            item.action();
        } else if (item.url) {
            window.location.href = item.url;
        }
    }

    window._executeCmdPaletteItem = function (index) {
        if (filteredItems[index]) {
            executeItem(filteredItems[index]);
        }
    };

    // 6. Open / Close controls
    function openCommandPalette() {
        injectCommandPaletteDOM();
        const backdrop = document.getElementById('cmdPaletteBackdrop');
        const input = document.getElementById('cmdPaletteInput');
        
        filteredItems = [...COMMAND_ITEMS];
        activeIndex = 0;
        input.value = '';
        renderItems();

        backdrop.classList.add('open');
        setTimeout(() => input.focus(), 50);
    }

    function closeCommandPalette() {
        const backdrop = document.getElementById('cmdPaletteBackdrop');
        if (backdrop) {
            backdrop.classList.remove('open');
        }
    }

    // 7. Global Keyboard Shortcut Listener (Cmd+K / Ctrl+K)
    window.addEventListener('keydown', function (e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isTrigger = isMac ? (e.metaKey && e.key.toLowerCase() === 'k') : (e.ctrlKey && e.key.toLowerCase() === 'k');

        if (isTrigger) {
            e.preventDefault();
            const backdrop = document.getElementById('cmdPaletteBackdrop');
            if (backdrop && backdrop.classList.contains('open')) {
                closeCommandPalette();
            } else {
                openCommandPalette();
            }
        }
    });

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCommandPaletteDOM);
    } else {
        injectCommandPaletteDOM();
    }
})();