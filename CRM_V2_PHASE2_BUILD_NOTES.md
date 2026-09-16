# RISE Tech CRM V2 Phase 2 — Connected CRM Integration

Version: 2.1.0

## Purpose
Phase 2 turns the V2 relationship engine into an integration layer used by the existing CRM pages. Existing page workflows are preserved; V2 adds relationship synchronization, audit logging and related-record visibility.

## Integrated modules
- customer.html
- supplier.html
- enquiry.html
- quotation.html
- business360.html
- follow_up.html
- invoice.html
- purchase.html

## Core changes
1. Added `frontend/crm_v2_integration.js`.
2. Existing API save operations are wrapped so successful records automatically create CRM V2 relationships.
3. Customer/Supplier/Enquiry/Quotation/Invoice/Purchase/Follow-up records can be connected through the V2 relationship API.
4. Related-record panels are injected into Customer/Supplier/Quotation views and the Enquiry/Business 360 contexts.
5. V2 audit entries are written after successful record synchronization.
6. Existing quotation-to-enquiry linking remains compatible with both enquiry ID and enquiry number.
7. Added `/api/crm/v2/record/:module/:id/related` for resolved related-record retrieval.
8. CRM V2 Module Centre now exposes Order Execution, Purchase Dashboard and Invoice Dashboard.
9. Existing invoice and CRM pages are not rewritten; Phase 2 is an integration layer.

## Relationship examples
Customer -> Quotation: HAS_QUOTATION
Customer -> Invoice: HAS_INVOICE
Customer -> Enquiry: HAS_ENQUIRY
Customer -> Purchase/other supported records: HAS_<MODULE>
Enquiry -> Quotation: GENERATED_QUOTATION
Enquiry -> Invoice: BILLED_TO_INVOICE
Quotation -> Invoice: BILLED_TO_INVOICE
Supplier -> Purchase: HAS_PURCHASE

## First run
The integration attempts the existing V2 `/api/crm/v2/migrate-links` endpoint after page initialization to backfill relationships from existing records.

## Important
The browser must be able to reach the configured backend API. If the API is unavailable, a local relationship cache is retained in `localStorage` under `crm_v2_relationships`; normal existing CRM save workflows are not blocked by V2 synchronization failures.
