// HTTP headers & content types
export const CONTENT_TYPE_JSON = 'application/json';
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_API_KEY = 'X-Api-Key';

// Queue & storage
export const QUEUE_SAVE_RECEIPT = 'SAVE_RECEIPT';

// Financial defaults
export const DEFAULT_CURRENCY = 'EUR';

// Supabase pagination
export const PAGE_SIZE = 1000;

// Scanner pipeline
export const SCANNER_TIMEOUT_MS = 15_000;

// Neo4j batch size (AuraDB free tier memory limit)
export const NEO4J_BATCH_SIZE = 100;

// Insight cache TTL (24 hours in ms)
export const INSIGHT_CACHE_TTL_MS = 86_400_000;

// Environment variable names (single source of truth)
export const ENV_GROQ_API_KEY = 'GROQ_API_KEY';
export const ENV_SUPABASE_URL = 'NEXT_PUBLIC_SUPABASE_URL';
export const ENV_SUPABASE_ANON_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
export const ENV_SUPABASE_SERVICE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';
export const ENV_CRON_SECRET = 'CRON_SECRET';
export const ENV_BASE_URL = 'NEXT_PUBLIC_BASE_URL';
export const ENV_OPENWA_SESSION_ID = 'OPENWA_SESSION_ID';
export const ENV_OPENWA_BASE_URL = 'OPENWA_BASE_URL';
export const ENV_OPENWA_API_KEY = 'OPENWA_API_KEY';
export const ENV_OPENWA_WEBHOOK_SECRET = 'OPENWA_WEBHOOK_SECRET';
export const ENV_SUPABASE_WEBHOOK_SECRET = 'SUPABASE_WEBHOOK_SECRET';
export const ENV_IMS_API_BASE_URL = 'IMS_API_BASE_URL';
export const ENV_IMS_API_KEY = 'IMS_API_KEY';
export const ENV_SYNC_SECRET_KEY = 'SYNC_SECRET_KEY';
export const ENV_PIN_DERIVATION_SECRET = 'PIN_DERIVATION_SECRET';
export const ENV_ENABLE_BANKING_APP_ID = 'ENABLE_BANKING_APP_ID';
export const ENV_ENABLE_BANKING_APP_SECRET = 'ENABLE_BANKING_APP_SECRET';
export const ENV_ENABLE_BANKING_BASE_URL = 'ENABLE_BANKING_BASE_URL';
export const ENV_NEXT_PUBLIC_APP_URL = 'NEXT_PUBLIC_APP_URL';

export const DEFAULT_CATEGORIES = [
  'Food Costs',
  'Beverages',
  'Supplies',
  'Rent & Lease',
  'Utilities',
  'Labor & Wages',
  'Marketing',
  'Maintenance',
  'Professional Services',
  'Taxes & Fees',
  'Other'
];

export const CATEGORY_ICONS: Record<string, string> = {
  'Food Costs': '🍎',
  'Beverages': '🥤',
  'Supplies': '📦',
  'Rent & Lease': '🏢',
  'Utilities': '⚡',
  'Labor & Wages': '👥',
  'Marketing': '📢',
  'Maintenance': '🛠️',
  'Professional Services': '💼',
  'Taxes & Fees': '⚖️',
  'Other': '❓'
};
