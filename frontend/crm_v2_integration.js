/* RISE Tech CRM V2 Phase 2 - Universal relationship integration */
(function () {
  'use strict';
  const NS = 'riseCRMv2';
  const base = window.API_BASE_URL || localStorage.getItem('backendApiUrl') || ((location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.protocol==='file:') ? 'http://localhost:5000/api' : location.origin + '/api');
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const user = () => localStorage.getItem('currentUser') || 'System';
  const localKey = 'crm_v2_relationships';
  const readLocal = () => { try { const x=JSON.parse(localStorage.getItem(localKey)||'[]'); return Array.isArray(x)?x:[]; } catch(_){return [];} };
  const writeLocal = x => localStorage.setItem(localKey, JSON.stringify(x.slice(-2000)));
  const idOf = (r, fallback) => String(r?.id || r?._id || fallback || '').trim();
  const nameOf = (r, type) => String(r?.name || r?.customerName || r?.custName || r?.supplierName || r?.enquiryNo || r?.refNo || r?.invoiceNo || r?.id || type || '').trim();
  const relType = (a,b) => `${String(a).toUpperCase()}_RELATED_TO_${String(b).toUpperCase()}`;

  async function request(path, options) {
    const opts = Object.assign({ headers: {'Content-Type':'application/json'}, cache:'no-store' }, options||{});
    const r = await fetch(base + path, opts);
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.success === false) throw new Error(j.message || `Request failed (${r.status})`);
    return j.data;
  }

  async function relate(fromModule, fromId, toModule, toId, relationType, metadata) {
    if (!fromModule || !fromId || !toModule || !toId || String(fromId)===String(toId)) return null;
    const payload = { fromModule, fromId:String(fromId), toModule, toId:String(toId), relationType:relationType||relType(fromModule,toModule), metadata:metadata||{}, source:'CRM_V2_PHASE2', createdBy:user() };
    const local = readLocal();
    const key = [payload.fromModule,payload.fromId,payload.toModule,payload.toId,payload.relationType].join('|');
    if (!local.some(x => [x.fromModule,x.fromId,x.toModule,x.toId,x.relationType].join('|')===key)) { local.push(Object.assign({id:'LREL-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)},payload)); writeLocal(local); }
    try { return await request('/crm/v2/relationships', {method:'POST', body:JSON.stringify(payload)}); } catch(e) { console.warn('CRM V2 relationship sync:', e.message); return null; }
  }

  async function audit(module, recordId, action, oldValue, newValue, reason) {
    if (!module || !recordId) return;
    try { await request('/crm/v2/audit', {method:'POST', body:JSON.stringify({module,recordId:String(recordId),action,user:user(),oldValue,newValue,reason})}); } catch(e) { console.warn('CRM V2 audit:',e.message); }
  }

  function localRows(key){ try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[];}catch(_){return [];} }
  function findByIdOrName(key, id, name, fields){
    const rows=localRows(key), sid=String(id||'').trim().toLowerCase(), sn=String(name||'').trim().toLowerCase();
    return rows.find(r=>sid && String(r.id||r._id||'').trim().toLowerCase()===sid) || rows.find(r=>sn && fields.some(f=>String(r[f]||'').trim().toLowerCase()===sn)) || null;
  }
  async function autoLink(module, record) {
    if (!record) return;
    const id = idOf(record); if (!id) return;
    const tasks=[];
    let customerId = String(record.customerId||'').trim();
    let supplierId = String(record.supplierId||'').trim();
    if (!customerId && (record.customerName||record.custName)) customerId = idOf(findByIdOrName('customers','',record.customerName||record.custName,['name']));
    if (!supplierId && record.supplierName) supplierId = idOf(findByIdOrName('suppliers','',record.supplierName,['name']));
    if (module==='customer' || module==='supplier') { await audit(module,id,'UPSERT',null,record,'Phase 2 integration'); return; }
    if (customerId) tasks.push(relate('customer',customerId,module,id,'HAS_'+module.toUpperCase(),{name:nameOf(record,module)}));
    if (supplierId) tasks.push(relate('supplier',supplierId,module,id,'HAS_'+module.toUpperCase(),{name:nameOf(record,module)}));
    if (module==='quotation') {
      let enquiry = null;
      if (record.enquiryId || record.enquiryNo) enquiry = findByIdOrName('crm_enquiries',record.enquiryId,record.enquiryNo,['enquiryNo']);
      const enquiryId = idOf(enquiry) || String(record.enquiryId||'').trim();
      if (enquiryId) tasks.push(relate('enquiry',enquiryId,'quotation',id,'GENERATED_QUOTATION',{enquiryNo:record.enquiryNo||enquiry?.enquiryNo||''}));
    }
    if (module==='invoice') {
      let enquiry = null;
      if (record.enquiryId || record.enquiryNo) enquiry = findByIdOrName('crm_enquiries',record.enquiryId,record.enquiryNo,['enquiryNo']);
      const enquiryId = idOf(enquiry) || String(record.enquiryId||'').trim();
      if (record.quotationId) tasks.push(relate('quotation',record.quotationId,'invoice',id,'BILLED_TO_INVOICE',{}));
      if (enquiryId) tasks.push(relate('enquiry',enquiryId,'invoice',id,'BILLED_TO_INVOICE',{enquiryNo:record.enquiryNo||enquiry?.enquiryNo||''}));
    }
    if (module==='purchase' && supplierId) tasks.push(relate('supplier',supplierId,'purchase',id,'HAS_PURCHASE',{}));
    if (module==='followup' || module==='activity') {
      ['enquiryId','quotationId','poId','invoiceId','ticketId','plantId'].forEach(k=>{ if(record[k]) tasks.push(relate(module,id,k.replace('Id',''),record[k],'ACTIVITY_FOR',{})); });
    }
    await Promise.all(tasks);
    await audit(module,id,'UPSERT',null,record,'Phase 2 relationship sync');
  }

  function linkFor(type,id,label) {
    const t=String(type||'').toLowerCase(), safeId=encodeURIComponent(String(id||''));
    const routes={customer:'business360.html?type=customer&id=',supplier:'business360.html?type=supplier&id=',enquiry:'enquiry.html?id=',quotation:'quotation.html?refNo=',invoice:'invoice.html?id=',purchase:'purchase.html',ticket:'customer_support.html?id='};
    const href=routes[t] ? routes[t]+safeId : '#';
    return href==='#' ? `<span>${esc(label||id)}</span>` : `<a href="${href}" class="crm-v2-link">${esc(label||id)} ↗</a>`;
  }

  async function related(module,id) {
    if (!module || !id) return [];
    try { const rows=await request(`/crm/v2/record/${encodeURIComponent(module)}/${encodeURIComponent(id)}/relationships`); return Array.isArray(rows)?rows:[]; } catch(e) {
      const all=readLocal(); return all.filter(r=>(r.fromModule===module&&String(r.fromId)===String(id))||(r.toModule===module&&String(r.toId)===String(id)));
    }
  }

  function panel(title, rows) {
    const box=document.createElement('div'); box.className='crm-v2-related-panel';
    const body=rows.length ? rows.map(r=>{
      const outgoing=r.fromModule===window.__crmV2PanelModule && String(r.fromId)===String(window.__crmV2PanelId);
      const type=outgoing?r.toModule:r.fromModule, id=outgoing?r.toId:r.fromId, meta=r.metadata||{};
      const label=meta.enquiryNo || meta.name || id;
      return `<div class="crm-v2-related-row"><div>${linkFor(type,id,label)}</div><small>${esc(r.relationType||'RELATED_TO')}</small></div>`;
    }).join('') : '<div class="crm-v2-empty">No V2 relationships recorded yet.</div>';
    box.innerHTML=`<div class="crm-v2-related-head"><b>🔗 ${esc(title||'CRM V2 Related Records')}</b><span>${rows.length}</span></div><div class="crm-v2-related-body">${body}</div>`;
    return box;
  }

  async function showPanel(module,id,title,host) {
    if(!id) return;
    window.__crmV2PanelModule=module; window.__crmV2PanelId=id;
    const rows=await related(module,id);
    const p=panel(title,rows);
    (host||document.body).querySelectorAll?.('.crm-v2-related-panel').forEach(x=>x.remove());
    (host||document.body).appendChild(p);
  }

  function installCSS(){
    if(document.getElementById('crm-v2-phase2-css')) return;
    const s=document.createElement('style'); s.id='crm-v2-phase2-css'; s.textContent=`
      .crm-v2-related-panel{margin:14px 0;border:1px solid #d8dde6;border-radius:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;font-family:Arial,sans-serif}
      .crm-v2-related-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f5f8fb;color:#172b4d;font-size:13px}
      .crm-v2-related-head span{background:#0176d3;color:#fff;border-radius:12px;padding:2px 8px;font-size:10px}.crm-v2-related-body{padding:8px 12px}.crm-v2-related-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f3}.crm-v2-related-row:last-child{border-bottom:0}.crm-v2-related-row small{color:#667085;font-size:9px}.crm-v2-link{color:#0176d3;font-weight:700;text-decoration:none}.crm-v2-link:hover{text-decoration:underline}.crm-v2-empty{padding:10px;color:#667085;font-size:11px}
      .crm-v2-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:12px;background:#eef6ff;color:#0176d3;font-size:10px;font-weight:700}
    `; document.head.appendChild(s);
  }

  function wrapApi(){
    if(!window.apiClient || window.apiClient.__crmV2Wrapped) return;
    const api=window.apiClient, wrap=(name,module)=>{
      if(typeof api[name]!=='function') return;
      const original=api[name]; api[name]=async function(data){
        const result=await original.apply(this,arguments); const record=result?.data||data;
        if(result?.success!==false && record) autoLink(module,record).catch(console.warn);
        return result;
      };
    };
    wrap('saveCustomer','customer'); wrap('saveSupplier','supplier'); wrap('saveCrmEnquiry','enquiry'); wrap('saveQuotation','quotation'); wrap('saveInvoice','invoice'); wrap('savePurchase','purchase'); wrap('saveFollowUp','followup');
    api.__crmV2Wrapped=true;
  }

  function wrapViews(){
    const wrap=(name,module,title,extract)=>{
      if(typeof window[name]!=='function' || window[name].__crmV2Wrapped) return;
      const original=window[name]; const fn=function(){const args=arguments; const result=original.apply(this,args); setTimeout(()=>{try{const info=extract(args,result); if(info?.id) showPanel(module,info.id,title,document.getElementById(module==='quotation'?'quotationViewBody':'viewContent')||document.body);}catch(e){console.warn(e)}},120); return result;}; fn.__crmV2Wrapped=true; window[name]=fn;
    };
    wrap('viewCustomer','customer','Customer 360° — Related Records',a=>({id:a[0]}));
    wrap('viewSupplier','supplier','Supplier 360° — Related Records',a=>({id:a[0]}));
    wrap('viewQuotation','quotation','Quotation — Related Records',a=>{const qs=JSON.parse(localStorage.getItem('quotations')||'[]');const q=qs.find(x=>String(x.refNo)===String(a[0])||String(x.id)===String(a[0]));return {id:q?.id};});
  }

  function wireEnquiry(){
    document.addEventListener('crm:open-enquiry',e=>{const id=e.detail?.id;if(id) setTimeout(()=>showPanel('enquiry',id,'Enquiry — Connected Records',document.getElementById('detail')||document.body),150);});
    if(typeof window.selectEnquiry==='function' && !window.selectEnquiry.__crmV2Wrapped){const original=window.selectEnquiry;window.selectEnquiry=async function(id){const r=await original.apply(this,arguments);setTimeout(()=>showPanel('enquiry',id,'Enquiry — Connected Records',document.getElementById('detail')||document.body),100);return r;};window.selectEnquiry.__crmV2Wrapped=true;}
  }

  function wireBusiness360(){
    if(!window.B360UI) return;
    const original=window.B360UI.renderCurrentTab;
    if(typeof original==='function'&&!original.__crmV2Wrapped){
      const fn=function(){const r=original.apply(this,arguments);setTimeout(()=>{if(this.currentPartyId) showPanel(this.currentType,this.currentPartyId,this.currentType==='customer'?'Customer 360° — V2 Connected Records':'Supplier 360° — V2 Connected Records',document.getElementById('b360TabViewport')||document.body);},100);return r;};fn.__crmV2Wrapped=true;window.B360UI.renderCurrentTab=fn;
    }
  }

  async function migrate(){try{await request('/crm/v2/migrate-links?user='+encodeURIComponent(user()),{method:'POST',body:'{}'});localStorage.setItem('crm_v2_last_migration',new Date().toISOString());}catch(e){console.warn('CRM V2 migration:',e.message)}}

  window.RISECRMv2=window.RISECRMv2||{};
  Object.assign(window.RISECRMv2,{relate,related,autoLink,audit,showPanel,migrate,version:'2.1'});

  function init(){installCSS();wrapApi();wrapViews();wireEnquiry();wireBusiness360();setTimeout(()=>migrate(),1200);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
