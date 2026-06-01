import { calcNetSavings, calcBudgetStatus, calcOperatingMargin } from './margins';

describe('Finance Margins and Status Indicators', () => {
  describe('calcNetSavings', () => {
    it('determines the net savings based on saved vs adjusted values', () => {
      expect(calcNetSavings(200, 50).netSavings).toBe(150);
      expect(calcNetSavings(100, 150).netSavings).toBe(-50);
    });
  });

  describe('calcBudgetStatus', () => {
    it('maps budget consumption to health status categories', () => {
      expect(calcBudgetStatus(40, 100).status).toBe('good');
      expect(calcBudgetStatus(85, 100).status).toBe('warn');
      expect(calcBudgetStatus(115, 100).status).toBe('bad');
    });
  });

  describe('calcOperatingMargin', () => {
    it('evaluates business retained earnings against goal margins', () => {
      const result = calcOperatingMargin(10000, 8500, 15);
      expect(result.income).toBe(10000);
      expect(result.spent).toBe(8500);
      expect(result.retainedEarnings).toBe(1500);
      expect(result.marginPercentage).toBe(15);
      expect(result.isTargetMet).toBe(true);
    });
  });
});
