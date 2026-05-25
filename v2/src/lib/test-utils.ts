import type { User } from '@supabase/supabase-js';
import { SecureContext } from './types/api';

function createMockUser(): User {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: { provider: 'test' },
    user_metadata: { name: 'Test User' },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2025-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2025-01-01T00:00:00.000Z',
    email_confirmed_at: '2025-01-01T00:00:00.000Z',
    phone_confirmed_at: undefined,
    last_sign_in_at: '2025-01-01T00:00:00.000Z',
    factors: undefined,
    identities: [],
    updated_at: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * Generates a strictly typed SecureContext for unit testing API routes.
 */
export const createMockAuthContext = (tenantId = 'test-tenant'): SecureContext => ({
  params: Promise.resolve({}),
  auth: {
    tenantId,
    user: createMockUser()
  }
});
