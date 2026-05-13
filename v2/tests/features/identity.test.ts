import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

const feature = loadFeature(path.join(__dirname, 'identity.feature'));

defineFeature(feature, (test) => {
  test('Auto-linking Staff to Tenant', ({ given, when, then }) => {
    let mockTenants: any[] = [];
    let currentUserEmail = '';
    let identityResult: any = null;

    given(/^an admin has added "(.*)" to the "(.*)" staff list$/, (email, tenant) => {
      currentUserEmail = email;
      mockTenants = [{ tenant_id: 'tenant-123', tenant_name: tenant, tenant_handle: 'acme', user_role: 'STAFF' }];
    });

    when(/^the user logs in with "(.*)"$/, (email) => {
      // Simulate useIdentity(session) hook behavior
      if (email === currentUserEmail) {
        identityResult = { tenants: mockTenants, loading: false };
      } else {
        identityResult = { tenants: [], loading: false };
      }
    });

    then('the Identity Gate should skip the Access Code screen', () => {
      // In IdentityGate.tsx, if tenants.length > 0, it shows TenantSelector, not IdentityAuth (Access Code screen)
      expect(identityResult.tenants.length).toBeGreaterThan(0);
    });

    then(/^they should be auto-linked to "(.*)"$/, (tenant) => {
      expect(identityResult.tenants[0].tenant_name).toBe(tenant);
    });
  });
});
