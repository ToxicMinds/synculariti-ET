import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'finance.feature'));

defineFeature(feature, (test) => {
  test('Automatic Invoice Generation from PO', ({ given, when, then }) => {
    given(/^a 'PROCUREMENT_RECEIVED' event is emitted to the outbox for a PO of (.*) (.*)$/, (amount, currency) => {
      // Mock: DB insert into outbox_events
    });

    when('the Bridge Trigger executes', () => {
      // Mock: consume_procurement_signal() logic
    });

    then(/^a new '(.*)' Invoice should appear in Finance$/, (status) => {
      // Assert: query invoices table
    });

    then('it should match the PO total and currency', () => {
      // Assert: compare fields
    });
  });
});
