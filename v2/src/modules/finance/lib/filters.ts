import { Transaction } from './types';

/**
 * Hybrid Category Resolver
 * Ensures we correctly identify Savings/Adjustments regardless of whether
 * the data is from v1 (text-based) or v2 (ID-based).
 */
export function isSavings(e: Partial<Transaction>): boolean {
  return e.category_id === 'c_savings' || e.category === 'Savings';
}

export function isAdjustment(e: Partial<Transaction>): boolean {
  return e.category_id === 'c_adjustment' || e.category === 'Adjustment';
}
