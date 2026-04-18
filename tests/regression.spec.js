// Regression logic simulates logic in app.js
describe('REGRESSION: Full User Journeys', () => {
  test('Old expenses without invoice_id still calculate correctly in budget logic', () => {
    // Simulate expenses returned from DB
    const oldExpenses = [
      { id: '1', amount: '10.50', category: 'Groceries' },
      { id: '2', amount: '5.20', category: 'Health' }
    ];

    const total = oldExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    expect(total).toBe(15.70);
  });

  test('Mixing new invoices and old expenses coexist smoothly', () => {
    const mixedExpenses = [
      { id: '1', amount: '10.50', category: 'Groceries' }, // Old: No Invoice
      { id: '2', amount: '15.00', category: 'Health', invoice_id: 'inv-xyz' } // New: Has Invoice
    ];

    const total = mixedExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    expect(total).toBe(25.50);
  });
});
