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
  const userKeys = Object.keys(NAMES);
  const isSingle = userKeys.length === 1;

  // 1. Add Expense Toggle Buttons
  const toggleContainer = document.getElementById('user-toggles-container');
  if (toggleContainer) {
    toggleContainer.innerHTML = userKeys.map((key, i) => `
      <button class="wbtn ${who === NAMES[key] ? 'active' : ''}" 
              data-user-id="${key}"
              onclick="setWho(NAMES['${key}'])">${esc(NAMES[key])}</button>
    `).join('');
  }

  // 2. Filter Toggles
  const filterContainer = document.getElementById('filter-user-toggles');
  if (filterContainer) {
    filterContainer.innerHTML = userKeys.map((key, i) => `
      <button class="wbtn ${swho === NAMES[key] ? 'active' : ''}" 
              data-user-id="${key}"
              onclick="setSWho(NAMES['${key}'])">${esc(NAMES[key])}</button>
    `).join('');
  }

  // 3. Filter Dropdown
  const fwhoSelect = document.getElementById('fwho');
  if (fwhoSelect) {
    fwhoSelect.innerHTML = '<option value="">All Members</option>' + 
      userKeys.map(key => `<option value="${esc(NAMES[key])}">${esc(NAMES[key])}</option>`).join('');
  }

  // 4. Settings Grid
  const settingsGrid = document.getElementById('set-members-grid');
  if (settingsGrid) {
    settingsGrid.innerHTML = userKeys.map(key => `
      <div class="fg"><div class="fl">${esc(NAMES[key])} Name</div><input type="text" id="set-name-${key}" value="${esc(NAMES[key])}"></div>
      <div class="fg"><div class="fl">${esc(NAMES[key])} Income (€)</div><input type="number" id="set-inc-${key}" min="0" step="0.01" value="${INCOME[key] || 0}"></div>
    `).join('');
  }

  // 5. Hide chart if single user
  const chartCard = document.getElementById('chart-users')?.closest('.card');
  if (chartCard) chartCard.style.display = isSingle ? 'none' : 'block';
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
  who = w;
  document.querySelectorAll('#user-toggles-container .wbtn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === w);
  });
  const fWhoEl = document.getElementById('fwho');
  if(fWhoEl) fWhoEl.value = w;
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
var analysisMode = 'monthly'; // 'monthly' or 'advanced'

function toggleViewMode() {
  viewMode = viewMode === 'log' ? 'calendar' : 'log';
  document.getElementById('viewToggleBtn').textContent = viewMode === 'log' ? 'List View' : 'Calendar View';
  document.getElementById('log-container').style.display = viewMode === 'log' ? 'block' : 'none';
  document.getElementById('calendar-container').style.display = viewMode === 'log' ? 'none' : 'block';
  renderAll();
}

