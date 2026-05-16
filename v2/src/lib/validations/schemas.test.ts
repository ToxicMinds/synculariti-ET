import { CategorySchema, EkasaDateSchema, ReceiptMetaSchema, ResilientReceiptSchema } from './schemas';

describe('Unified Validation Schemas', () => {
  describe('CategorySchema', () => {
    it('should validate an array of non-empty strings', () => {
      const valid = ['Coffee', 'Supplies'];
      expect(CategorySchema.parse(valid)).toEqual(valid);
    });

    it('should trim strings in the array', () => {
      const input = ['  Coffee  ', 'Supplies'];
      expect(CategorySchema.parse(input)).toEqual(['Coffee', 'Supplies']);
    });

    it('should reject empty strings in the array', () => {
      expect(() => CategorySchema.parse(['Coffee', ''])).toThrow();
    });
  });

  describe('EkasaDateSchema', () => {
    it('should accept clean ISO strings', () => {
      const date = '2023-10-27T10:00:00Z';
      expect(EkasaDateSchema.parse(date)).toBe(date);
    });

    it('should normalize Slovak localized date formats', () => {
      const slovakDate = '27.10.2023 10:00:00';
      const result = EkasaDateSchema.parse(slovakDate);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should reject and provide specific error for garbled strings', () => {
      expect(() => EkasaDateSchema.parse('not-a-date')).toThrow('Invalid eKasa date format');
    });
  });

  describe('ReceiptMetaSchema', () => {
    it('should validate a full receipt object', () => {
      const valid = {
        total: 15.50,
        date: '2023-10-27T10:00:00Z',
        merchant: 'Global Supply',
        categories: ['Coffee']
      };
      expect(ReceiptMetaSchema.parse(valid)).toEqual(valid);
    });

    it('should reject negative totals', () => {
      expect(() => ReceiptMetaSchema.parse({
        total: -5,
        date: '2023-10-27T10:00:00Z',
        merchant: 'Store',
        categories: []
      })).toThrow();
    });
  });

  describe('ResilientReceiptSchema (The Washer)', () => {
    it('should provide fallbacks for completely empty metadata', () => {
      const empty = {};
      const result = ResilientReceiptSchema.parse(empty);
      
      expect(result.store).toBe('Slovak Receipt');
      expect(result.date).toBe('0000-00-00');
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('should normalize and truncate dates for cache keys', () => {
      const input = { date: '2023-10-27T10:00:00Z' };
      const result = ResilientReceiptSchema.parse(input);
      expect(result.date).toBe('2023-10-27');
    });

    it('should handle null fields from the parser', () => {
      const input = { store: null, date: null, total: null };
      const result = ResilientReceiptSchema.parse(input);
      
      expect(result.store).toBe('Slovak Receipt');
      expect(result.date).toBe('0000-00-00');
      expect(result.total).toBe(0);
    });
  });
});
