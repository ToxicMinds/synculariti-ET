// Slovak B2B Ingredient Mapping Dictionary
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
