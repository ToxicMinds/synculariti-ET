const fs = require('fs');

const SB_URL = 'https://yleswxfenmuzmxeekxkg.supabase.co';
const SB_KEY = 'sb_publishable_qJGOiVaWDrd9Fq6EUJvGUg_a8VrWCUx';
const REST = SB_URL + '/rest/v1/expenses';
const REST_STATE = SB_URL + '/rest/v1/app_state?id=eq.global&select=config';

function sbH() {
  return {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

describe('DATA PRESERVATION: Pre-Tests', () => {
  let expenseCountBefore = 0;
  let allExpenses = [];

  beforeAll(async () => {
    // Record current state mapped directly from DB
    const res = await fetch(REST + '?select=*&order=date.desc,created_at.desc', { headers: sbH() });
    allExpenses = await res.json();
    expenseCountBefore = allExpenses.length;
  });

  test('All existing expenses still queryable', () => {
    expect(allExpenses.length).toBeGreaterThan(0);
  });

  test('Existing expenses have correct structure', () => {
    allExpenses.forEach(e => {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('who');
      expect(e).toHaveProperty('date');
      expect(e).toHaveProperty('amount');
      expect(e).toHaveProperty('category');
    });
  });

  test('app_state config still intact', async () => {
    const res = await fetch(REST_STATE, { headers: sbH() });
    const data = await res.json();
    const config = data[0].config;
    expect(config.names).toBeDefined();
    expect(config.budgets).toBeDefined();
    expect(config.income).toBeDefined();
  });

  test('Budget calculations match expectations', () => {
    const totals = allExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    expect(totals).toBeGreaterThan(0);
  });
});