function toggleAnalysisMode() {
  analysisMode = analysisMode === 'monthly' ? 'advanced' : 'monthly';
  document.getElementById('analysisToggleBtn').textContent = analysisMode === 'monthly' ? '6-Month Trends' : 'Monthly View';
  document.getElementById('monthly-charts').style.display = analysisMode === 'monthly' ? 'contents' : 'none';
  document.getElementById('advanced-charts').style.display = analysisMode === 'monthly' ? 'none' : 'grid';
  if (analysisMode === 'advanced') {
    renderTrends();
    renderRadar();
    renderHeatmap();
  }
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
    var invoices = await fetch(REST_INVOICES + '?household_id=eq.' + HOUSEHOLD_ID + '&date=gte.' + month + '-01&date=lte.' + month + '-' + daysInMonth, {headers:sbH()})
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
  const all = moExp();
  const tot = all.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const userKeys = Object.keys(NAMES);
  
  let userSpend = {};
  userKeys.forEach(k => {
    userSpend[k] = all.filter(e => e.who === NAMES[k]).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  });

  const totInc = userKeys.reduce((s, k) => s + (Number(INCOME[k]) || 0), 0) || 0;
  const svgs = totInc - tot;
  const rem = TOTAL_B - tot;
  const pct = TOTAL_B > 0 ? Math.round(tot / TOTAL_B * 100) : 0;
  const rc = rem < 0 ? 'bad' : rem < TOTAL_B * 0.2 ? 'warn' : 'good';
  const sc = svgs < 0 ? 'bad' : 'good';

  const totalIncome = Object.values(INCOME).reduce((a,b)=>a+Number(b), 0);
  const projected = getProjectedRecurring(all);
  const projSavings = totalIncome - (tot + projected);
  const psc = projSavings < 0 ? 'bad' : 'good';
  
  let html = `
    <div class="card"><div class="cl">${t('Total spent')}</div><div class="cv">${fmt(tot)}</div><div class="cs">${pct}% of €${TOTAL_B} budget</div></div>
    <div class="card"><div class="cl">${t('Remaining')}</div><div class="cv ${rc}">${(rem < 0 ? '-' : '') + fmt(Math.abs(rem))}</div><div class="cs">${rem < 0 ? t('Over budget') : t('Left this month')}</div></div>
    <div class="card"><div class="cl">Proj. Savings</div><div class="cv ${psc}">${(projSavings < 0 ? '-' : '') + fmt(Math.abs(projSavings))}</div><div class="cs">incl. €${projected} expected</div></div>
  `;

  userKeys.forEach((k, i) => {
    const uc = ['purple', 'pink', 'blue', 'orange'][i % 4];
    html += `
      <div class="card user-card-${uc}">
        <div class="cl">${esc(NAMES[k])}</div>
        <div class="cv">${fmt(userSpend[k])}</div>
        <div class="cs">${all.filter(e => e.who === NAMES[k]).length} entries</div>
      </div>`;
  });

  html += `<div class="card"><div class="cl">${t('Net Savings')}</div><div class="cv ${sc}">${(svgs < 0 ? '-' : '') + fmt(Math.abs(svgs))}</div><div class="cs">from €${totInc} income</div></div>`;
  
  document.getElementById('cards').innerHTML = html;

  const bar = document.getElementById('alertbar');
  if (rem < 0) {
    bar.className = 'alertbar d'; bar.style.display = 'block'; 
    bar.textContent = 'You are ' + fmt(Math.abs(rem)) + ' over budget this month.';
  } else if (pct > 80) {
    bar.className = 'alertbar w'; bar.style.display = 'block'; 
    bar.textContent = pct + '% of budget used — only ' + fmt(rem) + ' remaining.';
  } else {
    bar.style.display = 'none';
  }
  
  updateCharts(userSpend, catsObj(all));
}

function catsObj(all) {
  var c={};
  all.forEach(function(e){c[e.category]=(c[e.category]||0)+Number(e.amount);});
  return c;
}

let chartUsers = null;
let chartCats = null;

function updateCharts(userSpend, catTotals) {
  const ctxU = document.getElementById('chart-users');
  const ctxC = document.getElementById('chart-categories');
  if(!ctxU || !ctxC || typeof Chart === 'undefined') return;
  
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const userKeys = Object.keys(NAMES);
  const labels = userKeys.map(k => NAMES[k]);
  const data = userKeys.map(k => userSpend[k] || 0);

  if(chartUsers) chartUsers.destroy();
  chartUsers = new Chart(ctxU, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#8b5cf6', '#ec4899', '#3b82f6', '#f59e0b'],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { position: 'bottom' },
        title: { display: true, text: t('Spent by User'), font: { size: 14 } }
      } 
    }
  });

  const catLabels = Object.keys(catTotals).filter(k => catTotals[k] > 0);
  const catData = catLabels.map(k => catTotals[k]);

  if(chartCats) chartCats.destroy();
  chartCats = new Chart(ctxC, {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [{
        label: t('Spent'),
        data: catData,
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: isDark ? '#334155' : '#e2e8f0' } },
        x: { grid: { display: false } }
      }
    }
  });
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
    var dl = g.deadline ? t('Target') + ': ' + new Date(g.deadline).toLocaleDateString(LANG === 'sk' ? 'sk-SK' : 'en-GB') : '';
    
    // Premium Goal Card with visual accent
    const color = p >= 100 ? 'var(--accent)' : (p > 50 ? 'var(--info)' : 'var(--muted)');

    return `
      <div class="panel" style="border-left: 4px solid ${color}; padding: 1rem; margin-bottom: 0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--text)">${esc(g.name)}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">${p}% ${t('Remaining')} • ${dl}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono); font-size:14px; font-weight:600; color:${color}">€${fmt(g.saved)}</div>
            <div style="font-size:10px; color:var(--muted)">of €${fmt(g.target)}</div>
          </div>
        </div>
        <div class="goal-track" style="height:8px; background:var(--bg); border-radius:10px;">
          <div class="goal-fill" style="width:${p}%; background:${color}; border-radius:10px; transition:width 1s cubic-bezier(0.34, 1.56, 0.64, 1)"></div>
        </div>
        <button class="db-del" style="position:absolute; top:8px; right:8px; font-size:14px; border:none; background:none; cursor:pointer;" onclick="deleteGoal('${g.id}')">&times;</button>
      </div>`;
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
  if(!confirm('Disconnect Google Calendar? Sync will stop.')) return;
  GCAL.enabled = false;
  GCAL.token = null;
  localStorage.setItem('sf_gcal', JSON.stringify(GCAL));
  sbSaveState().catch(function(){});
  renderIntegrations();
}

