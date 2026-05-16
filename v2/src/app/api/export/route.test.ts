import { GET } from './route';
import { createMockAuthContext } from '@/lib/test-utils';

// Mock server-side utilities
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => Promise.resolve({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  })),
}));

describe('Export API Route Contract', () => {
  it('should support the SecureHandler signature and return CSV', async () => {
    const req = new Request('http://localhost/api/export?format=csv');
    const mockContext = createMockAuthContext('test-tenant');
    
    const response = await (GET as any)(req, mockContext);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Date,Description');
  });
});
