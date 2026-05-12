document.addEventListener('DOMContentLoaded', () => {
    // Default to last 30 days
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setDate(today.getDate() - 30);

    document.getElementById('sl-to-date').value = today.toISOString().split('T')[0];
    document.getElementById('sl-from-date').value = lastMonth.toISOString().split('T')[0];

    loadItems();
});

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

        const itemSelect = document.getElementById('sl-item');
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} ${item.code ? '(' + item.code + ')' : ''}`;
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
                ledgerEntries.push({
                    date: p.date || p.createdAt.split('T')[0],
                    timestamp: pDateMs,
                    type: p.category === 'Quick Entry' ? 'Quick Stock IN' : 'Purchase / Entry',
                    ref: p.supplierInv || p.remarks || '-',
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
                        ledgerEntries.push({
                            date: inv.date || inv.invoice_date || inv.created_at.split('T')[0],
                            timestamp: invDateMs,
                            type: inv.invoiceType === 'Quick Exit' ? 'Quick Stock OUT' : 'Invoice / Exit',
                            ref: inv.invoice_no || inv.remarks || '-',
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

    // Calculate Running Balance and Render
    renderLedgerTable(ledgerEntries, openingBalance);
}

function renderLedgerTable(entries, openingBalance) {
    const tbody = document.querySelector('#ledger-table tbody');
    tbody.innerHTML = '';

    if (entries.length === 0 && openingBalance === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No transactions found for the selected period.</td></tr>`;
        return;
    }

    let runningBalance = openingBalance;

    // Render Opening Balance Row
    const trOp = document.createElement('tr');
    trOp.classList.add('table-secondary');
    trOp.innerHTML = `
        <td colspan="3" class="text-end fw-bold">Opening Balance:</td>
        <td>-</td>
        <td>-</td>
        <td class="fw-bold">${runningBalance.toFixed(2)}</td>
    `;
    tbody.appendChild(trOp);

    let totalIn = 0;
    let totalOut = 0;

    // Render Transaction Rows
    entries.forEach(entry => {
        runningBalance += entry.in;
        runningBalance -= entry.out;
        totalIn += entry.in;
        totalOut += entry.out;

        const inHtml = entry.in > 0 ? `<span class="text-success fw-bold">+${entry.in.toFixed(2)}</span>` : '-';
        const outHtml = entry.out > 0 ? `<span class="text-danger fw-bold">-${entry.out.toFixed(2)}</span>` : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${entry.date}</td>
            <td>${entry.type}</td>
            <td>${entry.ref}</td>
            <td>${inHtml}</td>
            <td>${outHtml}</td>
            <td class="fw-bold">${runningBalance.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Render Closing Balance / Totals Row
    const trCl = document.createElement('tr');
    trCl.classList.add('table-dark');
    trCl.innerHTML = `
        <td colspan="3" class="text-end fw-bold">Totals / Closing Balance:</td>
        <td class="text-success fw-bold">${totalIn.toFixed(2)}</td>
        <td class="text-danger fw-bold">${totalOut.toFixed(2)}</td>
        <td class="fw-bold fs-5">${runningBalance.toFixed(2)}</td>
    `;
    tbody.appendChild(trCl);
}