# RISE Tech CRM V2 — Foundation Build

This build adds a non-destructive CRM V2 foundation on top of the existing RISE Tech CRM.

## Added
- `backend/routes/crm_v2.js` — relationship engine, universal activities, audit log, global search, executive overview, customer/supplier 360 APIs, and relationship migration.
- `frontend/crm_v2.html` — new CRM V2 Control Centre.
- `frontend/crm_v2.js` — API-backed dashboard, global search, pipeline and module launcher.
- `dashboardB.html` — CRM V2 navigation entry.

## Important architecture
Relationships use stable internal IDs rather than displayed document numbers. Existing modules remain intact.

## API endpoints
- `GET /api/crm/v2/health`
- `GET /api/crm/v2/overview`
- `GET /api/crm/v2/search?q=...`
- `GET /api/crm/v2/customer/:id`
- `GET /api/crm/v2/supplier/:id`
- `GET /api/crm/v2/relationships`
- `POST /api/crm/v2/relationships`
- `GET /api/crm/v2/record/:module/:id/relationships`
- `GET /api/crm/v2/activities`
- `POST /api/crm/v2/activities`
- `GET /api/crm/v2/audit`
- `POST /api/crm/v2/audit`
- `POST /api/crm/v2/migrate-links`

## First-run recommendation
After starting the backend and confirming MongoDB connectivity, run:
`POST /api/crm/v2/migrate-links`

This creates non-destructive relationship records between existing enquiries, quotations, customers, invoices and purchases. It does not delete or rewrite existing transactions.

## Existing modules preserved
The build does not replace the existing invoice, enquiry, quotation, customer, supplier or Business 360 pages. It provides a new V2 control layer that can be integrated into them incrementally.
