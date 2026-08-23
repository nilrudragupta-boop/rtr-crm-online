/**
 * apiClient.js
 * Handles all communication between the Frontend and the Express Backend.
 */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = localStorage.getItem('backendApiUrl') || (isLocal
    ? 'http://localhost:5000/api'
    : window.location.origin + '/api'); // Dynamically point to the hosted origin

const apiClient = {
    // --- Helper for Multi-Tenant Auth ---
    _getAuthQuery: () => {
        const currentUser = localStorage.getItem('currentUser') || 'System';
        let userRole = 'User';
        try {
            const adminUsers = JSON.parse(localStorage.getItem('ADMIN_USERS')) || [];
            const userMatch = adminUsers.find(u => u.username === currentUser);
            if (userMatch) userRole = userMatch.role || 'User';
        } catch (e) { }
        return `?user=${encodeURIComponent(currentUser)}&role=${encodeURIComponent(userRole)}`;
    },

    // --- Authentication ---
    login: async (username, password) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            return await response.json();
        } catch (error) {
            console.error('Error during login:', error);
            return { success: false, message: error.message };
        }
    },

    // --- Settings ---
    getSettings: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/settings${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('Error fetching settings:', error);
            return null;
        }
    },

    saveSettings: async (settingsData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/settings${apiClient._getAuthQuery()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(settingsData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving settings:', error);
            return { success: false, message: error.message };
        }
    },

    getAdminCreds: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/admin-creds${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error fetching admin creds:', error);
            return null;
        }
    },

    getLoginHistory: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/login-history${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('Error fetching login history:', error);
            return null;
        }
    },

    // --- Customers ---
    getCustomers: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/customers${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            if (Array.isArray(result)) return result;
            if (result && result.data !== undefined) return result.data;
            return result;
        } catch (error) {
            console.error('Error fetching customers:', error);
            return null;
        }
    },

    saveCustomer: async (customerData) => {
        try {
            if (!customerData.createdBy) customerData.createdBy = localStorage.getItem('currentUser') || 'System';
            const response = await fetch(`${API_BASE_URL}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(customerData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving customer:', error);
            return { success: false, message: error.message };
        }
    },
    deleteCustomer: (id) => apiClient._deleteCollection('customers', id),

    // --- Quotations ---
    getQuotations: () => apiClient._getCollection('quotations'),
    saveQuotation: (data) => apiClient._saveCollection('quotations', data),
    deleteQuotation: (id) => apiClient._deleteCollection('quotations', id),

    // --- Invoices ---
    getInvoices: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/invoices${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            if (Array.isArray(result)) return result;
            if (result && result.data !== undefined) return result.data;
            return result;
        } catch (error) {
            console.error('Error fetching invoices:', error);
            return null;
        }
    },

    getSales: async () => {
        try {
            const invoices = await apiClient.getInvoices();
            if (!Array.isArray(invoices)) return [];
            return invoices.map(invoice => ({
                ...invoice,
                id: invoice.id || invoice._id || invoice.invoiceNo || invoice.invoice_no || Date.now().toString(),
                invoiceNo: invoice.invoiceNo || invoice.invoice_no || invoice.invoiceNo || invoice.id || '',
                invoice_no: invoice.invoice_no || invoice.invoiceNo || invoice.id || '',
                invoiceDate: invoice.invoiceDate || invoice.invoice_date || invoice.date || '',
                invoice_date: invoice.invoice_date || invoice.invoiceDate || invoice.date || '',
                customerName: invoice.customerName || invoice.customer_name || 'Walk-in Customer',
                customer_name: invoice.customer_name || invoice.customerName || 'Walk-in Customer',
                customerPhone: invoice.customerPhone || invoice.customer_phone || invoice.contact || invoice.customerContact || '',
                customerGST: invoice.customerGST || invoice.customer_gst || invoice.gst_no || invoice.gst || '',
                paymentMode: invoice.paymentMode || invoice.payment_mode || 'Cash',
                subTotal: Number(invoice.subTotal ?? invoice.taxableValue ?? invoice.invoice_total ?? 0),
                taxTotal: Number(invoice.taxTotal ?? invoice.gstTotal ?? invoice.tax_amount ?? 0),
                grandTotal: Number(invoice.grandTotal ?? invoice.invoice_total ?? invoice.total ?? invoice.invoiceTotal ?? 0),
                items: Array.isArray(invoice.items) ? invoice.items : [],
                remarks: invoice.remarks || invoice.note || ''
            }));
        } catch (error) {
            console.error('Error fetching sales:', error);
            return [];
        }
    },

    saveInvoice: async (invoiceData) => {
        try {
            if (!invoiceData.createdBy) invoiceData.createdBy = localStorage.getItem('currentUser') || 'System';
            const response = await fetch(`${API_BASE_URL}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(invoiceData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving invoice:', error);
            return { success: false, message: error.message };
        }
    },

    saveSale: async (saleData) => {
        try {
            const normalized = {
                ...saleData,
                id: saleData.id || saleData._id || saleData.invoiceNo || saleData.invoice_no || Date.now().toString(),
                invoiceNo: saleData.invoiceNo || saleData.invoice_no || saleData.id || '',
                invoice_no: saleData.invoice_no || saleData.invoiceNo || saleData.id || '',
                invoiceDate: saleData.invoiceDate || saleData.invoice_date || saleData.date || '',
                invoice_date: saleData.invoice_date || saleData.invoiceDate || saleData.date || '',
                customerName: saleData.customerName || saleData.customer_name || 'Walk-in Customer',
                customer_name: saleData.customer_name || saleData.customerName || 'Walk-in Customer',
                customerPhone: saleData.customerPhone || saleData.customer_phone || saleData.contact || '',
                customerGST: saleData.customerGST || saleData.customer_gst || saleData.gst_no || '',
                paymentMode: saleData.paymentMode || saleData.payment_mode || 'Cash',
                subTotal: Number(saleData.subTotal ?? saleData.taxableValue ?? 0),
                taxTotal: Number(saleData.taxTotal ?? saleData.gstTax ?? 0),
                grandTotal: Number(saleData.grandTotal ?? saleData.invoice_total ?? saleData.total ?? 0),
                invoice_total: Number(saleData.grandTotal ?? saleData.invoice_total ?? saleData.total ?? 0),
                total_paid: Number(saleData.grandTotal ?? saleData.invoice_total ?? saleData.total ?? 0),
                total_due: 0,
                remarks: saleData.remarks || saleData.note || '',
                items: Array.isArray(saleData.items) ? saleData.items : []
            };
            return await apiClient.saveInvoice(normalized);
        } catch (error) {
            console.error('Error saving sale:', error);
            return { success: false, message: error.message };
        }
    },
    deleteInvoice: (id) => apiClient._deleteCollection('invoices', id),
    deleteSale: async (id) => apiClient.deleteInvoice(id),

    // --- Credit/Debit Notes ---
    getCreditDebitNotes: () => apiClient._getCollection('credit-debit-notes'),
    saveCreditDebitNote: async (data) => apiClient._saveCollection('credit-debit-notes', data),
    deleteCreditDebitNote: async (id) => apiClient._deleteCollection('credit-debit-notes', id),

    // --- Generic Fetch / Save for other collections ---
    _getCollection: async (collectionName) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            if (Array.isArray(result)) return result;
            if (result && result.data !== undefined) return result.data;
            return result;
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return null;
        }
    },
    _saveCollection: async (collectionName, data) => {
        try {
            if (!data.createdBy) data.createdBy = localStorage.getItem('currentUser') || 'System';
            const response = await fetch(`${API_BASE_URL}/${collectionName}${apiClient._getAuthQuery()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(data)
            });

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return await response.json();
            } else {
                if (response.status === 413) throw new Error("Payload Too Large: The file exceeds network size limits.");
                if (response.status === 404) throw new Error(`404 Not Found: The API endpoint '/api/${collectionName}' does not exist on the server.`);
                throw new Error(`Server returned HTML instead of JSON (${response.status}).`);
            }
        } catch (error) {
            console.error(`Error saving ${collectionName}:`, error);
            return { success: false, message: error.message };
        }
    },
    _deleteCollection: async (collectionName, id) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}/${id}${apiClient._getAuthQuery()}`, {
                method: 'DELETE',
                keepalive: true
            });
            return await response.json();
        } catch (error) {
            console.error(`Error deleting from ${collectionName}:`, error);
            return { success: false, message: error.message };
        }
    },

    getItems: () => apiClient._getCollection('items'),
    saveItem: (data) => apiClient._saveCollection('items', data),
    deleteItem: (id) => apiClient._deleteCollection('items', id),

    getPurchases: () => apiClient._getCollection('purchases'),
    savePurchase: (data) => apiClient._saveCollection('purchases', data),
    deletePurchase: (id) => apiClient._deleteCollection('purchases', id),

    getSuppliers: () => apiClient._getCollection('suppliers'),
    saveSupplier: (data) => apiClient._saveCollection('suppliers', data),
    deleteSupplier: (id) => apiClient._deleteCollection('suppliers', id),

    getBankAccounts: () => apiClient._getCollection('bank-accounts'),
    saveBankAccount: (data) => apiClient._saveCollection('bank-accounts', data),
    deleteBankAccount: (id) => apiClient._deleteCollection('bank-accounts', id),

    getBankTransactions: () => apiClient._getCollection('bank-transactions'),
    saveBankTransaction: (data) => apiClient._saveCollection('bank-transactions', data),
    deleteBankTransaction: (id) => apiClient._deleteCollection('bank-transactions', id),

    getJournalVouchers: () => apiClient._getCollection('journal-vouchers'),
    saveJournalVoucher: (data) => apiClient._saveCollection('journal-vouchers', data),
    deleteJournalVoucher: (id) => apiClient._deleteCollection('journal-vouchers', id),

    getFixedAssets: () => apiClient._getCollection('fixed-assets'),
    saveFixedAsset: (data) => apiClient._saveCollection('fixed-assets', data),
    deleteFixedAsset: (id) => apiClient._deleteCollection('fixed-assets', id),

    getAssetCategories: () => apiClient._getCollection('asset-categories'),
    saveAssetCategory: (data) => apiClient._saveCollection('asset-categories', data),
    deleteAssetCategory: (id) => apiClient._deleteCollection('asset-categories', id),

    getExpenses: () => apiClient._getCollection('expenses'),
    saveExpense: (data) => apiClient._saveCollection('expenses', data),
    deleteExpense: (id) => apiClient._deleteCollection('expenses', id),

    getEmployees: () => apiClient._getCollection('employees'),
    saveEmployee: (data) => apiClient._saveCollection('employees', data),
    deleteEmployee: (id) => apiClient._deleteCollection('employees', id),

    // --- Cheques ---
    getCheques: () => apiClient._getCollection('cheques'),
    saveCheque: (data) => apiClient._saveCollection('cheques', data),
    deleteCheque: (id) => apiClient._deleteCollection('cheques', id),

    // --- Medicines ---
    getMedicines: () => apiClient._getCollection('medicines'),
    saveMedicine: (data) => apiClient._saveCollection('medicines', data),
    deleteMedicine: (id) => apiClient._deleteCollection('medicines', id),

    // --- Medicine Payments ---
    getMedPayments: () => apiClient._getCollection('med-payments'),
    saveMedPayment: (data) => apiClient._saveCollection('med-payments', data),

    // --- Medicine Purchase Invoices ---
    getMedPurchaseInvoices: () => apiClient._getCollection('med-purchase-invoices'),
    saveMedPurchaseInvoice: (data) => apiClient._saveCollection('med-purchase-invoices', data),
    deleteMedPurchaseInvoice: (id) => apiClient._deleteCollection('med-purchase-invoices', id),

    // --- Marketing Visits ---
    getMarketingVisits: async (startDate, endDate) => {
        let qs = apiClient._getAuthQuery();
        if (startDate) qs += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) qs += `&endDate=${encodeURIComponent(endDate)}`;
        try {
            const response = await fetch(`${API_BASE_URL}/marketing-visits${qs}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('Error fetching marketing-visits:', error);
            return null;
        }
    },
    saveMarketingVisit: (data) => apiClient._saveCollection('marketing-visits', data),
    deleteMarketingVisit: (id) => apiClient._deleteCollection('marketing-visits', id),

    // --- Follow-ups ---
    getFollowUps: () => apiClient._getCollection('follow-ups'),
    saveFollowUp: (data) => apiClient._saveCollection('follow-ups', data),
    deleteFollowUp: (id) => apiClient._deleteCollection('follow-ups', id),

    // --- Reminders ---
    getReminders: () => apiClient._getCollection('reminders'),
    saveReminder: (data) => apiClient._saveCollection('reminders', data),
    deleteReminder: (id) => apiClient._deleteCollection('reminders', id),

    // --- Scraps & Production (for stock calculation) ---
    getScraps: () => apiClient._getCollection('scraps'),
    saveScrap: (data) => apiClient._saveCollection('scraps', data),
    deleteScrap: (id) => apiClient._deleteCollection('scraps', id),

    getProductions: () => apiClient._getCollection('production'),
    saveProduction: (data) => apiClient._saveCollection('production', data),
    deleteProduction: (id) => apiClient._deleteCollection('production', id),

    // --- Custom Fields & Dynamic Schema Records ---
    getCustomFields: () => apiClient._getCollection('custom-fields'),
    saveCustomField: (data) => apiClient._saveCollection('custom-fields', data),
    deleteCustomField: (id) => apiClient._deleteCollection('custom-fields', id),
    reorderCustomFields: async (data) => {
        try {
            const response = await fetch(`${API_BASE_URL}/custom-fields/reorder${apiClient._getAuthQuery()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Error reordering custom fields:', error);
            return { success: false, message: error.message };
        }
    },
    getCustomRecords: async (moduleName) => {
        try {
            const response = await fetch(`${API_BASE_URL}/custom-records/${moduleName}${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error(`Error fetching custom records for ${moduleName}:`, error);
            return null;
        }
    },
    saveCustomRecord: (data) => apiClient._saveCollection('custom-records', data),
    deleteCustomRecord: (id) => apiClient._deleteCollection('custom-records', id),

    // --- Shadow Ledger / Vault ---
    getShadowLedger: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/shadow_ledger${apiClient._getAuthQuery()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('Error fetching shadow ledger:', error);
            return null;
        }
    },
    saveShadowLedger: async (data) => {
        try {
            const currentUser = localStorage.getItem('currentUser') || 'System';
            const response = await fetch(`${API_BASE_URL}/shadow_ledger${apiClient._getAuthQuery()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shadow_ledger_data: data, user: currentUser })
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving shadow ledger:', error);
            return { success: false, message: error.message };
        }
    },

    // --- Tenant Identifier Helper ---
    getTenantId: async () => {
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser === 'DEVELOPER' || currentUser === '7908040851') {
            return '7908040851'; // Force developer into the correct support tenant
        }

        let tenant = 'System';
        if (window.electronAPI && window.electronAPI.getAppSettings) {
            try {
                const settings = await window.electronAPI.getAppSettings();
                if (settings && settings.companyName) {
                    tenant = settings.companyName;
                }
            } catch (e) { }
        } else if (typeof APP_SETTINGS !== 'undefined' && APP_SETTINGS.COMPANY_NAME) {
            tenant = APP_SETTINGS.COMPANY_NAME;
        } else {
            try {
                const adminUsers = JSON.parse(localStorage.getItem('ADMIN_USERS')) || [];
                const admin = adminUsers.find(u => u.role === 'Admin') || adminUsers[0];
                if (admin && admin.username) tenant = admin.username;
            } catch (e) { }
        }
        return tenant.replace(/[^a-zA-Z0-9 ]/gi, '_').trim();
    },

    // --- Chatter ---
    getMessages: async () => {
        const tenant = await apiClient.getTenantId();
        const auth = apiClient._getAuthQuery();
        const sep = auth.includes('?') ? '&' : '?';
        try {
            const response = await fetch(`${API_BASE_URL}/chatter${auth}${sep}tenant=${encodeURIComponent(tenant)}&_t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (e) { return null; }
    },
    saveMessage: async (data) => {
        // Do not overwrite tenant if it's already set (for cross-tenant messages)
        if (!data.tenant) {
            data.tenant = await apiClient.getTenantId();
        }

        // Pass explicit tenant via query string to bypass backend tenant overwrite middlewares
        const auth = apiClient._getAuthQuery();
        const sep = auth.includes('?') ? '&' : '?';
        const url = `${API_BASE_URL}/chatter${auth}${sep}tenant=${encodeURIComponent(data.tenant)}`;

        try {
            if (!data.createdBy) data.createdBy = localStorage.getItem('currentUser') || 'System';
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(data)
            });

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return await response.json();
            } else {
                if (response.status === 413) throw new Error("Payload Too Large: The file exceeds network size limits.");
                if (response.status === 404) throw new Error(`404 Not Found: The API endpoint '/api/chatter' does not exist on the server.`);
                throw new Error(`Server returned HTML instead of JSON (${response.status}).`);
            }
        } catch (error) {
            console.error('Error saving chatter:', error);
            return { success: false, message: error.message };
        }
    },
    deleteMessage: (id) => apiClient._deleteCollection('chatter', id),
    getChatterGroups: async () => {
        const tenant = await apiClient.getTenantId();
        const auth = apiClient._getAuthQuery();
        const sep = auth.includes('?') ? '&' : '?';
        try {
            const response = await fetch(`${API_BASE_URL}/chatter-groups${auth}${sep}tenant=${encodeURIComponent(tenant)}&_t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (e) { return null; }
    },
    saveChatterGroup: async (data) => {
        data.tenant = await apiClient.getTenantId();
        return apiClient._saveCollection('chatter-groups', data);
    },
    deleteChatterGroup: (id) => apiClient._deleteCollection('chatter-groups', id),
    getTypingStatus: async () => {
        const tenant = await apiClient.getTenantId();
        try {
            const response = await fetch(`${API_BASE_URL}/chatter/typing?tenant=${encodeURIComponent(tenant)}&_t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) { return null; }
    },
    setTypingStatus: async (user, isTyping) => {
        const tenant = await apiClient.getTenantId();
        try {
            await fetch(`${API_BASE_URL}/chatter/typing?tenant=${encodeURIComponent(tenant)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, isTyping, tenant })
            });
        } catch (error) { }
    },
    getOnlineUsers: async () => {
        const tenant = await apiClient.getTenantId();
        try {
            const response = await fetch(`${API_BASE_URL}/chatter/online?tenant=${encodeURIComponent(tenant)}&_t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) { return null; }
    },
    setOnlineStatus: async (user) => {
        const tenant = await apiClient.getTenantId();
        try {
            await fetch(`${API_BASE_URL}/chatter/online?tenant=${encodeURIComponent(tenant)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, tenant })
            });
        } catch (error) { }
    },


    // --- Maintenance ---
    cleanupAnonymousRecords: async (firestoreDb) => {
        try {
            const response = await fetch(`${API_BASE_URL}/cleanup-anonymous${apiClient._getAuthQuery()}`, {
                method: 'POST'
            });
            const result = await response.json();

            if (result.success) {
                if (firestoreDb && result.deletedCustomerIds && result.deletedCustomerIds.length > 0) {
                    result.deletedCustomerIds.forEach(id => firestoreDb.collection('customers').doc(id).delete().catch(e => console.warn(e)));
                }
                if (firestoreDb && result.deletedSupplierIds && result.deletedSupplierIds.length > 0) {
                    result.deletedSupplierIds.forEach(id => firestoreDb.collection('suppliers').doc(id).delete().catch(e => console.warn(e)));
                }
                console.log(result.message);
            }
            return result;
        } catch (error) {
            console.error('Error cleaning up anonymous records:', error);
            return { success: false, message: error.message };
        }
    },


    // --- Replaced Electron IPC Calls ---
    sendEmail: async (payload) => {
        try {
            const response = await fetch(`${API_BASE_URL}/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // --- Email Inbox & IMAP ---
    getInboxEmails: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/inbox`, { cache: 'no-store' });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    checkNewEmails: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/unread-count`, { cache: 'no-store' });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    markEmailRead: async (uid) => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};