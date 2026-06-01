import { isSavings, isAdjustment } from './filters';

describe('Finance Filters', () => {
  describe('isSavings', () => {
    it('correctly identifies savings from category or category_id', () => {
      expect(isSavings({ category: 'Savings' })).toBe(true);
      expect(isSavings({ category: 'Food', category_id: 'c_savings' })).toBe(true);
      expect(isSavings({ category: 'Food', category_id: 'other' })).toBe(false);
      expect(isSavings({})).toBe(false);
    });
  });

  describe('isAdjustment', () => {
    it('correctly identifies adjustments from category or category_id', () => {
      expect(isAdjustment({ category: 'Adjustment' })).toBe(true);
      expect(isAdjustment({ category: 'Food', category_id: 'c_adjustment' })).toBe(true);
      expect(isAdjustment({ category: 'Food', category_id: 'other' })).toBe(false);
      expect(isAdjustment({})).toBe(false);
    });
  });
});