async function syncToGCal(expense) {
  if (!GCAL || !GCAL.enabled || !GCAL.token) return;
  
  try {
    const res = await fetch('/api/google-calendar?action=sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: GCAL.token, expense: expense })
    });
    const data = await res.json();
    if (data.new_token) {
       GCAL.token = data.new_token;
       localStorage.setItem('sf_gcal', JSON.stringify(GCAL));
       sbSaveState().catch(function(){});
    }
  } catch(e) {
    console.error("GCal sync failed", e);
  }
}

async function syncAllToGCal() {
  if (!GCAL || !GCAL.enabled || !GCAL.token) {
    flash("Connect Google Calendar first", true);
    return;
  }
  
  if (!confirm(`Sync all ${expenses.length} expenses to your calendar? (This will cause significant "clutter" as requested!)`)) return;
  
  const status = document.getElementById('gcal-status');
  status.textContent = "Syncing... 0%";
  
  // Clone to avoid mutation
  const toSync = [...expenses];
  let success = 0;
  
  for (let i = 0; i < toSync.length; i++) {
    await syncToGCal(toSync[i]);
    success++;
    status.textContent = `Syncing... ${Math.round((success / toSync.length) * 100)}%`;
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
  }
  
  status.textContent = "Sync Complete!";
  flash(`Successfully pushed ${success} items to Calendar`, false);
  setTimeout(() => { status.textContent = ""; }, 5000);
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
   AUTHENTICATION LOGIC
═══════════════════════════════════════════════ */
async function executeAuth(mode) {
  var err = document.getElementById('auth-error');
  var userInp = document.getElementById('auth-user')?.value?.trim();
  var passInp = document.getElementById('auth-pass')?.value?.trim();
  var pinInp = document.getElementById('auth-pin')?.value?.trim();
  
  if (mode === 'pin') {
    if (pinInp === '2026') {
      err.style.color = 'var(--nikhil)';
      err.textContent = 'Unlocking primary household...';
      // Secret Bridge: Log in to the legacy account
      try {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email: 'legacy@et-tracker.com',
          password: 'pass2026'
        });
        if (error) throw error;
        window.location.reload();
      } catch (e) {
        err.style.color = 'var(--danger)';
        err.textContent = 'Bridge failed: ' + e.message;
      }
    } else {
      err.style.color = 'var(--danger)';
      err.textContent = 'Incorrect PIN';
    }
    return;
  }

  if (mode === 'google') {
    err.textContent = 'Redirecting to Google...';
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    } catch(e) { err.textContent = e.message; }
    return;
  }

  // Simple Auth Mode
  if (!userInp || !passInp) {
    err.textContent = 'Enter both name and password';
    return;
  }
  
  // Bridge Username to Email
  var email = userInp.includes('@') ? userInp : (userInp.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '@et-tracker.com');
  
  err.textContent = 'Connecting...';
  try {
    // 1. Try Login
    var { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: passInp });
    
    // 2. If login fails (user not found), try Signup automatically
    if (error) {
      if (error.message.toLowerCase().indexOf('invalid login credentials') > -1) {
        err.textContent = 'Creating new household...';
        var { data: sData, error: sErr } = await supabaseClient.auth.signUp({ 
          email: email, 
          password: passInp,
          options: {
            data: { household_name: userInp }
          }
        });
        if (sErr) throw sErr;
        
        var { data: reData, error: reErr } = await supabaseClient.auth.signInWithPassword({ email: email, password: passInp });
        if (reErr) {
           err.textContent = "Household created! Please log in again.";
           return;
        }
      } else {
        throw error;
      }
    }
    
    window.location.reload();
  } catch (e) {
    err.textContent = e.message || 'System error';
  }
}

