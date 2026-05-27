// Slovak B2B Ingredient Mapping Dictionary
import { enrichDate } from './holidays';
import type { TransactionSyncPayload, ReceiptItemSyncPayload } from './types';

export function buildMerchantId(name: string): string {
  return `merchant-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

interface TransactionRow {
  id: string;
  amount: number | string;
  date: string;
  category?: string | null;
  description?: string | null;
  who?: string | null;
  currency?: string | null;
  tenant_id: string;
}

interface ReceiptItemRow {
  id: string;
  name: string;
  amount: number | string;
  category?: string | null;
  currency?: string | null;
}

function inferCategory(items: ReceiptItemRow[]): string | undefined {
  if (items.length === 0) return undefined;
  const counts: Record<string, number> = {};
  for (const item of items) {
    const cat = item.category || 'COGS - Dry Goods';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function buildSyncPayload(
  txRow: TransactionRow,
  items: ReceiptItemRow[],
  options?: { inferCategory?: boolean }
): TransactionSyncPayload {
  const vendorName = (txRow.description || txRow.who || 'Unknown Merchant').trim();
  const merchantId = buildMerchantId(vendorName);
  const currency = txRow.currency || 'EUR';

  const mappedItems: ReceiptItemSyncPayload[] = items.map(item => {
    const mapped = mapToOntologyItem(item.name, merchantId, item.currency || currency);
    const itemAmount = Number(item.amount);
    return {
      ...mapped,
      itemId: item.id,
      itemAmount,
      itemQuantity: 1,
      itemUnitPrice: itemAmount,
      itemCategory: item.category || 'COGS - Dry Goods',
    };
  });

  let category = txRow.category || undefined;
  if (!category && options?.inferCategory) {
    category = inferCategory(items);
  }

  const enrichment = enrichDate(txRow.date);

  return {
    txId: txRow.id,
    tenantId: txRow.tenant_id,
    amount: Number(txRow.amount),
    date: txRow.date,
    category,
    ...enrichment,
    vendorName,
    merchantId,
    items: mappedItems,
  };
}

export function mapToOntologyItem(name: string, merchantId: string, itemCurrency: string) {
  const cleanName = name.trim();
  const lowerName = cleanName.toLowerCase();
  
  let canonicalName = cleanName;
  let baseUnit = 'pcs';
  let perishability = 30;

  if (lowerName.includes('mliek') || lowerName.includes('milk')) {
    canonicalName = 'Milk';
    baseUnit = 'L';
    perishability = 7;
  } else if (lowerName.includes('masl') || lowerName.includes('butter')) {
    canonicalName = 'Butter';
    baseUnit = 'kg';
    perishability = 21;
  } else if (lowerName.includes('kur') || lowerName.includes('chick') || lowerName.includes('hydin')) {
    canonicalName = 'Chicken Breast';
    baseUnit = 'kg';
    perishability = 5;
  } else if (lowerName.includes('múk') || lowerName.includes('muka') || lowerName.includes('flour')) {
    canonicalName = 'Flour';
    baseUnit = 'kg';
    perishability = 180;
  } else if (lowerName.includes('kofol') || lowerName.includes('cola') || lowerName.includes('pepsi')) {
    canonicalName = 'Cola Beverage';
    baseUnit = 'L';
    perishability = 180;
  } else if (lowerName.includes('piv') || lowerName.includes('beer') || lowerName.includes('bažant') || lowerName.includes('keg')) {
    canonicalName = 'Draft Beer';
    baseUnit = 'L';
    perishability = 60;
  } else if (lowerName.includes('zemiak') || lowerName.includes('potat')) {
    canonicalName = 'Potatoes';
    baseUnit = 'kg';
    perishability = 30;
  }

  if (baseUnit === 'pcs') {
    if (lowerName.includes(' kg') || lowerName.includes('kg ') || lowerName.endsWith('kg')) {
      baseUnit = 'kg';
    } else if (lowerName.includes(' l ') || lowerName.includes('l ') || lowerName.endsWith('l')) {
      baseUnit = 'L';
    } else if (lowerName.includes(' g ') || lowerName.includes('g ') || lowerName.endsWith('g')) {
      baseUnit = 'g';
    }
  }

  const itemId = `item-${Math.random().toString(36).substring(2, 9)}`;
  const skuId = `sku-${merchantId}-${lowerName.replace(/[^a-z0-9]/g, '-')}`;
  const canonicalIngredientId = `ing-${canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  return {
    itemId,
    itemName: cleanName,
    skuId,
    currency: itemCurrency,
    canonicalIngredientId,
    canonicalName,
    baseUnit,
    perishability,
  };
}
