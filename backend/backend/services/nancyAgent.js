const crypto = require('crypto');
const Type = { OBJECT: 'object', STRING: 'string' };


// 1. Nancy's tools (Every tool explicitly requires userId from the authenticated session)
function createNancyTools(userId, dataStore) {
    return {
        searchInvoices: async ({ query, status }) => {
            // Replace with your real DB / collection filter scoped strictly to userId
            return await dataStore.findInvoices({
                userId,
                search: query,
                status: status || undefined
            });
        },

        searchCustomers: async ({ customerName, phone }) => {
            return await dataStore.findCustomers({
                userId,
                name: customerName,
                phone: phone
            });
        },

        searchSuppliers: async ({ supplierName }) => dataStore.getRecordDetails({ userId, type: 'supplier', name: supplierName }),
        searchItems: async ({ itemName }) => dataStore.getRecordDetails({ userId, type: 'item', name: itemName }),

        getCustomerDetails: async ({ customerName }) => dataStore.getRecordDetails({ userId, type: 'customer', name: customerName }),
        getSupplierDetails: async ({ supplierName }) => dataStore.getRecordDetails({ userId, type: 'supplier', name: supplierName }),
        getItemDetails: async ({ itemName }) => dataStore.getRecordDetails({ userId, type: 'item', name: itemName }),

        checkItemStock: async ({ itemName }) => {
            return await dataStore.findStock({
                userId,
                item: itemName
            });
        },

        getLowStockItems: async () => dataStore.findLowStockItems({ userId }),

        getLedgerSummary: async ({ partyName, partyType }) => {
            return await dataStore.getLedgerBalance({
                userId,
                party: partyName,
                partyType
            });
        },

        getSalesSummary: async ({ period }) => {
            return await dataStore.getSalesSummary({ userId, period });
        },

        getUnpaidInvoices: async () => {
            return await dataStore.getUnpaidInvoices({ userId });
        }
    };
}

// 2. Tool Declarations for Gemini
const nancyToolDeclarations = [
    {
        name: 'searchInvoices',
        description: "Search invoices and billing records belonging strictly to the user's business.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'Invoice number, customer name, or item description' },
                status: { type: Type.STRING, description: 'Optional status: PAID, UNPAID, OVERDUE' }
            }
        }
    },
    {
        name: 'searchCustomers',
        description: "Search this user's customers by name or phone and return their matching records.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                customerName: { type: Type.STRING, description: 'Name or partial name of the customer' },
                phone: { type: Type.STRING, description: 'Mobile/WhatsApp number' }
            }
        }
    },
    {
        name: 'searchSuppliers',
        description: "Search this user's suppliers by name, phone, email, address, or GSTIN and return matching records.",
        parameters: {
            type: Type.OBJECT,
            properties: { supplierName: { type: Type.STRING, description: 'Supplier name or search text' } },
            required: ['supplierName']
        }
    },
    {
        name: 'searchItems',
        description: "Search this user's inventory by item name, item code, description, or index number and return matching records.",
        parameters: {
            type: Type.OBJECT,
            properties: { itemName: { type: Type.STRING, description: 'Item name, code, description, or index number' } },
            required: ['itemName']
        }
    },
    {
        name: 'getCustomerDetails',
        description: "Find detailed information about a customer by full or partial name, limited to the caller's business.",
        parameters: {
            type: Type.OBJECT,
            properties: { customerName: { type: Type.STRING, description: 'Full or partial customer name' } },
            required: ['customerName']
        }
    },
    {
        name: 'getSupplierDetails',
        description: "Find detailed information about a supplier by full or partial name, limited to the caller's business.",
        parameters: {
            type: Type.OBJECT,
            properties: { supplierName: { type: Type.STRING, description: 'Full or partial supplier name' } },
            required: ['supplierName']
        }
    },
    {
        name: 'getItemDetails',
        description: "Find detailed information about an inventory item by name, code, or description, limited to the caller's business.",
        parameters: {
            type: Type.OBJECT,
            properties: { itemName: { type: Type.STRING, description: 'Item name, code, or description' } },
            required: ['itemName']
        }
    },
    {
        name: 'checkItemStock',
        description: 'Check stock availability and godown quantities for an inventory item.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                itemName: { type: Type.STRING, description: 'Name or code of the product/item' }
            },
            required: ['itemName']
        }
    },
    {
        name: 'getLedgerSummary',
        description: 'Get ledger balance, outstanding dues, or payment summary for a party.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                partyName: { type: Type.STRING, description: 'Customer or supplier ledger account name' },
                partyType: { type: Type.STRING, enum: ['customer', 'supplier'], description: 'Specify the party type when known' }
            },
            required: ['partyName']
        }
    },
    {
        name: 'getSalesSummary',
        description: 'Summarize invoice sales for today or the current month.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                period: { type: Type.STRING, enum: ['today', 'month'] }
            },
            required: ['period']
        }
    },
    {
        name: 'getUnpaidInvoices',
        description: 'List unpaid and partially paid invoices with outstanding balances.',
        parameters: {
            type: Type.OBJECT,
            properties: {}
        }
    }
];

