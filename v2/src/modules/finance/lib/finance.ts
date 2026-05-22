import { OperatingMarginMetrics, TimeBoundForecast } from '../../../lib/types';

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
  created_at?: string;
  updated_at?: string;
}

// Alias for backward compatibility
export type Expense = Transaction;


/**
 * Hybrid Category Resolver
 * Ensures we correctly identify Savings/Adjustments regardless of whether
 * the data is from v1 (text-based) or v2 (ID-based).
 */
export function isSavings(e: Transaction): boolean {
  return e.category_id === 'c_savings' || e.category === 'Savings';
}

export function isAdjustment(e: Transaction): boolean {
  return e.category_id === 'c_adjustment' || e.category === 'Adjustment';
}

/**
 * Calculates total spent, saved, and adjusted from a list of transactions.
 */
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

/**
 * Projects end-of-month spend based on current burn rate.
 */
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

  const variableSpent = Math.max(0, spent - recurringPaid);
  const dailyRate = currentDay > 0 ? variableSpent / currentDay : 0;
  const projected = spent + (dailyRate * daysLeft);
  const diff = projected - totalBudget;

  return { projected, diff, dailyRate };
}

/**
 * Efficiently attributes spend to specific users.
 * Performance: O(N) - Single pass over transactions.
 */
export function calcPerUserSpend(transactions: Transaction[], userNames: Record<string, number | string>) {
  const result: Record<string, number> = {};
  
  // 1. Create Reverse Lookup Map (O(M)) and Polymorphic UUID Lookup Map (O(M)) to avoid nested loop in attribution
  const nameToId: Record<string, string> = {};
  const uuidToId: Record<string, string> = {};
  
  Object.keys(userNames).forEach(id => {
    result[id] = 0;
    nameToId[String(userNames[id])] = id;
    
    // Map normalized UUID of this config id to the config id itself (e.g. '0000...0001' -> 'u1')
    const normId = normalizeUserId(id);
    uuidToId[normId] = id;
  });

  // 2. Attribution Pass (O(N))
  transactions.forEach(exp => {
    if (isSavings(exp) || isAdjustment(exp)) return;

    let targetUserId: string | undefined;

    // Primary: Use who_id (polymorphic uuid mapping)
    if (exp.who_id) {
      const normWhoId = normalizeUserId(exp.who_id);
      targetUserId = uuidToId[normWhoId] || exp.who_id;
    } 
    // Fallback: O(1) lookup in our reverse name map
    else if (exp.who) {
      targetUserId = nameToId[exp.who];
    }

    if (targetUserId && result.hasOwnProperty(targetUserId)) {
      result[targetUserId] += (Number(exp.amount) || 0);
    }
  });

  return result;
}

/**
 * Calculates net savings and savings percentage.
 */
export function calcNetSavings(totalIncome: number, spent: number) {
  const netSavings = totalIncome - spent;
  const pct = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  return { netSavings, pct };
}

/**
 * Evaluates budget health and returns status flags.
 */
export function calcBudgetStatus(spent: number, totalBudget: number) {
  const remaining = totalBudget - spent;
  const pct = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;
  const status = remaining < 0 ? 'bad' : remaining < totalBudget * 0.2 ? 'warn' : 'good';
  return { remaining, pct, status };
}

/**
 * Calculates the difference between current and previous month spend.
 * Currency-agnostic formatting.
 */
export function calcMonthDelta(
  allTransactions: Transaction[], 
  currentMonth: string, 
  currentSpent: number,
  currencySymbol: string = '€'
) {
  const year = parseInt(currentMonth.slice(0, 4), 10);
  const month = parseInt(currentMonth.slice(5, 7), 10);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthNum = month === 1 ? 12 : month - 1;
  const prevMonth = prevYear + '-' + (prevMonthNum < 10 ? '0' + prevMonthNum : '' + prevMonthNum);

  const prevTotal = allTransactions.reduce((sum, e) => {
    if (e.date && e.date.startsWith(prevMonth) && !isSavings(e) && !isAdjustment(e)) {
      return sum + (Number(e.amount) || 0);
    }
    return sum;
  }, 0);

  const delta = currentSpent - prevTotal;
  const deltaStr = (delta >= 0 ? '+' : '-') + currencySymbol + Math.abs(delta).toFixed(2);
  const deltaColor = delta > 0 ? 'var(--accent-danger)' : 'var(--accent-success)';
  return { delta, deltaStr, deltaColor };
}

/**
 * Aggregates spend by category name.
 */
export function calcCategoryTotals(transactions: Transaction[]) {
  return transactions.reduce((acc, e) => {
    if (isSavings(e) || isAdjustment(e)) return acc;
    const key = e.category || 'Uncategorized'; 
    acc[key] = (acc[key] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Normalizes user IDs, casting light mock IDs (like 'u2') to mock UUIDs.
 * Ensures polymorphic matching between config keys and database UUIDs.
 */
export function normalizeUserId(id: string): string {
  if (!id) {
    return '00000000-0000-0000-0000-000000000000';
  }

  // 1. Standard UUID format matches pass through directly
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id.toLowerCase();
  }

  // 2. Light Mock ID match (^u[0-9]+)
  const mockMatch = /^u([0-9]+)$/.exec(id);
  if (mockMatch) {
    const digits = mockMatch[1];
    if (digits.length > 12) {
      return '00000000-0000-0000-0000-000000000000'; // Overflow guard
    }
    // Pad to 12 hex characters
    const padded = digits.padStart(12, '0');
    return `00000000-0000-0000-0000-${padded}`;
  }

  // Default fallback
  return '00000000-0000-0000-0000-000000000000';
}

/**
 * Calculates a mathematically sound B2B Operating Margin against benchmarks.
 */
export function calcOperatingMargin(income: number, spent: number, benchmark: number = 15): OperatingMarginMetrics {
  const retainedEarnings = income - spent;
  const marginPercentage = income > 0 ? (retainedEarnings / income) * 100 : 0;
  const isTargetMet = marginPercentage >= benchmark;

  return {
    income,
    spent,
    retainedEarnings,
    marginPercentage,
    targetBenchmark: benchmark,
    isTargetMet
  };
}

/**
 * Calculates a time-aware velocity projection forecast with zero budget safety constraints.
 */
export function calcTimeBoundForecast(
  transactions: Transaction[],
  totalBudget: number,
  now: Date = new Date()
): TimeBoundForecast {
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

  const variableSpent = Math.max(0, spent - recurringPaid);
  const dailySpendRate = currentDay > 0 ? variableSpent / currentDay : 0;
  const projectedSpend = spent + (dailySpendRate * daysLeft);
  const variance = projectedSpend - totalBudget;

  if (totalBudget <= 0) {
    return {
      dailySpendRate,
      projectedSpend,
      variance: 0,
      status: 'PENDING_CONFIGURATION'
    };
  }

  let status: 'EXCELLENT' | 'STABLE' | 'WARNING' | 'IN_DANGER' | 'PENDING_CONFIGURATION';
  if (projectedSpend > totalBudget) {
    status = 'IN_DANGER';
  } else if (projectedSpend > totalBudget * 0.8) {
    status = 'WARNING';
  } else if (projectedSpend > totalBudget * 0.5) {
    status = 'STABLE';
  } else {
    status = 'EXCELLENT';
  }

  return {
    dailySpendRate,
    projectedSpend,
    variance,
    status
  };
}


