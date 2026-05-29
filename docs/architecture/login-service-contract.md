# Login Service Boundary Contract

**Status:** Design — foundational contract  
**Owner:** Synculariti team (separate application, separate database)  
**Purpose:** Defines the boundary between the Login Service, ET, and IMS  
**Note:** This document establishes the contract. Implementation deep-dive is deferred.

---

## 1. What the Login Service Is

The Login Service is a **separate application** (separate Supabase project, separate deployment) that handles:

- User authentication and session management (Supabase Auth)
- Tenant creation and metadata management
- User↔tenant membership (`tenant_members`)
- Tenant configuration (workflows, phones, categories, budgets)
- Cross-app key provisioning (`api_keys` table)

It is the **only** service that creates users and tenants. ET and IMS consume tenants; they do not create them.

---

## 2. Application Boundaries

```
                    Login Service
              (own Supabase, own Auth)
              ┌──────────────────────────┐
              │  Owns:                   │
              │  - Users/profiles        │
              │  - Tenants (metadata)    │
              │  - tenant_members        │
              │  - api_keys              │
              │  - Writes tenants.config │
              └──────────┬───────────────┘
                         │
            ┌────────────┼────────────┐
            ▼                         ▼
     ┌──────────────┐          ┌──────────────┐
     │  ET           │          │  IMS         │
     │  (own Supabase│          │  (own        │
     │   project)    │          │   project)   │
     │  Reads tenants│          │  Reads       │
     │  via RLS      │          │  tenants     │
     │  + own data:  │          │  via RLS     │
     │  purchases,   │          │  + own data: │
     │  transactions,│          │  inventory,  │
     │  Neo4j,       │          │  POS,        │
     │  WhatsApp     │          │  recipes     │
     └──────────────┘          └──────────────┘
```

ET and IMS each have their own `tenants` table — they are replicas. The Login Service creates the tenant record. ET and IMS get their copies through a replication mechanism (to be determined — see Open Questions).

---

## 3. Data Ownership

| Data | Owned By | How ET Reads | How ET Writes |
|------|----------|-------------|---------------|
| User profile | Login Service | Via Supabase Auth session | Never |
| Tenant metadata | Login Service | Via RLS on `tenants` table | Never |
| Tenant members | Login Service | Via RLS on `tenant_members` | Never |
| `tenants.config` (workflows, phones, budgets, categories) | Login Service | Via RLS on `tenants.config` | Via `update_tenant_config_v1` RPC (service_role) |
| `api_keys` | Login Service (provisioned) | Via key lookup | Via `update_tenant_config_v1` (service_role) |
| Purchases | ET | Direct read | `save_purchase_v1` RPC |
| Transactions | ET | Direct read | `save_receipt_v4` / `add_transactions_bulk_v1` |
| POS staging | ET | Direct read | Via batch ingestion pipeline |
| Recipes (cached) | ET | Direct read (ET-local cache) | Via IMS API (ET polls) |
| Neo4j graph | ET | Via `getNeo4jDriver()` | Via `neo4jBulkMerge` |
| WhatsApp outbox | ET | Direct read | `insert_whatsapp_outbox_v2` RPC |
| Inventory snapshots | ET | Direct read (ET-local cache) | Via IMS API (ET polls) |

---

## 4. API Contracts

### 4.1 Login Service → ET/IMS (via service_role RPC)

```sql
RPC: public.update_tenant_config_v1(
  p_tenant_id UUID,
  p_config    JSONB
)
Auth: service_role (called by Login Service's Supabase client)
Purpose: Update tenants.config for a given tenant.

ET and IMS each have their own copy of this RPC.
Login Service calls BOTH when config changes.
```

### 4.2 Login Service → ET/IMS (HTTP fallback)

If direct RPC access is not available across Supabase projects:

```
POST /api/tenant/config
Auth: X-Api-Key (service-level key)
Body: { tenant_id: UUID, config: JSONB }

Called by Login Service when tenant config is updated.
ET validates the payload and upserts into its own tenants.config.
```

---

## 5. Default Workflow Configs

On tenant creation, the Login Service should set the following defaults via `update_tenant_config_v1` on both ET and IMS:

```json
{
  "phones": {
    "owner": "",
    "manager": ""
  },
  "workflows": {
    "bill_approval": {
      "enabled": false,
      "threshold": 100,
      "recipients": ["owner"]
    },
    "quarantine_alert": {
      "enabled": true,
      "auto_release_hours": 6,
      "recipients": ["manager"]
    },
    "purchase_anomaly": {
      "enabled": true,
      "z_score_threshold": 3,
      "auto_release_hours": 8,
      "recipients": ["owner", "manager"]
    },
    "low_stock_alert": {
      "enabled": true,
      "threshold_pct": 80,
      "recipients": ["manager"]
    },
    "fcv_gap_alert": {
      "enabled": true,
      "threshold_pct": 20,
      "recipients": ["owner"]
    },
    "data_gap_alert": {
      "enabled": true,
      "hours_before_alert": 12,
      "recipients": ["manager"]
    },
    "daily_summary": {
      "enabled": false,
      "time": "21:00",
      "recipients": ["owner"]
    }
  }
}
```

Each workflow key's semantics are defined in the batch-ingestion-pipeline.md §9 (Complete Workflow Registry).

---

## 6. Open Questions (Deferred for Deep Dive)

1. **Tenant replication**: How does a new tenant record propagate from Login Service to ET and IMS?
   - Option A: Login Service calls a webhook on both apps after creation
   - Option B: Database replication (logical replication between Supabase projects)
   - Option C: ET and IMS poll the Login Service API for new tenants

2. **User session sharing**: Does the same Supabase Auth project serve all three apps? Or does each have its own Auth with a shared user pool? Supabase Auth does not support cross-project authentication natively.

3. **Config write path**: When a tenant updates workflows in ET settings, does the request go:
   - Through ET → Login Service → both apps?
   - Directly to Login Service which then pushes to both?

4. **api_keys management**: The `api_keys` table exists in each app's database. Service-level keys must match across ET and IMS for cross-app HTTP auth. How does Login Service keep them in sync?

5. **IMS compatibility**: Does the IMS have the same `update_tenant_config_v1` RPC? The Login Service must write to both ET and IMS databases. If the IMS uses a different RPC name, the Login Service needs two calls.

---

## 7. Current Implementation (Pre-Login Service)

Until the Login Service is built:

- **Tenant creation**: Done manually via Supabase dashboard + seed scripts
- **Default configs**: Hardcoded in ET and applied on first tenant access
- **Config updates**: Done via `update_tenant_config_v1` RPC with service_role client (can be called from Supabase dashboard SQL editor)
- **Workflow defaults**: ET falls back to hardcoded defaults if `tenants.config.workflows` is null

This is functional but requires manual steps. The Login Service automates it.

---

## 8. Related Documents

- [batch-ingestion-pipeline.md](./batch-ingestion-pipeline.md) — Full architecture including workflow registry and IMS API contracts
- AGENTS.md §6.9 — Programmatic Workflow Integration (existing WhatsApp workflow patterns)
- AGENTS.md §6.8 — WhatsApp Test Coverage & Mock Patterns
