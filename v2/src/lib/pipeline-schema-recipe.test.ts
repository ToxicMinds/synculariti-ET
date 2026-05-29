import { supabase, tableExists, columnExists } from '@/lib/db-security-helpers';
import { resolveFixtures, TestFixtures, skipIfNoFixtures } from './test-fixtures';

describe('Phase 2: Recipe Cache Schema Contract', () => {

  // ───── cached_recipes table ─────
  describe('cached_recipes table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'menu_item_id', 'menu_item_name', 'selling_price',
      'is_active', 'ingredients', 'total_ingredient_cost', 'food_cost_pct', 'fetched_at',
    ];

    test('table exists', async () => {
      expect(await tableExists('cached_recipes')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('cached_recipes', col)).toBe(true);
      });
    });
  });

  // ───── cached_recipes constraints ─────
  describe('cached_recipes constraints', () => {
    let fx: TestFixtures;
    let insertedMenuItemId: string | null = null;

    beforeAll(async () => {
      fx = await resolveFixtures();
    });

    afterAll(async () => {
      if (fx.tenantId && insertedMenuItemId) {
        await supabase.from('cached_recipes').delete().eq('menu_item_id', insertedMenuItemId);
      }
    });

    test('tenant_id column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('cached_recipes').insert({
        tenant_id: null,
        menu_item_id: 'test-recipe-001',
        menu_item_name: 'Test Recipe',
        ingredients: [],
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "tenant_id"/i);
    });

    test('menu_item_id column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('cached_recipes').insert({
        tenant_id: fx.tenantId,
        menu_item_id: null,
        menu_item_name: 'Test Recipe',
        ingredients: [],
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "menu_item_id"/i);
    });

    test('ingredients column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('cached_recipes').insert({
        tenant_id: fx.tenantId,
        menu_item_id: 'test-recipe-002',
        menu_item_name: 'Test Recipe',
        ingredients: null,
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "ingredients"/i);
    });

    test('UNIQUE (tenant_id, menu_item_id) rejects duplicates', async () => {
      if (skipIfNoFixtures(fx)) return;
      const dupId = `test-recipe-dup-${Date.now()}`;
      const { error: err1 } = await supabase.from('cached_recipes').insert({
        tenant_id: fx.tenantId,
        menu_item_id: dupId,
        menu_item_name: 'Original',
        ingredients: [],
      });
      expect(err1).toBeNull();
      insertedMenuItemId = dupId;

      const { error: err2 } = await supabase.from('cached_recipes').insert({
        tenant_id: fx.tenantId,
        menu_item_id: dupId,
        menu_item_name: 'Duplicate',
        ingredients: [],
      });
      expect(err2).not.toBeNull();
      expect(err2.message).toMatch(/duplicate/i);
    });

    test('UNIQUE allows same menu_item_id for different tenants', async () => {
      if (!fx.tenantId) return;
      const { data: tenants } = await supabase.from('tenants').select('id').limit(2);
      if (!tenants || tenants.length < 2) return;

      const sharedId = `test-cross-tenant-${Date.now()}`;
      const tid1 = tenants[0].id;
      const tid2 = tenants[1].id;

      const { error: err1 } = await supabase.from('cached_recipes').insert({
        tenant_id: tid1, menu_item_id: sharedId, menu_item_name: 'T1', ingredients: [],
      });
      expect(err1).toBeNull();

      const { error: err2 } = await supabase.from('cached_recipes').insert({
        tenant_id: tid2, menu_item_id: sharedId, menu_item_name: 'T2', ingredients: [],
      });
      expect(err2).toBeNull();

      await supabase.from('cached_recipes').delete().eq('menu_item_id', sharedId);
    });

    test('is_active defaults to true', async () => {
      if (skipIfNoFixtures(fx)) return;
      const testId = `test-active-default-${Date.now()}`;
      const { data, error } = await supabase.from('cached_recipes').insert({
        tenant_id: fx.tenantId,
        menu_item_id: testId,
        menu_item_name: 'Default Test',
        ingredients: [],
      }).select('is_active').single();
      expect(error).toBeNull();
      expect(data.is_active).toBe(true);
      await supabase.from('cached_recipes').delete().eq('menu_item_id', testId);
    });
  });

  // ───── cached_ingredients table ─────
  describe('cached_ingredients table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'ingredient_id', 'canonical_name', 'category',
      'base_unit', 'perishability_days', 'current_stock_grams', 'cost_per_gram', 'fetched_at',
    ];

    test('table exists', async () => {
      expect(await tableExists('cached_ingredients')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('cached_ingredients', col)).toBe(true);
      });
    });
  });

  // ───── cached_ingredients constraints ─────
  describe('cached_ingredients constraints', () => {
    let fx: TestFixtures;
    let insertedIngredientId: string | null = null;

    beforeAll(async () => {
      fx = await resolveFixtures();
    });

    afterAll(async () => {
      if (fx.tenantId && insertedIngredientId) {
        await supabase.from('cached_ingredients').delete().eq('ingredient_id', insertedIngredientId);
      }
    });

    test('tenant_id column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('cached_ingredients').insert({
        tenant_id: null,
        ingredient_id: 'test-ing-001',
        canonical_name: 'Test Ingredient',
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "tenant_id"/i);
    });

    test('canonical_name column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('cached_ingredients').insert({
        tenant_id: fx.tenantId,
        ingredient_id: 'test-ing-002',
        canonical_name: null,
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "canonical_name"/i);
    });

    test('UNIQUE (tenant_id, ingredient_id) rejects duplicates', async () => {
      if (skipIfNoFixtures(fx)) return;
      const dupId = `test-ing-dup-${Date.now()}`;
      const { error: err1 } = await supabase.from('cached_ingredients').insert({
        tenant_id: fx.tenantId,
        ingredient_id: dupId,
        canonical_name: 'Original',
      });
      expect(err1).toBeNull();
      insertedIngredientId = dupId;

      const { error: err2 } = await supabase.from('cached_ingredients').insert({
        tenant_id: fx.tenantId,
        ingredient_id: dupId,
        canonical_name: 'Duplicate',
      });
      expect(err2).not.toBeNull();
      expect(err2.message).toMatch(/duplicate/i);
    });

    test('UNIQUE allows same ingredient_id for different tenants', async () => {
      if (!fx.tenantId) return;
      const { data: tenants } = await supabase.from('tenants').select('id').limit(2);
      if (!tenants || tenants.length < 2) return;

      const sharedId = `test-cross-ing-${Date.now()}`;
      const tid1 = tenants[0].id;
      const tid2 = tenants[1].id;

      const { error: err1 } = await supabase.from('cached_ingredients').insert({
        tenant_id: tid1, ingredient_id: sharedId, canonical_name: 'T1 Ing',
      });
      expect(err1).toBeNull();

      const { error: err2 } = await supabase.from('cached_ingredients').insert({
        tenant_id: tid2, ingredient_id: sharedId, canonical_name: 'T2 Ing',
      });
      expect(err2).toBeNull();

      await supabase.from('cached_ingredients').delete().eq('ingredient_id', sharedId);
    });
  });

  // ───── Row Level Security ─────
  describe('Row Level Security', () => {
    test('cached_recipes has RLS enabled', async () => {
      const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: 'cached_recipes' });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    test('cached_ingredients has RLS enabled', async () => {
      const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: 'cached_ingredients' });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });
  });
});
