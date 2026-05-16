import { NextResponse } from 'next/server';
import { User } from '@supabase/supabase-js';

/**
 * Verified Auth Context injected by middleware.
 */
export interface AuthContext {
  tenantId: string;
  user: User;
}

/**
 * Strictly compliant Next.js Context extended with Auth data for Synculariti-ET.
 */
export interface SecureContext {
  params: Promise<Record<string, string>>;
  auth?: AuthContext; // Populated by withAuth middleware or Test Mock
}

/**
 * Standardized Handler Type for all Synculariti-ET API routes.
 */
export type SecureHandler = (
  req: Request,
  context: SecureContext
) => Promise<NextResponse>;
