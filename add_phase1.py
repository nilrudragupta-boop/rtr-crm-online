from pathlib import Path
root=Path('/tmp/crm')
idx=root/'backend/index.js'
s=idx.read_text()
insert="""
// --- CRM Phase 1 Schemas ---
const crmContactSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    customerId: { type: String, index: true },
    customerName: String,
    name: { type: String, required: true },
    designation: String,
    department: String,
    contactType: String,
    mobile: String,
    alternateMobile: String,
    email: String,
    preferredCommunication: String,
    remarks: String,
    isPrimary: { type: Boolean, default: false },
    createdBy: String
}, { timestamps: true, strict: false });

const crmPlantSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    customerId: { type: String, index: true },
    customerName: String,
    plantName: { type: String, required: true },
    plantCode: String,
    address: String,
    district: String,
    state: String,
    pin: String,
    industry: String,
    unitDetails: String,
    equipmentSummary: String,
    status: { type: String, default: 'Active' },
    remarks: String,
    createdBy: String
}, { timestamps: true, strict: false });

const crmActivitySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    customerId: { type: String, index: true },
    customerName: String,
    plantId: String,
    plantName: String,
    activityType: { type: String, default: 'Note' },
    activityDate: { type: String, required: true },
    activityTime: String,
    subject: String,
    details: String,
    outcome: String,
    nextAction: String,
    nextFollowUp: String,
    relatedModule: String,
    relatedId: String,
    createdBy: String
}, { timestamps: true, strict: false });

const crmDocumentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    customerId: { type: String, index: true },
    customerName: String,
    plantId: String,
    plantName: String,
    documentType: String,
    documentName: { type: String, required: true },
    documentDate: String,
    referenceNo: String,
    fileName: String,
    mimeType: String,
    fileData: String,
    remarks: String,
    createdBy: String
}, { timestamps: true, strict: false });

"""
marker='// --- 8. Bank Account Schema ---'
s=s.replace(marker,insert+marker)
old="""    Customer: mongoose.model('Customer', customerSchema),
"""
new=old+"""    CrmContact: mongoose.model('CrmContact', crmContactSchema),
    CrmPlant: mongoose.model('CrmPlant', crmPlantSchema),
    CrmActivity: mongoose.model('CrmActivity', crmActivitySchema),
    CrmDocument: mongoose.model('CrmDocument', crmDocumentSchema),
"""
s=s.replace(old,new)
idx.write_text(s)

srv=root/'backend/server.js'
s=srv.read_text()
s=s.replace("const { Customer, Invoice, Item, Supplier, Purchase, CreditDebitNote, BankAccount, BankTransaction, JournalVoucher, Scrap, Production, Bom, Expense, Employee, CustomField, CustomRecord, Message, ChatterGroup } = require('./index');",
"const { Customer, CrmContact, CrmPlant, CrmActivity, CrmDocument, Invoice, Item, Supplier, Purchase, CreditDebitNote, BankAccount, BankTransaction, JournalVoucher, Scrap, Production, Bom, Expense, Employee, CustomField, CustomRecord, Message, ChatterGroup } = require('./index');")
route="""
// --- CRM Phase 1 Routes ---
function crmRoutes(app, Model, basePath) {
    app.get(basePath, async (req, res) => {
        try {
            const query = req.query.user ? { createdBy: req.query.user } : {};
            const data = await Model.find(query).sort({ createdAt: -1 });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });
    app.post(basePath, async (req, res) => {
        try {
            const payload = { ...req.body };
            if (!payload.createdBy && req.query.user) payload.createdBy = req.query.user;
            if (!payload.id) payload.id = `${basePath.replace('/api/','').replace(/-/g,'_')}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            const data = await Model.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true, setDefaultsOnInsert: true });
            res.status(200).json({ success: true, data });
        } catch (err) { res.status(400).json({ success: false, message: err.message }); }
    });
    app.delete(`${basePath}/:id`, async (req, res) => {
        try { await Model.findOneAndDelete({ id: req.params.id }); res.json({ success: true }); }
        catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });
}
crmRoutes(app, CrmContact, '/api/crm-contacts');
crmRoutes(app, CrmPlant, '/api/crm-plants');
crmRoutes(app, CrmActivity, '/api/crm-activities');
crmRoutes(app, CrmDocument, '/api/crm-documents');

app.get('/api/crm/customer/:id/360', async (req, res) => {
    try {
        const id = req.params.id;
        const customer = await Customer.findOne({ id });
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        const [contacts, plants, activities, documents, followUps] = await Promise.all([
            CrmContact.find({ customerId: id }).sort({ createdAt: -1 }),
            CrmPlant.find({ customerId: id }).sort({ createdAt: -1 }),
            CrmActivity.find({ customerId: id }).sort({ activityDate: -1, createdAt: -1 }).limit(50),
            CrmDocument.find({ customerId: id }).select('-fileData').sort({ createdAt: -1 }),
            FollowUp.find({ partyType: 'Customer', partyId: id }).sort({ date: 1 }).limit(20)
        ]);
        res.json({ success: true, data: { customer, contacts, plants, activities, documents, followUps } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

"""
# Insert before custom field routes, after followups so FollowUp exists
s=s.replace('// --- Custom Field Routes ---',route+'// --- Custom Field Routes ---')
srv.write_text(s)

