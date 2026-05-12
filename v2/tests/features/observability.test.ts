import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'observability.feature'));

defineFeature(feature, (test) => {
  test('Tracking Expense Additions', ({ given, when, then }) => {
    given(/^an expense of €(\d+) is added to the system$/, (amount) => {
      // Mock: update_transaction_v1 call
    });

    when('I view the Activity Log', () => {
      // Mock: query activity_log table
    });

    then(/^I should see a record '(.*)' with the description and actor name$/, (action) => {
      // Assert: check log entry fields
    });
  });
});
