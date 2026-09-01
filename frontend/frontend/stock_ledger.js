document.addEventListener('DOMContentLoaded', () => {
    // Default to last 30 days
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setDate(today.getDate() - 30);

    document.getElementById('sl-to-date').value = today.toISOString().split('T')[0];
    document.getElementById('sl-from-date').value = lastMonth.toISOString().split('T')[0];

    loadItems();

    document.getElementById('sl-item-search').addEventListener('input', function() {
        const val = this.value;
        const options = document.getElementById('sl-item-list').options;
        document.getElementById('sl-item').value = '';
        for(let i = 0; i < options.length; i++) {
            if(options[i].value === val) {
                document.getElementById('sl-item').value = options[i].dataset.id;
                break;
            }
        }
        document.getElementById('sl-item').dispatchEvent(new Event('change'));
    });

    document.getElementById('sl-item').addEventListener('change', function() {
        const selectedId = this.value;
        const detailsRow = document.getElementById('itemDetailsRow');
        if(!selectedId) {
            detailsRow.style.display = 'none';
            return;
        }
        const item = allItems.find(i => i.id === selectedId);
        if(item) {
            document.getElementById('lbl-itemCode').textContent = item.itemCode || '-';
            document.getElementById('lbl-indexNo').textContent = item.indexNo || '-';
            document.getElementById('lbl-category').textContent = item.category || '-';
            document.getElementById('lbl-uom').textContent = item.uom || '-';
            detailsRow.style.display = 'flex';
        } else {
            detailsRow.style.display = 'none';
        }
    });
});

let allItems = [];

async function loadItems() {
    try {
        let items = [];
        if (typeof apiClient !== 'undefined' && apiClient.getItems) {
            items = await apiClient.getItems();
            if (!items || items.length === 0) {
                items = JSON.parse(localStorage.getItem('items')) || [];
            }
        } else {
            items = JSON.parse(localStorage.getItem('items')) || [];
        }

        allItems = items;
        const itemSelect = document.getElementById('sl-item-list');
        allItems.forEach(item => {
            const opt = document.createElement('option');
            opt.value = `${item.name} ${item.itemCode ? '[' + item.itemCode + ']' : ''}`;
            opt.dataset.id = item.id;
            itemSelect.appendChild(opt);
        });
    } catch (error) {
        console.error("Error loading items:", error);
    }
}

async function generateLedger() {
    const itemId = document.getElementById('sl-item').value;
    const fromDateStr = document.getElementById('sl-from-date').value;
    const toDateStr = document.getElementById('sl-to-date').value;
    const refSearch = (document.getElementById('sl-ref-search') ? document.getElementById('sl-ref-search').value.toLowerCase().trim() : '');
    const typeFilter = document.getElementById('sl-type-filter') ? document.getElementById('sl-type-filter').value : '';

    if (!itemId) return alert("Please select an item first.");

    let fromDate = fromDateStr ? new Date(fromDateStr).getTime() : 0;
    let toDate = toDateStr ? new Date(toDateStr) : new Date();
    toDate.setHours(23, 59, 59, 999);
    let toDateMs = toDate.getTime();

    // Fetch data
    let purchases = [];
    let invoices = [];

    if (typeof apiClient !== 'undefined') {
        if (apiClient.getPurchases) purchases = await apiClient.getPurchases();
        if (apiClient.getInvoices) invoices = await apiClient.getInvoices();
    }

    if (!purchases || purchases.length === 0) purchases = JSON.parse(localStorage.getItem('purchases')) || [];
    if (!invoices || invoices.length === 0) invoices = JSON.parse(localStorage.getItem('invoices')) || [];

    let ledgerEntries = [];
    let openingBalance = 0;

    // Process Purchases (IN)
    purchases.forEach(p => {
        if (p.itemId === itemId) {
            const pDateMs = new Date(p.date || p.createdAt).getTime();
            const qty = parseFloat(p.totalQty || p.qty) || 0;

            if (pDateMs < fromDate) {
                openingBalance += qty;
            } else if (pDateMs >= fromDate && pDateMs <= toDateMs) {
                let refText = p.supplierInv || '-';
                if (p.category === 'Quick Entry' || p.remarks === 'Quick Stock Journal') {
                    refText = p.remarks && p.remarks !== 'Quick Stock Journal' ? p.remarks : p.supplierInv;
                } else if (p.remarks && p.remarks !== 'Medicine Purchase') {
                    refText = p.supplierInv ? `${p.supplierInv} - ${p.remarks}` : p.remarks;
                }

                ledgerEntries.push({
                    date: p.date || p.createdAt.split('T')[0],
                    timestamp: pDateMs,
                    type: p.category === 'Quick Entry' ? 'Quick Stock IN' : 'Purchase / Entry',
                    ref: refText,
                    in: qty,
                    out: 0
                });
            }
        }
    });

    // Process Invoices (OUT)
    invoices.forEach(inv => {
        if (inv.items && Array.isArray(inv.items)) {
            inv.items.forEach(item => {
                if (item.itemId === itemId || item.medId === itemId) {
                    const invDateMs = new Date(inv.date || inv.invoice_date || inv.created_at).getTime();
                    const qty = parseFloat(item.qty) || 0;

                    if (invDateMs < fromDate) {
                        openingBalance -= qty;
                    } else if (invDateMs >= fromDate && invDateMs <= toDateMs) {
                        let refText = inv.invoice_no || '-';
                        if (inv.invoiceType === 'Quick Exit' || inv.remarks === 'Quick Stock Journal') {
                            refText = inv.remarks && inv.remarks !== 'Quick Stock Journal' ? inv.remarks : inv.invoice_no;
                        } else if (inv.remarks) {
                            refText = inv.invoice_no ? `${inv.invoice_no} - ${inv.remarks}` : inv.remarks;
                        }

                        ledgerEntries.push({
                            date: inv.date || inv.invoice_date || inv.created_at.split('T')[0],
                            timestamp: invDateMs,
                            type: inv.invoiceType === 'Quick Exit' ? 'Quick Stock OUT' : 'Invoice / Exit',
                            ref: refText,
                            in: 0,
                            out: qty
                        });
                    }
                }
            });
        }
    });

    // Sort entries chronologically
    ledgerEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate Running Balance
    let currentBalance = openingBalance;
    ledgerEntries.forEach(entry => {
        currentBalance += entry.in;
        currentBalance -= entry.out;
        entry.runningBalance = currentBalance;
    });

    // Apply search filter if any
    let displayEntries = ledgerEntries;
    if (refSearch) {
        displayEntries = displayEntries.filter(e => 
            (e.ref && e.ref.toLowerCase().includes(refSearch)) || 
            (e.type && e.type.toLowerCase().includes(refSearch))
        );
    }
    if (typeFilter === 'IN') {
        displayEntries = displayEntries.filter(e => e.in > 0);
    } else if (typeFilter === 'OUT') {
        displayEntries = displayEntries.filter(e => e.out > 0);
    }

    renderLedgerTable(displayEntries, openingBalance, refSearch !== '' || typeFilter !== '');
}

