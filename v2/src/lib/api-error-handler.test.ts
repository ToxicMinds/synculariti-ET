import { apiError } from './api-error-handler';
import { NextResponse } from 'next/server';
import { ServerLogger } from './logger-server';

// Mock ServerLogger to verify calls
jest.mock('./logger-server', () => ({
  ServerLogger: {
    system: jest.fn()
  }
}));

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, ...init }))
  }
}));

describe('apiError Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a 500 status by default and log the error', () => {
    const error = new Error('Database connection failed');
    const response = apiError(error, 'API', 'General failure');

    expect(ServerLogger.system).toHaveBeenCalledWith(
      'ERROR', 
      'API', 
      'General failure', 
      expect.objectContaining({ error: 'Database connection failed' })
    );
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Database connection failed',
        retryable: false
      }),
      expect.objectContaining({ status: 500 })
    );
  });

  it('should handle Zod validation errors with 400 and retryable: false', () => {
    const zodIssues = [{ path: ['amount'], message: 'Required' }];
    const response = apiError('Invalid input', 'API', 'Validation failed', {
      status: 400,
      details: zodIssues
    });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid input',
        details: zodIssues,
        retryable: false
      }),
      expect.objectContaining({ status: 400 })
    );
  });

  it('should handle upstream proxy errors with 504 and retryable: true', () => {
    const error = new Error('Gateway Timeout');
    const response = apiError(error, 'eKasa', 'Upstream failure', {
      status: 504,
      upstreamError: true,
      retryable: true
    });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gateway Timeout',
        retryable: true
      }),
      expect.objectContaining({ status: 504 })
    );
  });
});
