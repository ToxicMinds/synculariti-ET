/* ═══════════════════════════════════════════════
   MAIN APP INSTANCE & BINDINGS
═══════════════════════════════════════════════ */


async function init() {
  // 1. BOOT: Initialize Supabase
  const booted = await sysBootSupabase();
  if (!booted) {
    flash("Connection Error. Please refresh.", true);
    return;
  }

  // 2. AUTH: Check for Session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    document.getElementById('auth-modal').classList.add('open');
    document.getElementById('app').style.display = 'none';
    return;
  }
  SESSION_JWT = session.access_token;

  // 3. HOUSEHOLD: Resolve Mapping
  try {
    const { data: userData, error: userError } = await supabaseClient
      .from('app_users')
      .select('household_id')
      .eq('id', session.user.id)
      .maybeSingle();
      
    if (userError) throw userError;
    if (userData && userData.household_id) {
      HOUSEHOLD_ID = userData.household_id;
    }
  } catch (e) {
    console.warn("Household lookup failed:", e.message);
  }

  // Handle Translations early
  applyTranslations();
  document.getElementById('auth-modal').classList.remove('open');
  document.getElementById('app').style.display = 'block';

  // 4. READY or ONBOARD:
  if (!HOUSEHOLD_ID) {
    document.getElementById('onboarding-modal').classList.add('open');
    return; 
  }

  // 5. DATA LOAD:
  setSyncing('s');
  try {
    var cState = await sbLoadState();
    if (cState) {
      NAMES   = cState.names   || NAMES;
      INCOME  = cState.income  || INCOME;
      BUDGETS = cState.budgets || BUDGETS;
      MEMORY  = cState.memory  || MEMORY;
      RULES   = cState.rules   || RULES;
      GOALS   = cState.goals   || GOALS;
      BANKS   = cState.banks   || BANKS;
      GCAL    = cState.gcal    || GCAL;
      CATS = Object.keys(BUDGETS);
      TOTAL_B = CATS.reduce(function(s,k){return s+Number(BUDGETS[k])},0);
      localStorage.setItem('sf_names',   JSON.stringify(NAMES));
      localStorage.setItem('sf_income',  JSON.stringify(INCOME));
      localStorage.setItem('sf_budgets', JSON.stringify(BUDGETS));
      localStorage.setItem('sf_memory',  JSON.stringify(MEMORY));
      localStorage.setItem('sf_rules',   JSON.stringify(RULES));
      localStorage.setItem('sf_goals',   JSON.stringify(GOALS));
      localStorage.setItem('sf_banks',   JSON.stringify(BANKS));
      localStorage.setItem('sf_gcal',    JSON.stringify(GCAL));
      applyNamesUI(); applyCatsUI();
    } else {
      // New Household -> Show Onboarding
      document.getElementById('onboarding-modal').classList.add('open');
      return; // Stop here, onboarding will finish and reload
    }

    expenses = await sbSelect();
    dbg('Loaded '+expenses.length+' rows');
    
    // Load Recurring
    await sbSelectRecurring();
    
    setSyncing('ok');
  } catch(e) {
    setSyncing('e');
    dbg('INIT: '+e.message, e, true);
    document.getElementById('cards').innerHTML =
      '<div class="card" style="grid-column:1/-1; text-align:center; padding:2rem">' +
      '<div style="font-size:32px; margin-bottom:12px">⚠️</div>' +
      '<div class="cl" style="color:var(--danger); font-size:14px; text-transform:none; letter-spacing:0">Connection Error</div>' +
      '<div style="font-size:13px; color:var(--muted); margin:8px 0 16px">' + esc(e.message) + '</div>' +
      '<button class="btn btn-p" style="width:auto; padding:8px 24px" onclick="location.reload()">🔄 Retry</button>' +
      '</div>';
  }
  
  if (document.getElementById('fdate')) {
    document.getElementById('fdate').value = today();
    document.getElementById('sdate').value = today();
  }
  
  initMonths();
  renderAll();

  /* Handle Enable Banking OAuth callback (?session_id=...) */
  var urlParams = new URLSearchParams(window.location.search);
  var ebSession = urlParams.get('session_id') || urlParams.get('code');
  if(ebSession && window.location.pathname.indexOf('google') === -1 && !urlParams.get('gcal_success')) {
    window.history.replaceState({}, document.title, window.location.pathname);
    handleEnableBankingCallback(ebSession);
  }

  /* Handle Google Calendar OAuth Callback */
  var gcalSuccess = urlParams.get('gcal_success');
  var gcalToken = urlParams.get('token');
  if (gcalSuccess === 'true' && gcalToken) {
    window.history.replaceState({}, document.title, window.location.pathname);
    GCAL.enabled = true;
    GCAL.token = gcalToken;
    localStorage.setItem('sf_gcal', JSON.stringify(GCAL));
    sbSaveState().catch(e => console.error("Could not persist GCAL token globally", e));
    alert('Google Calendar has been successfully connected!');
  }

  setInterval(async function(){
    if(busy) return;
    try{
      var r=await sbSelect();
      var s=await sbLoadState();
      if(s) {
        var changed = (
          JSON.stringify(s.budgets) !== JSON.stringify(BUDGETS) ||
          JSON.stringify(s.names)   !== JSON.stringify(NAMES)   ||
          JSON.stringify(s.income)  !== JSON.stringify(INCOME)  ||
          JSON.stringify(s.memory)  !== JSON.stringify(MEMORY)  ||
          JSON.stringify(s.rules)   !== JSON.stringify(RULES)   ||
          JSON.stringify(s.goals)   !== JSON.stringify(GOALS)   ||
          JSON.stringify(s.banks)   !== JSON.stringify(BANKS)   ||
          JSON.stringify(s.gcal)    !== JSON.stringify(GCAL)
        );
        if(changed) {
          NAMES=s.names||NAMES; INCOME=s.income||INCOME; BUDGETS=s.budgets||BUDGETS;
          MEMORY=s.memory||MEMORY; RULES=s.rules||RULES; GOALS=s.goals||GOALS; BANKS=s.banks||BANKS; GCAL=s.gcal||GCAL;
          CATS=Object.keys(BUDGETS); TOTAL_B=CATS.reduce(function(a,k){return a+Number(BUDGETS[k])},0);
          applyNamesUI(); applyCatsUI(); renderAll();
          const projected = getProjectedRecurring(expenses);
  const projEl = document.getElementById('projected-savings-val');
  if (projEl) {
    const totInc = Object.values(INCOME).reduce((a,b)=>a+Number(b), 0);
    const totExp = expenses.reduce((a,b)=>a+Number(b.amount), 0);
    const projSavings = totInc - (totExp + projected);
    projEl.textContent = (projSavings < 0 ? '-' : '') + '€' + Math.abs(projSavings).toFixed(2);
    projEl.className = 'cv ' + (projSavings < 0 ? 'bad' : 'good');
  }
}
      }
      if(JSON.stringify(r)!==JSON.stringify(expenses)){expenses=r;initMonths();renderAll();}
    }catch(e){}
  }, 30000);
}

