/* ═══════════════════════════════════════════════
   CREDENTIALS & ENDPOINTS
═══════════════════════════════════════════════ */
var SB_URL  = 'https://yleswxfenmuzmxeekxkg.supabase.co';
var SB_KEY  = 'sb_publishable_qJGOiVaWDrd9Fq6EUJvGUg_a8VrWCUx';
var GROQ    = '/api/groq';
var ENABLE_BANKING = '/api/enablebanking';
var REST    = SB_URL + '/rest/v1/expenses';
var REST_INVOICES = SB_URL + '/rest/v1/invoices';
var EKASA   = '/ekasa-proxy/receipt/find';

/* ═══════════════════════════════════════════════
   CONSTANTS & STATE DYNAMICS
═══════════════════════════════════════════════ */
var defaultNames = {u1: 'Nikhil', u2: 'Zuzana'};
var NAMES = JSON.parse(localStorage.getItem('sf_names')) || defaultNames;

var defaultBudgets = {Groceries:800,Clothing:150,Transport:280,Utilities:65,'Dining out':100,Health:10,Entertainment:500,Pets:50,Kids:50,Other:100};
var BUDGETS = JSON.parse(localStorage.getItem('sf_budgets')) || defaultBudgets;

/* Legacy migrate: if their old income state had {Nikhil: 4200}, migrate to {u1: 4200} */
var oldInc = JSON.parse(localStorage.getItem('sf_income'));
var INCOME = oldInc ? (oldInc.Nikhil !== undefined ? {u1: oldInc.Nikhil, u2: oldInc.Zuzana} : oldInc) : {u1: 4200, u2: 1400};

var TOTAL_B = Object.keys(BUDGETS).reduce(function(s,k){return s+Number(BUDGETS[k])},0);
var CATS    = Object.keys(BUDGETS);
var MEMORY  = JSON.parse(localStorage.getItem('sf_memory')) || {};
var RULES   = JSON.parse(localStorage.getItem('sf_rules'))  || []; /* [{id,pattern,category}] */
var GOALS   = JSON.parse(localStorage.getItem('sf_goals'))  || []; /* [{id,name,target,saved,deadline}] */
var BANKS   = JSON.parse(localStorage.getItem('sf_banks'))  || []; /* [{institution_id,name,requisition_id}] */
var GCAL    = JSON.parse(localStorage.getItem('sf_gcal'))   || { enabled: false, token: null };

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
var expenses = [];
var who  = NAMES.u1;
var swho = NAMES.u1;
var busy = false;
var qrStream    = null;
var qrInterval  = null;
var qrCanvas    = null;
var qrCtx       = null;
var editingId   = null; /* Track if we are editing an entry */

/* ═══════════════════════════════════════════════
   SUPABASE
═══════════════════════════════════════════════ */
function sbH(extra) {
  var h = {'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Accept':'application/json'};
  if (extra) Object.keys(extra).forEach(function(k){h[k]=extra[k];});
  return h;
}
async function sbSelect() {
  dbg('Supabase SELECT', {}, true); /* enhanced debug */
  var r = await fetch(REST+'?select=*&order=date.desc,created_at.desc', {headers:sbH()});
  var b = await r.text();
  dbg('SELECT '+r.status, b.slice(0, 100), true);
  if (!r.ok) throw new Error('Load failed '+r.status+': '+b.slice(0,300));
  return JSON.parse(b);
}
async function sbInsert(row) {
  dbg('INSERT expense (invoice_id=' + (row.invoice_id || 'null') + ') id='+row.id, row, true);
  var r = await fetch(REST, {method:'POST', headers:sbH({'Prefer':'return=minimal'}), body:JSON.stringify(row)});
  var b = await r.text();
  dbg('INSERT '+r.status, b ? b.slice(0,80) : 'OK', true);
  if (!r.ok) throw new Error('Save failed '+r.status+': '+b.slice(0,300));
}

async function sbCreateInvoice(invoice) {
  dbg('CREATE invoice', invoice, true);
  var r = await fetch(REST_INVOICES, {
    method: 'POST',
    headers: sbH({'Prefer': 'return=representation'}),
    body: JSON.stringify(invoice)
  });
  var data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Invoice creation failed');
  return data[0];
}
async function sbDelete(id) {
  dbg('DELETE id='+id, {}, true);
  var r = await fetch(REST+'?id=eq.'+encodeURIComponent(id), {method:'DELETE', headers:sbH({'Prefer':'return=minimal'})});
  var b = await r.text();
  dbg('DELETE '+r.status, b ? b.slice(0,80) : 'OK', true);
  if (!r.ok) throw new Error('Delete failed '+r.status+': '+b.slice(0,300));
}
async function sbUpdate(id, row) {
  dbg('UPDATE id='+id, row, true);
  var r = await fetch(REST+'?id=eq.'+encodeURIComponent(id), {
    method:'PATCH', headers:sbH({'Prefer':'return=minimal'}), body:JSON.stringify(row)
  });
  if (!r.ok) throw new Error('Update failed '+r.status);
}

async function sbLoadState() {
  dbg('Supabase LOAD STATE', {}, true);
  var r = await fetch(SB_URL + '/rest/v1/app_state?id=eq.global&select=config', {headers:sbH()});
  var b = await r.json();
  if(!r.ok) return null;
  if(b && b.length > 0) return b[0].config;
  return null;
}
async function sbSaveState() {
  dbg('Supabase SAVE STATE', {}, true);
  var configObj = {
    names: NAMES, income: INCOME, budgets: BUDGETS,
    memory: MEMORY, rules: RULES, goals: GOALS, banks: BANKS,
    gcal: GCAL
  };
  var r = await fetch(SB_URL + '/rest/v1/app_state?id=eq.global', {
    method:'PATCH', headers:sbH({'Prefer':'return=minimal'}), body:JSON.stringify({config: configObj})
  });
  if(!r.ok) throw new Error('State sync failed');
}
