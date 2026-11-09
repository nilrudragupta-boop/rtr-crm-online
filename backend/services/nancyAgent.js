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
async function runNancyAgent({ userId, prompt, conversationHistory = [], dataStore }) {
    if (!process.env.GEMINI_API_KEY) {
        const error = new Error('Nancy is not configured. Set GEMINI_API_KEY on the server.');
        error.code = 'NANCY_NOT_CONFIGURED';
        throw error;
    }
    if (!dataStore) throw new Error('Nancy data services are unavailable.');

    let GoogleGenAI;
    try {
        ({ GoogleGenAI } = require('@google/genai'));
    } catch (cause) {
        const error = new Error('Nancy dependencies are not installed. Run npm install in the backend folder.');
        error.code = 'NANCY_NOT_CONFIGURED';
        error.cause = cause;
        throw error;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
        model: 'gemini-2.5-flash',
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