function uid() { return 'ex_'+Date.now().toString(36)+Math.random().toString(36).substr(2,5); }

/* ═══════════════════════════════════════════════
   EXPENSE MANAGEMENT
═══════════════════════════════════════════════ */
async function addExpense() {
  if(busy) return;
  var date=document.getElementById('fdate').value;
  var amt=parseFloat(document.getElementById('famt').value);
  var cat=document.getElementById('fcat').value;
  var desc=document.getElementById('fdesc').value.trim();
  
  /* FIXED: Allow negative numbers for refunds! Removes 'amt<=0' constraint */
  if(!date || isNaN(amt)){flash('Please enter a date and amount.',true);return;}
  
  busy=true;
  var btn=document.getElementById('addbtn');
  btn.disabled=true; btn.textContent='Saving…'; setSyncing('s');
  
  if (editingId) {
    var row = {who:who, date:date, category:cat, amount:amt, description:desc};
    try {
      await sbUpdate(editingId, row);
      var idx = expenses.findIndex(e => e.id === editingId);
      if(idx>=0) {
        expenses[idx] = Object.assign({}, expenses[idx], row);
      }
      cancelEdit();
      initMonths(); renderAll(); flash('Updated!', false); setSyncing('ok');
      await syncToGCal(row);
    } catch(e) {
      flash(e.message, true); setSyncing('e');
    } finally {
      busy=false; btn.disabled=false;
    }
  } else {
    var row={id:uid(),who:who,date:date,category:cat,amount:amt,description:desc};
    try {
      await sbInsert(row);
      row.created_at=new Date().toISOString();
      expenses.unshift(row);
      syncToGCal(row); // Auto-sync to GCal
      document.getElementById('famt').value='';
      document.getElementById('fdesc').value='';
      initMonths(); document.getElementById('msel').value=date.slice(0,7);
      renderAll(); flash('Saved!',false); setSyncing('ok');
      await syncToGCal(row);
    } catch(e){flash(e.message,true);setSyncing('e');}
    finally{busy=false;btn.disabled=false;btn.textContent='Add expense';}
  }
}

