---
name: add-expense-mutation
description: Canonical pattern for writing a new financial mutation in Synculariti-ET. Use whenever adding a new write operation that touches expenses, receipt_items, or any financial ledger table.
---

# Add Expense Mutation

## When to Use
Any time you need to write a new function that creates, updates, or deletes expense data.

## The Golden Rule
> **ALL financial mutations MUST go through `save_receipt_v3`.** Never insert directly into `expenses` from application code. If `save_receipt_v3` doesn't support your use case, extend it with a new versioned RPC — don't bypass it.

## Why `save_receipt_v3` and not `v2`?
| Feature | `save_receipt_v2` | `save_receipt_v3` |
|---------|------------------|------------------|
| Tenant check | ✅ | ✅ |
| Location ownership check | ❌ | ✅ |
| ISO-4217 currency | ❌ | ✅ (defaults to `EUR`) |
| `location_id` column | ❌ | ✅ |
| Currency on `receipt_items` | ❌ | ✅ |
| **Use this?** | ❌ DEPRECATED | ✅ CANONICAL |

## Correct Mutation Pattern (in `useSync.ts`)

```typescript
const saveReceipt = async (receipt: ReceiptData, whoId: string, whoName: string, locationId?: string) => {
  if (!householdId) throw new Error('No household ID');

  const expensePayload = {
    id: crypto.randomUUID(),
    household_id: householdId,   // Required — v3 validates this
    location_id: locationId,      // Required for B2B locations
    who_id: whoId,
    who: whoName,
    category: primaryCategory,
    amount: totalAmount,
    currency: 'EUR',             // ISO-4217 — always explicit
    date: receipt.date,
    description: receipt.store,
  };

  // Use v3 — never v2
  const { data, error } = await supabase.rpc('save_receipt_v3', {
    p_expense: expensePayload,
    p_items: itemsPayload
  });
```

## Mandatory After Any Mutation
1. **Log user activity**: `Logger.user(householdId, 'EXPENSE_ADDED', description, actorName)`
2. **Signal state refresh**: `triggerRefresh()` from `useHouseholdContext()`
3. **Neo4j sync** (fire-and-forget): `normalizeAndLinkMerchant(store, expenseId, amount).catch(...)`

## Exponential Backoff Template
All financial writes MUST include retry logic:
```typescript
let attempt = 0;
const maxAttempts = 3;
while (attempt < maxAttempts) {
  try {
    // ... your mutation
    return data;
  } catch (err) {
    attempt++;
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      Logger.system('ERROR', 'Sync', 'Mutation failed after max retries', err, householdId);
      throw err;
    }
  }
}
```

## What NOT to Do
- ❌ `supabase.from('expenses').insert(...)` — bypasses RLS and dual-layer check
- ❌ Calling `save_receipt_v2` — it's deprecated and missing B2B columns
- ❌ Omitting `household_id` from the payload — v3 will throw a security exception
- ❌ Using a string like `"€50"` for amount — must be a `NUMERIC` (number)
- ❌ Skipping `Logger.user(...)` — the Business Feed won't show the action
- ❌ Skipping `triggerRefresh()` — the UI won't update until page reload
