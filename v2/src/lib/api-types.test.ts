import { createMockAuthContext } from './test-utils';
import { SecureHandler, SecureContext } from './types/api';
import { NextResponse } from 'next/server';

describe('Secure API Type Contract', () => {
  it('should allow creating a strictly typed mock context', () => {
    const context = createMockAuthContext('custom-tenant');
    
    expect(context.auth).toBeDefined();
    expect(context.auth?.tenantId).toBe('custom-tenant');
    expect(context.params).toBeInstanceOf(Promise);
  });

  it('should satisfy the SecureHandler interface with a mock context', async () => {
    // Define a dummy handler using the new interface
    const dummyHandler: SecureHandler = async (req, context) => {
      const { tenantId } = context.auth!;
      return NextResponse.json({ tenantId });
    };

    const req = new Request('http://localhost');
    const mockContext = createMockAuthContext('test-id');
    
    const response = await dummyHandler(req, mockContext);
    const data = await response.json();
    
    expect(data.tenantId).toBe('test-id');
  });
});
