/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */
function esc(s) { 
  if(!s)return''; 
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); 
}
function today() { var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtDate(s) {
  if(!s)return''; var p=s.split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : s;
}
function fmt(n) { return Number(n).toFixed(2); }
function checkEkasa(b64, mime) {
  /* Attempting to parse QR string structure */
  var txt = '';
  try { txt = atob(b64); } catch(e) {}
  
  /* Standard eKasa O-XXXXXX... pattern */
  var m = txt.match(/O-[0-9A-F]{32}/i);
  if (m) return m[0];
  
  /* Specific SK Financna Sprava URL pattern */
  var mUrl = txt.match(/id=([0-9A-F]{32})/i) || txt.match(/O-[0-9A-F]{32}/i);
  if (mUrl && mUrl[1]) return 'O-'+mUrl[1];
  
  return null;
}

/* ═══════════════════════════════════════════════
   UI & RENDER
═══════════════════════════════════════════════ */
function setSyncing(st) {
  var d=document.getElementById('sdot'),l=document.getElementById('slbl');
  if(!d||!l) return;
  if(st==='s'){d.className='dot s';l.textContent='syncing';}
  else if(st==='e'){d.className='dot e';l.textContent='error';}
  else{d.className='dot';l.textContent='live';}
}
function applyNamesUI() {
  var bN = document.getElementById('bn'); if(bN) bN.textContent = NAMES.u1;
  var bZ = document.getElementById('bz'); if(bZ) bZ.textContent = NAMES.u2;
  var sbn = document.getElementById('sbn'); if(sbn) sbn.textContent = NAMES.u1;
  var sbz = document.getElementById('sbz'); if(sbz) sbz.textContent = NAMES.u2;
  
  var lbl1 = document.getElementById('lbl-inc-u1'); if(lbl1) lbl1.textContent = NAMES.u1 + ' Income (€)';
  var lbl2 = document.getElementById('lbl-inc-u2'); if(lbl2) lbl2.textContent = NAMES.u2 + ' Income (€)';
  var sN1 = document.getElementById('set-name-u1'); if(sN1) sN1.value = NAMES.u1;
  var sN2 = document.getElementById('set-name-u2'); if(sN2) sN2.value = NAMES.u2;
  var sI1 = document.getElementById('set-inc-u1'); if(sI1) sI1.value = INCOME.u1;
  var sI2 = document.getElementById('set-inc-u2'); if(sI2) sI2.value = INCOME.u2;
  
  var fwho = document.getElementById('fwho');
  if(fwho && fwho.options.length > 2) {
    fwho.options[1].textContent = NAMES.u1;
    fwho.options[2].textContent = NAMES.u2;
  }
}
function applyCatsUI() {
  var cb=document.getElementById('bud-cats');
  var fcat=document.getElementById('fcat');
  var fcf=document.getElementById('fcatf');
  if(cb) cb.innerHTML=CATS.map(function(c){
    return '<div class="fg"><div class="fl">'+c+'</div><input type="number" id="bc_'+c+'" value="'+BUDGETS[c]+'"></div>';
  }).join('');
  if(fcat) fcat.innerHTML=CATS.map(function(c){return '<option>'+c+'</option>'}).join('');
  if(fcf) fcf.innerHTML='<option value="">All Categories</option>'+CATS.map(function(c){return '<option value="'+c+'">'+c+'</option>'}).join('');
}

function setWho(w) {
  who=w;
  document.getElementById('bn').className='wbtn'+(w===NAMES.u1?' an':'');
  document.getElementById('bz').className='wbtn'+(w===NAMES.u2?' az':'');
  document.getElementById('fwho').value = (w===NAMES.u1 ? NAMES.u1 : NAMES.u2);
}

function initMonths() {
  var sel=document.getElementById('msel');
  var prev=sel.value;
  var mo={};
  var cur=today().slice(0,7);
  mo[cur]=1;
  expenses.forEach(function(e){if(e.date)mo[String(e.date).slice(0,7)]=1;});
  sel.innerHTML=Object.keys(mo).sort().reverse().map(function(m){
    var p=m.split('-');
    return '<option value="'+m+'"'+(m===prev?' selected':'')+'>'+
      new Date(+p[0],+p[1]-1).toLocaleString('en',{month:'long',year:'numeric'})+'</option>';
  }).join('');
  if(!sel.value)sel.value=cur;
}
function curMonth(){return document.getElementById('msel').value;}
function moExp(){var m=curMonth();return expenses.filter(function(e){return e.date&&String(e.date).slice(0,7)===m;});}
function filtExp(){
  var w=document.getElementById('fwho').value,c=document.getElementById('fcatf').value;
  return moExp().filter(function(e){if(w&&e.who!==w)return false;if(c&&e.category!==c)return false;return true;});
}

function renderAll(){
  renderCards();
  renderBudget();
  renderGoals();
  renderBankSync();
  if (viewMode === 'log') {
    renderLog();
  } else {
    renderCalendar();
  }
}

var viewMode = 'log'; // 'log' or 'calendar'
function toggleViewMode() {
  viewMode = viewMode === 'log' ? 'calendar' : 'log';
  document.getElementById('viewToggleBtn').textContent = viewMode === 'log' ? 'List View' : 'Calendar View';
  document.getElementById('log-container').style.display = viewMode === 'log' ? 'block' : 'none';
  document.getElementById('calendar-container').style.display = viewMode === 'log' ? 'none' : 'block';
  renderAll();
}

async function renderCalendar() {
  var monthEl = document.getElementById('calendar-grid');
  if(!monthEl) return;
  var month = curMonth(); // e.g., "2023-04"
  
  if (!month) return;
  var parts = month.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  
  var daysInMonth = new Date(y, m, 0).getDate();
  
  monthEl.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><span class="spin"></span></div>';
  
  try {
    var invoices = await fetch(REST_INVOICES + '?date=gte.' + month + '-01&date=lte.' + month + '-' + daysInMonth, {headers:sbH()})
      .then(r => r.json());
      
    var html = '';
    // Basic grid logic (skipping start-of-month padding for brevity, just listing day boxes)
    for(var d=1; d<=daysInMonth; d++) {
      var dateStr = month + '-' + String(d).padStart(2,'0');
      var dayInvs = invoices.filter(i => i.date === dateStr);
      
      var cls = dayInvs.length > 0 ? 'calendar-day has-invoice' : 'calendar-day';
      var sum = dayInvs.reduce((acc, i) => acc + (parseFloat(i.total_amount)||0), 0);
      var inner = '<div class="day-num">' + d + '</div>';
      
      // If total is 0, we can map to expenses sum if we had it, but for UI sake show invoice count or nothing if old method
      if(dayInvs.length > 0) {
        inner += '<div class="inv-amt">' + dayInvs.length + ' inv</div>';
      }
      
      html += '<div class="' + cls + '" onclick="showDayDetails(\'' + dateStr + '\')">' + inner + '</div>';
    }
    monthEl.innerHTML = html;
  } catch(e) {
    monthEl.innerHTML = '<div style="grid-column:1/-1; color: var(--danger)">Failed to load invoices.</div>';
  }
}

function showDayDetails(dateStr) {
  // Simple prompt/alert for now
  // Real implementation would render #calendar-details with child expenses
  var exps = expenses.filter(e => e.date === dateStr && e.invoice_id);
  if(exps.length===0) {
    document.getElementById('calendar-details').innerHTML = '<div class="te">No invoice details for ' + dateStr + '</div>';
    return;
  }
  var html = '<div style="font-weight:500;margin-bottom:8px;">Details for ' + dateStr + '</div>';
  html += '<div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--r); padding:10px;">';
  exps.forEach(e => {
    html += '<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding:4px 0;">';
    html += '<span>' + esc(e.description||'Item') + '</span>';
    html += '<span style="font-family:var(--mono);">€' + fmt(e.amount) + '</span>';
    html += '</div>';
  });
  html += '</div>';
  document.getElementById('calendar-details').innerHTML = html;
}

function renderCards(){
  var all=moExp(),tot=all.reduce(function(s,e){return s+Number(e.amount);},0);
  var nik=all.filter(function(e){return e.who===NAMES.u1;}).reduce(function(s,e){return s+Number(e.amount);},0);
  var zuz=all.filter(function(e){return e.who===NAMES.u2;}).reduce(function(s,e){return s+Number(e.amount);},0);
  var rem=TOTAL_B-tot,pct=Math.round(tot/TOTAL_B*100),rc=rem<0?'bad':rem<TOTAL_B*.2?'warn':'good';
  var totInc = Number(INCOME.u1) + Number(INCOME.u2);
  var svgs=totInc-tot, sc=svgs<0?'bad':'good';
  document.getElementById('cards').innerHTML=
    '<div class="card"><div class="cl">Total spent</div><div class="cv">'+fmt(tot)+'</div><div class="cs">'+pct+'% of €'+TOTAL_B+' budget</div></div>'+
    '<div class="card"><div class="cl">Remaining</div><div class="cv '+rc+'">'+(rem<0?'-':'')+fmt(Math.abs(rem))+'</div><div class="cs">'+(rem<0?'Over budget':'Left this month')+'</div></div>'+
    '<div class="card cn"><div class="cl">'+esc(NAMES.u1)+'</div><div class="cv">'+fmt(nik)+'</div><div class="cs">'+all.filter(function(e){return e.who===NAMES.u1;}).length+' entries</div></div>'+
    '<div class="card cz"><div class="cl">'+esc(NAMES.u2)+'</div><div class="cv">'+fmt(zuz)+'</div><div class="cs">'+all.filter(function(e){return e.who===NAMES.u2;}).length+' entries</div></div>'+
    '<div class="card"><div class="cl">Net Savings</div><div class="cv '+sc+'">'+(svgs<0?'-':'')+fmt(Math.abs(svgs))+'</div><div class="cs">from €'+totInc+' income</div></div>';
  var bar=document.getElementById('alertbar');
  if(rem<0){bar.className='alertbar d';bar.style.display='block';bar.textContent='You are '+fmt(Math.abs(rem))+' over budget this month.';}
  else if(pct>80){bar.className='alertbar w';bar.style.display='block';bar.textContent=pct+'% of budget used — only '+fmt(rem)+' remaining.';}
  else{bar.style.display='none';}
}

function renderBudget(){
  var cats={};
  moExp().forEach(function(e){cats[e.category]=(cats[e.category]||0)+Number(e.amount);});
  document.getElementById('budbars').innerHTML=CATS.map(function(cat){
    var b=BUDGETS[cat],sp=cats[cat]||0,p=Math.min(100,Math.round(sp/b*100)),c=p>=100?'ov':p>=80?'hi':'ok';
    return '<div class="budr"><div class="budn">'+cat+'</div><div class="budt"><div class="budf '+c+'" style="width:'+p+'%"></div></div>'+
      '<div class="buda"><span class="sp '+c+'">'+fmt(sp)+'</span> /€'+b+'</div></div>';
  }).join('');
}

function renderLog(){
  var rows=filtExp().slice().sort(function(a,b){
    var d=String(b.date).localeCompare(String(a.date));
    return d!==0?d:String(b.id).localeCompare(String(a.id));
  });
  var tb=document.getElementById('logbody');
  if(!rows.length){tb.innerHTML='<tr><td colspan="6" class="te">No expenses found.</td></tr>';document.getElementById('logtot').textContent='€0.00';return;}
  var tot=rows.reduce(function(s,e){return s+Number(e.amount);},0);
  tb.innerHTML=rows.map(function(e){
    return '<tr>'+
      '<td class="act-col">'+
        '<button class="db db-edit" title="Edit" onclick="startEdit(\''+e.id+'\')">✎</button>'+
        '<button class="db db-del" title="Delete" onclick="deleteExp(\''+e.id+'\')">🗑</button>'+
      '</td>'+
      '<td style="font-family:var(--mono);font-size:12px;color:var(--muted)">'+fmtDate(e.date)+'</td>'+
      '<td><span class="pill '+(e.who===NAMES.u1?'pn':'pz')+'">'+esc(e.who)+'</span></td>'+
      '<td><span class="pill pc">'+esc(e.category)+'</span></td>'+
      '<td style="color:var(--muted)">'+esc(e.description||'—')+'</td>'+
      '<td class="ac">'+fmt(e.amount)+'</td>'+
      '</tr>';
  }).join('');
  document.getElementById('logtot').textContent=fmt(tot);
}

function flash(msg,isErr) {
  var f=document.getElementById('flash');
  f.textContent=msg; f.style.color=isErr?'var(--danger)':'var(--accent)';
  setTimeout(function(){f.textContent='';},4000);
}

function showReview(store, dateStr, items, totalInput) {
  // We no longer close the scanner, we just switch to the review step inside the same modal
  showStep('step-review');
  
  var storeEl = document.getElementById('r-store');
  if (storeEl) storeEl.textContent = store;
  
  var dateEl = document.getElementById('sdate');
  if (dateEl) dateEl.value = dateStr || today();
  
  var totalEl = document.getElementById('r-total');
  if (totalEl) totalEl.textContent = totalInput ? 'Total: €' + fmt(totalInput) : 'Total: Auto';
  
  var list = document.getElementById('r-items');
  if (!list) return;
  
  if (!items || !items.length) {
    list.innerHTML = '<div class="te" style="padding:20px;color:var(--muted)">No items extracted.</div>';
    return;
  }
  
  list.innerHTML = items.map(function(it, i) {
    var catOpts = CATS.map(function(c) {
      return '<option ' + (c === it.category ? 'selected' : '') + '>' + c + '</option>';
    }).join('');
    
    return '<div class="pitem">' +
      '<input type="checkbox" id="rcb_' + i + '" checked style="width:20px;height:20px">' +
      '<div class="pinm" style="flex:1;font-size:13px">' + esc(it.name) + '</div>' +
      '<div class="picat"><select id="rcat_' + i + '" style="font-size:11px;padding:2px">' + catOpts + '</select></div>' +
      '<div class="piam" style="font-family:var(--mono);width:60px;text-align:right">€' + fmt(it.amount) + 
      '<input type="hidden" id="ramt_' + i + '" value="' + it.amount + '">' +
      '</div>' +
      '<input type="hidden" id="rnm_' + i + '" value="' + esc(it.name) + '">' +
      '</div>';
  }).join('');
}
function cancelReview() { closeScanner(); }

/* ═══════════════════════════════════════════════
   SETTINGS & MODALS
═══════════════════════════════════════════════ */
function openSettings() {
  document.getElementById('nav-modal')?.classList.add('open');
  document.getElementById('settings-modal')?.classList.add('open');
  applyNamesUI();
  renderSettingsRules();
  renderBudgetsGrid();
  renderIntegrations();
}

function closeSettings() {
  document.getElementById('nav-modal')?.classList.remove('open');
  document.getElementById('settings-modal')?.classList.remove('open');
}

function openScanner() {
  document.getElementById('scan-modal').classList.add('open');
  document.getElementById('sdate').value = today();
  showStep('step-qr');
  startQRCamera();
}

function closeScanner() {
  stopQRCamera();
  document.getElementById('scan-modal').classList.remove('open');
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(function(s){s.classList.remove('active');});
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
  else dbg('UI Warning: step not found: '+id, true);
}

function showEkasaStatus(type, title, desc) {
  var b = document.getElementById('ekasa-status');
  if (!b) return;
  b.className = 'status-box ' + type;
  b.innerHTML = '<div class="sb-title">' + esc(title) + '</div><div>' + esc(desc) + '</div>';
  if(type==='info') b.insertAdjacentHTML('afterbegin','<div style="text-align:center;margin-bottom:10px"><span class="spin"></span></div>');
}

function openInsights() {
  document.getElementById('insights-modal').classList.add('open');
  var m = curMonth();
  var pParts = m.split('-');
  document.getElementById('insights-month-label').textContent = 'Analysing '+new Date(+pParts[0],+pParts[1]-1).toLocaleString('en',{month:'long',year:'numeric'})+'...';
  document.getElementById('insights-body').innerHTML = '<span class="spin spin-lg"></span>';
  generateInsights(m);
}
function closeInsights() { document.getElementById('insights-modal').classList.remove('open'); }

function addGoalUI() { document.getElementById('goal-modal').classList.add('open'); }
function closeGoalModal() { document.getElementById('goal-modal').classList.remove('open'); }

function renderGoals() {
  if(!document.getElementById('goals-row')) return;
  if(GOALS.length > 0) document.getElementById('goals-row').style.display = 'grid';
  var list = document.getElementById('goals-list');
  if(!list) return;
  
  if(GOALS.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--muted)">No goals yet. Add your first one above.</div>';
    return;
  }
  
  list.innerHTML = GOALS.map(function(g) {
    var p = Math.min(100, Math.round((g.saved / g.target) * 100));
    var dl = g.deadline ? 'Target: '+new Date(g.deadline).toLocaleDateString('en-GB') : '';
    return '<div class="goal-row">'+
           '<div class="goal-top"><div class="goal-name">'+esc(g.name)+'</div>'+
           '<div class="goal-amt">€'+fmt(g.saved)+' / €'+fmt(g.target)+' <button class="db" style="margin-left:8px" onclick="deleteGoal(\''+g.id+'\')">×</button></div></div>'+
           '<div class="goal-track"><div class="goal-fill" style="width:'+p+'%"></div></div>'+
           '<div class="goal-dleft">'+p+'% funded '+(dl?' • '+dl:'')+'</div>'+
           '</div>';
  }).join('');
}

