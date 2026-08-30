from pathlib import Path
p=Path('/mnt/data/b360work/frontend/quotation.html')
s=p.read_text(encoding='utf-8')
old='''            <div id="enquiryContext" style="display:none;margin:12px 0;padding:10px 12px;border:1px solid #d7e3f0;border-radius:6px;background:#f7fbff;font-size:13px;"></div>\n\n            <!-- Table -->'''
new='''            <!-- Optional Saved Enquiry Link -->
            <div class="customer-section" style="margin-top:-10px; margin-bottom:18px;">
                <label style="display:block; margin-bottom:8px;">Link Saved Enquiry <span style="font-weight:normal;color:#777;">(Optional)</span></label>
                <select id="enquirySelect" style="width:100%;" onchange="onEnquirySelected(this.value)">
                    <option value="">— No Enquiry Linked —</option>
                </select>
                <small style="display:block;margin-top:6px;color:#777;">Select a saved enquiry to relate this quotation to the enquiry workflow. The selected enquiry will be stored with the quotation.</small>
            </div>

            <div id="enquiryContext" style="display:none;margin:12px 0;padding:10px 12px;border:1px solid #d7e3f0;border-radius:6px;background:#f7fbff;font-size:13px;"></div>

            <!-- Table -->'''
assert old in s
s=s.replace(old,new)
old='''        async function fetchQuotationReferences() {
            try {
                const [remoteCustomers, remoteItems] = await Promise.all([
                    typeof apiClient !== 'undefined' && apiClient.getCustomers ? apiClient.getCustomers() : null,
                    typeof apiClient !== 'undefined' && apiClient.getItems ? apiClient.getItems() : null
                ]);

                if (Array.isArray(remoteCustomers)) {
                    localStorage.setItem('customers', JSON.stringify(remoteCustomers));
                    customers = remoteCustomers;
                    refreshCustomerList(remoteCustomers);
                }
                if (Array.isArray(remoteItems)) {
                    localStorage.setItem('items', JSON.stringify(remoteItems));
                    refreshItemList(remoteItems);
                }
            } catch (error) {
                console.warn("Failed to sync quotation references from backend:", error);
            }
        }

        window.enquiryContext = null;

        function applyEnquiryContext() {
            const p = new URLSearchParams(window.location.search);
            if (p.get('fromEnquiry') !== '1' || !p.get('enquiryId')) return;
            window.enquiryContext = {
                enquiryId: p.get('enquiryId') || '', enquiryNo: p.get('enquiryNo') || '',
                customerId: p.get('customerId') || '', customerName: p.get('customerName') || '',
                plantName: p.get('plantName') || '', contactName: p.get('contactName') || '',
                requirement: p.get('requirement') || '', subject: p.get('subject') || ''
            };'''
