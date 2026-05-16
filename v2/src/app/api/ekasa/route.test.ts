import { POST } from './route';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error-handler';
import { createMockAuthContext } from '@/lib/test-utils';

// Mock apiError to verify behavior
jest.mock('@/lib/api-error-handler', () => ({
  apiError: jest.fn(() => ({ status: 504, json: () => ({ retryable: true }) }))
}));

describe('eKasa API Route Contract', () => {
  it('should return 504 and retryable: true when the government proxy times out', async () => {
    // Mock a request that will trigger a timeout
    const req = new Request('http://localhost/api/ekasa', {
      method: 'POST',
      body: JSON.stringify({ receiptId: 'TIMEOUT_TRIGGER' })
    });

    // Use the new SecureContext pattern
    const mockContext = createMockAuthContext();
    const response = await POST(req, mockContext);
    
    expect(apiError).toHaveBeenCalledWith(
      expect.anything(),
      'eKasa',
      expect.stringContaining('Upstream service timeout'),
      expect.objectContaining({ status: 504, retryable: true, upstreamError: true })
    );
  });
});
