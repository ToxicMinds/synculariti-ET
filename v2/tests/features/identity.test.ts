import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'identity.feature'));

defineFeature(feature, (test) => {
  test('Auto-linking Staff to Tenant', ({ given, when, then }) => {
    given(/^an admin has added "(.*)" to the "(.*)" staff list$/, (email, tenant) => {
      // Mock: upsert_app_user_v1 logic
    });

    when(/^the user logs in with "(.*)"$/, (email) => {
      // Mock: session resolution
    });

    then('the Identity Gate should skip the Access Code screen', () => {
      // Mock: router redirect
    });

    then(/^they should be auto-linked to "(.*)"$/, (tenant) => {
      // Assert: tenantId in session
    });
  });
});
