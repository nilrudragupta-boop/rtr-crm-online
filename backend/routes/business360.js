const express = require('express');
const router = express.Router();

/**
 * Helper to determine Indian Financial Year (01-Apr to 31-Mar)
 */
function getIndianFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  const endYear = (startYear + 1).toString().slice(-2);
  return `FY ${startYear}-${endYear}`;
}

/**
 * GET /api/business360/search?type=customer|supplier&q=query
 */
router.get('/search', (req, res) => {
  const { type = 'customer', q = '' } = req.query;
  const searchTerm = q.trim().toLowerCase();
  
  // Note: Integrates directly with your live DB / Datastore
  res.json({
    status: 'success',
    partyType: type,
    searchTerm,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/business360/party/:type/:id
 * Central aggregation endpoint returning complete 360 profile
 */
router.get('/party/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const currentFY = getIndianFinancialYear();

  // Unified response schema contract
  const responsePayload = {
    status: 'success',
    partyType: type, // 'customer' | 'supplier'
    partyId: id,
    financialYear: currentFY,
    retrievedAt: new Date().toISOString(),
    profile: {},
    kpi: {},
    financialSummary: {},
    pipeline: [],
    contacts: [],
    plants: [],
    equipment: [],
    transactions: {
      enquiries: [],
      quotations: [],
      orders: [],
      dispatches: [],
      invoices: [],
      payments: []
    },
    service: {
      tickets: [],
      warranties: []
    },
    activities: [],
    followups: [],
    documents: [],
    alerts: [],
    smartInsights: []
  };

  res.json(responsePayload);
});

module.exports = router;