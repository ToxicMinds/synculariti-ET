import { TimeBoundForecast } from '../../../lib/types';
import { safeAmount } from '../../../lib/utils';
import { isSavings, isAdjustment } from './filters';
import { Transaction } from './types';

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
    .reduce((s, e) => s + (safeAmount(e.amount)), 0);

  const recurringPaid = transactions
    .filter((e) => e.recurring_id)
    .reduce((s, e) => s + (safeAmount(e.amount)), 0);

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