function renderSettingsRules() {
  var el = document.getElementById('set-rules-list');
  if(!el) return;
  el.innerHTML = RULES.map(function(r) {
    return '<div class="rule-row"><div class="rule-pat">"'+esc(r.pattern)+'"</div><div class="rule-arr">→</div><div class="rule-cat">'+esc(r.category)+'</div>'+
           '<button class="db" onclick="deleteRule(\''+r.id+'\')">×</button></div>';
  }).join('');
}

function renderBankSync() {
  var el = document.getElementById('bank-sync-list');
  var bList = document.getElementById('bank-connections-list');
  if(!el) return;
  
  if (BANKS.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted)">No banks connected. Open ⚙️ Settings → Bank Connections.</div>';
    if(bList) bList.innerHTML = '<div style="font-size:13px;color:var(--muted)">No banks connected.</div>';
    return;
  }
  
  var html = BANKS.map(function(b) {
    return '<div class="bank-item"><div class="bank-info"><div class="bank-name">'+esc(b.name)+'</div><div class="bank-status ok">Connected • '+b.accounts.length+' accounts</div></div>'+
           '<button class="db" onclick="syncBank(\''+b.requisition_id+'\')" title="Sync transactions">🔄</button>'+
           '</div>';
  }).join('');
  el.innerHTML = html;
  
  if(bList) {
    bList.innerHTML = BANKS.map(function(b) {
      return '<div class="bank-item"><div class="bank-info"><div class="bank-name">'+esc(b.name)+'</div><div class="bank-status ok">Connected on '+b.linked_at+'</div></div></div>';
    }).join('');
  }
}

