/**
 * apiClient.js
 * Handles all communication between the Frontend and the Express Backend.
 */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = localStorage.getItem('backendApiUrl') || (isLocal
    ? 'https://rtr-crm-online.onrender.com/api'
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
            const response = await fetch(`${API_BASE_URL}/settings${apiClient._getAuthQuery()}`);
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
            const response = await fetch(`${API_BASE_URL}/admin-creds${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error fetching admin creds:', error);
            return null;
        }
    },

    getLoginHistory: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/login-history${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching login history:', error);
            return [];
        }
    },

    // --- Customers ---
    getCustomers: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/customers${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching customers:', error);
            return [];
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
            const response = await fetch(`${API_BASE_URL}/invoices${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching invoices:', error);
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
    deleteInvoice: (id) => apiClient._deleteCollection('invoices', id),

    // --- Credit/Debit Notes ---
    getCreditDebitNotes: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/credit-debit-notes${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching credit/debit notes:', error);
            return [];
        }
    },
    saveCreditDebitNote: async (data) => apiClient._saveCollection('credit-debit-notes', data),
    deleteCreditDebitNote: async (id) => apiClient._deleteCollection('credit-debit-notes', id),

    // --- Generic Fetch / Save for other collections ---
    _getCollection: async (collectionName) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return [];
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
            return await response.json();
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
            const response = await fetch(`${API_BASE_URL}/marketing-visits${qs}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching marketing-visits:', error);
            return [];
        }
    },
    saveMarketingVisit: (data) => apiClient._saveCollection('marketing-visits', data),
    deleteMarketingVisit: (id) => apiClient._deleteCollection('marketing-visits', id),

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
            const response = await fetch(`${API_BASE_URL}/custom-records/${moduleName}${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error(`Error fetching custom records for ${moduleName}:`, error);
            return [];
        }
    },
    saveCustomRecord: (data) => apiClient._saveCollection('custom-records', data),
    deleteCustomRecord: (id) => apiClient._deleteCollection('custom-records', id),

    // --- Shadow Ledger / Vault ---
    getShadowLedger: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/shadow_ledger${apiClient._getAuthQuery()}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching shadow ledger:', error);
            return [];
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
            const response = await fetch(`${API_BASE_URL}/emails/inbox`);
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    checkNewEmails: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/unread-count`);
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