import { parseEkasaMetadata, cleanStoreName } from './ekasa-parser';

describe('eKasa Parser', () => {
  describe('cleanStoreName', () => {
    it('removes legal entity suffixes', () => {
      expect(cleanStoreName('LIDL Slovenská republika s.r.o.')).toBe('LIDL');
      expect(cleanStoreName('BILLA, s.r.o.')).toBe('BILLA');
      expect(cleanStoreName('Kaufland a.s.')).toBe('Kaufland');
    });

    it('returns Slovak Receipt if missing', () => {
      expect(cleanStoreName(null)).toBe('Slovak Receipt');
    });
  });

  describe('parseEkasaMetadata', () => {
    const mockFullReceipt = {
      receipt: {
        organization: {
          name: 'Tesco s.r.o.',
          dic: '2020123456',
          ico: '12345678'
        },
        receiptNumber: 'V-12345',
        issueDate: '2024-05-10',
        issueTime: '14:35',
        taxBaseBasic: 10.0,
        vatAmountBasic: 2.0,
        taxBaseReduced: 5.0,
        vatAmountReduced: 0.5,
        totalPrice: 17.5,
        items: [
          { name: 'Milk', itemTotalPrice: 1.5 }
        ]
      }
    };

    it('extracts all deterministic metadata correctly', () => {
      const result = parseEkasaMetadata(mockFullReceipt);
      
      expect(result.store).toBe('Tesco');
      expect(result.dic).toBe('2020123456');
      expect(result.ico).toBe('12345678');
      expect(result.receiptNumber).toBe('V-12345');
      expect(result.date).toBe('2024-05-10');
      expect(result.transactedAt).toBe('2024-05-10T14:35:00Z');
      expect(result.total).toBe(17.5);
    });

    it('extracts VAT detail correctly', () => {
      const result = parseEkasaMetadata(mockFullReceipt);
      expect(result.vatDetail.basic.base).toBe(10.0);
      expect(result.vatDetail.basic.amount).toBe(2.0);
      expect(result.vatDetail.reduced.base).toBe(5.0);
      expect(result.vatDetail.reduced.amount).toBe(0.5);
    });

    it('handles alternative date formats (Slovak format)', () => {
      const payload = {
        receipt: { issueDate: '10.05.2024', issueTime: '08:15' }
      };
      const result = parseEkasaMetadata(payload);
      expect(result.date).toBe('2024-05-10');
      expect(result.transactedAt).toBe('2024-05-10T08:15:00Z');
    });

    it('handles ISO timestamps natively', () => {
      const payload = {
        receipt: { issueDate: '2024-05-10T12:00:00Z' } // Missing issueTime
      };
      const result = parseEkasaMetadata(payload);
      expect(result.date).toBe('2024-05-10');
      expect(result.transactedAt).toBe('2024-05-10T12:00:00Z');
    });

    it('handles missing fields gracefully without crashing', () => {
      const result = parseEkasaMetadata({});
      expect(result.store).toBe('Slovak Receipt');
      expect(result.ico).toBeNull();
      expect(result.date).toBeNull();
      expect(result.transactedAt).toBeNull();
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
      expect(result.vatDetail.basic.base).toBe(0);
    });

    it('computes total from items if totalPrice is missing', () => {
      const payload = {
        receipt: {
          items: [
            { name: 'Apple', itemTotalPrice: 1.2 },
            { name: 'Banana', itemTotalPrice: 2.3 }
          ]
        }
      };
      const result = parseEkasaMetadata(payload);
      expect(result.total).toBeCloseTo(3.5);
      expect(result.items.length).toBe(2);
    });
  });
});
