document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    document.getElementById('sj-date').value = new Date().toISOString().split('T')[0];
    loadItems();

    const transactionType = document.getElementById('sj-type');
    const cardHeader = document.getElementById('sj-card-header');
    const headerIcon = document.getElementById('sj-header-icon');
    const headerTitle = document.getElementById('sj-header-title');
    const modeBadge = document.getElementById('sj-mode-badge');
    const quantityInput = document.getElementById('sj-qty');

    function updateTransactionTypeColors() {
        const color = transactionType.value === 'IN' ? 'success'
            : transactionType.value === 'OUT' ? 'danger'
                : null;

        cardHeader.classList.remove('bg-primary', 'bg-success', 'bg-danger');
        transactionType.classList.remove('text-success', 'text-danger', 'border-success', 'border-danger');
        quantityInput.classList.remove('text-success', 'text-danger');
        transactionType.classList.remove('fw-bold');
        quantityInput.classList.remove('fw-bold');
        quantityInput.style.removeProperty('font-size');

        if (!color) {
            cardHeader.classList.add('bg-primary');
            headerIcon.className = 'fas fa-exchange-alt';
            headerTitle.textContent = 'Quick Stock Entry & Exit';
            modeBadge.textContent = '';
            modeBadge.classList.add('d-none');
            return;
        }

        cardHeader.classList.add(`bg-${color}`);
        transactionType.classList.add(`text-${color}`, `border-${color}`, 'fw-bold');
        quantityInput.classList.add(`text-${color}`, 'fw-bold');
        quantityInput.style.fontSize = '16px';

        const isStockIn = transactionType.value === 'IN';
        headerIcon.className = `fas ${isStockIn ? 'fa-arrow-circle-down' : 'fa-arrow-circle-up'}`;
        headerTitle.textContent = isStockIn
            ? 'Stock IN (Inward Adjustment Entry)'
            : 'Stock OUT (Exit / Deduction Entry)';
        modeBadge.textContent = isStockIn ? 'Addition Mode' : 'Deduction Mode';
        modeBadge.classList.remove('d-none');
    }

    transactionType.addEventListener('change', updateTransactionTypeColors);
    updateTransactionTypeColors();

    document.getElementById('stockJournalForm').addEventListener('submit', function (e) {
        e.preventDefault();
        saveStockTransaction();
    });

    document.getElementById('sj-item-search').addEventListener('input', function() {
        const val = this.value;
        const options = document.getElementById('sj-item-list').options;
        document.getElementById('sj-item').value = '';
        for(let i = 0; i < options.length; i++) {
            if(options[i].value === val) {
                document.getElementById('sj-item').value = options[i].dataset.id;
                break;
            }
        }
        document.getElementById('sj-item').dispatchEvent(new Event('change'));
    });

    document.getElementById('sj-item').addEventListener('change', function() {
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
        let items = typeof apiClient !== 'undefined' && apiClient.getItems
            ? await apiClient.getItems()
            : null;
        if (!Array.isArray(items)) items = JSON.parse(localStorage.getItem('items') || '[]');
        allItems = items;

        await syncPendingStockTransactions();
        
        const itemSelect = document.getElementById('sj-item-list');
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

async function syncPendingStockTransactions() {
    if (typeof apiClient === 'undefined' || !apiClient.getStockJournal || !apiClient.saveStockJournal) return;

    const remoteRecords = await apiClient.getStockJournal();
    if (!Array.isArray(remoteRecords)) return;

    const remoteIds = new Set(remoteRecords.map(record => String(record.id)));
    const localRecords = JSON.parse(localStorage.getItem('stockJournal') || '[]');
    for (const record of localRecords) {
        if (remoteIds.has(String(record.id))) continue;
        const result = await apiClient.saveStockJournal(record);
        if (!result || result.success === false) {
            console.warn('A local stock journal record could not be synced:', record.id, result?.message);
        }
    }
}

async function saveStockTransaction() {
    const itemId = document.getElementById('sj-item').value;
    if (!itemId) return alert("Please select an item.");
    
    const selectedItem = allItems.find(i => i.id === itemId) || {};
    const itemName = selectedItem.name || document.getElementById('sj-item-search').value;
    const itemCode = selectedItem.itemCode || '';
    const indexNo = selectedItem.indexNo || '';
    const category = selectedItem.category || '';
    const uom = selectedItem.uom || '';
    const itemPrice = parseFloat(selectedItem.purchasePrice || selectedItem.price || selectedItem.salePrice || 0) || 0;

    const date = document.getElementById('sj-date').value;
    const type = document.getElementById('sj-type').value;
    const qty = parseFloat(document.getElementById('sj-qty').value);
    const remarks = document.getElementById('sj-remarks').value || 'Quick Stock Journal';
    
    const currentUser = localStorage.getItem('currentUser') || 'Admin';
    const transactionId = 'SJ-' + Date.now() + Math.random().toString(36).substr(2, 5);

    const journalRecord = {
        id: transactionId,
        type,
        date,
        itemId,
        itemName,
        itemCode,
        indexNo,
        category,
        uom,
        qty,
        price: itemPrice,
        amount: qty * itemPrice,
        remarks,
        createdBy: currentUser,
        createdAt: new Date().toISOString()
    };

    const localRecords = JSON.parse(localStorage.getItem('stockJournal') || '[]');
    localRecords.push(journalRecord);
    localStorage.setItem('stockJournal', JSON.stringify(localRecords));

    if (typeof apiClient !== 'undefined' && apiClient.saveStockJournal) {
        const result = await apiClient.saveStockJournal(journalRecord);
        if (!result || result.success === false) {
            return alert(`Could not sync stock transaction to the backend: ${result?.message || 'Connection unavailable'}. The record is saved on this device and will need to be synced.`);
        }
    }

    alert(`Stock ${type} recorded successfully!`);
    
    // Reset the form
    document.getElementById('sj-qty').value = '';
    document.getElementById('sj-remarks').value = '';
    document.getElementById('sj-item-search').value = '';
    document.getElementById('sj-item').value = '';
    document.getElementById('itemDetailsRow').style.display = 'none';
}