# Create phase 1 UI
page=root/'frontend/crm_phase1.html'
page.write_text(r'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM - Phase 1</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><script src="apiClient.js"></script><script src="brand.service.js"></script><script src="brandLoader.js"></script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Tahoma,sans-serif;background:#f4f6f8;color:#263238}button,input,select,textarea{font:inherit}button{border:0;border-radius:6px;padding:8px 12px;cursor:pointer;font-weight:600}.primary{background:#0d6efd;color:#fff}.success{background:#198754;color:#fff}.danger{background:#dc3545;color:#fff}.secondary{background:#6c757d;color:#fff}.muted{color:#6c757d}.app{display:flex;min-height:100vh}.side{width:230px;background:#17202a;color:#fff;padding:16px;position:sticky;top:0;height:100vh}.side h2{font-size:18px;margin:4px 0 20px}.nav{display:flex;gap:10px;align-items:center;width:100%;background:transparent;color:#ddd;text-align:left;margin:4px 0}.nav:hover,.nav.active{background:#273746;color:#fff}.main{flex:1;padding:20px;min-width:0}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.top h1{margin:0;font-size:22px}.cards{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:12px;margin-bottom:16px}.card{background:#fff;border-radius:10px;padding:15px;box-shadow:0 2px 7px #0000000d}.card .num{font-size:24px;font-weight:700;margin-top:6px}.layout{display:grid;grid-template-columns:330px 1fr;gap:16px}.panel{background:#fff;border-radius:10px;box-shadow:0 2px 7px #0000000d;overflow:hidden}.panel-head{padding:13px 15px;border-bottom:1px solid #e9ecef;display:flex;justify-content:space-between;align-items:center;gap:8px}.panel-body{padding:15px}.search{width:100%;padding:9px;border:1px solid #ced4da;border-radius:6px;margin-bottom:10px}.customer{padding:11px;border:1px solid #eee;border-radius:7px;margin:7px 0;cursor:pointer}.customer:hover,.customer.sel{border-color:#0d6efd;background:#eef5ff}.customer b{display:block}.tabs{display:flex;gap:4px;border-bottom:1px solid #ddd;padding:0 15px;overflow:auto}.tab{background:transparent;color:#495057;border-radius:0;padding:12px 14px;white-space:nowrap}.tab.active{color:#0d6efd;border-bottom:3px solid #0d6efd}.section{display:none}.section.active{display:block}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{margin-bottom:10px}.field label{display:block;font-size:12px;font-weight:700;color:#495057;margin-bottom:4px}.field input,.field select,.field textarea{width:100%;padding:8px;border:1px solid #ced4da;border-radius:6px}.field textarea{min-height:75px;resize:vertical}.toolbar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.tablewrap{overflow:auto}.data{width:100%;border-collapse:collapse}.data th,.data td{padding:9px;border-bottom:1px solid #eee;text-align:left;font-size:13px;vertical-align:top}.data th{background:#f8f9fa;white-space:nowrap}.timeline{border-left:3px solid #dee2e6;margin:8px 0 8px 8px;padding-left:18px}.event{position:relative;margin:0 0 16px}.event:before{content:'';position:absolute;left:-25px;top:4px;width:10px;height:10px;background:#0d6efd;border-radius:50%}.badge{display:inline-block;padding:3px 7px;border-radius:12px;background:#e9ecef;font-size:11px;font-weight:700}.empty{text-align:center;padding:35px;color:#6c757d}.modal{display:none;position:fixed;inset:0;background:#0008;z-index:20;align-items:center;justify-content:center}.modal.open{display:flex}.modalbox{background:#fff;width:720px;max-width:94vw;max-height:92vh;overflow:auto;border-radius:10px;padding:18px}.close{float:right;background:transparent;color:#6c757d;font-size:22px;padding:0}.toast{position:fixed;right:20px;bottom:20px;background:#212529;color:#fff;padding:12px 16px;border-radius:7px;display:none;z-index:30}@media(max-width:1000px){.cards{grid-template-columns:repeat(3,1fr)}.layout{grid-template-columns:1fr}.side{display:none}}@media(max-width:600px){.cards{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
</style></head><body>
<div class="app"><aside class="side"><h2><i class="fas fa-chart-line"></i> CRM <span data-brand="name"></span></h2><button class="nav active" onclick="showTab('overview')"><i class="fas fa-gauge"></i> Customer 360°</button><button class="nav" onclick="showTab('contacts')"><i class="fas fa-address-book"></i> Contacts</button><button class="nav" onclick="showTab('plants')"><i class="fas fa-industry"></i> Plants</button><button class="nav" onclick="showTab('activities')"><i class="fas fa-clock-rotate-left"></i> Activities</button><button class="nav" onclick="showTab('followups')"><i class="fas fa-bell"></i> Follow-ups</button><button class="nav" onclick="showTab('documents')"><i class="fas fa-folder-open"></i> Documents</button><hr><button class="nav" onclick="location.href='customer.html'"><i class="fas fa-users"></i> Customer Master</button><button class="nav" onclick="location.href='dashboardB.html'"><i class="fas fa-arrow-left"></i> Main Dashboard</button></aside>
<main class="main"><div class="top"><h1><i class="fas fa-users-gear"></i> CRM Phase 1</h1><div><button class="secondary" onclick="loadAll()"><i class="fas fa-sync"></i> Refresh</button></div></div>
<div class="cards"><div class="card"><div class="muted">Customers</div><div class="num" id="cCustomers">0</div></div><div class="card"><div class="muted">Contacts</div><div class="num" id="cContacts">0</div></div><div class="card"><div class="muted">Plants</div><div class="num" id="cPlants">0</div></div><div class="card"><div class="muted">Activities</div><div class="num" id="cActivities">0</div></div><div class="card"><div class="muted">Open Follow-ups</div><div class="num" id="cFollowups">0</div></div><div class="card"><div class="muted">Documents</div><div class="num" id="cDocuments">0</div></div></div>
<div class="layout"><section class="panel"><div class="panel-head"><b>Customer Directory</b><button class="primary" onclick="location.href='customer.html'">Manage</button></div><div class="panel-body"><input id="customerSearch" class="search" placeholder="Search customer..." oninput="renderCustomers()"><div id="customerList"></div></div></section>
<section class="panel"><div class="tabs"><button class="tab active" data-tab="overview" onclick="showTab('overview')">Overview</button><button class="tab" data-tab="contacts" onclick="showTab('contacts')">Contacts</button><button class="tab" data-tab="plants" onclick="showTab('plants')">Plants</button><button class="tab" data-tab="activities" onclick="showTab('activities')">Activities</button><button class="tab" data-tab="followups" onclick="showTab('followups')">Follow-ups</button><button class="tab" data-tab="documents" onclick="showTab('documents')">Documents</button></div><div class="panel-body">
<div id="overview" class="section active"></div><div id="contacts" class="section"></div><div id="plants" class="section"></div><div id="activities" class="section"></div><div id="followups" class="section"></div><div id="documents" class="section"></div>
</div></section></div></main></div>
<div id="modal" class="modal"><div class="modalbox"><button class="close" onclick="closeModal()">&times;</button><div id="modalBody"></div></div></div><div id="toast" class="toast"></div>
<script>
const state={customers:[],contacts:[],plants:[],activities:[],documents:[],followups:[],selected:null,tab:'overview'};
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const id=(p)=>p+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
async function api(path,opts={}){const r=await fetch('/api'+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const j=await r.json();if(!r.ok||j.success===false)throw Error(j.message||'Request failed');return j.data??j}
async function loadAll(){try{[state.customers,state.contacts,state.plants,state.activities,state.documents,state.followups]=await Promise.all([api('/customers'),api('/crm-contacts'),api('/crm-plants'),api('/crm-activities'),api('/crm-documents'),api('/follow-ups')]);renderCustomers();renderSelected();document.getElementById('cCustomers').textContent=state.customers.length;document.getElementById('cContacts').textContent=state.contacts.length;document.getElementById('cPlants').textContent=state.plants.length;document.getElementById('cActivities').textContent=state.activities.length;document.getElementById('cFollowups').textContent=state.followups.filter(x=>x.status==='Pending'||!x.status).length;document.getElementById('cDocuments').textContent=state.documents.length}catch(e){toast(e.message)}}
function renderCustomers(){const q=(document.getElementById('customerSearch').value||'').toLowerCase();const list=state.customers.filter(c=>[c.name,c.contact,c.email,c.gstin,c.district,c.state].join(' ').toLowerCase().includes(q));document.getElementById('customerList').innerHTML=list.length?list.map(c=>`<div class="customer ${state.selected?.id===c.id?'sel':''}" onclick="selectCustomer('${esc(c.id)}')"><b>${esc(c.name)}</b><small>${esc(c.district||'')}${c.state?' • '+esc(c.state):''}</small><br><small class="muted">${esc(c.contact||c.email||'')}</small></div>`).join(''):'<div class="empty">No customers found.</div>'}
function selectCustomer(cid){state.selected=state.customers.find(c=>c.id===cid)||null;renderCustomers();renderSelected()}
function showTab(tab){state.tab=tab;document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===tab));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));document.querySelectorAll('.side .nav').forEach(x=>x.classList.remove('active'));const nav=[...document.querySelectorAll('.side .nav')].find(x=>x.textContent.trim().toLowerCase().includes(tab==='overview'?'customer 360':tab));if(nav)nav.classList.add('active');renderSelected()}
function renderSelected(){const c=state.selected;if(!c){document.getElementById('overview').innerHTML='<div class="empty"><i class="fas fa-hand-pointer fa-2x"></i><br><br>Select a customer to open Customer 360°.</div>';['contacts','plants','activities','followups','documents'].forEach(x=>document.getElementById(x).innerHTML='<div class="empty">Select a customer first.</div>');return}const cid=c.id;const contacts=state.contacts.filter(x=>x.customerId===cid),plants=state.plants.filter(x=>x.customerId===cid),acts=state.activities.filter(x=>x.customerId===cid),docs=state.documents.filter(x=>x.customerId===cid),fus=state.followups.filter(x=>x.partyId===cid||(!x.partyId&&x.party===c.name));document.getElementById('overview').innerHTML=`<div class="toolbar"><button class="primary" onclick="openContact()"><i class="fas fa-user-plus"></i> Contact</button><button class="success" onclick="openPlant()"><i class="fas fa-industry"></i> Plant</button><button class="secondary" onclick="openActivity()"><i class="fas fa-plus"></i> Activity</button><button class="secondary" onclick="openFollowup()"><i class="fas fa-bell"></i> Follow-up</button><button class="secondary" onclick="openDocument()"><i class="fas fa-paperclip"></i> Document</button></div><h2 style="margin:5px 0">${esc(c.name)}</h2><p class="muted">${esc(c.address||'')}${c.district?', '+esc(c.district):''}${c.state?', '+esc(c.state):''} ${c.pin?'- '+esc(c.pin):''}</p><div class="grid2"><div class="card"><b>Customer Information</b><p>GSTIN: ${esc(c.gstin||'-')}<br>Phone: ${esc(c.contact||'-')}<br>Email: ${esc(c.email||'-')}</p></div><div class="card"><b>CRM Summary</b><p>Contacts: ${contacts.length}<br>Plants: ${plants.length}<br>Activities: ${acts.length}<br>Open Follow-ups: ${fus.filter(x=>x.status==='Pending'||!x.status).length}<br>Documents: ${docs.length}</p></div></div><h3>Recent Activity</h3>${acts.slice(0,8).map(a=>`<div class="timeline"><div class="event"><b>${esc(a.subject||a.activityType)}</b> <span class="badge">${esc(a.activityType)}</span><br><small>${esc(a.activityDate||'')} ${esc(a.activityTime||'')}</small><p style="margin:5px 0">${esc(a.details||a.outcome||'')}</p></div></div>`).join('')||'<div class="empty">No activity recorded.</div>'}`;
renderContacts(contacts);renderPlants(plants);renderActivities(acts);renderFollowups(fus);renderDocuments(docs)}
function renderContacts(rows){document.getElementById('contacts').innerHTML=`<div class="toolbar"><button class="primary" onclick="openContact()">+ New Contact</button></div><div class="tablewrap"><table class="data"><thead><tr><th>Name</th><th>Designation</th><th>Department</th><th>Mobile</th><th>Email</th><th>Primary</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.designation)}</td><td>${esc(x.department)}</td><td>${esc(x.mobile)}</td><td>${esc(x.email)}</td><td>${x.isPrimary?'Yes':'-'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No contacts.</td></tr>'}</tbody></table></div>`}
function renderPlants(rows){document.getElementById('plants').innerHTML=`<div class="toolbar"><button class="primary" onclick="openPlant()">+ New Plant</button></div><div class="tablewrap"><table class="data"><thead><tr><th>Plant</th><th>Code</th><th>Location</th><th>Industry</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.plantName)}</b><br><small>${esc(x.unitDetails||'')}</small></td><td>${esc(x.plantCode)}</td><td>${esc([x.district,x.state].filter(Boolean).join(', '))}</td><td>${esc(x.industry)}</td><td>${esc(x.status)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No plants.</td></tr>'}</tbody></table></div>`}
function renderActivities(rows){document.getElementById('activities').innerHTML=`<div class="toolbar"><button class="primary" onclick="openActivity()">+ Log Activity</button></div><div class="tablewrap"><table class="data"><thead><tr><th>Date</th><th>Type</th><th>Subject</th><th>Details</th><th>Next Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.activityDate)} ${esc(x.activityTime)}</td><td><span class="badge">${esc(x.activityType)}</span></td><td>${esc(x.subject)}</td><td>${esc(x.details||x.outcome)}</td><td>${esc(x.nextAction||'-')}<br>${esc(x.nextFollowUp||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No activities.</td></tr>'}</tbody></table></div>`}
function renderFollowups(rows){document.getElementById('followups').innerHTML=`<div class="toolbar"><button class="primary" onclick="openFollowup()">+ New Follow-up</button></div><div class="tablewrap"><table class="data"><thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Notes</th><th>Next Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.time)}</td><td>${esc(x.status||'Pending')}</td><td>${esc(x.notes||x.remarks||'')}</td><td>${esc(x.nextAction||'-')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No follow-ups.</td></tr>'}</tbody></table></div>`}
function renderDocuments(rows){document.getElementById('documents').innerHTML=`<div class="toolbar"><button class="primary" onclick="openDocument()">+ Add Document</button></div><div class="tablewrap"><table class="data"><thead><tr><th>Document</th><th>Type</th><th>Date</th><th>Reference</th><th>Remarks</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.documentName)}</td><td>${esc(x.documentType)}</td><td>${esc(x.documentDate)}</td><td>${esc(x.referenceNo)}</td><td>${esc(x.remarks)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No documents.</td></tr>'}</tbody></table></div>`}
function form(title,body,save){document.getElementById('modalBody').innerHTML=`<h2 style="margin-top:0">${title}</h2>${body}<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="${save}">Save</button></div>`;document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}
function field(id,label,val='',type='text',extra=''){return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}" ${extra}></div>`}function textarea(id,label,val=''){return `<div class="field"><label>${label}</label><textarea id="${id}">${esc(val)}</textarea></div>`}
function openContact(){if(!state.selected)return toast('Select a customer first');form('New Contact',`<div class="grid2">${field('n','Name *')}${field('d','Designation')}${field('dep','Department')}${field('mob','Mobile')}${field('alt','Alternate Mobile')}${field('em','Email','', 'email')}${field('pref','Preferred Communication','Phone')}${field('primary','Primary Contact','','checkbox')}</div>${textarea('remarks','Remarks')}`,'saveContact()')}
async function saveContact(){const p={id:id('contact'),customerId:state.selected.id,customerName:state.selected.name,name:v('n'),designation:v('d'),department:v('dep'),mobile:v('mob'),alternateMobile:v('alt'),email:v('em'),preferredCommunication:v('pref'),isPrimary:document.getElementById('primary').checked,remarks:v('remarks')};await api('/crm-contacts',{method:'POST',body:JSON.stringify(p)});closeModal();await loadAll();toast('Contact saved')}
function openPlant(){if(!state.selected)return toast('Select a customer first');form('New Plant',`<div class="grid2">${field('pn','Plant Name *')}${field('pc','Plant Code')}${field('dist','District')}${field('st','State')}${field('pin','PIN')}${field('ind','Industry','Thermal Power')}${field('status','Status','Active')}</div>${textarea('addr','Address')}${textarea('units','Unit / Equipment Details')}${textarea('prem','Remarks')}`,'savePlant()')}
async function savePlant(){const p={id:id('plant'),customerId:state.selected.id,customerName:state.selected.name,plantName:v('pn'),plantCode:v('pc'),district:v('dist'),state:v('st'),pin:v('pin'),industry:v('ind'),status:v('status'),address:v('addr'),unitDetails:v('units'),remarks:v('prem')};await api('/crm-plants',{method:'POST',body:JSON.stringify(p)});closeModal();await loadAll();toast('Plant saved')}
function openActivity(){if(!state.selected)return toast('Select a customer first');const today=new Date().toISOString().slice(0,10);form('Log Activity',`<div class="grid2">${field('atype','Activity Type','Call')}${field('adate','Date',today,'date')}${field('atime','Time','','time')}${field('sub','Subject *')}${field('next','Next Action')}${field('nfu','Next Follow-up','','date')}</div>${textarea('details','Discussion / Details')}${textarea('outcome','Outcome')}`,'saveActivity()')}
async function saveActivity(){const p={id:id('activity'),customerId:state.selected.id,customerName:state.selected.name,activityType:v('atype'),activityDate:v('adate'),activityTime:v('atime'),subject:v('sub'),details:v('details'),outcome:v('outcome'),nextAction:v('next'),nextFollowUp:v('nfu')};await api('/crm-activities',{method:'POST',body:JSON.stringify(p)});closeModal();await loadAll();toast('Activity logged')}
function openFollowup(){if(!state.selected)return toast('Select a customer first');const d=new Date().toISOString().slice(0,10);form('New Follow-up',`<div class="grid2">${field('fud','Follow-up Date *',d,'date')}${field('fut','Time','','time')}${field('fust','Status','Pending')}${field('fucon','Contact')}${field('fupart','Party',state.selected.name)}</div>${textarea('fun','Notes / Purpose')}${textarea('funa','Next Action')}`,'saveFollowup()')}
async function saveFollowup(){const p={id:id('followup'),partyType:'Customer',partyId:state.selected.id,party:state.selected.name,contact:v('fucon'),date:v('fud'),time:v('fut'),status:v('fust'),notes:v('fun'),nextAction:v('funa')};await api('/follow-ups',{method:'POST',body:JSON.stringify(p)});closeModal();await loadAll();toast('Follow-up saved')}
function openDocument(){if(!state.selected)return toast('Select a customer first');form('Add Document',`<div class="grid2">${field('dn','Document Name *')}${field('dt','Document Type','General')}${field('dd','Document Date','','date')}${field('dr','Reference No.')}</div><div class="field"><label>File</label><input id="df" type="file"></div>${textarea('dm','Remarks')}`,'saveDocument()')}
async function saveDocument(){const f=document.getElementById('df').files[0];let data='';if(f){data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}const p={id:id('document'),customerId:state.selected.id,customerName:state.selected.name,documentName:v('dn'),documentType:v('dt'),documentDate:v('dd'),referenceNo:v('dr'),fileName:f?.name||'',mimeType:f?.type||'',fileData:data,remarks:v('dm')};await api('/crm-documents',{method:'POST',body:JSON.stringify(p)});closeModal();await loadAll();toast('Document saved')}
function v(x){return document.getElementById(x)?.value||''}function toast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',2500)}
loadAll();
</script></body></html>''')

# Add dashboard nav button after customers
p=root/'frontend/dashboardB.html';s=p.read_text();needle="""                    <button class="nav-item" onclick="openWindow('customer.html', 800, 600)""";pos=s.find(needle)
if pos!=-1:
    # insert immediately before customer button
    btn="""                    <button class="nav-item" onclick="openWindow('crm_phase1.html', 1400, 850)" data-permission-id="perm_crm_phase1" title="CRM Phase 1 - Customer 360°">\n                        <i class="fas fa-chart-line"></i>\n                        <span class="nav-text">CRM Phase 1</span>\n                    </button>\n"""
    s=s[:pos]+btn+s[pos:]
p.write_text(s)