// 3. Nancy Chat Handler
async function lookupGeminiApiKey(userId) {
    const lookupUrl = process.env.NANCY_KEY_LOOKUP_URL;
    const sharedSecret = process.env.NANCY_KEY_LOOKUP_SECRET;
    if (!lookupUrl || !sharedSecret || sharedSecret.length < 32) {
        const error = new Error('Nancy key lookup is not configured on the server.');
        error.code = 'NANCY_NOT_CONFIGURED';
        throw error;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(lookupUrl);
    } catch (cause) {
        const error = new Error('Nancy key lookup URL is invalid.');
        error.code = 'NANCY_NOT_CONFIGURED';
        throw error;
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'script.google.com') {
        const error = new Error('Nancy key lookup must use the HTTPS Apps Script deployment URL.');
        error.code = 'NANCY_NOT_CONFIGURED';
        throw error;
    }

    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(24).toString('base64url');
    const canonical = `${userId}\n${timestamp}\n${nonce}`;
    const signature = crypto.createHmac('sha256', sharedSecret).update(canonical).digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(parsedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, timestamp, nonce, signature }),
            signal: controller.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('Nancy key lookup returned HTTP status:', response.status);
            const error = new Error('Nancy could not contact the key lookup service.');
            error.code = 'NANCY_LOOKUP_UNAVAILABLE';
            throw error;
        }
        if (!result.ok || typeof result.apiKey !== 'string' || !result.apiKey.trim()) {
            console.error('Nancy key lookup rejected the request or found no active key.');
            const error = new Error('Nancy not activated. Please contact your administrator.');
            error.code = 'NANCY_KEY_UNAVAILABLE';
            throw error;
        }
        return result.apiKey.trim();
    } catch (cause) {
        if (cause.code) throw cause;
        console.error('Nancy key lookup network error:', {
            name: cause.name,
            code: cause.cause && cause.cause.code
        });
        const error = new Error('Nancy could not contact the key lookup service.');
        error.code = 'NANCY_LOOKUP_UNAVAILABLE';
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function withTimeout(promise, timeoutMs, stage = 'upstream service') {
    let timer;
    const timeoutPromise = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`Nancy request timed out while waiting for ${stage}.`);
            error.code = 'NANCY_UPSTREAM_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

async function getDirectAnswer(prompt, tools) {
    const query = String(prompt || '').trim();
    const normalized = query.toLowerCase().replace(/[?.!]+$/g, '').trim();

    if (/^(unpaid invoices|unpaid bills|unpaid invoice summary|unpaid bills summary)$/.test(normalized)) {
        const invoices = await withTimeout(tools.getUnpaidInvoices({}), 8000, 'MongoDB unpaid-invoice query');
        if (!invoices.length) return 'No unpaid invoices found.';
        const rows = invoices.slice(0, 8).map((invoice, index) =>
            `**Sl No: ${index + 1}** | **Invoice No: ${invoice.invoiceNo || 'Invoice'}** - ${invoice.customerName || 'Unknown customer'}: **Dues: ${formatCurrency(invoice.outstanding)}**`);
        return `Found ${invoices.length} unpaid invoices.\n${rows.join('\n')}`;
    }

    if (/^(total sales this month|sales this month|monthly sales)$/.test(normalized)) {
        const summary = await withTimeout(tools.getSalesSummary({ period: 'month' }), 8000, 'MongoDB monthly-sales query');
        return `This month: ${formatCurrency(summary.totalSales)} across ${summary.invoiceCount} invoices.`;
    }

    if (/^(total sales today|today'?s sales|sales today)$/.test(normalized)) {
        const summary = await withTimeout(tools.getSalesSummary({ period: 'today' }), 8000, 'MongoDB daily-sales query');
        return `Today: ${formatCurrency(summary.totalSales)} across ${summary.invoiceCount} invoices.`;
    }

    if (/^(recent invoices|search recent invoices|latest invoices)$/.test(normalized)) {
        const invoices = await withTimeout(tools.searchInvoices({}), 8000, 'MongoDB recent-invoice query');
        if (!invoices.length) return 'No recent invoices found.';
        const rows = invoices.slice(0, 8).map(invoice =>
            `${invoice.invoiceNo || invoice.invoice_no || 'Invoice'} - ${invoice.customerName || invoice.customer_name || 'Unknown customer'}: ${formatCurrency(Number(invoice.invoice_total) || Number(invoice.invoiceTotal) || Number(invoice.grandTotal) || Number(invoice.total))} (${invoice.status || 'status unknown'})`);
        return `Here are ${Math.min(invoices.length, 8)} recent invoices:\n${rows.join('\n')}`;
    }

    if (/^(?:(?:please\s+)?(?:show|list|check|tell me|find|what are)\s+)?(?:the\s+)?(?:low|short)\s+stock(?:\s+items?)?(?:\s+(?:list|report))?$/.test(normalized)
        || /^(?:(?:please\s+)?(?:show|list|find|tell me)\s+)?(?:items?|products?)\s+(?:that are\s+)?(?:low|short)\s+(?:on\s+)?stock$/i.test(query)
        || /^(?:(?:please\s+)?(?:show|list|find|tell me)\s+)?(?:items?|products?)\s+(?:that\s+)?need(?:s)?\s+restocking$/i.test(query)) {
        const items = await withTimeout(tools.getLowStockItems(), 8000, 'MongoDB low-stock query');
        const low = items.filter(item => item.stockStatus === 'Low Stock');
        const unavailable = items.filter(item => item.stockStatus === 'Out of Stock' || item.stockStatus === 'Negative Stock');
        const formatItem = item => {
            const name = item.name || item.itemName || item.item_name || item.itemCode || 'Unnamed item';
            const code = item.itemCode || item.item_code || item.code;
            const quantity = Number(item.currentStock) || 0;
            const unit = item.uom || item.unit || 'units';
            const codeText = code ? ` [${code}]` : '';
            const statusText = item.stockStatus === 'Low Stock'
                ? `low: ${quantity} ${unit} (below ${item.reorderThreshold} ${unit})`
                : `${item.stockStatus.toLowerCase()}: ${quantity} ${unit}`;
            return `• ${name}${codeText} — ${statusText}`;
        };
        if (!low.length && !unavailable.length) return 'No low-stock or out-of-stock items found. All listed items are above the stock report’s low-stock threshold.';
        const sections = ['Stock status (same thresholds as the Stock Availability Report):'];
        if (low.length) sections.push(`Low stock (${low.length}):\n${low.slice(0, 15).map(formatItem).join('\n')}`);
        if (unavailable.length) sections.push(`Out of stock or negative stock (${unavailable.length}; needs attention first):\n${unavailable.slice(0, 15).map(formatItem).join('\n')}`);
        const total = low.length + unavailable.length;
        if (total > 15) sections.push(`Showing up to 15 items per section (${total} matching items total).`);
        sections.push('Low stock means below 5 units, or below 500 for gm/ml items; zero and negative quantities are listed separately.');
        return sections.join('\n\n');
    }

    const fieldMatch = query.match(/^(?:please\s+)?(?:(?:show(?:\s+me)?|get|find(?:\s+me)?|tell me|give me|what is|what's|whats)\s+)?(?:the\s+)?(?:contact(?:\s+(?:details|number))?|phone|mobile|email|address|gstin|gst\s*(?:number|no)?|opening balance|closing balance)\s+(?:of|for)\s+(customer|supplier)\s+(.+)$/i)
        || query.match(/^(?:please\s+)?(?:(?:show(?:\s+me)?|get|find(?:\s+me)?|tell me|give me|what is|what's|whats)\s+)?(?:the\s+)?(customer|supplier)\s+(.+?)\s+(contact(?:\s+(?:details|number))?|phone|mobile|email|address|gstin|gst\s*(?:number|no)?|opening balance|closing balance)$/i);
    const lookupMatch = query.match(/^(?:search|find|look up)\s+(customer|supplier)\s+by\s+(?:contact|phone|mobile|email|address|gstin|gst number)\s+(.+)$/i)
        || query.match(/^(?:search|find|look up)\s+(item)\s+by\s+(?:code|name|description)\s+(.+)$/i);
    const detailMatch = lookupMatch || (fieldMatch
        ? [fieldMatch[0], fieldMatch[1], fieldMatch[2]]
        : query.match(/^(?:(?:show(?:\s+me)?|get|tell me|give me)\s+)?(?:the\s+)?(customer|supplier|item)\s+(?:details|information|info)(?:\s+(?:for|of|about))?\s+(.+)$/i)
        || query.match(/^(?:show(?:\s+me)?|get|tell me|give me)\s+(?:the\s+)?(customer|supplier|item)\s+(.+?)\s+(?:details|information|info)$/i)
        || query.match(/^(?:details|information|info)\s+(?:of|for|about)\s+(customer|supplier|item)\s+(.+)$/i)
        || query.match(/^(?:tell me about|what do you know about)\s+(?:the\s+)?(customer|supplier|item)\s+(.+)$/i)
        || query.match(/^(?:search|find|look up)\s+(customer|supplier)\s+(.+)$/i)
        || query.match(/^(?:search|find|look up)\s+(item)\s+(?!stock\b)(.+)$/i));
    if (detailMatch) {
        const type = detailMatch[1].toLowerCase();
        const name = detailMatch[2].trim();
        const records = await withTimeout(tools[`get${type[0].toUpperCase()}${type.slice(1)}Details`]({
            [type === 'customer' ? 'customerName' : type === 'supplier' ? 'supplierName' : 'itemName']: name
        }), 8000, `MongoDB ${type}-details query`);
        if (!records.length) return `I couldn't find a ${type} matching “${name}”.`;

        const requestedField = fieldMatch
            ? (query.match(/contact(?:\s+(?:details|number))?|phone|mobile|email|address|gstin|gst\s*(?:number|no)?|opening balance|closing balance/i)?.[0] || '')
                .toLowerCase().replace(/\s+number$/, '').replace(/^phone$|^mobile$/, 'contact').replace(/^gst(?:\s*(?:number|no)?)$/, 'gstin')
            : '';
        const rows = await Promise.all(records.slice(0, 5).map(async record => {
            const balance = type === 'item' ? null : await withTimeout(tools.getLedgerSummary({
                partyName: record.name,
                partyType: type
            }), 8000, `MongoDB ${type}-balance query`);
            const openingType = balance?.openingBalanceType || (type === 'customer' ? 'Dr' : 'Cr');
            const closingType = balance?.closingBalanceType || openingType;
            const fields = (type === 'customer' ? [
                ['Contact', record.contact || record.phone || record.mobile || record.customerPhone], ['Email', record.email],
                ['Address', [record.address || record.customerAddress, record.district, record.state, record.pin || record.pinCode].filter(Boolean).join(', ')],
                ['GSTIN', record.gst || record.gstin || record.gst_no || record.gstNo || record.customerGST],
                ['Opening balance', `${formatCurrency(Math.abs(balance?.openingBalance ?? record.openingBalance ?? 0))} (${openingType})`],
                ['Closing balance', `${formatCurrency(Math.abs(balance?.closingBalance ?? balance?.outstanding ?? record.openingBalance ?? 0))} (${closingType})`]
            ] : type === 'supplier' ? [
                ['Contact', record.contact || record.phone || record.mobile], ['Email', record.email],
                ['Address', [record.address, record.district, record.state, record.pin || record.pinCode].filter(Boolean).join(', ')],
                ['GSTIN', record.gstin || record.gst_no || record.gstNo || record.supplierGST],
                ['Opening balance', `${formatCurrency(Math.abs(balance?.openingBalance ?? record.openingBalance ?? 0))} (${openingType})`],
                ['Closing balance', `${formatCurrency(Math.abs(balance?.closingBalance ?? balance?.outstanding ?? record.openingBalance ?? 0))} (${closingType})`]
            ] : [
                ['Item code', record.itemCode || record.item_code || record.code], ['Index no', record.indexNo], ['Description', record.description], ['Category', record.category],
                ['Stock', `${record.currentStock ?? record.stock ?? record.quantity ?? 0} ${record.uom || record.unit || ''}`.trim()],
                ['Unit', record.uom || record.unit], ['Selling price', (record.sellingPrice ?? record.salePrice) === undefined ? '' : formatCurrency(record.sellingPrice ?? record.salePrice)],
                ['Purchase price', (record.purchasePrice ?? record.averagePurchasePrice) === undefined ? '' : formatCurrency(record.purchasePrice ?? record.averagePurchasePrice)],
                ['GST', (record.gstRate ?? record.gst) === undefined ? '' : `${record.gstRate ?? record.gst}%`], ['HSN', record.hsnCode || record.hsn]
            ]).filter(([, value]) => value !== undefined && value !== null && value !== '');
            if (requestedField) {
                const selected = requestedField === 'contact details'
                    ? fields.filter(([label]) => ['contact', 'email'].includes(label.toLowerCase()))
                    : fields.filter(([label]) => label.toLowerCase().includes(requestedField));
                if (selected.length) return `${record.name || name}: ${selected.map(([label, value]) => `${label}: ${value}`).join('; ')}`;
            }
            return `${record.name || record.itemCode || name}: ${fields.map(([label, value]) => `${label}: ${value}`).join('; ')}`;
        }));
        return rows.join('\n');
    }

    const flexibleStockMatch = query.match(/^(?:(?:please\s+)?(?:check|show(?:\s+me)?|get|find|search|tell me|what(?:'s| is)?|how much|how many)\s+)?(?:(?:the\s+)?(?:current\s+)?(?:item\s+)?stock(?:\s+(?:(?:for|of|in)\s+)?(.+))?|item\s+(.+?)\s+(?:stock|quantity)|(?:quantity|stock)\s+(?:of|for)\s+(?:item\s+)?(.+)|(?:how many)\s+(.+?)\s+(?:do we have|are available|in stock))$/i);
    if (flexibleStockMatch) {
        const itemName = (flexibleStockMatch[1] || flexibleStockMatch[2] || flexibleStockMatch[3] || flexibleStockMatch[4] || '').trim().replace(/^item\s+/i, '');
        if (!itemName) return 'Which item stock would you like me to check?';
        const items = await withTimeout(tools.checkItemStock({ itemName }), 8000, 'MongoDB item-stock query');
        if (!items.length) return `I couldn't find an item matching "${itemName}".`;
        return items.slice(0, 8).map(item =>
            `${item.name || item.itemName || item.item_name || item.itemCode || item.item_code || 'Item'}: ${Number(item.currentStock ?? item.stock ?? item.quantity) || 0} ${item.uom || item.unit || 'units'}`).join('\n');
    }

    const customerMatch = query.match(/^(?:(?:please\s+)?(?:show(?:\s+me)?|tell me|get|check)\s+(?:the\s+)?)?(?:customer\s+)?balance(?:\s+(?:for|of))?\s*(.*)$/i);
    if (customerMatch) {
        const party = customerMatch[1].trim();
        if (!party) return 'Which customer’s balance would you like me to check?';
        const balance = await withTimeout(tools.getLedgerSummary({ partyName: party, partyType: 'customer' }), 8000, 'MongoDB customer-ledger query');
        if (!balance) return `I couldn’t find a ledger for “${party}”.`;
        return `${balance.party}: opening balance ${formatCurrency(Math.abs(balance.openingBalance))} (${balance.openingBalanceType}); outstanding ${formatCurrency(balance.outstanding)}; closing balance ${formatCurrency(Math.abs(balance.closingBalance))} (${balance.closingBalanceType}).`;
    }

    const supplierMatch = query.match(/^(?:(?:please\s+)?(?:show(?:\s+me)?|tell me|get|check)\s+(?:the\s+)?)?(?:supplier\s+)?dues(?:\s+(?:for|of))?\s*(.*)$/i);
    if (supplierMatch) {
        const party = supplierMatch[1].trim();
        if (!party) return 'Which supplier’s dues would you like me to check?';
        const balance = await withTimeout(tools.getLedgerSummary({ partyName: party, partyType: 'supplier' }), 8000, 'MongoDB supplier-ledger query');
        if (!balance) return `I couldn’t find a ledger for “${party}”.`;
        return `${balance.party}: opening balance ${formatCurrency(Math.abs(balance.openingBalance))} (${balance.openingBalanceType}); outstanding dues ${formatCurrency(balance.outstanding)}; closing balance ${formatCurrency(Math.abs(balance.closingBalance))} (${balance.closingBalanceType}).`;
    }

    return null;
}

async function runNancyAgent({ userId, prompt, previousInteractionId, dataStore }) {
    if (!dataStore) throw new Error('Nancy data services are unavailable.');
    const tools = createNancyTools(userId, dataStore);
    const directAnswer = await getDirectAnswer(prompt, tools);
    if (directAnswer) return { reply: directAnswer, interactionId: null };

    const apiKey = await lookupGeminiApiKey(userId);

    let GoogleGenAI;
    try {
        ({ GoogleGenAI } = require('@google/genai'));
    } catch (cause) {
        const error = new Error('Nancy dependencies are not installed. Run npm install in the backend folder.');
        error.code = 'NANCY_NOT_CONFIGURED';
        error.cause = cause;
        throw error;
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
You are Nancy, the voice and intelligence assistant for RISE Tech Revolution (RTR).
You assist individual users over voice/call while they work in their enterprise software.
CRITICAL SECURITY RULE: You only have access to records belonging strictly to the caller's account (User ID: ${userId}). 
Never guess or fabricate records. If an item or invoice is not found via your tools, politely state so.
For requests for customer, supplier, or item details, use the matching detail tool and summarize the fields it returns. Never invent missing contact, address, price, or stock values.
Interpret typed requests by the named record and requested information. For example, use item search for product names/codes, customer or supplier search for party names/contact fields, and the ledger tool for opening, outstanding, or closing balances. If the record type or name is missing, ask a short clarifying question.
Keep answers concise, direct, and conversational so they are pleasant to listen to when read aloud.
`;

    const deadline = Date.now() + 35000;
    const createInteraction = ({ input: interactionInput, previousInteractionId }) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            const error = new Error('Nancy request timed out while waiting for search results.');
            error.code = 'NANCY_UPSTREAM_TIMEOUT';
            throw error;
        }
        return withTimeout(ai.interactions.create({
            model: 'gemini-3.8-flash',
            input: interactionInput,
            tools: nancyToolDeclarations.map(tool => ({ type: 'function', ...tool })),
            system_instruction: systemInstruction,
            generation_config: { thinking_level: 'low' },
            store: true,
            ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {})
        }), remaining, 'Your search results ');
    };

    let interaction = await createInteraction({
        input: prompt,
        previousInteractionId: previousInteractionId || ''
    });

    let toolRounds = 0;
    while (toolRounds < 8) {
        const functionCalls = (interaction.steps || []).filter(step => step.type === 'function_call');
        if (functionCalls.length === 0) break;
        toolRounds += 1;
        const functionResults = await withTimeout(Promise.all(functionCalls.map(async call => {
            const toolHandler = tools[call.name];
            let result;
            if (!toolHandler) {
                result = { error: `Tool ${call.name} is not available.` };
            } else {
                try {
                    result = await toolHandler(typeof call.arguments === 'string'
                        ? JSON.parse(call.arguments)
                        : call.arguments || {});
                } catch (error) {
                    result = { error: `Could not complete ${call.name}.` };
                }
            }
            return {
                type: 'function_result',
                name: call.name,
                call_id: call.id,
                result: [{ type: 'text', text: JSON.stringify(result) }]
            };
        })), Math.max(1, deadline - Date.now()), 'Nancy data tools');
        interaction = await createInteraction({
            input: functionResults,
            previousInteractionId: interaction.id
        });
    }

    if ((interaction.steps || []).some(step => step.type === 'function_call')) {
        throw new Error('Nancy could not complete the request. Please try a more specific question.');
    }

    return {
        reply: interaction.output_text || 'I could not find an answer to that question.',
        interactionId: interaction.id
    };
}

module.exports = { runNancyAgent };
