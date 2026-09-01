document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    document.getElementById('sj-date').value = new Date().toISOString().split('T')[0];
    loadItems();

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
        // Fetch items directly from localStorage or API (matching your architecture)
        const storedItems = localStorage.getItem('items');
        allItems = storedItems ? JSON.parse(storedItems) : [];
        
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

    if (type === 'IN') {
        // 1. Process as a "Purchase" for Stock Entry
        const purchaseRecord = {
            id: transactionId,
            date: date,
            supplierName: 'Self (Stock Entry)',
            supplierInv: 'ENTRY-' + Date.now(),
            itemId: itemId,
            itemName: itemName,
            itemCode: itemCode,
            indexNo: indexNo,
            category: category || 'Quick Entry',
            uom: uom,
            qty: qty,
            totalQty: qty,
            freeQty: 0,
            price: itemPrice,
            amount: qty * itemPrice,
            remarks: remarks,
            createdBy: currentUser,
            createdAt: new Date().toISOString()
        };

        let purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        purchases.push(purchaseRecord);
        localStorage.setItem('purchases', JSON.stringify(purchases));

        if (typeof apiClient !== 'undefined' && apiClient.savePurchase) {
            await apiClient.savePurchase(purchaseRecord);
        }

    } else if (type === 'OUT') {
        // 2. Process as an "Invoice" (or Consumption) for Stock Exit
        const invoiceRecord = {
            id: transactionId,
            invoice_no: 'EXIT-' + Date.now(),
            date: date,
            invoice_date: date,
            customer_name: 'Self (Stock Exit)',
            invoiceType: 'Quick Exit',
            remarks: remarks,
            items: [{
                itemId: itemId,
                item: itemName,
                itemName: itemName,
                itemCode: itemCode,
                indexNo: indexNo,
                category: category,
                uom: uom,
                qty: qty,
                price: itemPrice,
                rate: itemPrice,
                total: qty * itemPrice
            }],
            total: qty * itemPrice,
            createdBy: currentUser,
            created_at: new Date().toISOString()
        };

        let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        invoices.push(invoiceRecord);
        localStorage.setItem('invoices', JSON.stringify(invoices));

        if (typeof apiClient !== 'undefined' && apiClient.saveInvoice) {
            await apiClient.saveInvoice(invoiceRecord);
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