import { POST } from './route';
import { createMockAuthContext } from '@/lib/test-utils';

// Mock ServerLogger to avoid console spam and focus on contract
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: {
    system: jest.fn(),
    user: jest.fn(),
  },
}));

describe('EnableBanking API Route Contract', () => {
  beforeAll(() => {
    process.env.ENABLE_BANKING_APP_ID = 'test-id';
    process.env.ENABLE_BANKING_APP_SECRET = 'test-secret';
  });

  it('should support the SecureHandler signature and handle validation', async () => {
    const req = new Request('http://localhost/api/enablebanking', {
      method: 'POST',
      body: JSON.stringify({ action: 'institutions', country: 'SK' })
    });
    const mockContext = createMockAuthContext('test-tenant');
    
    // Mock global fetch
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    ) as jest.Mock;

    const response = await (POST as any)(req, mockContext);
    expect(response.status).toBe(200);
  });
});
