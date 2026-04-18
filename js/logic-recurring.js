/* ═══════════════════════════════════════════════
   RECURRING EXPENSES LOGIC
═══════════════════════════════════════════════ */

let recurring = [];

async function sbSelectRecurring() {
  if (!HOUSEHOLD_ID) return [];
  var r = await fetch(SB_URL + '/rest/v1/recurring_expenses?household_id=eq.'+HOUSEHOLD_ID+'&select=*', {headers:sbH()});
  if (!r.ok) return [];
  recurring = await r.json();
  return recurring;
}

async function sbSaveRecurring(row) {
  row.household_id = HOUSEHOLD_ID;
  var r = await fetch(SB_URL + '/rest/v1/recurring_expenses', {
    method: 'POST',
    headers: sbH({'Prefer': 'return=representation'}),
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('Save failed');
  return await r.json();
}

async function sbDeleteRecurring(id) {
  var r = await fetch(SB_URL + '/rest/v1/recurring_expenses?id=eq.'+id, {
    method: 'DELETE',
    headers: sbH()
  });
  return r.ok;
}

/**
 * Calculates projected recurring costs that haven't happened yet this month
 */
function getProjectedRecurring(currentExpenses) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  let projected = 0;
  
  recurring.forEach(rec => {
    // Check if this recurring item already exists in currentExpenses for this month
    const exists = currentExpenses.find(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && 
               d.getFullYear() === currentYear &&
               e.description === rec.name && 
               Number(e.amount) === Number(rec.amount);
    });
    
    if (!exists) {
        projected += Number(rec.amount);
    }
  });
  
  return projected;
}
