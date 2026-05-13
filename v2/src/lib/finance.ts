// Synculariti-ET: Finance Calculation Core
// Purpose: Provide deterministic, type-safe financial calculations for both V1 legacy and V2 B2B data.

export interface Expense {
  id?: string;
  amount: number;
  category: string;
  category_id?: string;
  date: string;
  who?: string;
  who_id?: string;
  description?: string;
}

/**
 * Calculates total savings and spend from a list of expenses.
 * Handles both string-based categories (v1) and ID-based categories (v2).
 */
export function calcTotals(expenses: Expense[]) {
  return expenses.reduce(
    (acc, exp) => {
      const isSavings = exp.category === 'Savings' || exp.category_id === 'c_savings';
      if (isSavings) {
        acc.saved += exp.amount;
      } else {
        acc.spent += exp.amount;
      }
      return acc;
    },
    { saved: 0, spent: 0 }
  );
}

/**
 * Attributions spend to specific users using who_id (preferred) or who (fallback).
 */
export function calcPerUserSpend(expenses: Expense[], userNames: Record<string, string>) {
  const result: Record<string, number> = {};
  
  // Initialize result map with user IDs
  Object.keys(userNames).forEach(userId => {
    result[userId] = 0;
  });

  expenses.forEach(exp => {
    let targetUserId: string | undefined;

    // 1. Primary: Use who_id if present
    if (exp.who_id) {
      targetUserId = exp.who_id;
    } 
    // 2. Fallback: Reverse lookup from userNames mapping
    else if (exp.who) {
      targetUserId = Object.keys(userNames).find(id => userNames[id] === exp.who);
    }

    if (targetUserId && result.hasOwnProperty(targetUserId)) {
      result[targetUserId] += exp.amount;
    }
  });

  return result;
}
