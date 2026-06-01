import { formatCurrency, safeAmount } from '../../../lib/utils';
import { isSavings, isAdjustment } from './filters';
import { Transaction } from './types';

/**
 * Calculates total spent, saved, and adjusted from a list of transactions.
 */
export function calcTotals(transactions: Transaction[]) {
  let spent = 0, saved = 0, adjusted = 0;
  transactions.forEach((e) => {
    const amt = safeAmount(e.amount);
    if (isSavings(e)) saved += amt;
    else if (isAdjustment(e)) adjusted += amt;
    else spent += amt;
  });
  return { spent, saved, adjusted };
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
      result[targetUserId] += safeAmount(exp.amount);
    }
  });

  return result;
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
      return sum + (safeAmount(e.amount));
    }
    return sum;
  }, 0);

  const delta = currentSpent - prevTotal;
  const deltaStr = (delta >= 0 ? '+' : '-') + formatCurrency(Math.abs(delta));
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
    acc[key] = (acc[key] || 0) + (safeAmount(e.amount));
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
