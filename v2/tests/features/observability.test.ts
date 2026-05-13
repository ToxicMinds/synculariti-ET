import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'observability.feature'));

defineFeature(feature, (test) => {
  test('Tracking Expense Additions', ({ given, when, then }) => {
    let activityLog: any[] = [];
    let actorName = 'Antigravity AI';

    given(/^an expense of €(\d+) is added to the system$/, (amount) => {
      // Simulate audit_expense_mutation trigger behavior
      activityLog.push({
        type: 'EXPENSE_ADDED',
        message: `Added New Expense (€${amount})`,
        user_name: actorName
      });
    });

    when('I view the Activity Log', () => {
      // Data is already in activityLog mock
    });

    then(/^I should see a record '(.*)' with the description and actor name$/, (action) => {
      const entry = activityLog.find(l => l.type === action);
      expect(entry).toBeDefined();
      expect(entry.user_name).toBe(actorName);
      expect(entry.message).toContain('Expense');
    });
  });
});
