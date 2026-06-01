import { OperatingMarginMetrics } from '../../../lib/types';

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