new='''        async function fetchQuotationReferences() {
            try {
                const [remoteCustomers, remoteItems, remoteEnquiries] = await Promise.all([
                    typeof apiClient !== 'undefined' && apiClient.getCustomers ? apiClient.getCustomers() : null,
                    typeof apiClient !== 'undefined' && apiClient.getItems ? apiClient.getItems() : null,
                    typeof apiClient !== 'undefined' && apiClient.getCrmEnquiries ? apiClient.getCrmEnquiries() : null
                ]);

                if (Array.isArray(remoteCustomers)) {
                    localStorage.setItem('customers', JSON.stringify(remoteCustomers));
                    customers = remoteCustomers;
                    refreshCustomerList(remoteCustomers);
                }
                if (Array.isArray(remoteItems)) {
                    localStorage.setItem('items', JSON.stringify(remoteItems));
                    refreshItemList(remoteItems);
                }
                if (Array.isArray(remoteEnquiries)) {
                    localStorage.setItem('crm_enquiries', JSON.stringify(remoteEnquiries));
                }
                populateEnquiryDropdown();
            } catch (error) {
                console.warn("Failed to sync quotation references from backend:", error);
                populateEnquiryDropdown();
            }
        }

        function getSavedEnquiries() {
            try {
                const rows = JSON.parse(localStorage.getItem('crm_enquiries') || '[]');
                return Array.isArray(rows) ? rows : [];
            } catch (e) { return []; }
        }

        function enquiryLabel(e) {
            const no = e.enquiryNo || e.id || 'Enquiry';
            const customer = e.customerName || e.customer || '';
            const subject = e.subject || e.requirement || '';
            const target = e.targetDate ? ` · Target: ${e.targetDate}` : '';
            return [no, customer, subject].filter(Boolean).join(' | ') + target;
        }

        function populateEnquiryDropdown(selectedId = '') {
            const select = document.getElementById('enquirySelect');
            if (!select) return;
            const enquiries = getSavedEnquiries().sort((a,b) => new Date(b.enquiryDate || b.createdAt || 0) - new Date(a.enquiryDate || a.createdAt || 0));
            const current = selectedId || select.value || '';
            select.innerHTML = '<option value="">— No Enquiry Linked —</option>' + enquiries.map(e =>
                `<option value="${escapeHtml(String(e.id || ''))}">${escapeHtml(enquiryLabel(e))}</option>`
            ).join('');
            if (current) select.value = String(current);
        }

        function getEnquiryByIdOrNo(id, no) {
            return getSavedEnquiries().find(e => String(e.id || '') === String(id || '') || (no && String(e.enquiryNo || '') === String(no))) || null;
        }

        function setEnquiryContextFromRecord(e) {
            if (!e) {
                window.enquiryContext = null;
                const context = document.getElementById('enquiryContext');
                if (context) { context.style.display = 'none'; context.innerHTML = ''; }
                return;
            }
            window.enquiryContext = {
                enquiryId: e.id || '', enquiryNo: e.enquiryNo || '',
                customerId: e.customerId || '', customerName: e.customerName || e.customer || '',
                plantName: e.plantName || '', contactName: e.contactName || '',
                requirement: e.requirement || '', subject: e.subject || '', targetDate: e.targetDate || ''
            };
            const cust = document.getElementById('custName');
            if (cust && window.enquiryContext.customerName) { cust.value = window.enquiryContext.customerName; fillCustomerDetails(); }
            const contact = document.getElementById('custContact');
            if (contact && window.enquiryContext.contactName) contact.value = window.enquiryContext.contactName;
            const context = document.getElementById('enquiryContext');
            if (context) {
                context.style.display = 'block';
                context.innerHTML = '<b>Linked Enquiry:</b> ' + escapeHtml(window.enquiryContext.enquiryNo) +
                    ' &nbsp;|&nbsp; <b>Subject:</b> ' + escapeHtml(window.enquiryContext.subject || '-') +
                    (window.enquiryContext.targetDate ? ' &nbsp;|&nbsp; <b>Target Date:</b> ' + escapeHtml(window.enquiryContext.targetDate) : '') +
                    (window.enquiryContext.plantName ? ' &nbsp;|&nbsp; <b>Plant:</b> ' + escapeHtml(window.enquiryContext.plantName) : '') +
                    (window.enquiryContext.requirement ? '<br><b>Requirement:</b> ' + escapeHtml(window.enquiryContext.requirement) : '');
            }
        }

        function onEnquirySelected(id) {
            if (!id) { setEnquiryContextFromRecord(null); return; }
            const e = getEnquiryByIdOrNo(id, '');
            if (!e) return;
            setEnquiryContextFromRecord(e);
            const ref = document.getElementById('refNo');
            if (ref && !ref.value && e.enquiryNo) ref.value = 'QT-' + String(e.enquiryNo).replace(/^ENQ-/, '');
        }

        window.enquiryContext = null;

        function applyEnquiryContext() {
            populateEnquiryDropdown();
            const p = new URLSearchParams(window.location.search);
            if (p.get('fromEnquiry') !== '1' || !p.get('enquiryId')) return;
            window.enquiryContext = {
                enquiryId: p.get('enquiryId') || '', enquiryNo: p.get('enquiryNo') || '',
                customerId: p.get('customerId') || '', customerName: p.get('customerName') || '',
                plantName: p.get('plantName') || '', contactName: p.get('contactName') || '',
                requirement: p.get('requirement') || '', subject: p.get('subject') || '', targetDate: p.get('targetDate') || ''
            };
            const select = document.getElementById('enquirySelect');
            if (select) select.value = window.enquiryContext.enquiryId;
            const saved = getEnquiryByIdOrNo(window.enquiryContext.enquiryId, window.enquiryContext.enquiryNo);
            if (saved) setEnquiryContextFromRecord(saved);'''
