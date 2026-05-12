import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'logistics.feature'));

defineFeature(feature, (test) => {
  test('Processing a Purchase Order Receipt', ({ given, when, then }) => {
    given(/^a Purchase Order with (\d+) units of "(.*)" is marked as RECEIVED$/, (amount, sku) => {
      // TODO: Implement mock DB call
    });

    when('I check the Inventory Ledger', () => {
      // TODO: Implement mock DB call
    });

    then(/^I should see a new 'RECEIPT' entry for (\d+) units$/, (amount) => {
      // TODO: Assert ledger entry
    });

    then('the total stock should increase accordingly', () => {
      // TODO: Assert stock calculation
    });
  });
});
