const crypto = require('crypto');
const Type = { OBJECT: 'OBJECT', STRING: 'STRING' };


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

        checkItemStock: async ({ itemName }) => {
            return await dataStore.findStock({
                userId,
                item: itemName
            });
        },

        getLedgerSummary: async ({ partyName }) => {
            return await dataStore.getLedgerBalance({
                userId,
                party: partyName
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
        description: "Find customer details, contact numbers, and balances for this user.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                customerName: { type: Type.STRING, description: 'Name or partial name of the customer' },
                phone: { type: Type.STRING, description: 'Mobile/WhatsApp number' }
            }
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
                partyName: { type: Type.STRING, description: 'Customer or supplier ledger account name' }
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
            const error = new Error('No active Gemini API key is configured for this user.');
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

async function runNancyAgent({ userId, prompt, conversationHistory = [], dataStore }) {
    if (!dataStore) throw new Error('Nancy data services are unavailable.');
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
    const tools = createNancyTools(userId, dataStore);

    const systemInstruction = `
You are Nancy, the voice and intelligence assistant for RISE Tech Revolution (RTR).
You assist individual users over voice/call while they work in their enterprise software.
CRITICAL SECURITY RULE: You only have access to records belonging strictly to the caller's account (User ID: ${userId}). 
Never guess or fabricate records. If an item or invoice is not found via your tools, politely state so.
Keep answers concise, direct, and conversational so they are pleasant to listen to when read aloud.
`;

    // Start chat with Nancy's function declarations
    const chat = ai.chats.create({
        model: 'gemini-3.8-flash',
        config: {
            systemInstruction,
            tools: [{ functionDeclarations: nancyToolDeclarations }]
        },
        history: Array.isArray(conversationHistory) ? conversationHistory.slice(-20) : []
    });

    let response = await chat.sendMessage({ message: prompt });

    let toolRounds = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && toolRounds < 8) {
        toolRounds += 1;
        const functionResponses = await Promise.all(response.functionCalls.map(async call => {
            const toolHandler = tools[call.name];
            let result;
            if (!toolHandler) {
                result = { error: `Tool ${call.name} is not available.` };
            } else {
                try {
                    result = await toolHandler(call.args || {});
                } catch (error) {
                    result = { error: `Could not complete ${call.name}.` };
                }
            }
            return { functionResponse: { name: call.name, response: { result } } };
        }));
        response = await chat.sendMessage({ message: functionResponses });
    }

    if (response.functionCalls && response.functionCalls.length > 0) {
        throw new Error('Nancy could not complete the request. Please try a more specific question.');
    }

    return {
        reply: response.text || 'I could not find an answer to that question.',
        updatedHistory: await chat.getHistory()
    };
}

module.exports = { runNancyAgent };