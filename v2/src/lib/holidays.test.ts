import { enrichDate, DateEnrichment, isHoliday, getHolidayName, daysUntilNextHoliday, isBeforeHoliday } from './holidays';

describe('Slovak Holiday Calendar', () => {
  describe('isHoliday', () => {
    it('returns true for known Slovak holidays', () => {
      expect(isHoliday('2025-01-01')).toBe(true);
      expect(isHoliday('2025-12-24')).toBe(true);
      expect(isHoliday('2025-12-25')).toBe(true);
      expect(isHoliday('2025-05-01')).toBe(true);
      expect(isHoliday('2026-01-01')).toBe(true);
    });

    it('returns false for regular days', () => {
      expect(isHoliday('2025-06-15')).toBe(false);
      expect(isHoliday('2025-03-10')).toBe(false);
    });
  });

  describe('getHolidayName', () => {
    it('returns the Slovak name for a known holiday', () => {
      expect(getHolidayName('2025-12-24')).toBe('Štedrý deň');
      expect(getHolidayName('2025-01-01')).toBe('Nový rok');
    });

    it('returns null for non-holiday', () => {
      expect(getHolidayName('2025-06-15')).toBeNull();
    });
  });

  describe('daysUntilNextHoliday', () => {
    it('returns 0 when the date itself is a holiday', () => {
      expect(daysUntilNextHoliday('2025-01-01')).toBe(0);
    });

    it('returns positive days until the next holiday', () => {
      const days = daysUntilNextHoliday('2025-01-02');
      expect(days).toBeGreaterThan(0);
      expect(days).toBe(4);
    });

    it('returns 365 if no future holiday found', () => {
      const days = daysUntilNextHoliday('2027-01-01');
      expect(days).toBe(365);
    });
  });

  describe('isBeforeHoliday', () => {
    it('returns true within 3 days before a holiday', () => {
      expect(isBeforeHoliday('2025-12-21')).toBe(true);
      expect(isBeforeHoliday('2025-12-22')).toBe(true);
      expect(isBeforeHoliday('2025-12-23')).toBe(true);
    });

    it('returns false more than 3 days before a holiday', () => {
      expect(isBeforeHoliday('2025-12-20')).toBe(false);
    });

    it('returns false for a regular non-holiday-proximate day', () => {
      expect(isBeforeHoliday('2025-06-15')).toBe(false);
    });
  });

  describe('enrichDate', () => {
    it('enriches a regular weekday correctly', () => {
      const result: DateEnrichment = enrichDate('2025-06-16');
      expect(result.dayOfWeek).toBe(1);
      expect(result.isWeekend).toBe(false);
      expect(result.month).toBe(6);
      expect(result.quarter).toBe(2);
      expect(result.isHoliday).toBe(false);
      expect(result.holidayName).toBeNull();
      expect(result.isBeforeHoliday).toBe(false);
    });

    it('marks Saturday as weekend', () => {
      const result: DateEnrichment = enrichDate('2025-06-14');
      expect(result.dayOfWeek).toBe(6);
      expect(result.isWeekend).toBe(true);
    });

    it('marks Sunday as weekend', () => {
      const result: DateEnrichment = enrichDate('2025-06-15');
      expect(result.dayOfWeek).toBe(0);
      expect(result.isWeekend).toBe(true);
    });

    it('enriches a known Slovak holiday', () => {
      const result: DateEnrichment = enrichDate('2025-05-01');
      expect(result.isHoliday).toBe(true);
      expect(result.holidayName).toBe('Sviatok práce');
      expect(result.daysToNextHoliday).toBe(0);
    });

    it('correctly computes daysToNextHoliday', () => {
      const result: DateEnrichment = enrichDate('2025-04-28');
      expect(result.isBeforeHoliday).toBe(true);
      expect(result.daysToNextHoliday).toBe(3);
    });

    it('correctly identifies Q1 months', () => {
      expect(enrichDate('2025-01-15').quarter).toBe(1);
      expect(enrichDate('2025-02-15').quarter).toBe(1);
      expect(enrichDate('2025-03-15').quarter).toBe(1);
    });

    it('correctly identifies Q4 months', () => {
      expect(enrichDate('2025-10-15').quarter).toBe(4);
      expect(enrichDate('2025-11-15').quarter).toBe(4);
      expect(enrichDate('2025-12-15').quarter).toBe(4);
    });

    it('handles 2026 dates correctly', () => {
      const result: DateEnrichment = enrichDate('2026-12-25');
      expect(result.isHoliday).toBe(true);
      expect(result.holidayName).toBe('1. sviatok vianočný');
    });
  });
});
