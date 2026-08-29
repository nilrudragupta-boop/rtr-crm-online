# Phase 2 – Two-way Enquiry ↔ Quotation Link

Implemented:
- Quotation pages now expose a **View Enquiry** button when an enquiry reference is present.
- The button navigates to `enquiry.html` carrying `id` and/or `enquiryNo`.
- Existing quotation/enquiry logic is preserved; the integration is additive.
- The enquiry page accepts the linked-enquiry URL parameters and emits a `crm:open-enquiry` event for existing/custom enquiry-detail code to consume.

Workflow:
Enquiry ↔ Quotation → Negotiation → PO → Invoice → Payment
