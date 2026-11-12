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

    // Stock Ledger is sourced only from Stock Journal records. The dedicated
    // backend collection keeps this report independent from purchases/invoices.
    let stockJournal = typeof apiClient !== 'undefined' && apiClient.getStockJournal
        ? await apiClient.getStockJournal()
        : null;
    if (!Array.isArray(stockJournal)) stockJournal = JSON.parse(localStorage.getItem('stockJournal') || '[]');

    // Direct sale records are stored separately from stock journal records.
    // Include their item quantities as OUT movements so errors can be corrected
    // from the ledger and remain consistent with the shared sales backend.
    // The generic collection fetch returns null on a network failure and an
    // empty array when the shared backend has no active sales. That distinction
    // prevents deleted remote sales from being resurrected from an old cache.
    let sales = typeof apiClient !== 'undefined' && apiClient._getCollection
        ? await apiClient._getCollection('sales-records')
        : (typeof apiClient !== 'undefined' && apiClient.getSales ? await apiClient.getSales() : null);
    const localSales = JSON.parse(localStorage.getItem('sales_records') || '[]');
    if (!Array.isArray(sales)) sales = localSales;

    let ledgerEntries = [];
    let openingBalance = 0;

    // Journal IN and OUT both contribute to the ledger balance.
    stockJournal.forEach(record => {
        const type = String(record.type || '').toUpperCase();
        if (!['IN', 'OUT'].includes(type) || String(record.itemId) !== String(itemId)) return;
        const recordDate = record.date || record.createdAt;
        const recordDateMs = new Date(recordDate).getTime();
        const qty = parseFloat(record.qty) || 0;
        if (!qty || Number.isNaN(recordDateMs)) return;

        if (recordDateMs < fromDate) {
            openingBalance += type === 'IN' ? qty : -qty;
        } else if (recordDateMs <= toDateMs) {
            ledgerEntries.push({
                date: String(recordDate).split('T')[0],
                timestamp: recordDateMs,
                type: type === 'IN' ? 'Stock Journal IN' : 'Stock Journal OUT',
                ref: record.remarks || '-',
                in: type === 'IN' ? qty : 0,
                out: type === 'OUT' ? qty : 0
            });
        }
    });

    sales.forEach(sale => {
        const saleId = String(sale.invoiceNo || sale.invoice_no || sale.id || sale._id || '');
        const saleDate = sale.invoiceDate || sale.invoice_date || sale.date || sale.createdAt;
        const saleDateMs = new Date(saleDate).getTime();
        if (!saleId || Number.isNaN(saleDateMs) || !Array.isArray(sale.items)) return;

        sale.items.forEach(item => {
            if (String(item.itemId || item.item_id || '') !== String(itemId)) return;
            const qty = parseFloat(item.qty ?? item.quantity) || 0;
            if (!(qty > 0)) return;
            if (saleDateMs < fromDate) {
                openingBalance -= qty;
            } else if (saleDateMs <= toDateMs) {
                ledgerEntries.push({
                    date: String(saleDate).split('T')[0],
                    timestamp: saleDateMs,
                    type: 'Direct Sale OUT',
                    ref: `${saleId}${sale.customerName ? ` - ${sale.customerName}` : ''}${sale.remarks ? ` - ${sale.remarks}` : ''}`,
                    in: 0,
                    out: qty,
                    source: 'sale',
                    saleId
                });
            }
        });
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
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No transactions found for the selected period.</td></tr>`;
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
            <td>-</td>
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
            <td></td>
        `;
        if (entry.source === 'sale' || entry.saleId) {
            const actionsCell = tr.lastElementChild;
            const actionSelect = document.createElement('select');
            actionSelect.className = 'form-select form-select-sm';
            actionSelect.setAttribute('aria-label', `Actions for direct sale ${entry.saleId}`);
            actionSelect.style.minWidth = '100px';
            actionSelect.innerHTML = '<option value="">Action</option><option value="edit">Edit</option><option value="delete">Delete</option>';
            actionSelect.addEventListener('change', () => {
                const action = actionSelect.value;
                actionSelect.value = '';
                if (action === 'edit') editDirectSaleFromLedger(entry.saleId);
                if (action === 'delete') deleteDirectSaleFromLedger(entry.saleId);
            });
            actionsCell.appendChild(actionSelect);
        } else {
            tr.lastElementChild.textContent = '-';
        }
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
            <td>-</td>
        `;
    } else {
        trCl.innerHTML = `
            <td colspan="3" class="text-end fw-bold">Totals / Closing Balance:</td>
            <td class="text-success fw-bold">${totalIn.toFixed(2)}</td>
            <td class="text-danger fw-bold">${totalOut.toFixed(2)}</td>
            <td class="fw-bold fs-5">${finalBalance.toFixed(2)}</td>
            <td>-</td>
        `;
    }
    tbody.appendChild(trCl);
}

function editDirectSaleFromLedger(invoiceNo) {
    if (!invoiceNo) return alert('This sale has no invoice number and cannot be opened for editing.');
    window.location.href = `direct_sale.html?editInvoice=${encodeURIComponent(invoiceNo)}`;
}

async function deleteDirectSaleFromLedger(invoiceNo) {
    if (!invoiceNo) return alert('This sale has no invoice number and cannot be deleted from the ledger.');
    if (!confirm(`Delete direct sale ${invoiceNo}? This deletes the full invoice, including its other item lines.`)) return;

    if (typeof apiClient === 'undefined' || typeof apiClient.deleteSale !== 'function') {
        return alert('Remote sale deletion is unavailable. Please reconnect and try again.');
    }

    const result = await apiClient.deleteSale(invoiceNo);
    if (!result || result.success === false) {
        return alert(`Could not delete this sale from the shared backend: ${result?.message || 'Connection unavailable'}`);
    }

    const localSales = JSON.parse(localStorage.getItem('sales_records') || '[]');
    const updatedSales = localSales.filter(sale =>
        String(sale.invoiceNo || sale.invoice_no || sale.id || sale._id) !== String(invoiceNo)
    );
    localStorage.setItem('sales_records', JSON.stringify(updatedSales));
    await generateLedger();
}