function startEdit(id) {
  var e = expenses.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  setWho(e.who);
  document.getElementById('fdate').value = e.date;
  document.getElementById('famt').value = e.amount;
  document.getElementById('fcat').value = e.category;
  document.getElementById('fdesc').value = e.description;
  document.getElementById('form-title').innerHTML = 'Edit expense <button class="btn-g" style="padding:2px 8px;font-size:11px" onclick="cancelEdit()">Cancel</button>';
  document.getElementById('addbtn').textContent = 'Update expense';
  window.scrollTo({top:0, behavior:'smooth'});
}

function cancelEdit() {
  editingId = null;
  document.getElementById('famt').value = '';
  document.getElementById('fdesc').value = '';
  document.getElementById('form-title').textContent = 'Add expense';
  document.getElementById('addbtn').textContent = 'Add expense';
}

async function deleteExp(id) {
  if (editingId === id) cancelEdit();
  if(busy){alert('Another operation is running.');return;}
  busy=true; setSyncing('s');
  var backup=expenses.slice();
  expenses=expenses.filter(function(e){return e.id!==id;});
  renderAll();
  try{await sbDelete(id);setSyncing('ok');}
  catch(e){expenses=backup;renderAll();setSyncing('e');alert('Delete failed.\n\n'+e.message);}
  finally{busy=false;}
}

