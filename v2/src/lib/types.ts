/**
 * CANONICAL TYPES: B2B Graph Ontology Layer
 * 
 * Rules:
 * 1. 0 ': any' usages allowed.
 * 2. Explicit return types only.
 * 3. Pre-calculated unique identifiers to avoid Neo4j full scans.
 */

export interface Ingredient {
  id: string;             // Deterministic UUID/hash from normalized name
  name: string;           // e.g., "Chicken Breast"
  category: string;       // e.g., "Meat & Poultry"
  base_unit: string;      // e.g., "kg"
  perishability_days: number;
}

export interface MerchantSKU {
  id: string;             // Compound hash of: sha256(merchantId + ":" + normalized_raw_name)
  merchant_id: string;
  raw_name: string;       // Exactly as it appears on the receipt
  package_size: number;   // e.g. 1.0 or 10.0
  unit: string;           // e.g. "kg" or "pack"
  currency: string;       // e.g., "EUR"
}

export interface MenuItemRecipeItem {
  ingredient_id: string;
  qty: number;
  unit: string;
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  name: string;           // e.g. "Chicken Schnitzel"
  recipe: MenuItemRecipeItem[];
}

export interface ReceiptItemSyncPayload {
  itemId: string;
  itemName: string;
  itemAmount: number;     // Financial price for the quantity
  itemCategory: string;
  skuId: string;          // Pre-calculated SKU hash
  currency: string;       // Financial currency context
  canonicalIngredientId: string; // Pre-calculated Ingredient ID
  canonicalName: string;
  baseUnit: string;
  perishability: number;
}

export interface TransactionSyncPayload {
  txId: string;
  tenantId: string;
  amount: number;
  date: string;
  vendorName: string;
  merchantId: string;     // Hash/UUID of normalized vendor name
  items: ReceiptItemSyncPayload[];
}

/**
 * Polymorphic User Identity Resolution Context
 */
export interface UserIdentityMap {
  /** Map of unpadded IDs (e.g., 'u1') to human names (e.g., 'Nik') */
  rawNames: Record<string, string>;
  /** Map of padded UUIDs (e.g., '00000000-0000-0000-0000-000000000001') to unpadded IDs */
  uuidToId: Record<string, string>;
}

/**
 * Mathematically Safe B2B Operating Margin Payload
 */
export interface OperatingMarginMetrics {
  /** Total company income across the period */
  income: number;
  /** Total company spent across the period */
  spent: number;
  /** Retained earnings (Income - Spent) */
  retainedEarnings: number;
  /** True margin percentage: (Retained / Income) * 100 */
  marginPercentage: number;
  /** Healthy B2B target margin benchmark (default: 15%) */
  targetBenchmark: number;
  /** True if margin exceeds or equals the benchmark */
  isTargetMet: boolean;
}

/**
 * Time-Bound AI Spending Projection
 */
export interface TimeBoundForecast {
  /** The daily average spend rate */
  dailySpendRate: number;
  /** Projected total spend at end-of-month */
  projectedSpend: number;
  /** Variance against budget limit */
  variance: number;
  /** Warning state based on remaining days and velocity */
  status: 'EXCELLENT' | 'STABLE' | 'WARNING' | 'IN_DANGER' | 'PENDING_CONFIGURATION';
}