/* ═══════════════════════════════════════════════
   ONBOARDING LOGIC
═══════════════════════════════════════════════ */
function nextOB(step) {
  if (step === 2) {
    const hname = document.getElementById('ob-hname').value.trim();
    if (!hname) { alert('Please name your household first'); return; }
  }
  document.querySelectorAll('.ob-step').forEach(s => s.style.display = 'none');
  document.getElementById('ob-step-' + step).style.display = 'block';
}

function addOBMember() {
  const list = document.getElementById('ob-members-list');
  const count = list.querySelectorAll('.ob-member-row').length;
  if (count >= 4) return;
  const div = document.createElement('div');
  div.className = 'ob-member-row';
  div.style.display = 'flex';
  div.style.gap = '10px';
  div.innerHTML = `<input type="text" class="ob-m-name" placeholder="Member Name" style="flex:1">`;
  list.appendChild(div);
}

async function finishOB() {
  setSyncing('s');
  // 1. Collect names
  const members = Array.from(document.querySelectorAll('.ob-m-name'))
    .map(i => i.value.trim())
    .filter(v => v !== '');
  
  var newNames = {};
  var newInc = {};
  members.forEach((m, idx) => {
    newNames['u' + (idx+1)] = m;
    newInc['u' + (idx+1)] = 1;
  });
  
  NAMES = newNames;
  INCOME = newInc;
  LANG = document.getElementById('ob-lang').value;
  localStorage.setItem('sf_lang', LANG);
  
  // 2. Save to localStorage temporarily
  localStorage.setItem('sf_names', JSON.stringify(NAMES));
  localStorage.setItem('sf_income', JSON.stringify(INCOME));
  
  // 3. Provision household FIRST to get the ID
  try {
    const hname = document.getElementById('ob-hname').value || 'My Household';
    await provisionHousehold(hname);
    
    // 4. Now that we have HOUSEHOLD_ID, save the state (names, etc)
    await sbSaveState();
    
    document.getElementById('onboarding-modal').classList.remove('open');
    location.reload();
  } catch(e) {
    console.error("Onboarding sync failed", e);
    alert("Onboarding failed to sync: " + e.message);
  }
}

async function provisionHousehold(name) {
  if (!supabaseClient) throw new Error("Storage engine not ready");
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("No active session");
    
    // 1. Check if mapping already exists (e.g. if trigger worked)
    const { data: existingMap } = await supabaseClient
      .from('app_users')
      .select('household_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (existingMap && existingMap.household_id) {
      HOUSEHOLD_ID = existingMap.household_id;
      return true; 
    }

    // 2. Create Household Row 
    const { data: hh, error: hErr } = await supabaseClient
      .from('households')
      .insert({ name: name })
      .select()
      .single();
    
    if (hErr) throw hErr;
    if (!hh) throw new Error("Household creation returned no data");

    // 3. Link User to Household 
    const { error: mErr } = await supabaseClient
      .from('app_users')
      .insert({ id: session.user.id, household_id: hh.id });
    
    if (mErr) throw mErr;

    HOUSEHOLD_ID = hh.id;
    return true;
  } catch(e) {
    console.error("Manual provisioning failed", e);
    throw e; // Propagate to finishOB
  }
}

/* ═══════════════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════════════ */
function changeLanguage(val) {
  LANG = val;
  localStorage.setItem('sf_lang', LANG);
  applyTranslations();
  render(); // Re-render charts/lists
}

