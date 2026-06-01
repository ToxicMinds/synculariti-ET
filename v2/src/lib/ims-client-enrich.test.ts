import { enrichStagingRow } from './ims-client';

describe('enrichStagingRow', () => {
  test('returns row with enriched theoretical_grams', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ingredients: [
            { ingredient_id: 'ing-1', ingredient_name: 'Pork', grams_per_portion: 150, cost_per_gram: 0.02 },
            { ingredient_id: 'ing-2', ingredient_name: 'Flour', grams_per_portion: 20, cost_per_gram: 0.005 }
          ]
        }
      })
    };

    const row = { id: 'row-1', menu_item_id: 'menu-schnitzel', quantity: 2 };
    const result = await enrichStagingRow(mockSupabase as any, 'tenant-1', row as any);
    
    expect(result.theoretical_grams).toBeDefined();
    expect(result.theoretical_grams.ingredients).toHaveLength(2);
    expect(result.theoretical_grams.ingredients[0].grams).toBe(300); // 150 * 2
    expect(result.theoretical_grams.ingredients[0].cost).toBe(6); // 300 * 0.02
  });

  test('gracefully degrades if no recipe', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null })
    };

    const row = { id: 'row-1', menu_item_id: 'menu-unknown', quantity: 1, theoretical_grams: null };
    const result = await enrichStagingRow(mockSupabase as any, 'tenant-1', row as any);
    
    expect(result.theoretical_grams).toBeNull();
  });

  test('returns null theoretical_grams when recipe has empty ingredients array', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { ingredients: [] }
      })
    };

    const row = { id: 'row-2', menu_item_id: 'menu-empty', quantity: 1, theoretical_grams: null };
    const result = await enrichStagingRow(mockSupabase as any, 'tenant-1', row as any);

    expect(result.theoretical_grams).toBeNull();
  });

  test('returns zero grams and cost when quantity is zero', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ingredients: [
            { ingredient_id: 'ing-1', ingredient_name: 'Pork', grams_per_portion: 150, cost_per_gram: 0.02 },
          ]
        }
      })
    };

    const row = { id: 'row-3', menu_item_id: 'menu-item', quantity: 0, theoretical_grams: null };
    const result = await enrichStagingRow(mockSupabase as any, 'tenant-1', row as any);

    expect(result.theoretical_grams).toBeDefined();
    expect(result.theoretical_grams.ingredients[0].grams).toBe(0);
    expect(result.theoretical_grams.ingredients[0].cost).toBe(0);
  });

  test('handles null quantity gracefully (treated as zero)', async () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ingredients: [
            { ingredient_id: 'ing-1', ingredient_name: 'Pork', grams_per_portion: 150, cost_per_gram: 0.02 },
          ]
        }
      })
    };

    const row = { id: 'row-4', menu_item_id: 'menu-item', quantity: null, theoretical_grams: null };
    const result = await enrichStagingRow(mockSupabase as any, 'tenant-1', row as any);

    expect(result.theoretical_grams).toBeDefined();
    expect(result.theoretical_grams.ingredients[0].grams).toBe(0);
    expect(result.theoretical_grams.ingredients[0].cost).toBe(0);
  });
});
