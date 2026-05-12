---
name: add-expense-mutation
description: Canonical pattern for writing a new financial mutation in Synculariti-ET. Use whenever adding a new write operation that touches expenses, receipt_items, or any financial ledger table.
---

# Add Expense Mutation

## When to Use
Any time you need to write a new function that creates, updates, or deletes expense data.

## The Platinum Rule
> **ALL financial mutations MUST go through `save_receipt_v3`.** This RPC ensures dual-layer security (Tenant + Location) and maintains currency integrity.

## Mutation Pattern (in `useSync.ts`)

```typescript
const saveReceipt = async (receipt: ReceiptData, whoId: string, whoName: string, locationId?: string) => {
  const { tenant } = useTenant();
  if (!tenant?.tenant_id) throw new Error('Unauthorized');

  const expensePayload = {
    id: receipt.id || crypto.randomUUID(),
    tenant_id: tenant.tenant_id,
    location_id: locationId,      // Multi-location support
    who_id: whoId,
    who: whoName,
    category: receipt.category,
    amount: receipt.amount,
    currency: receipt.currency || 'EUR',
    date: receipt.date,
    description: receipt.store,
    items: receipt.items          // Nested items handled by v3
  };

  const { data, error } = await supabase.rpc('save_receipt_v3', {
    p_expense: expensePayload
  });
```

## Mandatory Lifecycle
1. **Auditing**: `Logger.user(tenantId, 'EXPENSE_ADDED', description, actorName)`
2. **State Sync**: `triggerRefresh()` to update the dashboard.
3. **Graph Analysis**: `normalizeAndLinkMerchant(...)` for Neo4j.

## Resilience (Outbox Pattern)
If you are adding a mutation that affects Inventory or Logistics, you MUST write an event to the `outbox_events` table instead of calling the Finance module directly. This ensures ACID compliance across the enterprise.

## What NOT to Do
- ❌ **No direct inserts** into `expenses` or `receipt_items`.
- ❌ **No hardcoding** categories (use `tenant.categories`).
- ❌ **No skipping** the `tenant_id` check.