function applyTranslations() {
  const mappings = {
    'lbl-auth-title': 'Login', // Title key
    'lbl-auth-sub': 'Secure access to your household',
    'lbl-family-passcode': '🔐 Family Passcode',
    'lbl-btn-pin-enter': 'Unlock Household',
    'lbl-auth-or-text': 'OR SIGN IN WITH',
    'lbl-continue-google': 'Google Account',
    'lbl-show-advanced': 'Advanced: Username & Password',
    'lbl-btn-enter': 'Login',
    'lbl-set-lang': 'Language',
    // Settings
    'lbl-set-title': 'Financial Plan & Settings',
    'lbl-set-sub': 'Update your monthly income and budget limits based on your financial plan.',
    'lbl-set-members': 'Household Members',
    'lbl-set-budgets': 'Monthly Budgets',
    'lbl-btn-add-cat': '+ Add Custom',
    'lbl-set-rules': 'Smart Rules',
    'lbl-btn-add-rule': '+ Add Rule',
    'lbl-set-rules-sub': 'Auto-categorize items matching a keyword. Applied before AI.',
    'lbl-set-banks': 'Bank Connections (Enable Banking)',
    'lbl-btn-connect-bank': '+ Connect Bank',
    'lbl-set-banks-sub': 'Connect professional banking feeds via Enable Banking (Supports Tatra Banka, VUB, SLSP, Revolut).',
    'lbl-set-integrations': 'Integrations',
    'lbl-insights-title': '💡 Monthly Insights',
  };
  
  Object.keys(mappings).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(mappings[id]);
  });
  
  // Placeholders
  const user = document.getElementById('auth-user');
  if (user) user.placeholder = t('Username / Household name');
  const pass = document.getElementById('auth-pass');
  if (pass) pass.placeholder = t('Password');
  
  // Filter Dropdown: Re-init to update 'All Members' etc
  initMonths();
  applyNamesUI(); 
  applyCatsUI();
}

/* ═══════════════════════════════════════════════
   THEMING
═══════════════════════════════════════════════ */
function toggleTheme() {
  var b = document.body;
  if(b.getAttribute('data-theme') === 'dark') {
    b.removeAttribute('data-theme');
    localStorage.setItem('sf_theme', 'light');
  } else {
    b.setAttribute('data-theme', 'dark');
    localStorage.setItem('sf_theme', 'dark');
  }
  if(typeof renderCards === 'function') renderCards();
}

/* ═══════════════════════════════════════════════
   RECURRING BILLS UI
═══════════════════════════════════════════════ */
async function openSettings() {
  document.getElementById('settings-modal').classList.add('open');
  await renderRecurring();
}

async function renderRecurring() {
  const list = document.getElementById('set-recurring-list');
  if (!list) return;
  list.innerHTML = '<span class="spin"></span>';
  
  const recs = await sbSelectRecurring();
  if (recs.length === 0) {
    list.innerHTML = '<div style="font-size:12px; color:var(--muted)">No recurring bills added.</div>';
    return;
  }
  
  list.innerHTML = recs.map(r => `
    <div class="bank-item">
      <div class="bank-info">
        <div class="bank-name">${esc(r.name)}</div>
        <div class="bank-status">€${r.amount} - ${r.category} - Day ${r.day_of_month} (${r.who})</div>
      </div>
      <button class="db db-del" onclick="deleteRecurringUI('${r.id}')">&times;</button>
    </div>
  `).join('');
}

async function addRecurringUI() {
  const name = prompt("Bill Name (e.g. Netflix):");
  if (!name) return;
  const amt = prompt("Amount (€):", "15.00");
  const cat = prompt("Category:", "Entertainment");
  const day = prompt("Day of Month (1-31):", "1");
  const who = prompt("Who pays? (e.g. Nik):", NAMES.u1 || "You");
  
  try {
    await sbSaveRecurring({
      name,
      amount: parseFloat(amt),
      category: cat,
      day_of_month: parseInt(day),
      who
    });
    renderRecurring();
    renderCards();
  } catch(e) { flash("Failed to save recurring bill", true); }
}

async function deleteRecurringUI(id) {
  if (!confirm("Delete this recurring bill?")) return;
  await sbDeleteRecurring(id);
  renderRecurring();
  renderCards();
}

/* ═══════════════════════════════════════════════
   AI STATEMENT ANALYZER UI
═══════════════════════════════════════════════ */
let analyzedTransactions = [];

function openAnalyzer() {
  document.getElementById('analyzer-modal').classList.add('open');
}
function closeAnalyzer() {
  document.getElementById('analyzer-modal').classList.remove('open');
  document.getElementById('analyzer-results').style.display = 'none';
  document.getElementById('analyzer-input').value = '';
}

function onStatementFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    document.getElementById('analyzer-input').value = evt.target.result;
    flash("File loaded into analyzer!");
  };
  reader.readAsText(file);
}