/* ═══════════════════════════════════════════════
   SMART RULES (Applied before AI)
═══════════════════════════════════════════════ */
function applySmartRules(text) {
  if(!text) return null;
  var t = text.toLowerCase();
  for (var i=0; i<RULES.length; i++) {
    if (t.indexOf(RULES[i].pattern.toLowerCase()) > -1) {
      return RULES[i].category;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════
   RECEIPT IMPORT LOGIC
═══════════════════════════════════════════════ */
async function startEkasaLookup(receiptId) {
  showStep('step-ekasa');
  showEkasaStatus('info', 'Searching Slovak eKasa database', 'Receipt ID: '+receiptId);

  try {
    var rawData = await getEkasaData(receiptId);
    showEkasaStatus('success', 'Found receipt in eKasa database', 'Analysing items using AI...');
    await categoriseWithGroq(rawData, receiptId);
  } catch(e) {
    showEkasaStatus('error', 'eKasa fetch failed', esc(e.message) + ' — Are you sure this is a valid SK fiscal receipt?');
  }
}

function handleQRData(raw) {
  dbg('QR raw: '+raw.slice(0,120));
  var receiptId = null;
  try {
    var u = new URL(raw);
    receiptId = u.searchParams.get('id');
  } catch(e){}
  
  if (!receiptId) {
    var m = raw.match(/O-[0-9A-F]{32}/i);
    if(m) receiptId = m[0];
  }
  
  if (receiptId) {
    showStep('step-ekasa');
    startEkasaLookup(receiptId);
  } else {
    showStep('step-ekasa');
    showEkasaStatus('error', 'Unrecognised QR code format', 'This does not appear to be a Slovak eKasa receipt.');
  }
}

async function handlePhotoUpload(el) {
  var f = el.files[0];
  if(!f) return;
  el.value='';
  showStep('step-ekasa');
  showEkasaStatus('info','Reading photo…','Compressing image for AI processing');
  
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function() {
      var maxW=1024, maxH=1024;
      var w=img.width, h=img.height;
      if (w>maxW || h>maxH) {
        var r = Math.min(maxW/w, maxH/h);
        w=Math.floor(w*r); h=Math.floor(h*r);
      }
      var c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      var b64=c.toDataURL('image/jpeg', 0.85).split(',')[1];
      categoriseImage(b64, 'image/jpeg');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
}

async function confirmReview() {
  if(busy) return;
  var items = document.querySelectorAll('.pitem');
  var dateStr = (document.getElementById('sdate') || {}).value || today();
  
  var addedCount = 0;
  busy = true; setSyncing('s');
  
  try {
    var storeEl = document.getElementById('r-store');
    var storeName = storeEl?.textContent?.trim();
    var invoiceId = null;
    
    // If scanning receipt, create parent invoice
    if (storeName && storeName !== 'Unknown') {
      var invoice = await sbCreateInvoice({
        who: swho,
        merchant_name: storeName,
        date: dateStr,
        total_amount: 0 // We aren't setting strict total amount for now, relying on sum of expenses
      });
      invoiceId = invoice.id;
      dbg('Created invoice: ' + invoice.id);
    }

    for (var i=0; i<items.length; i++) {
      var cb = document.getElementById('rcb_'+i);
      if(cb && cb.checked) {
        var amt = parseFloat(document.getElementById('ramt_'+i).value);
        var cat = document.getElementById('rcat_'+i).value;
        var nm  = document.getElementById('rnm_'+i).value;
        if(isNaN(amt)||!nm) continue;
        
        var row = {id:uid(), who:swho, date:dateStr, category:cat, amount:amt, description:nm, invoice_id: invoiceId};
        await sbInsert(row);
        row.created_at = new Date().toISOString();
        expenses.unshift(row);
        syncToGCal(row); // Auto-sync to GCal
        addedCount++;
        
        if (MEMORY[nm] !== cat) {
          MEMORY[nm] = cat;
          try { await sbSaveState(); } catch(e){}
        }
      }
    }
  } catch(e) {
    flash('Partial failure: '+e.message, true);
  } finally {
    busy = false;
    cancelReview();
    if(addedCount>0) {
      initMonths();
      document.getElementById('msel').value = dateStr.slice(0,7);
      renderAll();
      flash('Saved '+addedCount+' item(s)!', false);
      setSyncing('ok');
    }
  }
}

/* ═══════════════════════════════════════════════
   SETTINGS MANAGER & CUSTOM CATEGORIES
═══════════════════════════════════════════════ */
function addCategoryUI() {
  var nc = prompt('Enter new category name:');
  if(!nc || nc.trim()==='') return;
  nc = nc.trim();
  if(CATS.indexOf(nc)===-1) {
    CATS.push(nc);
    BUDGETS[nc] = 0;
    renderBudgetsGrid();
  }
}

function delCategory(catName) {
  if(!confirm('Remove category "'+catName+'"?')) return;
  CATS = CATS.filter(function(c){ return c !== catName; });
  delete BUDGETS[catName];
  renderBudgetsGrid();
}

async function saveSettings() {
  const userKeys = Object.keys(NAMES);
  userKeys.forEach(k => {
    const nameEl = document.getElementById('set-name-' + k);
    const incEl = document.getElementById('set-inc-' + k);
    if (nameEl) NAMES[k] = nameEl.value.trim() || NAMES[k];
    if (incEl) INCOME[k] = Number(incEl.value) || 0;
  });

  CATS.forEach(function(c){
    var v=document.getElementById('bc_'+c);
    if(v) BUDGETS[c]=Number(v.value);
  });
  TOTAL_B = CATS.reduce(function(s,k){return s+Number(BUDGETS[k])},0);
  
  localStorage.setItem('sf_names',   JSON.stringify(NAMES));
  localStorage.setItem('sf_income',  JSON.stringify(INCOME));
  localStorage.setItem('sf_budgets', JSON.stringify(BUDGETS));
  
  await sbSaveState();
  closeSettings();
  renderAll();
  flash('Settings saved & synced');
}

function addRuleUI() {
  var p = prompt('Enter a keyword / pattern that appears on receipts:');
  if(!p || !p.trim()) return;
  var cats = CATS.map(function(c, i){ return (i+1)+'. '+c; }).join('\n');
  var idx = prompt('Choose category by number (1-'+CATS.length+'):\n'+cats);
  if(!idx || isNaN(idx) || idx<1 || idx>CATS.length) return;
  RULES.push({id: uid(), pattern: p.trim(), category: CATS[idx-1]});
  localStorage.setItem('sf_rules', JSON.stringify(RULES));
  renderSettingsRules();
  sbSaveState().catch(function(){}); // Silent sync
}

function deleteRule(id) {
  RULES = RULES.filter(function(r){return r.id !== id;});
  localStorage.setItem('sf_rules', JSON.stringify(RULES));
  renderSettingsRules();
  sbSaveState().catch(function(){});
}

function saveGoal() {
  var gn = document.getElementById('g-name').value.trim();
  var gt = parseFloat(document.getElementById('g-target').value);
  var gs = parseFloat(document.getElementById('g-saved').value) || 0;
  var gd = document.getElementById('g-deadline').value;
  if(!gn || !gt) { flash('Name and target amount required', true); return; }
  
  GOALS.push({id: uid(), name: gn, target: gt, saved: gs, deadline: gd});
  localStorage.setItem('sf_goals', JSON.stringify(GOALS));
  closeGoalModal();
  renderGoals();
  sbSaveState().catch(function(){});
}

function deleteGoal(id) {
  if(!confirm('Delete this goal?')) return;
  GOALS = GOALS.filter(function(g){return g.id !== id;});
  localStorage.setItem('sf_goals', JSON.stringify(GOALS));
  renderGoals();
  sbSaveState().catch(function(){});
}

/* ═══════════════════════════════════════════════
   QR CAMERA MECHANICS
═══════════════════════════════════════════════ */
function startQRCamera() {
  stopQRCamera();
  var video = document.getElementById('qr-video');
  if (!video) return;
  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}})
    .then(function(stream) {
      qrStream = stream;
      video.srcObject = stream;
      video.play();
      qrCanvas = document.createElement('canvas');
      qrCtx    = qrCanvas.getContext('2d', {willReadFrequently:true});
      qrInterval = setInterval(function() {
        if (video.readyState < 4) return;
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        qrCanvas.width  = video.videoWidth;
        qrCanvas.height = video.videoHeight;
        qrCtx.drawImage(video, 0, 0);
        var data = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
        if (typeof jsQR === 'undefined') { dbg('jsQR not loaded', true); return; }
        var code = jsQR(data.data, data.width, data.height, {inversionAttempts:'attemptBoth'});
        if (code && code.data) {
          dbg('QR detected: ' + code.data.slice(0,80));
          stopQRCamera();
          handleQRData(code.data);
        }
      }, 300);
    })
    .catch(function(e) {
      dbg('Camera error: '+e.message, true);
      var w = document.getElementById('qr-wrap');
      if(w) w.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:13px">Camera not available — use the upload option below.</div>';
    });
}

function stopQRCamera() {
  if(qrInterval){clearInterval(qrInterval);qrInterval=null;}
  if(qrStream){qrStream.getTracks().forEach(function(t){t.stop();});qrStream=null;}
}

function scanQRFromImage(ev) {
  var f = ev.target.files[0]; if(!f) return;
  ev.target.value = ''; /* reset so same file can be re-selected */
  stopQRCamera();
  showStep('step-ekasa');
  showEkasaStatus('info','Reading QR code…','Analysing image for a QR code');
  var img = new Image();
  var url = URL.createObjectURL(f);
  img.onload = function() {
    if(!qrCanvas){qrCanvas=document.createElement('canvas');}
    if(!qrCtx){qrCtx=qrCanvas.getContext('2d',{willReadFrequently:true});}
    qrCanvas.width=img.width; qrCanvas.height=img.height;
    qrCtx.drawImage(img,0,0);
    var data=qrCtx.getImageData(0,0,img.width,img.height);
    URL.revokeObjectURL(url);
    if(typeof jsQR==='undefined'){showEkasaStatus('error','jsQR library not loaded','Please refresh the page and try again.');return;}
    var code=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});
    if(!code){
      var s=document.createElement('canvas');
      s.width=Math.floor(img.width/2); s.height=Math.floor(img.height/2);
      s.getContext('2d').drawImage(img,0,0,s.width,s.height);
      var d2=s.getContext('2d').getImageData(0,0,s.width,s.height);
      code=jsQR(d2.data,d2.width,d2.height,{inversionAttempts:'attemptBoth'});
    }
    if(code && code.data){dbg('QR from image: '+code.data.slice(0,80));handleQRData(code.data);}
    else {showEkasaStatus('error','No QR code found in image', 'Try a clearer, well-lit photo where the QR code fills most of the frame.');}
  };
  img.onerror=function(){ showEkasaStatus('error','Could not read image file','Please try a different photo.'); };
  img.src=url;
}

function onManualPhoto(ev) {
  handlePhotoUpload(ev.target);
}

function setSWho(w) {
  swho = w;
  document.querySelectorAll('#filter-user-toggles .wbtn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === w);
  });
  const fWhoEl = document.getElementById('fwho');
  if(fWhoEl) fWhoEl.value = w;
  renderLog();
}
