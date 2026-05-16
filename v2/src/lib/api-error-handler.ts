import { NextResponse } from 'next/server';
import { ServerLogger } from './logger-server';
import { ZodIssue } from 'zod';

export type LogComponent = 'AI' | 'Auth' | 'Sync' | 'Export' | 'eKasa' | 'Banking' | 'API';

export interface ApiErrorOptions {
  status?: number;
  details?: ZodIssue[] | unknown;
  upstreamError?: boolean;
  retryable?: boolean;
}

/**
 * Standardized API Error Handler
 * Ensures consistent JSON responses and high-fidelity server logging.
 */
export function apiError(
  error: unknown,
  component: LogComponent,
  description: string,
  options: ApiErrorOptions = {}
): NextResponse {
  const status = options.status || 500;
  const msg = error instanceof Error ? error.message : String(error);
  
  // Logic for retryable hint: 
  // 1. Explicitly passed in options
  // 2. Or is an upstream proxy error (502, 503, 504)
  const isRetryable = options.retryable ?? (status >= 502 && status <= 504);

  // High-fidelity telemetry
  ServerLogger.system('ERROR', component, description, {
    error: msg,
    status,
    upstream: !!options.upstreamError,
    details: options.details
  });

  return NextResponse.json(
    {
      error: msg,
      details: options.details,
      retryable: isRetryable,
      code: options.upstreamError ? 'UPSTREAM_FAILURE' : 'INTERNAL_ERROR'
    },
    { status }
  );
}
