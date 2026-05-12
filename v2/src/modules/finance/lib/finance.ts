export interface Transaction {
  id?: string;
  tenant_id?: string;
  amount: number | string;
  category: string;      // The display text (Snapshot/Legacy)
  category_id?: string;  // The stable ID (Modern)
  account_id?: string;   // CoA ID (Synculariti Finance)
  date: string;
  who?: string;
  who_id?: string;
  description?: string;
  recurring_id?: string;
  is_deleted?: boolean;
  transaction_type?: 'DEBIT' | 'CREDIT';
  currency?: string;
  location_id?: string;
  invoice_id?: string;
}

// Alias for backward compatibility if needed, but we should migrate
export type Expense = Transaction;

/**
 * Hybrid Category Resolver
 * Ensures we correctly identify Savings/Adjustments regardless of whether
 * the data is from v1 (text-based) or v2 (ID-based).
 */
function isSavings(e: Transaction): boolean {
  return e.category_id === 'c_savings' || e.category === 'Savings';
}

function isAdjustment(e: Transaction): boolean {
  return e.category_id === 'c_adjustment' || e.category === 'Adjustment';
}

export function calcTotals(transactions: Transaction[]) {
  let spent = 0, saved = 0, adjusted = 0;
  transactions.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (isSavings(e)) saved += amt;
    else if (isAdjustment(e)) adjusted += amt;
    else spent += amt;
  });
  return { spent, saved, adjusted };
}

export function calcForecast(transactions: Transaction[], totalBudget: number, now: Date = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());
  const daysLeft = daysInMonth - currentDay;

  const spent = transactions
    .filter((e) => !isSavings(e) && !isAdjustment(e))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const recurringPaid = transactions
    .filter((e) => e.recurring_id)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const variableSpent = spent - recurringPaid;
  const dailyRate = currentDay > 0 ? variableSpent / currentDay : 0;
  const projected = spent + (dailyRate * daysLeft);
  const diff = projected - totalBudget;

  return { projected, diff, dailyRate };
}

export function calcPerUserSpend(transactions: Transaction[], names: Record<string, string>) {
  const result: Record<string, number> = {};
  Object.keys(names).forEach((k) => {
    result[k] = transactions
      .filter((e) => {
        const byId = e.who_id === k;
        const byName = !e.who_id && e.who === names[k];
        const countable = !isSavings(e) && !isAdjustment(e);
        return (byId || byName) && countable;
      })
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  });
  return result;
}

export function calcNetSavings(totalIncome: number, spent: number) {
  const netSavings = totalIncome - spent;
  const pct = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  return { netSavings, pct };
}

export function calcBudgetStatus(spent: number, totalBudget: number) {
  const remaining = totalBudget - spent;
  const pct = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;
  const status = remaining < 0 ? 'bad' : remaining < totalBudget * 0.2 ? 'warn' : 'good';
  return { remaining, pct, status };
}

export function calcMonthDelta(allTransactions: Transaction[], currentMonth: string, currentSpent: number) {
  const year = parseInt(currentMonth.slice(0, 4), 10);
  const month = parseInt(currentMonth.slice(5, 7), 10);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthNum = month === 1 ? 12 : month - 1;
  const prevMonth = prevYear + '-' + (prevMonthNum < 10 ? '0' + prevMonthNum : '' + prevMonthNum);

  const prevTotal = allTransactions
    .filter((e) => {
      return e.date &&
        e.date.startsWith(prevMonth) &&
        !isSavings(e) && 
        !isAdjustment(e);
    })
    .reduce((s, e) => s + Number(e.amount), 0);

  const delta = currentSpent - prevTotal;
  const deltaStr = (delta > 0 ? '+' : '-') + '€' + Math.abs(delta).toFixed(2);
  const deltaColor = delta > 0 ? 'var(--accent-danger)' : 'var(--accent-success)';
  return { delta, deltaStr, deltaColor };
}

export function calcCategoryTotals(transactions: Transaction[]) {
  return transactions.reduce((acc, e) => {
    // For breakdown, we prefer the category name from the ID lookup if possible
    const key = e.category; 
    acc[key] = (acc[key] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {} as Record<string, number>);
}