function renderLedgerTable(entries, openingBalance, isFiltered) {
    const tbody = document.querySelector('#ledger-table tbody');
    tbody.innerHTML = '';

    if (entries.length === 0 && openingBalance === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No transactions found for the selected period.</td></tr>`;
        return;
    }

    // Render Opening Balance Row
    if (!isFiltered) {
        const trOp = document.createElement('tr');
        trOp.classList.add('table-secondary');
        trOp.innerHTML = `
            <td colspan="3" class="text-end fw-bold">Opening Balance:</td>
            <td>-</td>
            <td>-</td>
            <td class="fw-bold">${openingBalance.toFixed(2)}</td>
        `;
        tbody.appendChild(trOp);
    }

    let totalIn = 0;
    let totalOut = 0;
    let finalBalance = openingBalance;

    // Render Transaction Rows
    entries.forEach(entry => {
        totalIn += entry.in;
        totalOut += entry.out;
        finalBalance = entry.runningBalance !== undefined ? entry.runningBalance : finalBalance;

        const inHtml = entry.in > 0 ? `<span class="text-success fw-bold">+${entry.in.toFixed(2)}</span>` : '-';
        const outHtml = entry.out > 0 ? `<span class="text-danger fw-bold">-${entry.out.toFixed(2)}</span>` : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${entry.date}</td>
            <td>${entry.type}</td>
            <td>${entry.ref}</td>
            <td>${inHtml}</td>
            <td>${outHtml}</td>
            <td class="fw-bold">${entry.runningBalance.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Render Closing Balance / Totals Row
    const trCl = document.createElement('tr');
    trCl.classList.add('table-dark');
    if (isFiltered) {
        trCl.innerHTML = `
            <td colspan="3" class="text-end fw-bold">Filtered Totals:</td>
            <td class="text-success fw-bold">${totalIn.toFixed(2)}</td>
            <td class="text-danger fw-bold">${totalOut.toFixed(2)}</td>
            <td class="fw-bold fs-5">-</td>
        `;
    } else {
        trCl.innerHTML = `
            <td colspan="3" class="text-end fw-bold">Totals / Closing Balance:</td>
            <td class="text-success fw-bold">${totalIn.toFixed(2)}</td>
            <td class="text-danger fw-bold">${totalOut.toFixed(2)}</td>
            <td class="fw-bold fs-5">${finalBalance.toFixed(2)}</td>
        `;
    }
    tbody.appendChild(trCl);
}