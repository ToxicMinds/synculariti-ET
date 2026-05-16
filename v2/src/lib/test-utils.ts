import { SecureContext } from './types/api';

/**
 * Generates a strictly typed SecureContext for unit testing API routes.
 */
export const createMockAuthContext = (tenantId = 'test-tenant'): SecureContext => ({
  params: Promise.resolve({}),
  auth: {
    tenantId,
    user: { 
      id: 'test-user-id',
      email: 'test@example.com',
      app_metadata: { provider: 'test' },
      user_metadata: { name: 'Test User' },
      aud: 'authenticated',
      role: 'authenticated'
    } as any // Cast allowed in core test utility to satisfy complex Supabase User type
  }
});
