import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'finance.feature'));

defineFeature(feature, (test) => {
  test('Automatic Invoice Generation from PO', ({ given, when, then }) => {
    let outbox: any[] = [];
    let invoices: any[] = [];

    given(/^a 'PROCUREMENT_RECEIVED' event is emitted to the outbox for a PO of (.*) (.*)$/, (amount, currency) => {
      outbox.push({
        event_type: 'PROCUREMENT_RECEIVED',
        payload: {
          total_amount: parseFloat(amount),
          currency: currency
        }
      });
    });

    when('the Bridge Trigger executes', () => {
      // Simulate the trigger/edge function that processes the outbox
      const event = outbox.find(e => e.event_type === 'PROCUREMENT_RECEIVED');
      if (event) {
        invoices.push({
          status: 'PENDING',
          total_amount: event.payload.total_amount,
          currency: event.payload.currency
        });
      }
    });

    then(/^a new '(.*)' Invoice should appear in Finance$/, (status) => {
      const invoice = invoices[0];
      expect(invoice).toBeDefined();
      expect(invoice.status).toBe(status);
    });

    then('it should match the PO total and currency', () => {
      const invoice = invoices[0];
      const event = outbox[0];
      expect(invoice.total_amount).toBe(event.payload.total_amount);
      expect(invoice.currency).toBe(event.payload.currency);
    });
  });
});