async function processStatementAI() {
  const text = document.getElementById('analyzer-input').value.trim();
  if (!text) { flash("Please paste transactions or upload a file", true); return; }
  
  const btn = document.getElementById('lbl-btn-analyze');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Analyzing...';
  
  try {
    // Process via Groq AI
    analyzedTransactions = await aiProcessBulkTransactions(text);
    
    document.getElementById('analyzer-results').style.display = 'block';
    const list = document.getElementById('analyzer-list');
    list.innerHTML = analyzedTransactions.map((t, idx) => `
      <div class="pitem">
        <input type="checkbox" checked id="ana-${idx}">
        <div class="pinm">
          <strong>${t.description}</strong><br>
          <small>${t.date} | ${t.who}</small>
        </div>
        <div class="piam">€${t.amount}</div>
        <div class="picat">
          <select id="ana-cat-${idx}">
            ${CATS.map(c => `<option ${c===t.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
    `).join('');
    
  } catch(e) {
    flash("AI Analysis failed: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze with Groq AI";
  }
}

async function confirmAnalyzerResults() {
  const toSave = [];
  analyzedTransactions.forEach((t, idx) => {
    if (document.getElementById(`ana-${idx}`).checked) {
      t.category = document.getElementById(`ana-cat-${idx}`).value;
      toSave.push(t);
    }
  });
  
  if (toSave.length === 0) return;
  
  flash(`Importing ${toSave.length} transactions...`);
  for (const t of toSave) {
    await sbInsert(t);
  }
  
  closeAnalyzer();
  renderAll();
  flash("Successfully imported all verified transactions!", false);
}

/* ═══════════════════════════════════════════════
   ADVANCED ANALYTICS (ROADMAP PHASE 3)
═══════════════════════════════════════════════ */
let chartTrends, chartRadar;

function renderTrends() {
  const ctx = document.getElementById('chart-trends')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = [];
  const spendData = [];
  const incomeData = [];

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStr = d.toISOString().slice(0, 7);
    labels.push(d.toLocaleString(LANG === 'sk' ? 'sk-SK' : 'en-US', { month: 'short' }));
    
    const mExpenses = expenses.filter(e => e.date && e.date.startsWith(mStr));
    const mTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
    spendData.push(mTotal);
    
    incomeData.push(Object.values(INCOME).reduce((a, b) => a + Number(b), 0));
  }

  if (chartTrends) chartTrends.destroy();
  chartTrends = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: t('Spent'),
          data: spendData,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: t('Income') || 'Income',
          data: incomeData,
          borderColor: 'var(--info)',
          borderDash: [5, 5],
          tension: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderRadar() {
  const ctx = document.getElementById('chart-radar')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const catTotals = {};
  const m = curMonth();
  expenses.filter(e => e.date && e.date.startsWith(m)).forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount);
  });

  const labels = CATS;
  const data = labels.map(c => catTotals[c] || 0);

  if (chartRadar) chartRadar.destroy();
  chartRadar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: t('Current Month'),
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderColor: 'var(--nikhil)',
        pointBackgroundColor: 'var(--nikhil)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(0,0,0,0.1)' },
          grid: { color: 'rgba(0,0,0,0.1)' },
          suggestedMin: 0
        }
      }
    }
  });
}

function renderHeatmap() {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const m = curMonth();
  const dateParts = m.split('-');
  const daysInMonth = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]), 0).getDate();
  const daySpend = new Array(daysInMonth).fill(0);

  expenses.filter(e => e.date && e.date.startsWith(m)).forEach(e => {
    const d = parseInt(e.date.split('-')[2]);
    if (d > 0 && d <= daysInMonth) daySpend[d - 1] += Number(e.amount);
  });

  const max = Math.max(...daySpend, 1);
  
  let html = '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; width:100%">';
  daySpend.forEach((s, i) => {
    const alpha = Math.min(1, s / (max * 0.7));
    const color = s > 0 ? `rgba(59, 130, 246, ${Math.max(0.1, alpha)})` : 'var(--bg)';
    html += `<div title="Day ${i+1}: €${s.toFixed(2)}" style="height:24px; border-radius:3px; background:${color}; border:1px solid var(--border)"></div>`;
  });
  html += '</div>';
  
  container.innerHTML = html;
}