function renderBudgetsGrid() {
  var grid = document.getElementById('set-budgets-grid');
  if(!grid) return;
  grid.innerHTML = '';
  CATS.forEach(function(c, idx) {
    grid.innerHTML += '<div class="fg" style="margin-bottom:0"><div class="fl" style="display:flex;justify-content:space-between"><span>'+esc(c)+' (€)</span><button onclick="delCategory(\''+esc(c)+'\')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;line-height:1">&#x2715;</button></div><input type="number" id="set-b-'+idx+'" value="'+(BUDGETS[c]||0)+'" min="0" step="1" data-cat="'+esc(c)+'"></div>';
  });
}



function openBankPicker() {
  document.getElementById('bank-picker-modal').classList.add('open');
  loadBanks();
}

function connectGoogleCalendar() {
  window.location.href = '/api/google-calendar?action=auth';
}

function disconnectGoogleCalendar() {
  if(!confirm('Disconnect Google Calendar?')) return;
  GCAL.enabled = false;
  GCAL.token = null;
  localStorage.setItem('sf_gcal', JSON.stringify(GCAL));
  sbSaveState().catch(()=>{});
  renderIntegrations();
}

function renderIntegrations() {
  var btn = document.getElementById('btn-gcal-connect');
  if(!btn) return;
  
  if (GCAL && GCAL.enabled) {
    btn.textContent = 'Connected (Disconnect)';
    btn.style.background = 'var(--bg)';
    btn.style.color = 'var(--text)';
    btn.onclick = disconnectGoogleCalendar;
  } else {
    btn.textContent = 'Connect';
    btn.style.background = 'var(--nikhil-light)';
    btn.style.color = 'var(--nikhil)';
    btn.onclick = connectGoogleCalendar;
  }
}

/* ═══════════════════════════════════════════════
   APP LOCK MECHANICS
═══════════════════════════════════════════════ */
var APP_PIN = '2026'; // Fast hardcoded PIN

function verifyAppPin() {
  var v = document.getElementById('pin-input').value;
  var err = document.getElementById('pin-error');
  if (v === APP_PIN) {
    sessionStorage.setItem('sf_unlocked', '1');
    document.getElementById('pin-modal').classList.remove('open');
    err.textContent = '';
  } else {
    document.getElementById('pin-input').value = '';
    err.textContent = 'Incorrect PIN';
  }
}

function enforceAppLock() {
  if (sessionStorage.getItem('sf_unlocked') !== '1') {
    document.getElementById('pin-modal').classList.add('open');
  }
}
