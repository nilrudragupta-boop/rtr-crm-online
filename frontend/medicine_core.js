const MedicineCore = {
    medicines: [],
    cart: [],
    purCart: [],
    heldBills: [],
    stockSort: { field: null, direction: 'asc' },
    masterSort: { field: null, direction: 'asc' },

    init: async function () {
        // Load medicines from backend API
        if (typeof apiClient !== 'undefined' && apiClient.getMedicines) {
            try {
                const remoteMeds = await apiClient.getMedicines();
                if (remoteMeds && remoteMeds.length > 0) {
                    this.medicines = remoteMeds;
                    localStorage.setItem('medicines', JSON.stringify(this.medicines));
                } else {
                    this.medicines = JSON.parse(localStorage.getItem('medicines')) || [];
                }
            } catch (error) {
                console.warn("Failed to fetch medicines from backend:", error);
                this.medicines = JSON.parse(localStorage.getItem('medicines')) || [];
            }
        } else {
            this.medicines = JSON.parse(localStorage.getItem('medicines')) || [];
        }

        this.heldBills = JSON.parse(localStorage.getItem('med_held_bills')) || [];

        this.renderDashboard();
        this.populateSelects();
        this.renderStock();
        this.renderPurCart();

        const saleInvInput = document.getElementById('sale-invoice-no');
        if (saleInvInput && !saleInvInput.value) saleInvInput.value = this.generateNextSaleInvoiceNo();
    },

    populateSelects: function () {
        const purMedSelect = document.getElementById('pur-med-select');
        const saleMedSelect = document.getElementById('sale-med-select');

        let opts = '<option value="">Select Medicine</option>';
        this.medicines.forEach(m => {
            opts += `<option value="${m.id}">${m.name} ${m.generic ? '(' + m.generic + ')' : ''}</option>`;
        });

        if (purMedSelect) purMedSelect.innerHTML = opts;
        if (saleMedSelect) saleMedSelect.innerHTML = opts;
    },

    renderDashboard: function () {
        if (!document.getElementById('dash-total-meds')) return;
        document.getElementById('dash-total-meds').innerText = this.medicines.length;

        // Basic logic for stats (mocked for now, assumes you have purchases/invoices)
        const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const today = new Date().toISOString().split('T')[0];

        let expiredCount = 0;
        let expiringSoonCount = 0;

        purchases.forEach(p => {
            if (p.expiryDate) {
                const expDate = new Date(p.expiryDate);
                const now = new Date();
                const diffTime = expDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) expiredCount++;
                else if (diffDays <= 90) expiringSoonCount++;
            }
        });

        document.getElementById('dash-expired').innerText = expiredCount;
        document.getElementById('dash-expiring-soon').innerText = expiringSoonCount;

        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        let todaySales = 0;
        invoices.forEach(inv => {
            if ((inv.invoice_date === today || inv.date === today) && inv.invoiceType === 'Medicine Sales') {
                todaySales += parseFloat(inv.invoice_total || inv.total) || 0;
            }
        });
        document.getElementById('dash-today-sales').innerText = `₹ ${todaySales.toFixed(2)}`;

        // Calculate Out of Stock items
        const stockMap = {};
        purchases.forEach(p => {
            if (p.category !== 'Medicine' && p.remarks !== 'Medicine Purchase') return;
            if (!stockMap[p.itemId]) stockMap[p.itemId] = 0;
            stockMap[p.itemId] += (parseFloat(p.totalQty) || parseFloat(p.qty) || 0);
        });

        invoices.forEach(inv => {
            if (inv.items) {
                inv.items.forEach(item => {
                    const iId = item.itemId || item.medId;
                    if (stockMap[iId] !== undefined) {
                        stockMap[iId] -= (parseFloat(item.qty) || 0);
                    }
                });
            }
        });

        const outOfStockCount = this.medicines.filter(m => (stockMap[m.id] || 0) <= 0).length;
        if (document.getElementById('dash-out-of-stock')) document.getElementById('dash-out-of-stock').innerText = outOfStockCount;

        this.renderExpiryAlertsTable(purchases);
    },

    renderExpiryAlertsTable: function (purchases) {
        const tbody = document.querySelector('#expiry-alert-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const alerts = [];
        purchases.forEach(p => {
            if (p.expiryDate && p.category === 'Medicine') {
                const expDate = new Date(p.expiryDate);
                const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
                if (diffDays <= 90) {
                    alerts.push({ ...p, daysLeft: diffDays });
                }
            }
        });

        alerts.sort((a, b) => a.daysLeft - b.daysLeft);

        if (alerts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#666;">No expiring items.</td></tr>`;
            return;
        }

        alerts.forEach(a => {
            let color = "var(--warning)";
            if (a.daysLeft <= 0) color = "var(--danger)";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${a.itemName}</td>
                <td>${a.batch}</td>
                <td>${a.expiryDate}</td>
                <td style="color:${color}; font-weight:bold;">${a.daysLeft <= 0 ? 'Expired' : a.daysLeft + ' Days'}</td>
                <td>${a.qty}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    showOutOfStock: function () {
        if (typeof switchView === 'function') switchView('stock');
        const filterSelect = document.getElementById('filter-stock-status');
        if (filterSelect) {
            filterSelect.value = 'Out of Stock';
            this.renderStock();
        }
    },

    showExpiredBatches: function () {
        if (typeof switchView === 'function') switchView('stock');
        const filterSelect = document.getElementById('filter-stock-status');
        if (filterSelect) {
            filterSelect.value = 'Expired';
            this.renderStock();
        }
    },

    renderMaster: function () {
        const tbody = document.querySelector('#master-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const search = (document.getElementById('search-master')?.value || '').toLowerCase();

        let filtered = this.medicines.filter(m =>
            (m.name || '').toLowerCase().includes(search) ||
            (m.generic || '').toLowerCase().includes(search) ||
            (m.manufacturer || '').toLowerCase().includes(search)
        );

        if (this.masterSort && this.masterSort.field === 'name') {
            filtered.sort((a, b) => {
                let nameA = (a.name || '').toLowerCase();
                let nameB = (b.name || '').toLowerCase();
                if (nameA < nameB) return this.masterSort.direction === 'asc' ? -1 : 1;
                if (nameA > nameB) return this.masterSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
            const icon = document.getElementById('sort-icon-master-name');
            if (icon) icon.className = this.masterSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        } else {
            const icon = document.getElementById('sort-icon-master-name');
            if (icon) icon.className = 'fas fa-sort';
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#666;">No medicines found.</td></tr>`;
        }

        // Calculate current stock levels for highlighting
        const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const stockMap = {};

        purchases.forEach(p => {
            if (p.category !== 'Medicine' && p.remarks !== 'Medicine Purchase') return;
            if (!stockMap[p.itemId]) stockMap[p.itemId] = 0;
            stockMap[p.itemId] += (parseFloat(p.totalQty) || parseFloat(p.qty) || 0);
        });

        invoices.forEach(inv => {
            if (inv.items) {
                inv.items.forEach(item => {
                    const iId = item.itemId || item.medId;
                    if (stockMap[iId] !== undefined) {
                        stockMap[iId] -= (parseFloat(item.qty) || 0);
                    }
                });
            }
        });

        filtered.forEach(m => {
            const tr = document.createElement('tr');

            const currentStock = stockMap[m.id] || 0;
            const alertQty = parseFloat(m.alertQty) || 10;

            if (currentStock <= 0) {
                tr.style.backgroundColor = '#ffe6e6';
            } else if (currentStock <= alertQty) {
                tr.style.backgroundColor = '#fff3cd';
            }

            const genericCellBg = !m.generic ? 'background-color: #f8d7da; color: #721c24;' : '';
            const hsnCellBg = !m.hsn ? 'background-color: #f8d7da; color: #721c24;' : '';
            const manufacturerCellBg = !m.manufacturer ? 'background-color: #f8d7da; color: #721c24;' : '';
            const categoryCellBg = !m.category ? 'background-color: #f8d7da; color: #721c24;' : '';
            const unitCellBg = !m.unit ? 'background-color: #f8d7da; color: #721c24;' : '';

            tr.innerHTML = `
                <td>${m.id}</td>
                <td><strong>${m.name}</strong></td>
                <td style="${genericCellBg}">${m.generic || 'Missing'}</td>
                <td style="${manufacturerCellBg}">${m.manufacturer || 'Missing'}</td>
                <td style="${categoryCellBg}">${m.category || 'Missing'}</td>
                <td style="${unitCellBg}">${m.unit || 'Missing'}</td>
                <td style="${hsnCellBg}">${m.hsn || 'Missing'}</td>
                <td>${m.rack || '-'}</td>
                <td>₹${(parseFloat(m.mrp) || 0).toFixed(2)}</td>
                <td>${m.alertQty || 10}</td>
                <td>
                    <select class="form-control" style="width: auto; padding: 4px 8px; cursor: pointer; display: inline-block;" onchange="if(this.value === 'edit') MedicineCore.editMedicine('${m.id}'); else if(this.value === 'delete') MedicineCore.deleteMedicine('${m.id}'); this.value='';">
                        <option value="">Action</option>
                        <option value="edit">Edit</option>
                        <option value="delete">Delete</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    saveMedicine: async function () {
        const name = document.getElementById('new-med-name').value.trim();
        if (!name) return alert("Medicine Name is required!");

        const newMed = {
            id: 'MED-' + Date.now(),
            name: name,
            generic: document.getElementById('new-med-generic').value,
            category: document.getElementById('new-med-cat').value,
            hsn: document.getElementById('new-med-hsn').value,
            manufacturer: document.getElementById('new-med-supplier').value,
            gst: document.getElementById('new-med-gst').value,
            unit: document.getElementById('new-med-unit').value,
            alertQty: document.getElementById('new-med-alert').value,
            rack: document.getElementById('new-med-loc').value,
            schedule: document.getElementById('new-med-schedule').value
        };

        this.medicines.push(newMed);
        localStorage.setItem('medicines', JSON.stringify(this.medicines));

        if (typeof apiClient !== 'undefined' && apiClient.saveMedicine) {
            try {
                await apiClient.saveMedicine(newMed);
            } catch (e) {
                console.warn("Backend sync failed", e);
            }
        }

        document.getElementById('modal-add-medicine').style.display = 'none';
        this.renderMaster();
        this.populateSelects();
        this.renderDashboard();

        // Clear inputs
        document.querySelectorAll('#modal-add-medicine input').forEach(el => el.value = '');
        document.querySelectorAll('#modal-add-medicine select').forEach(el => el.selectedIndex = 0);

        alert("Medicine added successfully!");
    },

    editMedicine: function (id) {
        const med = this.medicines.find(m => m.id === id);
        if (!med) return;

        document.getElementById('edit-med-id').value = med.id;
        document.getElementById('edit-med-name').value = med.name || '';
        document.getElementById('edit-med-generic').value = med.generic || '';
        document.getElementById('edit-med-hsn').value = med.hsn || '';
        document.getElementById('edit-med-gst').value = med.gst || '12';
        document.getElementById('edit-med-alert').value = med.alertQty || '10';
        document.getElementById('edit-med-schedule').value = med.schedule || 'OTC';

        if (typeof loadManufacturers === 'function') loadManufacturers();
        if (typeof loadCategories === 'function') loadCategories();
        if (typeof loadUnits === 'function') loadUnits();
        if (typeof loadRacks === 'function') loadRacks();

        document.getElementById('edit-med-cat').value = med.category || '';
        document.getElementById('edit-med-supplier').value = med.manufacturer || '';
        document.getElementById('edit-med-unit').value = med.unit || '';
        document.getElementById('edit-med-loc').value = med.rack || '';

        if (typeof openModal === 'function') openModal('modal-edit-medicine');
    },

    updateMedicine: async function () {
        const id = document.getElementById('edit-med-id').value;
        const name = document.getElementById('edit-med-name').value.trim();
        if (!name) return alert("Medicine Name is required!");

        const medIndex = this.medicines.findIndex(m => m.id === id);
        if (medIndex === -1) return alert("Medicine not found!");

        const updatedMed = {
            ...this.medicines[medIndex],
            name: name,
            generic: document.getElementById('edit-med-generic').value,
            category: document.getElementById('edit-med-cat').value,
            hsn: document.getElementById('edit-med-hsn').value,
            manufacturer: document.getElementById('edit-med-supplier').value,
            gst: document.getElementById('edit-med-gst').value,
            unit: document.getElementById('edit-med-unit').value,
            alertQty: document.getElementById('edit-med-alert').value,
            rack: document.getElementById('edit-med-loc').value,
            schedule: document.getElementById('edit-med-schedule').value
        };

        this.medicines[medIndex] = updatedMed;
        localStorage.setItem('medicines', JSON.stringify(this.medicines));

        if (typeof apiClient !== 'undefined' && apiClient.saveMedicine) {
            try { await apiClient.saveMedicine(updatedMed); } catch (e) { console.warn("Backend sync failed", e); }
        }

        if (typeof closeModal === 'function') closeModal('modal-edit-medicine');
        this.renderMaster();
        this.populateSelects();
        this.renderDashboard();
        this.renderStock();

        alert("Medicine updated successfully!");
    },

    deleteMedicine: async function (id) {
        if (!confirm("Are you sure you want to delete this medicine?")) return;

        this.medicines = this.medicines.filter(m => m.id !== id);
        localStorage.setItem('medicines', JSON.stringify(this.medicines));

        if (typeof apiClient !== 'undefined' && apiClient.deleteMedicine) {
            try {
                await apiClient.deleteMedicine(id);
            } catch (e) {
                console.warn("Backend sync failed", e);
            }
        }
        this.renderMaster();
        this.populateSelects();
        this.renderDashboard();
    },

    renderStock: function () {
        const tbody = document.querySelector('#stock-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const search = (document.getElementById('search-stock')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filter-stock-status')?.value || '';

        // Group purchases by medicine and batch to calculate available stock
        const stockMap = {};

        purchases.forEach(p => {
            if (p.category !== 'Medicine' && p.remarks !== 'Medicine Purchase') return;
            const key = p.itemId + '_' + p.batch;
            if (!stockMap[key]) {
                const med = this.medicines.find(m => m.id === p.itemId);
                stockMap[key] = {
                    id: p.itemId,
                    name: p.itemName,
                    manufacturer: med ? (med.manufacturer || '-') : '-',
                    batch: p.batch,
                    expiry: p.expiryDate,
                    supplier: p.supplierName || p.supplier || '-',
                    qty: 0,
                    purRate: parseFloat(p.price) || 0,
                    mrp: parseFloat(p.mrp) || 0
                };
            }
            stockMap[key].qty += (parseFloat(p.totalQty) || parseFloat(p.qty) || 0);
        });

        // Deduct Sales (Invoices) - Preparation for Sales Module
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        invoices.forEach(inv => {
            if (inv.items) {
                inv.items.forEach(item => {
                    const iId = item.itemId || item.medId;
                    const key = iId + '_' + item.batch;
                    if (stockMap[key]) {
                        stockMap[key].qty -= (parseFloat(item.qty) || 0);
                    }
                });
            }
        });

        let filtered = Object.values(stockMap).filter(s =>
            s.name.toLowerCase().includes(search) ||
            s.manufacturer.toLowerCase().includes(search) ||
            (s.batch && s.batch.toLowerCase().includes(search)) ||
            (s.supplier && s.supplier.toLowerCase().includes(search))
        );

        filtered = filtered.map(s => {
            let status = "In Stock";
            let color = "var(--success)";
            const med = this.medicines.find(m => m.id === s.id);
            const alertQty = med ? (parseFloat(med.alertQty) || 10) : 10;
            let isLowStock = false;

            if (s.qty <= 0) {
                status = "Out of Stock";
                color = "var(--danger)";
            } else {
                if (s.qty <= alertQty) {
                    status = "Low Stock";
                    color = "var(--warning)";
                    isLowStock = true;
                }
                if (s.expiry) {
                    const expDate = new Date(s.expiry);
                    const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 0) {
                        status = "Expired";
                        color = "var(--danger)";
                    } else if (diffDays <= 90) {
                        status = "Expiring Soon";
                        color = "var(--warning)";
                    }
                }
            }
            s.status = status;
            s.color = color;
            s.isLowStock = isLowStock;
            return s;
        });

        if (statusFilter) {
            if (statusFilter === 'In Stock') {
                // Broaden "In Stock" to include Low Stock and Expiring Soon items
                filtered = filtered.filter(s => s.qty > 0 && s.status !== 'Expired');
            } else {
                filtered = filtered.filter(s => s.status === statusFilter);
            }
        }

        // Reset sort icons
        const iconExpiry = document.getElementById('sort-icon-expiry');
        const iconName = document.getElementById('sort-icon-name');
        if (iconExpiry) iconExpiry.className = 'fas fa-sort';
        if (iconName) iconName.className = 'fas fa-sort';

        if (this.stockSort && this.stockSort.field === 'expiry') {
            filtered.sort((a, b) => {
                let dateA = a.expiry ? new Date(a.expiry).getTime() : 0;
                let dateB = b.expiry ? new Date(b.expiry).getTime() : 0;

                if (!a.expiry) dateA = this.stockSort.direction === 'asc' ? Infinity : -Infinity;
                if (!b.expiry) dateB = this.stockSort.direction === 'asc' ? Infinity : -Infinity;

                if (dateA < dateB) return this.stockSort.direction === 'asc' ? -1 : 1;
                if (dateA > dateB) return this.stockSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
            if (iconExpiry) iconExpiry.className = this.stockSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        } else if (this.stockSort && this.stockSort.field === 'name') {
            filtered.sort((a, b) => {
                let nameA = (a.name || '').toLowerCase();
                let nameB = (b.name || '').toLowerCase();
                if (nameA < nameB) return this.stockSort.direction === 'asc' ? -1 : 1;
                if (nameA > nameB) return this.stockSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
            if (iconName) iconName.className = this.stockSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#666;">No stock available.</td></tr>`;
            return;
        }

        filtered.forEach(s => {
            const tr = document.createElement('tr');

            if (s.qty <= 0) {
                tr.style.backgroundColor = '#ffe6e6';
            } else if (s.isLowStock) {
                tr.style.backgroundColor = '#fff3cd';
            }

            tr.innerHTML = `
                <td>${s.name}</td>
                <td>${s.manufacturer}</td>
                <td>${s.batch || '-'}</td>
                <td>${s.supplier}</td>
                <td>${s.expiry || '-'}</td>
                <td style="font-weight:bold;">${s.qty}</td>
                <td>₹${s.purRate.toFixed(2)}</td>
                <td>₹${s.mrp.toFixed(2)}</td>
                <td><span class="badge" style="background:${s.color}">${s.status}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding:4px 8px; font-size:12px;" onclick="editStock('${s.id}', '${s.batch || ''}')" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteStock('${s.id}', '${s.batch || ''}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    sortStockByExpiry: function () {
        if (this.stockSort.field === 'expiry') {
            this.stockSort.direction = this.stockSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.stockSort.field = 'expiry';
            this.stockSort.direction = 'asc';
        }
        this.renderStock();
    },

    sortStockByName: function () {
        if (this.stockSort.field === 'name') {
            this.stockSort.direction = this.stockSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.stockSort.field = 'name';
            this.stockSort.direction = 'asc';
        }
        this.renderStock();
    },

    sortMasterByName: function () {
        if (this.masterSort.field === 'name') {
            this.masterSort.direction = this.masterSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.masterSort.field = 'name';
            this.masterSort.direction = 'asc';
        }
        this.renderMaster();
    },

    renderLedger: function () {
        const tbody = document.querySelector('#ledger-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const searchStr = document.getElementById('ledger-customer-search')?.value.trim().toLowerCase() || '';
        const balElement = document.getElementById('ledger-balance');

        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const payments = JSON.parse(localStorage.getItem('med_payments')) || [];

        let allEntries = [];

        // 1. Add Sales (Debits)
        invoices.forEach(inv => {
            if (inv.invoiceType === 'Medicine Sales') {
                const custName = inv.customer_name || 'Walk-in';
                allEntries.push({
                    date: inv.invoice_date || inv.date,
                    customer: custName,
                    description: `Sale - Inv: ${inv.invoice_no}`,
                    type: 'Sale',
                    debit: parseFloat(inv.invoice_total || inv.total) || 0,
                    credit: 0
                });

                // If sale had paid amount directly at POS, log it as a receipt
                const paidAmt = parseFloat(inv.paid_amount) || 0;
                if (paidAmt > 0) {
                    allEntries.push({
                        date: inv.invoice_date || inv.date,
                        customer: custName,
                        description: `Payment at POS - Inv: ${inv.invoice_no}`,
                        type: 'Receipt',
                        debit: 0,
                        credit: paidAmt
                    });
                }
            }
        });

        // 2. Add Payments (Credits)
        payments.forEach(pay => {
            allEntries.push({
                date: pay.date,
                customer: pay.customer_name || 'Walk-in',
                description: `Receipt - ${pay.payment_mode} ${pay.remarks ? '(' + pay.remarks + ')' : ''}`,
                type: 'Receipt',
                debit: 0,
                credit: parseFloat(pay.amount) || 0
            });
        });

        // 3. Group by Customer to calculate running balances properly
        const entriesByCustomer = {};
        allEntries.forEach(entry => {
            if (!entriesByCustomer[entry.customer]) entriesByCustomer[entry.customer] = [];
            entriesByCustomer[entry.customer].push(entry);
        });

        let finalProcessedEntries = [];
        let totalDebit = 0;
        let totalCredit = 0;
        let overallBalance = 0;

        for (const cust in entriesByCustomer) {
            entriesByCustomer[cust].sort((a, b) => new Date(a.date) - new Date(b.date));
            let currentBal = 0;
            entriesByCustomer[cust].forEach(entry => {
                currentBal += (entry.debit - entry.credit);
                entry.runningBalance = currentBal;
                finalProcessedEntries.push(entry);
            });
        }

        // 4. Sort combined entries chronologically for rendering
        finalProcessedEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

        // 5. Apply Search Filter
        let filteredEntries = finalProcessedEntries;
        if (searchStr) {
            filteredEntries = finalProcessedEntries.filter(entry =>
                entry.customer.toLowerCase().includes(searchStr) ||
                entry.description.toLowerCase().includes(searchStr)
            );
        }

        if (filteredEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#666;">No ledger records found.</td></tr>`;
        } else {
            function highlightMatch(text, term) {
                if (!term) return text;
                const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedTerm})`, 'gi');
                return text.replace(regex, '<mark style="background-color: yellow; padding: 0;">$1</mark>');
            }

            filteredEntries.forEach(entry => {
                totalDebit += entry.debit;
                totalCredit += entry.credit;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${entry.date}</td>
                    <td>${highlightMatch(entry.customer, searchStr)}</td>
                    <td>${highlightMatch(entry.description, searchStr)}</td>
                    <td>${entry.type}</td>
                    <td style="color:var(--danger)">${entry.debit > 0 ? '₹' + entry.debit.toFixed(2) : '-'}</td>
                    <td style="color:var(--success)">${entry.credit > 0 ? '₹' + entry.credit.toFixed(2) : '-'}</td>
                    <td style="font-weight:bold;">₹${Math.abs(entry.runningBalance).toFixed(2)} ${entry.runningBalance > 0 ? '(Dr)' : (entry.runningBalance < 0 ? '(Cr)' : '')}</td>
                `;
                tbody.appendChild(tr);
            });

            overallBalance = totalDebit - totalCredit;

            const trTotal = document.createElement('tr');
            trTotal.style.fontWeight = 'bold';
            trTotal.style.backgroundColor = '#e9ecef';
            trTotal.innerHTML = `
                <td colspan="4" style="text-align:right;">Totals (Filtered):</td>
                <td style="color:var(--danger)">₹${totalDebit.toFixed(2)}</td>
                <td style="color:var(--success)">₹${totalCredit.toFixed(2)}</td>
                <td style="font-weight:bold;">₹${Math.abs(overallBalance).toFixed(2)} ${overallBalance > 0 ? '(Dr)' : (overallBalance < 0 ? '(Cr)' : '')}</td>
            `;
            tbody.appendChild(trTotal);
        }

        if (balElement) {
            if (overallBalance > 0) {
                balElement.innerText = `₹ ${overallBalance.toFixed(2)} (Dr / Due)`;
                balElement.style.color = 'var(--danger)';
            } else if (overallBalance < 0) {
                balElement.innerText = `₹ ${Math.abs(overallBalance).toFixed(2)} (Cr / Advance)`;
                balElement.style.color = 'var(--success)';
            } else {
                balElement.innerText = `₹ 0.00`;
                balElement.style.color = 'var(--primary)';
            }
        }
    },

    savePayment: async function () {
        const customer = document.getElementById('pay-customer').value.trim();
        const date = document.getElementById('pay-date').value;
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const mode = document.getElementById('pay-mode').value;
        const remarks = document.getElementById('pay-remarks').value.trim();

        if (!customer || !date || amount <= 0) {
            return alert("Customer, Date, and a valid Amount are required!");
        }

        const paymentRecord = {
            id: 'PAY-MED-' + Date.now(),
            date: date,
            customer_name: customer,
            amount: amount,
            payment_mode: mode,
            remarks: remarks,
            type: 'Receipt',
            created_at: new Date().toISOString()
        };

        let payments = JSON.parse(localStorage.getItem('med_payments')) || [];
        payments.push(paymentRecord);
        localStorage.setItem('med_payments', JSON.stringify(payments));

        if (typeof closeModal === 'function') closeModal('modal-payment');

        document.getElementById('pay-customer').value = '';
        document.getElementById('pay-amount').value = '';
        document.getElementById('pay-remarks').value = '';

        // Auto-refresh the ledger table
        const searchInput = document.getElementById('ledger-customer-search');
        if (searchInput) {
            searchInput.value = customer;
            this.renderLedger();
        }

        alert("Payment recorded successfully!");
    },

    renderReports: function () {
        const tbody = document.querySelector('#report-sales-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const search = (document.getElementById('search-reports')?.value || '').toLowerCase();
        const fromDateStr = document.getElementById('report-from-date')?.value;
        const toDateStr = document.getElementById('report-to-date')?.value;

        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];

        // Filter only Medicine Sales
        let medInvoices = invoices.filter(inv => inv.invoiceType === 'Medicine Sales');

        // Filter by Date Range if selected
        if (fromDateStr) {
            const fd = new Date(fromDateStr).getTime();
            medInvoices = medInvoices.filter(inv => new Date(inv.date || inv.created_at).getTime() >= fd);
        }

        if (toDateStr) {
            const td = new Date(toDateStr);
            td.setHours(23, 59, 59, 999); // Include the entire end day
            medInvoices = medInvoices.filter(inv => new Date(inv.date || inv.created_at).getTime() <= td.getTime());
        }

        // Sort by date descending (newest first)
        medInvoices.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        if (search) {
            medInvoices = medInvoices.filter(inv =>
                (inv.invoice_no || '').toLowerCase().includes(search) ||
                (inv.customer_name || '').toLowerCase().includes(search)
            );
        }

        if (medInvoices.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#666;">No sales invoices found.</td></tr>`;
            const totalEl = document.getElementById('report-grand-total');
            if (totalEl) totalEl.innerText = `₹0.00`;
            return;
        }

        let reportTotal = 0;

        medInvoices.forEach(inv => {
            const tr = document.createElement('tr');
            const itemsCount = inv.items ? inv.items.length : 0;
            const invTotal = parseFloat(inv.invoice_total || inv.total || 0);
            reportTotal += invTotal;

            tr.innerHTML = `
                <td>${inv.invoice_no}</td>
                <td>${inv.date}</td>
                <td>${inv.customer_name || 'Walk-in'}</td>
                <td>${itemsCount}</td>
                <td>₹${invTotal.toFixed(2)}</td>
                <td>
                    <select class="form-control" style="width: auto; padding: 4px 8px; cursor: pointer; display: inline-block;" onchange="if(this.value === 'print') MedicineCore.printInvoiceFromReport('${inv.id}'); else if(this.value === 'edit') MedicineCore.editInvoice('${inv.id}'); else if(this.value === 'delete') MedicineCore.deleteInvoice('${inv.id}'); this.value='';">
                        <option value="">Action</option>
                        <option value="print">Print</option>
                        <option value="edit">Edit</option>
                        <option value="delete">Delete</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const totalEl = document.getElementById('report-grand-total');
        if (totalEl) totalEl.innerText = `₹${reportTotal.toFixed(2)}`;
    },

    printInvoiceFromReport: function (id) {
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const inv = invoices.find(i => i.id === id);
        if (inv) {
            this.printPosInvoice(inv);
        } else {
            alert("Invoice not found!");
        }
    },

    deleteInvoice: async function (id) {
        if (!confirm("Are you sure you want to completely delete this invoice? This will restore the stock and remove ledger records.")) return;

        let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        invoices = invoices.filter(i => i.id !== id);
        localStorage.setItem('invoices', JSON.stringify(invoices));

        if (typeof apiClient !== 'undefined' && apiClient.deleteInvoice) {
            try { await apiClient.deleteInvoice(id); } catch (e) { }
        }

        this.renderReports();
        this.renderStock();
        this.renderDashboard();

        alert("Invoice deleted successfully!");
    },

    editInvoice: async function (id) {
        if (this.cart && this.cart.length > 0) {
            if (!confirm("Your current POS cart has items. Editing this invoice will clear the current cart. Continue?")) return;
        } else {
            if (!confirm("Are you sure you want to edit this invoice? It will be moved back to the POS cart and the original invoice will be deleted.")) return;
        }

        let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const inv = invoices.find(i => i.id === id);
        if (!inv) return alert("Invoice not found!");

        this.cart = [...(inv.items || [])];
        document.getElementById('sale-customer').value = inv.customer_name === 'Walk-in' ? '' : (inv.customer_name || '');
        document.getElementById('sale-doctor').value = inv.doctor_name || '';
        document.getElementById('sale-date').value = inv.date || new Date().toISOString().split('T')[0];

        const invNoInput = document.getElementById('sale-invoice-no');
        if (invNoInput) invNoInput.value = inv.invoice_no || '';

        const payModeSelect = document.getElementById('sale-payment-mode');
        if (payModeSelect) payModeSelect.value = inv.payment_mode || 'Cash';

        const paidAmtInput = document.getElementById('sale-paid-amount');
        if (paidAmtInput) paidAmtInput.value = inv.paid_amount || '0';

        invoices = invoices.filter(i => i.id !== id);
        localStorage.setItem('invoices', JSON.stringify(invoices));

        if (typeof apiClient !== 'undefined' && apiClient.deleteInvoice) {
            try { await apiClient.deleteInvoice(id); } catch (e) { }
        }

        if (typeof switchView === 'function') switchView('sales');
        this.renderCart();
        this.renderStock();
        this.renderDashboard();
    },

    fillMedicineDetails: function (medId) {
        const med = this.medicines.find(m => m.id === medId);
        if (med) {
            document.getElementById('pur-mrp').value = med.mrp || '';
            document.getElementById('pur-gst').value = med.gst || '0';

            // Auto-populate last purchase rate
            const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
            let lastRate = '';
            for (let i = purchases.length - 1; i >= 0; i--) {
                const p = purchases[i];
                if ((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId) {
                    lastRate = p.price;
                    break;
                }
            }
            document.getElementById('pur-rate').value = lastRate || '';
            this.calculatePurTotal();
        } else {
            document.getElementById('pur-mrp').value = '';
            document.getElementById('pur-rate').value = '';
            document.getElementById('pur-gst').value = '';
            document.getElementById('pur-total').value = '';
        }
    },

    calculatePurTotal: function () {
        const qty = parseFloat(document.getElementById('pur-qty').value) || 0;
        const rate = parseFloat(document.getElementById('pur-rate').value) || 0;
        const gst = parseFloat(document.getElementById('pur-gst').value) || 0;

        const baseTotal = qty * rate;
        const gstAmount = baseTotal * (gst / 100);
        const finalTotal = baseTotal + gstAmount;

        const totalInput = document.getElementById('pur-total');
        if (totalInput) totalInput.value = finalTotal.toFixed(2);
    },

    calculateReturnAmount: function () {
        const grandTotalField = document.getElementById('sale-grand-total-field');
        const grandTotal = grandTotalField ? (parseFloat(grandTotalField.value) || 0) : 0;

        const paidAmtField = document.getElementById('sale-paid-amount');
        const paidAmt = paidAmtField ? (parseFloat(paidAmtField.value) || 0) : 0;

        const payMode = document.getElementById('sale-payment-mode')?.value || 'Cash';

        const returnInput = document.getElementById('sale-return-amount');
        if (returnInput) {
            if (payMode === 'Cash' && grandTotal > 0 && paidAmt > grandTotal) {
                returnInput.value = (paidAmt - grandTotal).toFixed(2);
            } else {
                returnInput.value = '0.00';
            }
        }
    },

    calculateSaleItemTotal: function () {
        const price = parseFloat(document.getElementById('sale-price').value) || 0;
        const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
        const disc = parseFloat(document.getElementById('sale-disc').value) || 0;
        const discType = document.getElementById('sale-disc-type') ? document.getElementById('sale-disc-type').value : '%';
        const gst = parseFloat(document.getElementById('sale-gst').value) || 0;

        let finalPrice = price;
        if (disc > 0) {
            if (discType === '%') {
                finalPrice = price * (1 - disc / 100);
            } else {
                finalPrice = price - disc;
            }
        }
        if (finalPrice < 0) finalPrice = 0;

        const baseTotal = finalPrice * qty;
        const gstAmount = baseTotal * (gst / 100);
        const total = baseTotal + gstAmount;

        const itemTotalInput = document.getElementById('sale-item-total');
        if (itemTotalInput) itemTotalInput.value = total.toFixed(2);
    },

    addToPurchaseCart: function () {
        const medId = document.getElementById('pur-med-select').value;
        const batch = document.getElementById('pur-batch').value.trim();
        const expiry = document.getElementById('pur-expiry').value;
        const qty = parseFloat(document.getElementById('pur-qty').value) || 0;
        const free = parseFloat(document.getElementById('pur-free').value) || 0;
        const rate = parseFloat(document.getElementById('pur-rate').value) || 0;
        const mrp = parseFloat(document.getElementById('pur-mrp').value) || 0;
        const gst = parseFloat(document.getElementById('pur-gst').value) || 0;
        const total = parseFloat(document.getElementById('pur-total').value) || (qty * rate * (1 + gst / 100));

        if (!medId || qty <= 0 || !batch || !expiry) {
            return alert("Medicine, Batch, Expiry Date, and Quantity are required!");
        }

        const med = this.medicines.find(m => m.id === medId);
        if (!med) return alert("Selected medicine not found!");

        this.purCart.push({
            medId: med.id,
            medName: med.name,
            category: med.category || 'Medicine',
            uom: med.unit || 'Nos',
            gst: gst || med.gst || 0,
            batch: batch,
            expiry: expiry,
            qty: qty,
            free: free,
            rate: rate,
            mrp: mrp,
            total: total
        });

        document.getElementById('pur-batch').value = '';
        document.getElementById('pur-expiry').value = '';
        document.getElementById('pur-qty').value = '';
        document.getElementById('pur-free').value = '0';
        document.getElementById('pur-rate').value = '';
        document.getElementById('pur-gst').value = '';
        document.getElementById('pur-total').value = '';
        document.getElementById('pur-mrp').value = '';
        document.getElementById('pur-med-select').selectedIndex = 0;

        this.renderPurCart();
    },

    renderPurCart: function () {
        const tbody = document.querySelector('#pur-cart-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let grandTotal = 0;

        if (this.purCart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#666;">No items added to invoice yet.</td></tr>`;
            document.getElementById('pur-grand-total').innerText = '0.00';
            return;
        }

        this.purCart.forEach((item, i) => {
            grandTotal += item.total;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.medName}</td>
                <td>${item.batch}</td>
                <td>${item.expiry}</td>
                <td>${item.qty} (+${item.free})</td>
                <td>₹${item.rate.toFixed(2)}</td>
                <td>₹${item.mrp.toFixed(2)}</td>
                <td>₹${item.total.toFixed(2)}</td>
                <td><button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="removePurCartItem(${i})"><i class="fas fa-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('pur-grand-total').innerText = grandTotal.toFixed(2);
    },

    removePurCartItem: function (index) {
        this.purCart.splice(index, 1);
        this.renderPurCart();
    },

    savePurchaseInvoice: async function () {
        const supplier = document.getElementById('pur-supplier').value;
        const invoice = document.getElementById('pur-invoice').value.trim();
        const purDate = document.getElementById('pur-date').value;

        if (!supplier || !invoice || !purDate) {
            return alert("Supplier, Invoice No, and Date are required to save the invoice!");
        }

        if (this.purCart.length === 0) {
            return alert("Please add at least one item to the list before saving.");
        }

        let purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const timestamp = new Date().toISOString();

        for (let item of this.purCart) {
            const purchaseRecord = {
                id: 'PUR-' + Date.now() + Math.random().toString(36).substr(2, 5),
                date: purDate,
                supplierName: supplier,
                supplierInv: invoice,
                itemId: item.medId,
                itemName: item.medName,
                itemCode: item.medId,
                category: item.category,
                batch: item.batch,
                expiryDate: item.expiry,
                qty: item.qty,
                freeQty: item.free,
                totalQty: item.qty + item.free,
                price: item.rate,
                mrp: item.mrp,
                uom: item.uom,
                gst: item.gst,
                amount: item.total,
                remarks: 'Medicine Purchase',
                createdAt: timestamp
            };
            purchases.push(purchaseRecord);

            if (typeof apiClient !== 'undefined' && apiClient.savePurchase) {
                try {
                    await apiClient.savePurchase(purchaseRecord);
                } catch (e) {
                    console.warn("Backend sync failed", e);
                }
            }
        }

        localStorage.setItem('purchases', JSON.stringify(purchases));

        // Reset form for next invoice
        document.getElementById('pur-supplier').value = '';
        document.getElementById('pur-invoice').value = '';
        this.purCart = [];
        this.renderPurCart();

        this.renderDashboard();
        this.renderStock();
        this.renderMaster(); // Refresh Medicine Master to update stock highlight colors
        alert("Purchase Invoice saved and stock updated successfully!");
    },

    editStock: function (medId, batch) {
        const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];

        let totalPurchased = 0;
        let totalSold = 0;
        let samplePurchase = null;

        purchases.forEach(p => {
            if ((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId && (p.batch || '') === batch) {
                totalPurchased += (parseFloat(p.totalQty) || parseFloat(p.qty) || 0);
                if (!samplePurchase) samplePurchase = p;
            }
        });

        invoices.forEach(inv => {
            if (inv.items) {
                inv.items.forEach(item => {
                    const iId = item.itemId || item.medId;
                    if (iId === medId && (item.batch || '') === batch) {
                        totalSold += (parseFloat(item.qty) || 0);
                    }
                });
            }
        });

        const currentQty = totalPurchased - totalSold;

        if (!samplePurchase) return alert("Stock details not found!");

        document.getElementById('edit-stock-med-id').value = medId;
        document.getElementById('edit-stock-old-batch').value = batch;
        document.getElementById('edit-stock-med-name').value = samplePurchase.itemName;
        document.getElementById('edit-stock-batch').value = batch;
        document.getElementById('edit-stock-expiry').value = samplePurchase.expiryDate || '';
        document.getElementById('edit-stock-supplier').value = samplePurchase.supplierName || samplePurchase.supplier || '';
        document.getElementById('edit-stock-mrp').value = samplePurchase.mrp || 0;

        const qtyInput = document.getElementById('edit-stock-qty');
        qtyInput.value = currentQty;
        qtyInput.dataset.originalQty = currentQty;

        if (typeof openModal === 'function') openModal('modal-edit-stock');
    },

    updateStock: async function () {
        const medId = document.getElementById('edit-stock-med-id').value;
        const oldBatch = document.getElementById('edit-stock-old-batch').value;
        const newBatch = document.getElementById('edit-stock-batch').value.trim();
        const newExpiry = document.getElementById('edit-stock-expiry').value;
        const newSupplier = document.getElementById('edit-stock-supplier').value;
        const newMrp = parseFloat(document.getElementById('edit-stock-mrp').value) || 0;

        const qtyInput = document.getElementById('edit-stock-qty');
        const newQty = parseFloat(qtyInput.value) || 0;
        const oldQty = parseFloat(qtyInput.dataset.originalQty) || 0;

        let purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        let updated = false;
        let samplePurchase = null;

        purchases.forEach(p => {
            if ((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId && (p.batch || '') === oldBatch) {
                p.batch = newBatch;
                p.expiryDate = newExpiry;
                p.supplierName = newSupplier;
                p.supplier = newSupplier;
                p.mrp = newMrp;
                updated = true;
                if (!samplePurchase) samplePurchase = { ...p };
            }
        });

        const qtyDiff = newQty - oldQty;
        if (qtyDiff !== 0 && samplePurchase) {
            const adjPurchase = {
                ...samplePurchase,
                id: 'PUR-ADJ-' + Date.now(),
                date: new Date().toISOString().split('T')[0],
                supplierInv: 'ADJ-' + Date.now(),
                batch: newBatch,
                qty: qtyDiff,
                freeQty: 0,
                totalQty: qtyDiff,
                amount: 0,
                remarks: 'Manual Stock Adjustment',
                createdAt: new Date().toISOString()
            };
            purchases.push(adjPurchase);
            updated = true;

            if (typeof apiClient !== 'undefined' && apiClient.savePurchase) {
                try { await apiClient.savePurchase(adjPurchase); } catch (e) { }
            }
        }

        if (updated) {
            localStorage.setItem('purchases', JSON.stringify(purchases));

            if (typeof apiClient !== 'undefined' && apiClient.savePurchase) {
                for (let p of purchases) {
                    if ((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId && p.batch === newBatch) {
                        try { await apiClient.savePurchase(p); } catch (e) { }
                    }
                }
            }

            if (oldBatch !== newBatch) {
                let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
                let invUpdated = false;
                invoices.forEach(inv => {
                    if (inv.items) {
                        inv.items.forEach(item => {
                            if ((item.itemId || item.medId) === medId && (item.batch || '') === oldBatch) {
                                item.batch = newBatch;
                                invUpdated = true;
                            }
                        });
                    }
                });
                if (invUpdated) {
                    localStorage.setItem('invoices', JSON.stringify(invoices));
                }
            }
        }

        if (typeof closeModal === 'function') closeModal('modal-edit-stock');
        this.renderStock();
        this.renderDashboard();
        alert("Stock updated successfully!");
    },

    deleteStock: async function (medId, batch) {
        if (!confirm("Are you sure you want to delete this stock batch completely? This will remove all associated purchase records for this batch.")) return;

        let purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        let toDelete = purchases.filter(p => (p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId && (p.batch || '') === batch);
        purchases = purchases.filter(p => !((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId && (p.batch || '') === batch));

        localStorage.setItem('purchases', JSON.stringify(purchases));

        if (typeof apiClient !== 'undefined' && apiClient.deletePurchase) {
            for (let d of toDelete) {
                try { await apiClient.deletePurchase(d.id); } catch (e) { }
            }
        }

        this.renderStock();
        this.renderDashboard();
        alert("Stock batch deleted successfully!");
    },

    loadBatchesForSale: function (medId) {
        const batchSelect = document.getElementById('sale-batch-select');
        if (!batchSelect) return;
        batchSelect.innerHTML = '<option value="">Select Batch</option>';

        if (!medId) return;

        const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const stockMap = {};

        purchases.forEach(p => {
            if ((p.category === 'Medicine' || p.remarks === 'Medicine Purchase') && p.itemId === medId) {
                const batch = p.batch || '';
                if (!stockMap[batch]) {
                    stockMap[batch] = {
                        batch: batch,
                        expiry: p.expiryDate,
                        qty: 0,
                        mrp: parseFloat(p.mrp) || parseFloat(p.price) || 0,
                        purRate: parseFloat(p.price) || 0
                    };
                }
                stockMap[batch].qty += (parseFloat(p.totalQty) || parseFloat(p.qty) || 0);
            }
        });

        invoices.forEach(inv => {
            if (inv.items) {
                inv.items.forEach(item => {
                    const iId = item.itemId || item.medId;
                    if (iId === medId) {
                        const batch = item.batch || '';
                        if (stockMap[batch]) {
                            stockMap[batch].qty -= (parseFloat(item.qty) || 0);
                        }
                    }
                });
            }
        });

        Object.values(stockMap).filter(b => b.qty > 0).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.batch;
            opt.dataset.mrp = b.mrp;
            opt.dataset.expiry = b.expiry;
            opt.dataset.qty = b.qty;
            opt.dataset.purRate = b.purRate;
            opt.textContent = `${b.batch || 'No Batch'} (Qty: ${b.qty}, MRP: ₹${b.mrp.toFixed(2)})`;
            batchSelect.appendChild(opt);
        });

        document.getElementById('sale-price').value = '';
        document.getElementById('sale-qty').value = '1';
        document.getElementById('sale-disc').value = '0';

        const med = this.medicines.find(m => m.id === medId);
        if (med) {
            document.getElementById('sale-gst').value = med.gst || '0';
        } else {
            document.getElementById('sale-gst').value = '';
        }
        this.calculateSaleItemTotal();
    },

    updateSalePrice: function () {
        const batchSelect = document.getElementById('sale-batch-select');
        const selectedOpt = batchSelect.options[batchSelect.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
            document.getElementById('sale-price').value = selectedOpt.dataset.mrp || '';
        } else {
            document.getElementById('sale-price').value = '';
        }
        this.calculateSaleItemTotal();
    },

    addToCart: function () {
        const medId = document.getElementById('sale-med-select').value;
        const batchSelect = document.getElementById('sale-batch-select');
        const batchOpt = batchSelect.options[batchSelect.selectedIndex];
        const price = parseFloat(document.getElementById('sale-price').value) || 0;
        const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
        const disc = parseFloat(document.getElementById('sale-disc').value) || 0;
        const discType = document.getElementById('sale-disc-type') ? document.getElementById('sale-disc-type').value : '%';
        const gst = parseFloat(document.getElementById('sale-gst').value) || 0;

        if (!medId || qty <= 0) {
            return alert("Please select a medicine and enter a valid quantity.");
        }

        let batch = '';
        let expiry = '';
        let availableQty = Infinity;
        let purRate = 0;

        if (batchOpt && batchOpt.value) {
            batch = batchOpt.value;
            expiry = batchOpt.dataset.expiry || '';
            availableQty = parseFloat(batchOpt.dataset.qty) || 0;
            purRate = parseFloat(batchOpt.dataset.purRate) || 0;
        }

        if (qty > availableQty) {
            return alert(`Only ${availableQty} available in stock for this batch.`);
        }

        const med = this.medicines.find(m => m.id === medId);
        if (!med) return alert("Medicine not found.");

        if (purRate === 0) {
            const purchases = JSON.parse(localStorage.getItem('purchases')) || [];
            for (let i = purchases.length - 1; i >= 0; i--) {
                if ((purchases[i].category === 'Medicine' || purchases[i].remarks === 'Medicine Purchase') && purchases[i].itemId === medId) {
                    purRate = parseFloat(purchases[i].price) || 0;
                    break;
                }
            }
        }

        let finalPrice = price;
        let discText = '';
        if (disc > 0) {
            if (discType === '%') {
                finalPrice = price * (1 - disc / 100);
                discText = `(-${disc}%)`;
            } else {
                finalPrice = price - disc;
                discText = `(-₹${disc})`;
            }
        }
        if (finalPrice < 0) finalPrice = 0;

        const baseTotal = finalPrice * qty;
        const gstAmount = baseTotal * (gst / 100);
        const total = baseTotal + gstAmount;

        const totalCost = purRate * qty;
        const marginAmt = total - totalCost;
        let marginPercent = 0;
        if (total > 0) {
            marginPercent = (marginAmt / total) * 100;
        } else if (totalCost === 0) {
            marginPercent = 100;
        }

        this.cart.push({
            medId: med.id,
            medName: med.name,
            batch: batch,
            expiry: expiry,
            mrp: price,
            gst: gst,
            qty: qty,
            disc: disc,
            discType: discType,
            discText: discText,
            rate: finalPrice,
            total: total,
            purRate: purRate,
            marginAmt: marginAmt,
            marginPercent: marginPercent
        });

        document.getElementById('sale-med-select').selectedIndex = 0;
        document.getElementById('sale-batch-select').innerHTML = '<option value="">Select Batch</option>';
        document.getElementById('sale-price').value = '';
        document.getElementById('sale-qty').value = '1';
        document.getElementById('sale-disc').value = '0';
        if (document.getElementById('sale-disc-type')) document.getElementById('sale-disc-type').value = '%';
        if (document.getElementById('sale-gst')) document.getElementById('sale-gst').value = '';

        const itemTotalInput = document.getElementById('sale-item-total');
        if (itemTotalInput) itemTotalInput.value = '';

        this.renderCart();
    },

    renderCart: function () {
        const tbody = document.querySelector('#cart-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let grandTotal = 0;
        let grossTotal = 0;
        let totalGst = 0;

        if (this.cart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#666;">Cart is empty.</td></tr>`;
            document.getElementById('sale-grand-total').innerText = '0.00';

            const grossField = document.getElementById('sale-gross-amount');
            if (grossField) grossField.value = '0.00';

            const gstField = document.getElementById('sale-total-gst');
            if (gstField) gstField.value = '0.00';

            const roundField = document.getElementById('sale-round-off');
            if (roundField) roundField.value = '0.00';

            const grandTotalField = document.getElementById('sale-grand-total-field');
            if (grandTotalField) grandTotalField.value = '0.00';

            const paidInput = document.getElementById('sale-paid-amount');
            if (paidInput) paidInput.value = '0.00';

            this.calculateReturnAmount();
            return;
        }

        this.cart.forEach((item, i) => {
            const baseTotal = item.rate * item.qty;
            grossTotal += baseTotal;
            totalGst += baseTotal * ((parseFloat(item.gst) || 0) / 100);
            grandTotal += item.total;
            let marginColor = item.marginPercent < 0 ? 'var(--danger)' : 'var(--success)';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.medName}</td>
                <td>${item.batch || '-'}</td>
                <td>${item.expiry || '-'}</td>
                <td>${item.qty}</td>
                <td>${item.gst}%</td>
                <td>₹${item.mrp.toFixed(2)} <small style="color:var(--danger)">${item.discText}</small></td>
                <td>₹${item.total.toFixed(2)}</td>
                <td style="color:${marginColor}; font-weight:bold;">₹${item.marginAmt.toFixed(2)} (${item.marginPercent.toFixed(1)}%)</td>
                <td>
                    <button class="btn btn-primary" style="padding:4px 8px; font-size:12px; margin-right:5px;" onclick="MedicineCore.editCartItem(${i})" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="MedicineCore.removeFromCart(${i})" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const isRoundOff = document.getElementById('sale-round-off-check') ? document.getElementById('sale-round-off-check').checked : false;
        let roundOffValue = 0;
        if (isRoundOff) {
            const roundedTotal = Math.round(grandTotal);
            roundOffValue = roundedTotal - grandTotal;
            grandTotal = roundedTotal;
        }

        const grossInput = document.getElementById('sale-gross-amount');
        if (grossInput) grossInput.value = grossTotal.toFixed(2);

        const gstInput = document.getElementById('sale-total-gst');
        if (gstInput) gstInput.value = totalGst.toFixed(2);

        const roundOffInput = document.getElementById('sale-round-off');
        if (roundOffInput) roundOffInput.value = roundOffValue.toFixed(2);

        document.getElementById('sale-grand-total').innerText = grandTotal.toFixed(2);

        const grandTotalField = document.getElementById('sale-grand-total-field');
        if (grandTotalField) grandTotalField.value = grandTotal.toFixed(2);


        const paidInput = document.getElementById('sale-paid-amount');
        if (paidInput) {
            paidInput.value = grandTotal.toFixed(2);
        }
        this.calculateReturnAmount();
    },

    editCartItem: function (index) {
        const item = this.cart[index];

        document.getElementById('sale-med-select').value = item.medId;
        this.loadBatchesForSale(item.medId);

        // Small delay to allow the batch dropdown to populate before setting its value
        setTimeout(() => {
            document.getElementById('sale-batch-select').value = item.batch || '';
            document.getElementById('sale-price').value = item.mrp;
            document.getElementById('sale-qty').value = item.qty;
            document.getElementById('sale-disc').value = item.disc;
            if (document.getElementById('sale-disc-type')) document.getElementById('sale-disc-type').value = item.discType || '%';
            if (document.getElementById('sale-gst')) document.getElementById('sale-gst').value = item.gst || '0';
        }, 150);

        this.removeFromCart(index);
    },

    holdBill: function () {
        if (this.cart.length === 0) return alert("Cart is empty. Nothing to hold.");

        const customer = document.getElementById('sale-customer').value.trim();
        const doctor = document.getElementById('sale-doctor').value.trim();
        const total = document.getElementById('sale-grand-total').innerText;

        this.heldBills.push({
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            customer: customer || 'Walk-in',
            doctor: doctor,
            items: [...this.cart],
            total: parseFloat(total) || 0
        });

        localStorage.setItem('med_held_bills', JSON.stringify(this.heldBills));

        this.cart = [];
        document.getElementById('sale-customer').value = '';
        document.getElementById('sale-doctor').value = '';
        this.renderCart();
        alert("Bill held successfully!");
    },

    openHeldBills: function () {
        const tbody = document.querySelector('#held-bills-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.heldBills.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No held bills found.</td></tr>';
        } else {
            this.heldBills.forEach((bill, i) => {
                tbody.innerHTML += `
                    <tr>
                        <td>${bill.time}</td>
                        <td>${bill.customer}</td>
                        <td>${bill.items.length} items</td>
                        <td>₹${bill.total.toFixed(2)}</td>
                        <td>
                            <button class="btn btn-success" style="padding:4px 8px; font-size:12px; margin-right:5px;" onclick="MedicineCore.resumeBill(${i})">Resume</button>
                            <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="MedicineCore.deleteHeldBill(${i})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
        if (typeof openModal === 'function') openModal('modal-held-bills');
    },

    generateNextSaleInvoiceNo: function () {
        const invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        const medInvoices = invoices.filter(inv => inv.invoiceType === 'Medicine Sales');
        if (medInvoices.length === 0) return 'MED-0001';

        // Sort chronologically
        medInvoices.sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));
        const lastInv = medInvoices[medInvoices.length - 1].invoice_no;
        if (!lastInv) return 'MED-0001';

        const match = lastInv.match(/^(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1];
            const numStr = match[2];
            const nextNum = parseInt(numStr, 10) + 1;
            return prefix + nextNum.toString().padStart(numStr.length, '0');
        }
        return lastInv + '-1';
    },

    finalizeSale: async function () {
        if (this.cart.length === 0) return alert("Cart is empty!");

        const customer = document.getElementById('sale-customer').value.trim() || 'Walk-in';
        const doctor = document.getElementById('sale-doctor').value.trim();
        const date = document.getElementById('sale-date').value || new Date().toISOString().split('T')[0];
        const payMode = document.getElementById('sale-payment-mode').value;
        const grandTotalField = document.getElementById('sale-grand-total-field');
        const totalAmt = grandTotalField ? (parseFloat(grandTotalField.value) || 0) : 0;

        let paidAmt = parseFloat(document.getElementById('sale-paid-amount').value) || 0;
        if (payMode === 'Cash' && paidAmt > totalAmt) {
            paidAmt = totalAmt; // Limit the official paid amount to the total since change was returned
        }

        let invoiceNo = document.getElementById('sale-invoice-no').value.trim();
        if (!invoiceNo) invoiceNo = this.generateNextSaleInvoiceNo();

        let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
        if (invoices.some(i => i.invoice_no === invoiceNo)) {
            invoiceNo = invoiceNo + '-' + Math.floor(Math.random() * 1000); // Prevent exact duplicates if overridden
        }

        const invoiceRecord = {
            id: 'INV-MED-' + Date.now(),
            invoice_no: invoiceNo,
            invoice_date: date,
            date: date,
            customer_name: customer,
            doctor_name: doctor,
            items: this.cart.map(item => ({
                ...item,
                itemId: item.medId,
                itemName: item.medName
            })),
            gross_total: parseFloat(document.getElementById('sale-gross-amount')?.value) || 0,
            round_off: parseFloat(document.getElementById('sale-round-off')?.value) || 0,
            invoice_total: totalAmt,
            total: totalAmt,
            paid_amount: paidAmt,
            payment_mode: payMode,
            invoiceType: 'Medicine Sales',
            created_at: new Date().toISOString()
        };


        invoices.push(invoiceRecord);
        localStorage.setItem('invoices', JSON.stringify(invoices));

        if (typeof apiClient !== 'undefined' && apiClient.saveInvoice) {
            try { await apiClient.saveInvoice(invoiceRecord); } catch (e) { }
        }

        this.printPosInvoice(invoiceRecord);

        this.cart = [];
        document.getElementById('sale-customer').value = '';
        document.getElementById('sale-doctor').value = '';
        document.getElementById('sale-invoice-no').value = this.generateNextSaleInvoiceNo();
        this.renderCart();
        this.renderDashboard();
        this.renderStock();

        alert("Invoice generated successfully!");
    },

    printPosInvoice: function (inv) {
        if (!window.jspdf) return alert("PDF library not loaded");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Tax Invoice (Pharmacy)", 105, 15, { align: "center" });

        doc.setFontSize(10);
        doc.text(`Invoice No: ${inv.invoice_no}`, 15, 30);
        doc.text(`Date: ${inv.date}`, 150, 30);
        doc.text(`Patient: ${inv.customer_name}`, 15, 40);
        doc.text(`Doctor: ${inv.doctor_name || '-'}`, 15, 45);

        const head = [['Medicine', 'Batch', 'Expiry', 'Qty', 'MRP', 'Disc', 'CGST%', 'SGST%', 'Rate', 'Total']];
        const body = inv.items.map(item => {
            const gst = parseFloat(item.gst) || 0;
            const halfGst = (gst / 2).toFixed(1);
            return [
                item.itemName || item.medName,
                item.batch || '-',
                item.expiry || '-',
                item.qty,
                item.mrp.toFixed(2),
                item.discText || '-',
                `${halfGst}%`,
                `${halfGst}%`,
                item.rate.toFixed(2),
                item.total.toFixed(2)
            ];
        });

        doc.autoTable({
            startY: 55,
            head: head,
            body: body,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [44, 62, 80] }
        });

        let finalY = doc.lastAutoTable.finalY + 10;
        const grossTotal = parseFloat(inv.gross_total) || 0;
        const roundOff = parseFloat(inv.round_off) || 0;
        const grandTotal = parseFloat(inv.invoice_total) || 0;

        let totalGst = 0;
        if (inv.items) {
            inv.items.forEach(item => {
                const base = (parseFloat(item.rate) || 0) * (parseFloat(item.qty) || 0);
                totalGst += base * ((parseFloat(item.gst) || 0) / 100);
            });
        }

        if (grossTotal > 0 || roundOff !== 0) {
            doc.text(`Gross Total: Rs. ${grossTotal.toFixed(2)}`, 140, finalY);
            finalY += 5;
            if (totalGst > 0) {
                doc.text(`Total GST: Rs. ${totalGst.toFixed(2)}`, 140, finalY);
                finalY += 5;
            }
            if (roundOff !== 0) {
                doc.text(`Round Off: Rs. ${(roundOff > 0 ? '+' : '')}${roundOff.toFixed(2)}`, 140, finalY);
                finalY += 5;
            }
        }

        doc.setFont("helvetica", "bold");
        doc.text(`Grand Total: Rs. ${grandTotal.toFixed(2)}`, 140, finalY);
        doc.setFont("helvetica", "normal");
        doc.save(`${inv.invoice_no}.pdf`);
    },

    removeFromCart: function (index) {
        this.cart.splice(index, 1);
        this.renderCart();
    },

    resumeBill: function (index) {
        const bill = this.heldBills[index];
        if (!bill) return;
        if (this.cart.length > 0) {
            if (!confirm("Your current active cart will be cleared. Continue?")) return;
        }
        this.cart = bill.items;
        document.getElementById('sale-customer').value = bill.customer !== 'Walk-in' ? bill.customer : '';
        document.getElementById('sale-doctor').value = bill.doctor || '';
        this.deleteHeldBill(index);
        this.renderCart();
        if (typeof closeModal === 'function') closeModal('modal-held-bills');
    },

    deleteHeldBill: function (index) {
        this.heldBills.splice(index, 1);
        localStorage.setItem('med_held_bills', JSON.stringify(this.heldBills));
        this.openHeldBills();
    }
};

window.MedicineCore = MedicineCore;