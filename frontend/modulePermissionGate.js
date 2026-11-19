/* Scoped permission bridge for the CRM module pages that opt in with data-module-permission. */
(() => {
    const moduleId = document.documentElement?.dataset?.modulePermission;
    if (!moduleId) return;

    const functionActions = {
        purchase: { addToDraft:'add', updateDraftItem:'add', removeDraftItem:'add', saveAllDraft:'add', updatePurchase:'edit', editPurchase:'edit', deleteSelectedPurchases:'delete', confirmDelete:'delete', duplicatePurchase:'add', deletePurchase:'delete', restorePurchaseFromBin:'edit', printPurchaseDetails:'print', savePaymentDate:'edit', updateRemarks:'edit', exportToExcel:'excelDownload', savePurchasePaymentAmount:'edit', savePurchasePaymentReference:'edit', savePaymentSplit:'edit', saveAuditedPurchase:'edit', addCustomUOM:'add' },
        item_stock: { confirmDelete:'delete', performExport:'export', initiateAddItem:'add', performAddItem:'add', performEditToggle:'edit', performUpdateItem:'edit', confirmBulkEdit:'edit', editItem:'edit', deleteItem:'delete', deleteSelectedItems:'delete', copyItem:'add', performCopyItem:'add', restoreItemFromBin:'edit', exportItemsCSV:'export', importItemsCSV:'import', printBarcode:'print', addManagedCategory:'add', editManagedCategory:'edit', deleteManagedCategory:'delete', addManagedItemType:'add', editManagedItemType:'edit', deleteManagedItemType:'delete', addManagedUom:'add', deleteManagedUom:'delete', saveModalConversions:'edit' },
        customer: { saveCustomer:'addOrEdit', editCustomer:'edit', deleteCustomer:'delete', deleteSelectedCustomers:'delete', confirmDelete:'delete', restoreCustomerFromBin:'edit', exportCustomersCSV:'export', exportCustomersPDF:'pdfDownload', importCustomersCSV:'import', printPaymentReceipt:'print', printArchivedReceipt:'print', saveManageAttachments:'edit', removeManageAttachment:'edit', removeCustomerAttachment:'edit' },
        supplier: { saveSupplier:'addOrEdit', editSupplier:'edit', performEdit:'edit', deleteSupplier:'delete', deleteSelectedSuppliers:'delete', confirmDelete:'delete', restoreSupplierFromBin:'edit', exportSuppliersCSV:'export', importSuppliersCSV:'import', saveManageAttachments:'edit', addSupplierType:'add', editSupplierType:'edit', deleteSupplierType:'delete' },
        advance_payment: { handleFormSubmit:'addOrEdit', submitAdvanceRefund:'edit', reverseAdvanceAllocation:'edit', editRecord:'edit', runRowAction:'rowAction', submitQuickAdjust:'edit', deleteRecord:'delete', exportToCSV:'export' },
        expense_manager: { saveExpense:'addOrEdit', saveVendor:'addOrEdit', deleteExpense:'delete', editExpense:'edit', deleteRecurring:'delete', editRecurring:'edit', saveRecurringFrequency:'edit', exportToExcel:'excelDownload', exportVendorsToExcel:'excelDownload', editVendor:'edit', deleteVendor:'delete', addParentCategory:'add', addSubCategory:'add', editParentCategory:'edit', editSubCategory:'edit', deleteParentCategory:'delete', deleteSubCategory:'delete', saveSubCategoryOrder:'edit' },
        follow_up: { saveFollowUp:'addOrEdit', duplicateFollowUp:'add', markStatus:'edit', deleteFollowUp:'delete', deleteSelected:'delete' },
        contacts: { saveContact:'addOrEdit', deleteContact:'delete', deleteSelectedContacts:'delete', confirmDelete:'delete', editContact:'edit', exportContactsCSV:'export', exportContactsPDF:'pdfDownload', importContactsCSV:'import', saveAttachments:'edit', removeAttachment:'edit' },
        reports: { duplicateInvoice:'add', directPrintInvoicePDF:'pdfDownload', generateAndSavePDF:'pdfDownload', handleExcelInvoiceFile:'import', handleImportCsvFile:'import', printInvoicePDF:'pdfDownload', printArchivedReceipt:'print', printPaymentReceipt:'print', createBlankExcelInvoice:'add', importReviewedExcelInvoice:'import', saveInvoicePaymentEntry:'edit', saveInvoicePaymentReference:'edit', savePaymentSplit:'edit', restoreInvoiceFromBin:'edit', exportInvoicesCSV:'export', printGodownAuthorization:'print', saveGodownAuthorization:'edit', saveTerms:'edit', saveBankDetails:'edit', saveSignatureImage:'edit' },
        quotation: { confirmSave:'addOrEdit', saveQuotation:'addOrEdit', updateQuoteStatus:'edit', editQuote:'edit', deleteQuote:'delete', printQuoteFromList:'print' },
        ordersheet: { updateOrderStatus:'edit', deleteOrder:'delete', editOrder:'edit', saveOrder:'addOrEdit', explicitSaveTerms:'edit' }
    };

    const explicitElementActions = { reports: { btnConfirmDelete:'delete', btnDeleteSelected:'delete', btnEditSmart:'edit', btnEditSimple:'edit', btnPrintReport:'print' } };
    const permissionForLegacyFlag = {
        perm_backup_data:'export', perm_export_excel:'excelDownload', perm_restore_data:'import', perm_print:'print',
        perm_delete_action:'delete', perm_manage_items:'edit', perm_manage_customers:'edit', perm_supplier:'edit', perm_supplier_manager:'edit'
    };
    const actionLabels = { add:'adding', edit:'editing', delete:'deleting', print:'printing', pdfDownload:'PDF download', excelDownload:'Excel download', import:'importing', export:'exporting' };
    let loaded = false;
    let permissionState = {};

    function denied(action) {
        const label = actionLabels[action] || action;
        if (typeof window.showToast === 'function') window.showToast(`Permission denied: ${label} is not allowed for this module.`, '#c0392b');
        else alert(`Permission denied: ${label} is not allowed for this module.`);
    }
    function allowed(action, operationName) {
        if (action === 'addOrEdit') return allowed(isEditing(operationName) ? 'edit' : 'add');
        if (action === 'rowAction') return true;
        return loaded && permissionState.privileged === true || loaded && permissionState.permissions?.[action] === true;
    }
    function isEditing(operationName) {
        const selectorByModule = { customer:'#custId', supplier:'#supplierId', contacts:'#contactId', advance_payment:'#entryId', follow_up:'#fuId' };
        if (selectorByModule[moduleId]) return !!document.querySelector(selectorByModule[moduleId])?.value;
        if (moduleId === 'expense_manager') return operationName === 'saveVendor' ? !!document.querySelector('#vendId')?.value : !!document.querySelector('#expenseId')?.value;
        if (moduleId === 'quotation') {
            const ref = document.querySelector('#refNo')?.value?.trim();
            try { return !!ref && (JSON.parse(localStorage.getItem('quotations') || '[]') || []).some(row => String(row.refNo) === ref); } catch (_) { return false; }
        }
        if (moduleId === 'ordersheet') {
            const orderNo = document.querySelector('#orderNo')?.value?.trim();
            try { return !!orderNo && (JSON.parse(localStorage.getItem('order_sheets') || '[]') || []).some(row => String(row.orderNo) === orderNo); } catch (_) { return false; }
        }
        return false;
    }
    function operationForElement(el) {
        const form = el.matches?.('form') ? el : el.closest?.('form');
        const source = `${el.getAttribute('onclick') || ''} ${el.getAttribute('onsubmit') || ''} ${form?.getAttribute('onsubmit') || ''}`;
        const map = functionActions[moduleId] || {};
        const names = source.match(/[A-Za-z_$][\w$]*(?=\s*\()/g) || [];
        return names.find(name => map[name]) || '';
    }
    function actionForElement(el) {
        const operationName = operationForElement(el);
        if (operationName) return functionActions[moduleId][operationName];
        const explicit = explicitElementActions[moduleId]?.[el.id];
        if (explicit) return explicit;
        const flag = el.getAttribute('data-permission-id');
        return flag ? permissionForLegacyFlag[flag] || '' : '';
    }
    function refreshControls() {
        document.querySelectorAll('button, input[type="button"], input[type="submit"], a[onclick]').forEach(el => {
            const action = actionForElement(el);
            if (!action || action === 'rowAction') return;
            const can = allowed(action, operationForElement(el));
            if (!can) { el.disabled = true; el.dataset.modulePermissionDenied = 'true'; el.title = `Disabled: ${actionLabels[action] || action} permission is not granted.`; }
            else if (el.dataset.modulePermissionDenied === 'true') { el.disabled = false; delete el.dataset.modulePermissionDenied; el.removeAttribute('title'); }
        });
    }
    async function load() {
        const actor = String(localStorage.getItem('currentUser') || '').trim();
        if (!actor) { loaded = true; permissionState = { privileged:false, permissions:{} }; document.body.innerHTML = '<main style="font:16px Arial;padding:40px"><h2>Access denied</h2><p>You do not have view permission for this module.</p></main>'; return; }
        try {
            const tenant = typeof apiClient !== 'undefined' && apiClient.getTenantId ? await apiClient.getTenantId() : actor;
            const local = ['localhost','127.0.0.1'].includes(location.hostname);
            const apiBase = (localStorage.getItem('backendApiUrl') || (local ? 'http://localhost:5000/api' : `${location.origin}/api`)).replace(/\/+$/, '');
            const response = await fetch(`${apiBase}/permissions/my-permissions?user=${encodeURIComponent(tenant)}&actor=${encodeURIComponent(actor)}&module=${encodeURIComponent(moduleId)}`, { headers:{ 'x-rtr-user':actor }, cache:'no-store' });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Permission load failed');
            permissionState = { privileged:result.privileged === true, permissions:result.permissions?.[moduleId] || {} };
        } catch (error) {
            console.warn(`${moduleId} permissions could not be loaded:`, error.message);
            permissionState = { privileged:false, permissions:{} };
        }
        loaded = true;
        if (!allowed('view')) {
            document.body.innerHTML = '<main style="font:16px Arial;padding:40px"><h2>Access denied</h2><p>You do not have view permission for this module.</p></main>';
            return;
        }
        refreshControls();
    }

    document.addEventListener('click', event => {
        const el = event.target.closest('button, input[type="button"], input[type="submit"], a[onclick]');
        if (!el) return;
        const action = actionForElement(el);
        if (!action || action === 'rowAction') return;
        const operationName = operationForElement(el);
        if (!allowed(action, operationName)) { event.preventDefault(); event.stopImmediatePropagation(); denied(action === 'addOrEdit' ? (isEditing(operationName) ? 'edit' : 'add') : action); }
    }, true);
    document.addEventListener('submit', event => {
        const operation = operationForElement(event.target);
        const action = operation ? functionActions[moduleId][operation] : '';
        if (action && !allowed(action, operation)) { event.preventDefault(); event.stopImmediatePropagation(); denied(action === 'addOrEdit' ? (isEditing(operation) ? 'edit' : 'add') : action); }
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
        const map = functionActions[moduleId] || {};
        if (moduleId === 'reports') {
            ['hasEditInvoicePermission','hasDeleteInvoicePermission','hasSmartPrintPermission'].forEach((name) => {
                const original = window[name];
                if (typeof original !== 'function' || original.__modulePermissionWrapped) return;
                const required = name === 'hasDeleteInvoicePermission' ? 'delete' : name === 'hasSmartPrintPermission' ? 'add' : 'edit';
                const wrapped = function(...args) { return allowed(required) && original.apply(this, args); };
                wrapped.__modulePermissionWrapped = true;
                window[name] = wrapped;
            });
        }
        Object.entries(map).forEach(([name, action]) => {
            const original = window[name];
            if (typeof original !== 'function' || original.__modulePermissionWrapped) return;
            const wrapped = function(...args) {
                let required = action;
                if (required === 'rowAction') {
                    const rowAction = String(args[0] || '').toLowerCase();
                    required = rowAction.includes('delete') ? 'delete' : rowAction.includes('export') ? 'export' : rowAction.includes('voucher') ? 'print' : rowAction.includes('audit') ? 'view' : 'edit';
                }
                if (!allowed(required, name)) { denied(required === 'addOrEdit' ? (isEditing(name) ? 'edit' : 'add') : required); return false; }
                return original.apply(this, args);
            };
            wrapped.__modulePermissionWrapped = true;
            window[name] = wrapped;
        });
        refreshControls();
        let refreshQueued = false;
        new MutationObserver(() => {
            if (refreshQueued) return;
            refreshQueued = true;
            requestAnimationFrame(() => { refreshQueued = false; refreshControls(); });
        }).observe(document.body, { childList:true, subtree:true });
        load();
    }, { once:true });
})();
