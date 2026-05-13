import { useTenantContext } from '@/context/TenantContext';
import { Logger } from '@/lib/logger';

export function useCategories() {
  const { tenant, updateState } = useTenantContext();

  const addCategory = async (name: string) => {
    if (!tenant) {
      Logger.system('WARN', 'Finance', 'Attempted to add category without active tenant context', {});
      return;
    }
    
    const cleanName = name.trim();
    if (!cleanName) return;
    
    const existingBudgets = tenant.budgets || {};
    const existingCategories = tenant.categories || [];
    
    // Skip if already exists
    if (existingCategories.includes(cleanName)) return;
    
    const newBudgets = { ...existingBudgets, [cleanName]: existingBudgets[cleanName] || 0 };
    const newCategories = [...existingCategories, cleanName];
    
    try {
      await updateState({ 
        budgets: newBudgets,
        categories: newCategories
      });
      Logger.user(tenant.tenant_id, 'CATEGORY_ADDED', `Added new category: ${cleanName}`, 'System');
    } catch (e: unknown) {
      Logger.system('ERROR', 'Finance', 'Failed to add category', { error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };

  return {
    addCategory,
    categories: tenant?.categories || [],
    budgets: tenant?.budgets || {}
  };
}
