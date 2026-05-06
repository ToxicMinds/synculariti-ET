import { supabase } from './supabase';

/**
 * Executes a fetch request with exponential backoff retries.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && response.status >= 500) {
      console.warn(`Fetch failed (${response.status}), retrying in ${backoff}ms...`);
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch threw error, retrying in ${backoff}ms...`, error);
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

/**
 * Logs technical metrics (like eKasa performance) to Supabase.
 */
export async function systemLog(action: string, errorData: any, tenantId?: string) {
  // Redundant - use Logger.system from @/lib/logger instead.
}