assert old in s
s=s.replace(old,new)
# Remove duplicate old context application block after the new saved context setup, preserving ref/customer behavior.
old2='''            const ref = document.getElementById('refNo');
            if (ref && !ref.value && window.enquiryContext.enquiryNo) ref.value = 'QT-' + window.enquiryContext.enquiryNo.replace(/^ENQ-/, '');
            const cust = document.getElementById('custName');
            if (cust && window.enquiryContext.customerName) { cust.value = window.enquiryContext.customerName; fillCustomerDetails(); }
            if (window.enquiryContext.contactName) document.getElementById('custContact').value = window.enquiryContext.contactName;
            const context = document.getElementById('enquiryContext');
            if (context) {
                context.style.display = 'block';
                context.innerHTML = '<b>Linked Enquiry:</b> ' + escapeHtml(window.enquiryContext.enquiryNo) +
                    ' &nbsp;|&nbsp; <b>Subject:</b> ' + escapeHtml(window.enquiryContext.subject || '-') +
                    (window.enquiryContext.plantName ? ' &nbsp;|&nbsp; <b>Plant:</b> ' + escapeHtml(window.enquiryContext.plantName) : '') +
                    (window.enquiryContext.requirement ? '<br><b>Requirement:</b> ' + escapeHtml(window.enquiryContext.requirement) : '');
            }
        }'''
new2='''            const ref = document.getElementById('refNo');
            if (ref && !ref.value && window.enquiryContext.enquiryNo) ref.value = 'QT-' + window.enquiryContext.enquiryNo.replace(/^ENQ-/, '');
            if (!saved) setEnquiryContextFromRecord(window.enquiryContext);
        }'''
assert old2 in s
s=s.replace(old2,new2,1)
# Save target and explicit enquiry fields from dropdown/context
old3='''                enquiryId: window.enquiryContext?.enquiryId || '',
                enquiryNo: window.enquiryContext?.enquiryNo || '',
                enquiryRequirement: window.enquiryContext?.requirement || '',
                enquirySubject: window.enquiryContext?.subject || '',
                plantName: window.enquiryContext?.plantName || '',
                contactName: window.enquiryContext?.contactName || '',
                items,'''
new3='''                enquiryId: window.enquiryContext?.enquiryId || document.getElementById('enquirySelect')?.value || '',
                enquiryNo: window.enquiryContext?.enquiryNo || getEnquiryByIdOrNo(document.getElementById('enquirySelect')?.value, '')?.enquiryNo || '',
                enquiryRequirement: window.enquiryContext?.requirement || '',
                enquirySubject: window.enquiryContext?.subject || '',
                enquiryTargetDate: window.enquiryContext?.targetDate || '',
                plantName: window.enquiryContext?.plantName || '',
                contactName: window.enquiryContext?.contactName || '',
                items,'''
assert old3 in s
s=s.replace(old3,new3)
# Load existing quotation: restore linked enquiry after customer/address
old4='''                document.getElementById("custAddress").value = quotation.custAddress || "";
                document.getElementById("termsConditions").value = quotation.terms || "";
                renderDynamicFields(quotation);'''
