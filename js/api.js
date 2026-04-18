/* ═══════════════════════════════════════════════
   DEBUG TRACE
═══════════════════════════════════════════════ */
var dbgOn = false;

function dbg(msg, objPayload, isApiTrace = false) {
  var isErr = (objPayload instanceof Error) || (msg.toLowerCase().indexOf('error') > -1) || (msg.toLowerCase().indexOf('fail') > -1);
  console[isErr?'error':'log']('[APP]', msg, objPayload || '');
  
  var p = document.getElementById('dbgpanel');
  if(!p) return;
  
  var d = document.createElement('div');
  d.className = isErr ? 'err' : '';
  
  var tracePrefix = isApiTrace ? '[API] ' : '';
  var textBody = new Date().toTimeString().slice(0,8) + ' ' + tracePrefix + msg;
  
  if (objPayload instanceof Error) {
    textBody += '\n  Error: ' + objPayload.message;
    if (objPayload.stack) textBody += '\n  Stack: ' + objPayload.stack.split('\n').slice(0,2).join('\n');
  } else if (objPayload && typeof objPayload === 'object' && Object.keys(objPayload).length > 0) {
    try {
      textBody += '\n  Payload: ' + JSON.stringify(objPayload).slice(0, 150) + '...';
    } catch(e) {}
  } else if (typeof objPayload === 'string' && objPayload.trim() !== '') {
    textBody += '\n  Data: ' + objPayload.slice(0, 150) + '...';
  }
  
  d.textContent = textBody;
  p.appendChild(d);
  p.scrollTop = p.scrollHeight;
}

function toggleDbg() {
  dbgOn = !dbgOn;
  var panel = document.getElementById('dbgpanel');
  if(panel) panel.style.display = dbgOn ? 'block' : 'none';
}

/* ═══════════════════════════════════════════════
   EKASA FETCH
═══════════════════════════════════════════════ */
async function getEkasaData(receiptId) {
  dbg('eKasa proxy fetch', {id: receiptId}, true);
  var r = await fetch(EKASA, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ receiptId: receiptId })
  });
  var b = await r.json();
  dbg('eKasa proxy res: ' + r.status, b, true);
  if (!r.ok) throw new Error(b.error || 'Failed to fetch from eKasa');
  return b;
}

/* ═══════════════════════════════════════════════
   GROQ AI CALLS (PROXIED)
═══════════════════════════════════════════════ */
function getMemoryPrompt() {
  if (!Object.keys(MEMORY).length) return '';
  return '\n\nUser Preference Memory (PRIORITIZE THESE MAPPINGS):\n' + JSON.stringify(MEMORY) + '\n';
}

