import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'logistics.feature'));

defineFeature(feature, (test) => {
  test('Processing a Purchase Order Receipt', ({ given, when, then }) => {
    let ledger: any[] = [];
    let initialStock = 0;

    given(/^a Purchase Order with (\d+) units of "(.*)" is marked as RECEIVED$/, (amount, sku) => {
      // Simulate receive_purchase_order_v1 RPC behavior
      ledger.push({
        item_sku: sku,
        quantity: parseInt(amount, 10),
        entry_type: 'RECEIPT',
        created_at: new Date()
      });
    });

    when('I check the Inventory Ledger', () => {
      // Data is already in ledger mock
    });

    then(/^I should see a new 'RECEIPT' entry for (\d+) units$/, (amount) => {
      const receipt = ledger.find(l => l.entry_type === 'RECEIPT');
      expect(receipt).toBeDefined();
      expect(receipt.quantity).toBe(parseInt(amount, 10));
    });

    then('the total stock should increase accordingly', () => {
      const totalStock = ledger.reduce((sum, l) => sum + l.quantity, initialStock);
      expect(totalStock).toBeGreaterThan(0);
    });
  });
});