new4='''                document.getElementById("custAddress").value = quotation.custAddress || "";
                document.getElementById("termsConditions").value = quotation.terms || "";
                populateEnquiryDropdown(quotation.enquiryId || '');
                const linkedEnquiry = getEnquiryByIdOrNo(quotation.enquiryId || '', quotation.enquiryNo || '');
                if (linkedEnquiry) setEnquiryContextFromRecord(linkedEnquiry);
                else if (quotation.enquiryId || quotation.enquiryNo) setEnquiryContextFromRecord({
                    id: quotation.enquiryId || '', enquiryNo: quotation.enquiryNo || '',
                    customerName: quotation.custName || '', requirement: quotation.enquiryRequirement || '',
                    subject: quotation.enquirySubject || '', targetDate: quotation.enquiryTargetDate || ''
                });
                renderDynamicFields(quotation);'''
assert old4 in s
s=s.replace(old4,new4,1)
p.write_text(s,encoding='utf-8')

# Patch enquiry creation URL to include target date
p=Path('/mnt/data/b360work/frontend/enquiry.html')
s=p.read_text(encoding='utf-8')
s=s.replace("subject:e.subject||''});window.location.href='quotation.html?'", "subject:e.subject||'',targetDate:e.targetDate||''});window.location.href='quotation.html?'")
p.write_text(s,encoding='utf-8')

# Patch Business 360 transactions to include target date, resolving quotation target from linked enquiry.
p=Path('/mnt/data/b360work/frontend/business360.js')
s=p.read_text(encoding='utf-8')
old="""        const rows = this.currentType === 'customer' ? [\n            ...(d.enquiries || []).map(r => ({ page:'enquiry.html', id:r.id || r.enquiryNo, ref:r.enquiryNo || r.id, desc:r.subject || r.requirement, value:r.estimatedValue, status:r.status, date:r.enquiryDate })),\n            ...(d.quotations || []).map(r => ({ page:'quotation.html', id:r.id || r.refNo, ref:r.refNo || r.id, desc:'Quotation', value:r.grandTotal || r.totalValue, status:r.status, date:r.date }))\n        ] :"""
new="""        const linkedEnquiries = d.enquiries || [];\n        const findLinkedEnquiry = (q) => linkedEnquiries.find(e =>\n            (q.enquiryId && String(e.id || '') === String(q.enquiryId)) ||\n            (q.enquiryNo && String(e.enquiryNo || '') === String(q.enquiryNo))\n        );\n        const rows = this.currentType === 'customer' ? [\n            ...linkedEnquiries.map(r => ({ page:'enquiry.html', id:r.id || r.enquiryNo, ref:r.enquiryNo || r.id, desc:r.subject || r.requirement, value:r.estimatedValue, status:r.status, date:r.enquiryDate, targetDate:r.targetDate })),\n            ...(d.quotations || []).map(r => { const e = findLinkedEnquiry(r); return { page:'quotation.html', id:r.id || r.refNo, ref:r.refNo || r.id, desc:'Quotation', value:r.grandTotal || r.totalValue, status:r.status, date:r.date, targetDate:r.targetDate || r.enquiryTargetDate || e?.targetDate || '' }; })\n        ] :"""
assert old in s
s=s.replace(old,new)
s=s.replace("<th>Record</th><th>Date</th><th>Description</th><th>Value</th><th>Status</th>", "<th>Record</th><th>Date</th><th>Target Date</th><th>Description</th><th>Value</th><th>Status</th>",1)
s=s.replace("<td>${this.esc(r.date || '—')}</td><td>${this.esc(r.desc || '—')}</td><td>${this.money(r.value)}</td><td>", "<td>${this.esc(r.date || '—')}</td><td>${this.esc(r.targetDate || '—')}</td><td>${this.esc(r.desc || '—')}</td><td>${this.money(r.value)}</td><td>",1)
s=s.replace("<td colspan=\"5\" class=\"b360-empty-small\">", "<td colspan=\"6\" class=\"b360-empty-small\">")
p.write_text(s,encoding='utf-8')
