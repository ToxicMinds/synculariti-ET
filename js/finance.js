/* ═══════════════════════════════════════════════
   FINANCE.JS
   Pure financial calculation functions.
   Zero DOM dependencies. Fully unit-testable.
   
   All functions are stateless — they take data
   as arguments and return plain objects.
   No globals read here. No DOM touched here.
═══════════════════════════════════════════════ */

/**
 * Separates expenses into spending, savings, and adjustment buckets.
 * @param {Array} expenses - Array of expense objects for the period
 * @returns {{ spent: number, saved: number, adjusted: number }}
 */
function calcTotals(expenses) {
  let spent = 0, saved = 0, adjusted = 0;
  expenses.forEach(function(e) {
    const amt = Number(e.amount) || 0;
    if (e.category === 'Savings')       saved    += amt;
    else if (e.category === 'Adjustment') adjusted += amt;
    else                                 spent    += amt;
  });
  return { spent, saved, adjusted };
}

/**
 * Calculates the bill-aware spending forecast for the remainder of the month.
 * Uses variable daily spending rate — recurring bills are excluded from the
 * daily rate so they don't inflate the projection.
 *
 * @param {Array}  expenses     - All expenses for the current month
 * @param {number} totalBudget  - Total monthly budget ceiling
 * @param {Date}   now          - Current date (injectable for testing)
 * @returns {{ projected: number, diff: number, dailyRate: number }}
 */
function calcForecast(expenses, totalBudget, now) {
  now = now || new Date();
  var year       = now.getFullYear();
  var month      = now.getMonth();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var currentDay = Math.max(1, now.getDate());
  var daysLeft   = daysInMonth - currentDay;

  var spent = expenses
    .filter(function(e) { return e.category !== 'Savings' && e.category !== 'Adjustment'; })
    .reduce(function(s, e) { return s + (Number(e.amount) || 0); }, 0);

  var recurringPaid = expenses
    .filter(function(e) { return e.recurring_id; })
    .reduce(function(s, e) { return s + (Number(e.amount) || 0); }, 0);

  var variableSpent = spent - recurringPaid;
  var dailyRate     = currentDay > 0 ? variableSpent / currentDay : 0;
  var projected     = spent + (dailyRate * daysLeft);
  var diff          = projected - totalBudget;

  return { projected: projected, diff: diff, dailyRate: dailyRate };
}

/**
 * Calculates per-user spending for the given expense set.
 * Handles both who_id-keyed (new) and who-name-keyed (legacy) entries.
 *
 * @param {Array}  expenses - Array of expense objects
 * @param {Object} names    - Map of { u1: 'Nikhil', u2: 'Zuzana' }
 * @returns {Object}          Map of { u1: 234.50, u2: 120.00 }
 */
function calcPerUserSpend(expenses, names) {
  var result = {};
  Object.keys(names).forEach(function(k) {
    result[k] = expenses
      .filter(function(e) {
        var byId   = e.who_id === k;
        var byName = !e.who_id && e.who === names[k];
        var countable = e.category !== 'Savings' && e.category !== 'Adjustment';
        return (byId || byName) && countable;
      })
      .reduce(function(s, e) { return s + (Number(e.amount) || 0); }, 0);
  });
  return result;
}

/**
 * Calculates net savings (income minus spending).
 * @param {number} totalIncome - Sum of all user incomes
 * @param {number} spent       - Total spent this month
 * @returns {{ netSavings: number, pct: number }}
 */
function calcNetSavings(totalIncome, spent) {
  var netSavings = totalIncome - spent;
  var pct        = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  return { netSavings: netSavings, pct: pct };
}

/**
 * Calculates budget remaining and percentage used.
 * @param {number} spent
 * @param {number} totalBudget
 * @returns {{ remaining: number, pct: number, status: 'good'|'warn'|'bad' }}
 */
function calcBudgetStatus(spent, totalBudget) {
  var remaining = totalBudget - spent;
  var pct       = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;
  var status    = remaining < 0 ? 'bad' : remaining < totalBudget * 0.2 ? 'warn' : 'good';
  return { remaining: remaining, pct: pct, status: status };
}

/**
 * Compares current month spending to previous month.
 * @param {Array}  allExpenses   - Full expense history (all months)
 * @param {string} currentMonth  - YYYY-MM string
 * @param {number} currentSpent  - Already-calculated current month total
 * @returns {{ delta: number, deltaStr: string, deltaColor: string }}
 */
function calcMonthDelta(allExpenses, currentMonth, currentSpent) {
  // Timezone-safe: parse YYYY-MM directly, don't use Date().toISOString() 
  // which shifts by UTC offset and can produce the wrong month.
  var year  = parseInt(currentMonth.slice(0, 4), 10);
  var month = parseInt(currentMonth.slice(5, 7), 10); // 1-based
  var prevYear  = month === 1 ? year - 1 : year;
  var prevMonthNum = month === 1 ? 12 : month - 1;
  var prevMonth = prevYear + '-' + (prevMonthNum < 10 ? '0' + prevMonthNum : '' + prevMonthNum);

  var prevTotal = allExpenses
    .filter(function(e) {
      return e.date &&
        e.date.startsWith(prevMonth) &&
        e.category !== 'Savings' &&
        e.category !== 'Adjustment';
    })
    .reduce(function(s, e) { return s + Number(e.amount); }, 0);

  var delta      = currentSpent - prevTotal;
  var deltaStr   = (delta > 0 ? '+' : '-') + '\u20ac' + Math.abs(delta).toFixed(2);
  var deltaColor = delta > 0 ? 'var(--danger)' : 'var(--success)';
  return { delta: delta, deltaStr: deltaStr, deltaColor: deltaColor };
}

/**
 * Aggregates all expenses into a category-keyed totals object.
 * @param {Array} expenses
 * @returns {Object} { Groceries: 234.50, Transport: 45.00, ... }
 */
function calcCategoryTotals(expenses) {
  return expenses.reduce(function(acc, e) {
    acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {});
}

/* ── CommonJS export for Jest tests ─────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcTotals,
    calcForecast,
    calcPerUserSpend,
    calcNetSavings,
    calcBudgetStatus,
    calcMonthDelta,
    calcCategoryTotals
  };
}
