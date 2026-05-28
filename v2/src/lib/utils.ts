import { Logger } from './logger';

export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Safely coerces a value to a number with a fallback for null/undefined/NaN.
 */
export function safeAmount(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Executes a fetch request with exponential backoff retries.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && response.status >= 500) {
      Logger.system('WARN', 'Utils', `Fetch failed (${response.status}), retrying in ${backoff}ms...`, { url });
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error: unknown) {
    if (retries > 0) {
      Logger.system('WARN', 'Utils', `Fetch threw error, retrying in ${backoff}ms...`, { url, error: getErrorMessage(error) });
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

/**
 * Strips markdown code block fences from AI JSON responses.
 */
export function cleanMarkdownJsonBlock(input: string): string {
  let content = input.trim();
  if (content.startsWith('```json')) content = content.slice(7);
  if (content.startsWith('```')) content = content.slice(3);
  if (content.endsWith('```')) content = content.slice(0, -3);
  return content.trim();
}

/**
 * Formats a number as a locale-aware currency string.
 */
export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency }).format(amount);
}