async function categoriseWithGroq(ekasaData, receiptId) {
  dbg('Groq categorise — raw keys: '+Object.keys(ekasaData).join(', '));

  var receipt  = ekasaData.receipt || ekasaData;
  var items    = receipt.items || receipt.receiptItems || receipt.lines || [];
  var store    = receipt.organizationName || receipt.merchantName || receipt.name || receipt.ico || 'Slovak receipt';
  var dateStr  = null;
  if (receipt.createDate || receipt.issueDate || receipt.date) {
    var raw = receipt.createDate || receipt.issueDate || receipt.date || '';
    var m = String(raw).match(/\d{4}-\d{2}-\d{2}/);
    if (m) dateStr = m[0];
  }
  var total    = receipt.totalPrice || receipt.amount || receipt.total || null;

  dbg('Store: '+store+' | Items: '+items.length+' | Date: '+dateStr);

  if (!items.length) {
    dbg('No items array — sending full JSON to Groq');
    items = [];
    await categoriseRawJSON(ekasaData, store, dateStr, receiptId);
    return;
  }

  var lines = items.map(function(it, i) {
    var name  = it.name || it.itemName || it.description || it.text || ('Item '+(i+1));
    var price = Number(it.price || it.amount || it.totalPrice || it.unitPrice || 0);
    var qty   = Number(it.quantity || it.qty || 1);
    var targetTotal = Number(it.itemTotalPrice || it.lineTotal || (price * qty) || price);
    return (i+1)+'. '+name+' — €'+targetTotal.toFixed(2);
  });

  var prompt =
    'You are a shopping receipt categoriser. Categorise each item below into EXACTLY one of these categories: '+
    CATS.join(', ')+'\n\n'+
    'Rules:\n'+
    '- Food, drinks, produce, tobacco, cigarettes → Groceries\n'+
    '- Clothes, shoes, bags, accessories → Clothing\n'+
    '- Toys, baby items, school supplies → Kids\n'+
    '- Medicine, pharmacy, vitamins → Health\n'+
    '- Alcohol, beer, wine → Dining out\n'+
    '- Pet food, pet supplies → Pets\n'+
    '- Fuel, parking, bus tickets → Transport\n'+
    '- Anything else → Other\n\n'+
    'Items:\n'+lines.join('\n') + getMemoryPrompt() + '\n\n' +
    'Return ONLY a JSON array — no markdown, no explanation, nothing else:\n'+
    '[{"idx":1,"category":"Groceries"},{"idx":2,"category":"Other"},...]\n'+
    'One object per item, using the same number as the item list above.';

  var payload = {
    model:       'llama-3.3-70b-versatile',
    max_tokens:  800,
    temperature: 0,
    response_format: {type:'json_object'},
    messages: [
      { role: 'system', content: 'You are a receipt categoriser. Always respond with valid JSON.' },
      { role: 'user', content: prompt + '\n\nIMPORTANT: respond with JSON only. Wrap the array in an object: {"items":[...]}' }
    ]
  };

  dbg('Groq API Call (Categorize Text)', payload, true);

  try {
    var res = await fetch(GROQ, {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var rb = await res.json();
    dbg('Groq API Response', rb, true);
    
    if (!res.ok) throw new Error(rb.error ? rb.error.message : 'Groq error '+res.status);

    var txt = rb.choices[0].message.content.trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'').trim();
    var parsed = {};
    if (txt) {
      try { parsed = JSON.parse(txt); }
      catch(ep) {
        var fixMatch = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if(fixMatch) parsed = JSON.parse(fixMatch[0]);
        else throw ep;
      }
    }
    var catsArray = parsed.items || (Array.isArray(parsed) ? parsed : null);
    if (!catsArray) {
      var vals = Object.values(parsed);
      catsArray = Array.isArray(vals[0]) ? vals[0] : [];
    }

    var catMap = {};
    catsArray.forEach(function(c){ if(c && c.idx) catMap[c.idx]=c.category; });

    var result = items.map(function(it, i) {
      var name  = it.name || it.itemName || it.description || it.text || ('Item '+(i+1));
      var price = Number(it.price || it.amount || it.totalPrice || it.unitPrice || 0);
      var qty   = Number(it.quantity || it.qty || 1);
      var amt   = Number(it.itemTotalPrice || it.lineTotal || (price*qty) || price);
      
      var ruleCat = applySmartRules(name);
      
      return {
        name:     name,
        amount:   amt,
        category: ruleCat || catMap[i+1] || 'Other'
      };
    });

    showReview(store, dateStr, result, total);

  } catch(e) {
    dbg('Groq error', e, true);
    showEkasaStatus('error','Groq categorisation failed', esc(e.message));
  }
}

async function categoriseRawJSON(rawData, store, dateStr, receiptId) {
  var prompt =
    'This is a JSON response from the Slovak eKasa fiscal receipt API for receipt '+receiptId+'.\n'+
    'Extract all purchased items and categorise each into one of these exactly: '+CATS.join(', ')+'.\n\n'+
    'JSON data:\n'+JSON.stringify(rawData)+'\n\n'+
    getMemoryPrompt() + '\n' +
    'Return ONLY this JSON object, no markdown:\n'+
    '{"store":"store name","date":"YYYY-MM-DD or null","items":[{"name":"item","amount":1.23,"category":"Groceries"}]}';

  var payload = {
    model:'llama-3.3-70b-versatile', max_tokens:1500, temperature:0,
    response_format:{type:'json_object'},
    messages:[
      {role:'system', content:'You are a receipt parser that extracts structured JSON from eKasa receipt data.'},
      {role:'user',   content:prompt}
    ]
  };

  dbg('Groq API Call (Categorize Raw JSON)', payload, true);

  try {
    var res = await fetch(GROQ, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var rb = await res.json();
    dbg('Groq API Response', rb, true);
    if(!res.ok) throw new Error(rb.error?rb.error.message:'Groq error '+res.status);
    
    var rbtxt = rb.choices[0].message.content.trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'').trim();
    var parsed = {};
    try { parsed = JSON.parse(rbtxt); } catch(ep) {
      var fixMatch = rbtxt.match(/\{[\s\S]*\}/);
      if(fixMatch) parsed = JSON.parse(fixMatch[0]); else throw ep;
    }
    if(parsed.items) {
      parsed.items.forEach(function(it) {
        var ruleCat = applySmartRules(it.name || '');
        if(ruleCat) it.category = ruleCat;
      });
    }
    showReview(parsed.store||store, parsed.date||dateStr, parsed.items||[], null);
  } catch(e) {
    dbg('Groq Raw JSON error', e, true);
    showEkasaStatus('error','Fallback extraction failed', esc(e.message));
  }
}

async function categoriseImage(b64, mime) {
  showEkasaStatus('info','Uploading to Groq Vision...','Processing image via Llama 3.2 Vision');
  var prompt='Read this Slovak receipt. Use eKasa format if present. '+
    'Extract store name and return it in "store".\n'+
    'Identify EVERY purchased item, its EXACT price. '+
    'Assign EACH item to a generic category (Groceries, Kids, Health, Transport, Pets, Utilities, Clothing, Dining out, Entertainment, Other).\n'+
    'Produce valid JSON: {"store":"Lidl","date":"2023-10-15","items":[{"name":"Mlieko","amount":1.15,"category":"Groceries"}]}\n'+
    'CAT must be exactly one of: '+CATS.join(', ')+'\n'+
    getMemoryPrompt() + '\n' +
    'Rules: food/drinks/tobacco→Groceries. clothes/shoes→Clothing. toys/school→Kids. medicine→Health. alcohol→Dining out. pet items→Pets. fuel/parking→Transport.\n'+
    'List every line item. Extract date if visible.';

  var payload = {
    model:'llama-3.2-90b-vision-preview',
    max_tokens:2000, temperature:0.1,
    messages:[{role:'user',content:[
      {type:'image_url',image_url:{url:'data:'+mime+';base64,'+b64}},
      {type:'text',text:prompt}
    ]}]
  };
  
  dbg('Groq API Call (Vision)', {model: payload.model, length: b64.length}, true);

  try {
    var res=await fetch(GROQ,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    var rb=await res.json();
    dbg('Groq API Response', {status: res.status, id: rb.id}, true);
    if(!res.ok) throw new Error(rb.error?rb.error.message:'Groq vision error '+res.status);
    
    var txt=rb.choices[0].message.content.trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'').trim();
    var match=txt.match(/\{[\s\S]*\}/);
    if(!match) throw new Error('Unexpected response format — try a clearer photo');
    
    var p=JSON.parse(match[0]);
    if(p.items) {
      p.items.forEach(function(it) {
        var ruleCat = applySmartRules(it.name || '');
        if(ruleCat) it.category = ruleCat;
      });
    }
    showReview(p.store,p.date,p.items||[],null);
  } catch(e){
    dbg('Image process err', e, true);
    showEkasaStatus('error','Photo processing failed', esc(e.message));
  }
}

/* ═══════════════════════════════════════════════
   BANKS (ENABLE BANKING INTEGRATION)
═══════════════════════════════════════════════ */
async function loadBanks() {
  var el = document.getElementById('bank-picker-list');
  el.innerHTML = '<span class="spin"></span>';
  
  dbg('Enable Banking API Call', {action:'institutions'}, true);
  try {
    var r = await fetch(ENABLE_BANKING, { method:'POST', body:JSON.stringify({action:'institutions', country:'SK'}) });
    var banks = await r.json();
    dbg('Enable Banking API Response', banks, true);
    if(!r.ok) throw new Error(banks.error || 'Failed to load banks');
    
    var html = '<div style="max-height:60vh;overflow-y:auto;padding-right:8px">';
    banks.forEach(function(b) {
      // Filter for banks that support account information
      html += '<div class="bank-item" style="cursor:pointer" onclick="connectBank(\''+b.id+'\', \''+esc(b.name)+'\')">'+
              '<div class="bank-info"><div class="bank-name">'+esc(b.name)+'</div><div class="bank-status">'+(b.country||'SK')+'</div></div>'+
              '<button class="btn-scan" style="padding:4px 10px;font-size:11px">Connect</button>'+
              '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    dbg('Enable Banking error', e, true);
    el.innerHTML = '<div class="status-box error">'+esc(e.message)+'</div>';
  }
}

async function connectBank(instId, instName) {
  var el = document.getElementById('bank-picker-list');
  el.innerHTML = '<div style="text-align:center"><span class="spin spin-lg"></span><div style="margin-top:10px;font-size:13px;color:var(--muted)">Generating secure link...</div></div>';
  
  var redirectUri = window.location.origin + window.location.pathname;
  
  var payload = { action:'start_session', institution_id: instId, redirect_uri: redirectUri };
  dbg('Enable Banking API Call (Start Session)', payload, true);
  
  try {
    var r = await fetch(ENABLE_BANKING, { method:'POST', body:JSON.stringify(payload) });
    var res = await r.json();
    dbg('Enable Banking API Response', res, true);
    if(!r.ok) throw new Error(res.error || 'Connection failed');
    
    localStorage.setItem('sf_eb_pending', JSON.stringify({id: instId, name: instName}));
    window.location.href = res.url; // Use 'url' for Enable Banking redirect
  } catch(e) {
    dbg('Enable Banking connect error', e, true);
    el.innerHTML = '<div class="status-box error">'+esc(e.message)+'</div>';
  }
}

async function handleEnableBankingCallback(sessionId) {
  document.getElementById('cards').innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center"><span class="spin"></span> Finalizing banking feed...</div>';
  
  var payload = { action:'get_session', session_id: sessionId };
  dbg('Enable Banking API Call (Get Session)', payload, true);
  try {
    var pending = JSON.parse(localStorage.getItem('sf_eb_pending')) || {name: 'Connected Bank'};
    
    var r = await fetch(ENABLE_BANKING, { method:'POST', body:JSON.stringify(payload) });
    var res = await r.json();
    dbg('Enable Banking API Response', res, true);
    
    if (res.status === 'AUTHORIZED') {
      // Get actual accounts linked to this session
      var accPayload = { action:'get_accounts', session_id: sessionId };
      var accRes = await fetch(ENABLE_BANKING, { method:'POST', body:JSON.stringify(accPayload) });
      var accData = await accRes.json();
      
      var b = { 
        institution_id: pending.id, 
        name: pending.name, 
        session_id: sessionId, 
        accounts: accData.accounts || [], 
        linked_at: today() 
      };
      
      var exists = BANKS.findIndex(function(x){return x.session_id === sessionId});
      if(exists < 0) BANKS.push(b); else BANKS[exists] = b;
      
      await sbSaveState();
      flash('Bank feed live!', false);
    } else {
      throw new Error('Bank connection not authorized (Status: '+res.status+')');
    }
  } catch(e) {
    dbg('Enable Banking callback error', e, true);
    flash('Bank error: '+e.message, true);
  }
  localStorage.removeItem('sf_eb_pending');
  renderAll();
  renderBankSync();
}

async function syncBank(sessionId) {
  var bank = BANKS.find(function(b){return b.session_id===sessionId});
  if(!bank || !bank.accounts || bank.accounts.length===0) return;
  
  busy=true; setSyncing('s');
  // Enable Banking often needs fetching per-account. We'll grab the first one.
  var payload = {action:'get_transactions', session_id: sessionId, account_id: bank.accounts[0].resourceId};
  dbg('Enable Banking API Call (Get Transactions)', payload, true);
  
  try {
    var r = await fetch(ENABLE_BANKING, { method:'POST', body:JSON.stringify(payload) });
    var res = await r.json();
    dbg('Enable Banking API Response', res, true);
    if(!r.ok) throw new Error(res.error || 'Failed to fetch transactions');
    
    // Enable Banking response structure: { transactions: [...] }
    var txs = res.transactions || [];
    txs.sort(function(a,b){ return new Date(b.bookingDate||b.valueDate) - new Date(a.bookingDate||a.valueDate); });
    
    var promptData = txs.slice(0, 20).map(function(t) {
      return { 
        id: t.transactionId, 
        date: t.bookingDate||t.valueDate, 
        amount: t.transactionAmount.amount, 
        currency: t.transactionAmount.currency, 
        info: (t.remittanceInformationUnstructured||'')+' '+(t.creditorName||'') 
      };
    });
    
    var gPayload = {
      model:'llama-3.3-70b-versatile', max_tokens:1500, temperature:0, response_format:{type:'json_object'},
      messages:[
        {role:'system', content:'You are a financial categoriser. Return a JSON object with a "transactions" array. Each item must have: "date" (YYYY-MM-DD), "amount" (positive number), "category" (Must be one of: '+CATS.join(', ')+'), "description" (cleaned up). Do not return internal bank transfers. '+getMemoryPrompt()},
        {role:'user', content:JSON.stringify(promptData)}
      ]
    };
    dbg('Groq API Call (Categorize Bank Transactions)', gPayload, true);
    var gRes = await fetch(GROQ, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(gPayload)
    });
    var grb = await gRes.json();
    dbg('Groq API Response', grb, true);
    
    var gbtxt = grb.choices[0].message.content.trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'').trim();
    var pTxs = [];
    try { pTxs = JSON.parse(gbtxt).transactions || []; } catch(ep) {
      var fixMatch = gbtxt.match(/\{[\s\S]*\}/);
      if(fixMatch) pTxs = JSON.parse(fixMatch[0]).transactions || []; else throw ep;
    }
    if(pTxs) {
      pTxs.forEach(function(it) {
        var ruleCat = applySmartRules(it.description || '');
        if(ruleCat) it.category = ruleCat;
      });
    }
    
    showReview(bank.name + ' Sync', today(), pTxs.map(function(t){return {name:t.description, amount:t.amount, category:t.category}}), today());
    
  } catch(e) {
    dbg('Sync bank error', e, true);
    flash('Sync error: '+e.message, true);
  } finally {
    busy=false; setSyncing('ok');
  }
}

/* ═══════════════════════════════════════════════
   MONTHLY INSIGHTS GENERATOR
═══════════════════════════════════════════════ */
async function generateInsights(month) {
  var exps = expenses.filter(function(e){return e.date&&String(e.date).slice(0,7)===month;});
  if (exps.length < 5) {
    document.getElementById('insights-body').innerHTML = '<div style="color:var(--muted);text-align:center">Not enough data this month for insights. Keep logging!</div>';
    return;
  }
  
  var catTotals = {};
  exps.forEach(function(e){ catTotals[e.category] = (catTotals[e.category]||0) + Number(e.amount); });
  
  var promptData = {
    month: month,
    total_spent: exps.reduce(function(s,e){return s+Number(e.amount)},0),
    budgets: BUDGETS,
    spent_by_category: catTotals,
    top_5_items: exps.sort(function(a,b){return Number(b.amount)-Number(a.amount)}).slice(0,5)
  };

  var payload = {
    model:'llama-3.3-70b-versatile', max_tokens:600, temperature:0.3,
    messages:[
      {role:'system', content:'You are a financial advisor. Review this month\'s expense data. Offer 2-3 short, highly actionable insights. E.g. point out anomalies, praise good budgeting, or suggest where to cut back. Keep it under 150 words. Format with simple emojis and clear spacing.'},
      {role:'user', content:JSON.stringify(promptData)}
    ]
  };
  dbg('Groq API Call (Generate Insights)', payload, true);

  try {
    var res = await fetch(GROQ, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var rb = await res.json();
    dbg('Groq API Response', rb, true);
    
    if(!res.ok) throw new Error(rb.error?rb.error.message:'Groq error '+res.status);
    document.getElementById('insights-body').innerHTML = '<div class="insight-body">'+esc(rb.choices[0].message.content)+'</div>';
  } catch(e) {
    dbg('Insights error', e, true);
    document.getElementById('insights-body').innerHTML = '<div class="status-box error">'+esc(e.message)+'</div>';
  }
}

/* ═══════════════════════════════════════════════
   AI BULK PROCESSING (BANK STATEMENTS)
═══════════════════════════════════════════════ */
async function aiProcessBulkTransactions(text) {
  var prompt = 
    'Analyze this bank statement text or CSV content. Extract EVERY valid transaction.\n' +
    'Each transaction must have: date (YYYY-MM-DD), who (e.g. Nik), amount (positive number), category, description.\n\n' +
    'Rules:\n' +
    '- Current Categories: ' + CATS.join(', ') + '\n' +
    '- Default "who" to: ' + (NAMES.u1 || 'You') + '\n' +
    '- Clean descriptions (e.g. "TESCO STORES 1234" -> "Tesco")\n\n' +
    'Input Text:\n' + text + '\n\n' +
    'Return ONLY a JSON array of objects: [{"date":"...","who":"...","amount":12.34,"category":"...","description":"..."}]';

  var payload = {
    model: 'llama-3.3-70b-versatile',
    max_tokens: 4000,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a bank statement parser. Always respond with a JSON object containing a "transactions" array.' },
      { role: 'user', content: prompt }
    ]
  };

  dbg('Groq API Call (Bulk Statement)', {length: text.length}, true);

  const res = await fetch(GROQ, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const rb = await res.json();
  if (!res.ok) throw new Error(rb.error ? rb.error.message : 'Groq error');

  const content = rb.choices[0].message.content.trim();
  const parsed = JSON.parse(content);
  const txs = parsed.transactions || parsed;
  
  return Array.isArray(txs) ? txs : [];
}

