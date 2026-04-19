/* ═══════════════════════════════════════════════
   CREDENTIALS & ENDPOINTS
═══════════════════════════════════════════════ */
var SB_URL = '';
var SB_KEY = '';
var GROQ = '/api/groq';
var ENABLE_BANKING = '/api/enablebanking';
var REST = '';
var REST_INVOICES = '';
var EKASA = '/ekasa-proxy/receipt/find';
var HOUSEHOLD_ID = '';
var SESSION_JWT = null;
var supabaseClient = null;
var LANG = localStorage.getItem('sf_lang') || 'en';

// Central Date Formatter (dd/mm/yyyy)
function dtf(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

const DICT = {
  en: {
    'Add expense': 'Add expense',
    'Spent by User': 'Spent by User',
    'Category Breakdown': 'Category Breakdown',
    'Budget vs Actual': 'Budget vs Actual',
    'Scan receipt': 'Scan receipt',
    'Private Access': 'Private Access',
    'Login': 'Login',
    'Continue with Google': 'Continue with Google',
    'Username / Household name': 'Username / Household name',
    'Password': 'Password',
    'Enter Household': 'Enter Household',
    'New here?': 'New here?',
    'Settings': 'Settings',
    'Logout': 'Logout',
    'Language': 'Language',
    'Secure access to your household': 'Secure access to your household',
    '🔐 Family Passcode': '🔐 Family Passcode',
    'Unlock Household': 'Unlock Household',
    'OR SIGN IN WITH': 'OR SIGN IN WITH',
    'Google Account': 'Google Account',
    'Advanced: Username & Password': 'Advanced: Username & Password',
    'Total spent': 'Total spent',
    'Remaining': 'Remaining',
    'Left this month': 'Left this month',
    'Over budget': 'Over budget',
    'Household Members': 'Household Members',
    'Monthly Budgets': 'Monthly Budgets',
    'Smart Rules': 'Smart Rules',
    'Bank Connections': 'Bank Connections',
    'Connect Bank': 'Connect Bank',
    'Integrations': 'Integrations',
    'Connect Google Calendar': 'Connect Google Calendar',
    'Monthly Insights': 'Monthly Insights',
    'Analysing this month...': 'Analysing this month...',
    'Net Savings': 'Net Savings',
    'Everyone': 'Everyone',
    'All categories': 'All categories',
    'Financial Plan & Settings': 'Financial Plan & Settings',
    'Update your monthly income and budget limits based on your financial plan.': 'Update your monthly income and budget limits based on your financial plan.',
    'Household Members': 'Household Members',
    'Monthly Budgets': 'Monthly Budgets',
    '+ Add Custom': '+ Add Custom',
    'Smart Rules': 'Smart Rules',
    '+ Add Rule': '+ Add Rule',
    'Auto-categorize items matching a keyword. Applied before AI.': 'Auto-categorize items matching a keyword. Applied before AI.',
    'Bank Connections (Enable Banking)': 'Bank Connections (Enable Banking)',
    '+ Connect Bank': '+ Connect Bank',
    'Connect professional banking feeds via Enable Banking (Supports Tatra Banka, VUB, SLSP, Revolut).': 'Connect professional banking feeds via Enable Banking (Supports Tatra Banka, VUB, SLSP, Revolut).',
    'Integrations': 'Integrations',
    '💡 Monthly Insights': '💡 Monthly Insights'
  },
  sk: {
    'Add expense': 'Pridať výdavok',
    'Spent by User': 'Utratené podľa užívateľa',
    'Category Breakdown': 'Rozdelenie podľa kategórií',
    'Budget vs Actual': 'Rozpočet vs Skutočnosť',
    'Scan receipt': 'Naskenovať bloček',
    'Private Access': 'Súkromný prístup',
    'Login': 'Prihlásiť sa',
    'Continue with Google': 'Pokračovať cez Google',
    'Username / Household name': 'Meno užívateľa / Domácnosť',
    'Password': 'Heslo',
    'Enter Household': 'Vstúpiť do domácnosti',
    'New here?': 'Prvýkrát tu?',
    'Settings': 'Nastavenia',
    'Logout': 'Odhlásiť sa',
    'Language': 'Jazyk',
    'Secure access to your household': 'Zabezpečený prístup k vašej domácnosti',
    '🔐 Family Passcode': '🔐 Rodinný PIN kód',
    'Unlock Household': 'Odomknúť domácnosť',
    'OR SIGN IN WITH': 'ALEBO SA PRIHLÁSTE CEZ',
    'Google Account': 'Google účet',
    'Advanced: Username & Password': 'Rozšírené: Meno a Heslo',
    'Total spent': 'Celkovo utratené',
    'Remaining': 'Zostáva',
    'Left this month': 'Zostáva tento mesiac',
    'Over budget': 'Nad rozpočet',
    'Household Members': 'Členovia domácnosti',
    'Monthly Budgets': 'Mesačné rozpočty',
    'Smart Rules': 'Inteligentné pravidlá',
    'Bank Connections': 'Bankové spojenia',
    'Connect Bank': 'Pripojiť banku',
    'Integrations': 'Integrácie',
    'Connect Google Calendar': 'Pripojiť Google kalendár',
    'Monthly Insights': 'Mesačné štatistiky',
    'Analysing this month...': 'Analyzujem tento mesiac...',
    'Net Savings': 'Čisté úspory',
    'Everyone': 'Všetci',
    'All categories': 'Všetky kategórie',
    'Financial Plan & Settings': 'Finančný plán a nastavenia',
    'Update your monthly income and budget limits based on your financial plan.': 'Aktualizujte svoje mesačné príjmy a rozpočtové limity na základe vášho plánu.',
    'Household Members': 'Členovia domácnosti',
    'Monthly Budgets': 'Mesačné rozpočty',
    '+ Add Custom': '+ Pridať vlastné',
    'Smart Rules': 'Inteligentné pravidlá',
    '+ Add Rule': '+ Pridať pravidlo',
    'Auto-categorize items matching a keyword. Applied before AI.': 'Automaticky kategorizujte položky podľa kľúčového slova. Aplikuje sa pred AI.',
    'Bank Connections (Enable Banking)': 'Bankové spojenia (Enable Banking)',
    '+ Connect Bank': '+ Pripojiť banku',
    'Connect professional banking feeds via Enable Banking (Supports Tatra Banka, VUB, SLSP, Revolut).': 'Pripojte profesionálne bankové kanály cez Enable Banking (Podporuje Tatra Banku, VÚB, SLSP, Revolut).',
    'Integrations': 'Integrácie',
    '💡 Monthly Insights': '💡 Mesačné štatistiky',
    'Details for': 'Podrobnosti pre',
    'Target': 'Cieľ',
    'Spent': 'Minuté',
    'Income': 'Príjem',
    'Current Month': 'Aktuálny mesiac'
  }
};

function t(key) {
  return (DICT[LANG] && DICT[LANG][key]) || key;
}

async function sysBootSupabase() {
  try {
    const env = await fetch('/api/env').then(r => r.json());
    SB_URL = env.SB_URL;
    SB_KEY = env.SB_KEY;
    REST = SB_URL + '/rest/v1/expenses';
    REST_INVOICES = SB_URL + '/rest/v1/invoices';
    if(window.supabase) {
      supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
    return !!supabaseClient;
  } catch(e) {
    console.error("Critical: SDK boot failed", e);
    return false;
  }
}

/* ═══════════════════════════════════════════════
   CONSTANTS & STATE DYNAMICS
═══════════════════════════════════════════════ */
var defaultNames = {u1: 'Person 1'};
var NAMES = JSON.parse(localStorage.getItem('sf_names')) || defaultNames;

var defaultBudgets = {Groceries:500,Transport:100,Utilities:200,Dining:100,Other:100};
var BUDGETS = JSON.parse(localStorage.getItem('sf_budgets')) || defaultBudgets;

var oldInc = JSON.parse(localStorage.getItem('sf_income'));
var INCOME = oldInc || {u1: 1};

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
  var token = SESSION_JWT || SB_KEY;
  var h = {'apikey':SB_KEY,'Authorization':'Bearer ' + token,'Content-Type':'application/json','Accept':'application/json'};
  if (extra) Object.keys(extra).forEach(function(k){h[k]=extra[k];});
  return h;
}
async function sbSelect() {
  dbg('Supabase SELECT', {}, true); /* enhanced debug */
  var r = await fetch(REST+'?household_id=eq.'+HOUSEHOLD_ID+'&select=*&order=date.desc,created_at.desc', {headers:sbH()});
  var b = await r.text();
  dbg('SELECT '+r.status, b.slice(0, 100), true);
  if (!r.ok) throw new Error('Load failed '+r.status+': '+b.slice(0,300));
  return JSON.parse(b);
}
async function sbInsert(row) {
  row.household_id = HOUSEHOLD_ID;
  dbg('INSERT expense (invoice_id=' + (row.invoice_id || 'null') + ') id='+row.id, row, true);
  var r = await fetch(REST, {method:'POST', headers:sbH({'Prefer':'return=minimal'}), body:JSON.stringify(row)});
  var b = await r.text();
  dbg('INSERT '+r.status, b ? b.slice(0,80) : 'OK', true);
  if (!r.ok) throw new Error('Save failed '+r.status+': '+b.slice(0,300));
}

async function sbCreateInvoice(invoice) {
  invoice.household_id = HOUSEHOLD_ID;
  dbg('CREATE invoice', invoice, true);
  var r = await fetch(REST_INVOICES, {
    method: 'POST',
    headers: sbH({'Prefer': 'return=representation'}),
    body: JSON.stringify(invoice)
  });
  var data = await r.json();
  if (!r.ok) throw new Error(data.message || data.error?.message || 'Invoice creation failed');
  return data[0];
}
async function sbDelete(id) {
  dbg('DELETE id='+id, {}, true);
  var r = await fetch(REST+'?id=eq.'+encodeURIComponent(id)+'&household_id=eq.'+HOUSEHOLD_ID, {method:'DELETE', headers:sbH({'Prefer':'return=minimal'})});
  var b = await r.text();
  dbg('DELETE '+r.status, b ? b.slice(0,80) : 'OK', true);
  if (!r.ok) throw new Error('Delete failed '+r.status+': '+b.slice(0,300));
}
async function sbUpdate(id, row) {
  dbg('UPDATE id='+id, row, true);
  var r = await fetch(REST+'?id=eq.'+encodeURIComponent(id)+'&household_id=eq.'+HOUSEHOLD_ID, {
    method:'PATCH', headers:sbH({'Prefer':'return=minimal'}), body:JSON.stringify(row)
  });
  if (!r.ok) throw new Error('Update failed '+r.status);
}

async function sbLoadState() {
  if (!HOUSEHOLD_ID) return null;
  dbg('Supabase LOAD STATE', {}, true);
  var r = await fetch(SB_URL + '/rest/v1/app_state?id=eq.' + encodeURIComponent(HOUSEHOLD_ID) + '&select=config', {headers:sbH()});
  if(!r.ok) return null;
  var b = await r.json();
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
  // Use POST with resolution=merge-duplicates for an UPSERT
  var r = await fetch(SB_URL + '/rest/v1/app_state', {
    method:'POST', 
    headers:sbH({
      'Prefer':'resolution=merge-duplicates',
      'Content-Type': 'application/json'
    }), 
    body:JSON.stringify({id: HOUSEHOLD_ID, config: configObj})
  });
  if(!r.ok) {
    var err = await r.text();
    console.error("State save failed", err);
    throw new Error('State sync failed');
  }
}
