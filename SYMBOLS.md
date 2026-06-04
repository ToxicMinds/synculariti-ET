# Synculariti-ET Symbol Map

## Identity & Auth
- `function useTenant()`: Hook for accessing tenant data within the Identity module.
- `interface AppState`: Represents the global application state for tenant context.
- `interface Location`: Defines the structure of a physical store/location within a tenant.
- `function IdentityGate()`: Component that ensures a tenant context is resolved before rendering the app.
- `function IdentityGateWrapper()`: Wrapper component for the IdentityGate.
- `function TenantSelector()`: UI for multi-org users to switch between available tenants.
- `function useIdentity()`: Hook for managing user identity and tenant discovery.
- `interface AvailableTenant`: Represents a tenant organization accessible by the current user.
- `function AuthProvider()`: Context provider for managing Supabase session lifecycle.
- `function useAuth()`: Hook to access the current authentication session.
- `function withAuth()`: API middleware that injects a `SecureContext` into route handlers.
- `interface SecureContext`: Strictly compliant Next.js context extended with optional `auth` data. Used by all authenticated routes (Export, AI, Debug, Banking).
- `type SecureHandler`: Standardized signature for all Synculariti-ET API routes.
- `function createMockAuthContext()`: Utility for generating type-safe API contexts in unit tests.
- `type LogComponent`: Centralized Single Source of Truth for platform domain logging (API, Neo4j, Security, Debug, Usage, etc.).
- `type LogLevel`: Centralized taxonomy for technical and business telemetry levels (INFO, WARN, ERROR, PERF).

## Finance
- `function useCategories()`: Hook for managing tenant expense categories.
- `function useManualEntryForm()`: Headless hook managing ManualEntryModal form state, validation, and submission lifecycle.
- `interface UseManualEntryFormReturn`: Contract for the useManualEntryForm hook state and actions.
- `interface FieldErrors`: Field-level validation error map for form hooks.
- `function useOfflineQueue()`: Hook for queuing financial mutations when offline.
- `function useSync()`: Facade hook for delegating financial mutations to transaction and offline queues.
- `function useTransactions()`: Read-only hook for fetching and subscribing to the transactions ledger.
- `function useTransactionSync()`: Core write hook for inserting/updating transactions (ACID compliant).
- `function useTransactionFilter()`: Headless hook for memoized filtering, sorting, and pagination of the transaction ledger.
- `interface UseTransactionFilterReturn`: Contract for the useTransactionFilter hook state and actions.
- `function useCalendarGrid()`: Headless hook for generating a fiscal month grid and intensity heatmap from transactions.
- `function useStatementScanner()`: Headless hook managing bank statement extraction, batch processing, and reconciliation.
- `interface UseStatementScannerReturn`: Contract for the useStatementScanner hook state and actions.
- `interface ParsedTransaction`: Structured representation of a transaction extracted from a statement.
- `interface ReconciliationResult`: Result of comparing extracted statement rows against a declared total.
- `interface UserIdentityMap`: Polymorphic mapping context for unpadded staff IDs and padded database UUIDs.
- `interface OperatingMarginMetrics`: Professional B2B operating margin tracking payload.
- `interface TimeBoundForecast`: Struct containing daily spend velocities, EOM projections, variance, and warning levels.
- `interface ReceiptData`: Canonical payload for scanned receipt data (in useTransactionSync). Extended by useScannerState with a `source` field.
- `interface ReceiptItem`: Canonical line item for a receipt (in useTransactionSync). Carries `confidence?: 'high'|'medium'|'low'` from AI extraction or 'high' for eKasa Gov items. Optional category during scan, required at save time.
- `type ItemConfidence`: `'high' | 'medium' | 'low'` — confidence rating per receipt line item. Auto-downgraded to `'low'` if name < 3 chars or amount === 0.
- `function processScannerInput(input, categories?, timeoutMs?)`: Unified entry point in `scanner-client.ts` (thin orchestrator). Routes string → `scanner-ekasa.ts`, File → `scanner-vision.ts`. Returns `ScannerResult`. Manages idempotency (SHA-256 cache via `scanner-cache.ts`), timeout (15s AbortController), offline queue fallback, image preprocessing, eKasa enrichment, and confidence scoring.
- `type ScannerResult`: `{ status: 'SUCCESS' | 'ERROR' | 'QUEUED', source: 'EKASA' | 'AI_VISION' | 'MANUAL' | 'OFFLINE_QUEUE', cacheKey?: string, data?: ReceiptData, error?: string }`. Returned by `processScannerInput()`.
- `function clearScannerCache()`: Clears the in-memory idempotency `resultCache` map (used in tests).
- `function preprocessImage(imageDataUrl, signal)`: Client-side call to `POST /api/ai/preprocess-image`. Returns preprocessed WebP data URL, falls back to original on failure. (scanner-client.ts)
- `Scanner orchestrator: src/lib/scanner-client.ts` (78 lines): Thin orchestrator routing to `scanner-cache.ts` (idempotency), `scanner-ekasa.ts` (eKasa QR pipeline), `scanner-vision.ts` (AI vision pipeline). Manages AbortController 15s timeout, offline queue integration, eKasa→parse-receipt enrichment wiring, and two-button→one-pipeline UI architecture. (V-88 split)
- `Scanner cache: src/lib/scanner-cache.ts`: SHA-256 idempotency cache (`Map<string, ScannerResult>`). Exports `getCachedResult()`, `setCachedResult()`, `clearScannerCache()`.
- `Scanner eKasa: src/lib/scanner-ekasa.ts`: eKasa QR pathway — fetches raw Gov data from `/api/ekasa`, enriches via `/api/ai/parse-receipt`, applies confidence scoring. Exports `processEkasaInput()`, `applyConfidence()`.
- `Scanner vision: src/lib/scanner-vision.ts`: AI Vision pathway — preprocesses image, calls `/api/ai/parse-invoice`, applies confidence scoring. Exports `processVisionInput()`.
- `function preprocessImageWithSharp(imageDataUrl)`: Server-side sharp pipeline in `image-preprocessor.ts`. Resizes to max 2000px, transcodes to WebP quality 80. Returns `{ image, width, height, originalSize, compressedSize, originalFormat }`.
- `API Route: POST /api/ai/preprocess-image`: Serverless endpoint accepting `{ image: dataUrl }`, runs `preprocessImageWithSharp()`, returns compressed WebP data URL. Logs compression ratio via ServerLogger.
- `interface ReceiptScannerProps`: Props interface for the `ReceiptScanner` component: `{ onSave, onAddCategory?, categories?, names? }`.
- `type ScannerStep`: `'scan' | 'processing' | 'review'` — step state for `useScannerState`.
- `interface UseScannerStateReturn`: Contract for useScannerState: `{ step, receipt, payerId, isProcessing, isSaving, isVerified, error, setPayerId, updateReceiptItem, process, confirmAndSave, reset }`.
- `function useScannerState()`: Simplified hook in `modules/finance/hooks/useScannerState.ts`. Single `process(input: string | File)` method routes internally via `processScannerInput()`. State-only — no intelligence logic.
- `function calcBudgetStatus()`: Calculates budget vs. actual spend variance. (v2/src/modules/finance/lib/margins.ts)
- `function calcCategoryTotals()`: Aggregates transaction totals grouped by category. (v2/src/modules/finance/lib/aggregation.ts)
- `function calcMonthDelta()`: Calculates the financial difference between current and previous months. (v2/src/modules/finance/lib/aggregation.ts)
- `function calcNetSavings()`: Computes total net savings (income minus expenses). (v2/src/modules/finance/lib/aggregation.ts)
- `function calcOperatingMargin()`: Calculates a mathematically sound B2B Operating Margin against benchmarks. (v2/src/modules/finance/lib/margins.ts)
- `function calcPerUserSpend()`: Computes spending distribution across team members. (v2/src/modules/finance/lib/aggregation.ts)
- `function calcTimeBoundForecast()`: Calculates a time-aware velocity projection forecast with zero budget safety constraints. (v2/src/modules/finance/lib/forecast.ts)
- `function calcTotals()`: Calculates absolute aggregate transaction totals. (v2/src/modules/finance/lib/aggregation.ts)
- `function isAdjustment()`: Utility to flag balance-adjustment transactions. (v2/src/modules/finance/lib/filters.ts)
- `function isSavings()`: Utility to flag savings-related transactions. (v2/src/modules/finance/lib/filters.ts)
- `function normalizeUserId()`: Normalizes user IDs, casting light mock IDs (like 'u2') to mock UUIDs. (v2/src/modules/finance/lib/aggregation.ts)
- `Facade finance: v2/src/modules/finance/lib/finance.ts`: Pure facade exporting the above deconstructed calculation utilities and types to preserve backward compatibility.
- `interface Transaction`: Core ledger entity representing a financial event. Includes strict `created_at` and `updated_at` audit trails. (v2/src/modules/finance/lib/types.ts)
- `type Expense`: Legacy alias for Transaction (deprecated in V2). (v2/src/modules/finance/lib/types.ts)


## Logistics & Inventory
- `function useInventory()`: Read-only hook for fetching the current physical stock ledger.
- `function useLogisticsSync()`: Write hook for atomic inventory ledger mutations.
- `interface InventoryItemInput`: Payload for creating a new SKU/inventory item.
- `function useLogistics()`: Hook that originally mixed read/write operations (potential SRP violation).
- `interface CurrentInventory`: Represents the calculated on-hand stock for an item.
- `interface InventoryCategory`: Classification grouping for inventory SKUs.
- `interface InventoryItem`: Defines a physical item or SKU in the catalog.
- `interface POLineItem`: Individual line item within a Purchase Order.
- `interface PurchaseOrder`: Represents a procurement order affecting future inventory.

## AI & Receipt Processing (eKasa)
- `function getCategoryPrompt()`: Generates the context-aware prompt for the Groq categorization LLM.
- `function cleanStoreName()`: Sanitizes raw merchant strings extracted from OCR/QR data.
- `export const EkasaRequestSchema`: Validator for incoming eKasa proxy payloads.
- `export const ResilientReceiptSchema`: The 'Washer' pattern that normalizes nullable parser output into guaranteed primitives.
- `function parseEkasaMetadata()`: Parses foundational data from an eKasa QR payload.
- `interface EkasaMetadata`: Structured representation of an eKasa receipt header.
- `function extractBaselineId()`: Extracts the base UUID from a raw fiscal string.
- `function extractOkpData()`: Extracts Offline eKasa Protocol (OKP) payload data.
- `function extractUniversal()`: Universal router for parsing various eKasa formats.
- `function parseEkasaError()`: Maps raw eKasa API errors to human-readable strings.
- `interface OkpData`: Structured payload for the OKP fallback protocol.
- `type ExtractionResult`: Union type for the result of an eKasa parsing attempt.
- `const GROQ_ERRORS`: Strict error messages contract for callGroq and its unit tests.
- `type GroqErrorType`: Type helper for standard Groq errors.

## Shared Utilities & Core Platform
- `function apiError()`: Standardized API error response handler with retry-logic and telemetry.
- `function callGroq()`: Unified API wrapper for the Groq SDK with token usage tracking and vision support.
- `const CATEGORY_ICONS`: Mapping of transaction categories to UI icons.
- `const DEFAULT_CATEGORIES`: Baseline fallback categories for new tenants.
- `class ServerLogger`: High-fidelity server-side telemetry logger.
- `type LogComponent`: Defined subsystems available for server-side logging.
- `type LogLevel`: Severity levels for system/user events.
- `class Logger`: Client-side telemetry logger interface.
- `function getNeo4jDriver()`: Instantiates the Neo4j graph database driver.
- `function neo4jBulkMerge()`: High-performance utility using a 3-Phase Lock-Safe aggregation engine to merge transactions, isolated merchant SKUs, and aggregated ingredients.
- `function processOutboxSync()`: Background runner processor that syncs ledger outbox events using a flat sliding cursor batch chunker.
- `function neo4jDeleteTransaction()`: Removes a transaction node and its relationships from the graph.
- `function enrichDate(date: Date): EnrichedDate`: Slovak holiday calendar enrichment returning `{dayOfWeek, isWeekend, month, quarter, isHoliday, holidayName, daysToNextHoliday, isBeforeHoliday}`. Covers 2025–2026. (lib/holidays.ts)
- `interface EnrichedDate`: The return type of `enrichDate()` with all 8 temporal fields.
- `Module: lib/insight-types.ts`: Exports `InsightFinding`, `QueryRunner`, `toNum`, `toStr` types extracted from `insight-queries.ts` for SRP. (V-89)
- `Module: lib/insight-queries.ts` (199 lines): Imports types from `insight-types.ts`. Contains query functions and insight orchestration.
- `interface InsightFinding extends Finding`: Structured insight finding with `type`, `title`, `description`, `impact`, and `data` fields. (lib/insight-types.ts)
- `type QueryRunner`: Function signature for analytical Cypher queries. (lib/insight-types.ts)
- `function toNum(val: unknown, fallback = 0): number`: Safe number extraction for Neo4j query results. (lib/insight-types.ts)
- `function toStr(val: unknown, fallback = ''): string`: Safe string extraction for Neo4j query results. (lib/insight-types.ts)
- `function queryPriceIntelligence(session, tenantId)`: Cypher query that compares avg unit price per ingredient across merchants, returns cheapest/dearest findings. (lib/insight-queries.ts)
- `function queryTimingPatterns(session, tenantId)`: Cypher query analyzing day-of-week / weekend spend patterns, returns highest/lowest-cost timing findings. (lib/insight-queries.ts)
- `function queryWasteRisk(session, tenantId)`: Cypher query scoring perishability × purchase day × holiday proximity for spoilage risk. (lib/insight-queries.ts)
- `function articulateFinding(finding)`: Template fallback that programmatically generates a natural-language insight string when LLM is unavailable.
- `function pickWinningFinding(findings)`: Scores all findings by impact and returns the highest-impact winner.
- `function analyzeInsights(session, tenantId)`: Orchestrator that runs all 3 analytical queries, picks the winner, calls LLM as narrator, and returns the insight string (lib/insight-queries.ts)
- `function mapToOntologyItem(name, merchantId, currency)`: Maps raw receipt item name to canonical ingredient via keyword matching (mliek→Milk, kur→Chicken Breast, etc.). Returns `{ skuId, canonicalName, canonicalIngredientId, baseUnit, perishability }`. (lib/neo4j-ontology.ts)
- `API Route: GET /api/debug/sync-neo4j`: Manually triggers outbox processing for the current authenticated tenant's pending graph sync queue.
- `API Route: GET /api/debug/backfill-neo4j`: Manually rebuilds and backfills the entire Neo4j graph from historical Postgres ledgers for the current tenant.
- `Script: rebuild-neo4j-graph.ts`: Utility that deletes all tenant Neo4j data, reads all Postgres transactions+receipt_items, calls `mapToOntologyItem()` on each item, builds `TransactionSyncPayload[]` with items array, and calls `neo4jBulkMerge()` in small batches (100 tx/batch) to avoid AuraDB free tier memory limits. Usage: `npx tsx src/scripts/rebuild-neo4j-graph.ts`.
- `interface Ingredient`: Defines a canonical, deduplicated ingredient category in the restaurant graph ontology.
- `interface MerchantSKU`: Defines a merchant-specific, compound-hashed store item linked to a parent Ingredient.
- `interface ReceiptItemSyncPayload`: Canonical interface for receipt line items during background outbox replication. Now carries `itemQuantity` (default 1), `itemUnitPrice` (default total amount), and a `category` field mapped from the parent transaction.
- `interface TransactionSyncPayload`: Canonical interface for transactional outbox replication payloads. Now carries 8 temporal enrichment fields (`dayOfWeek`, `isWeekend`, `month`, `quarter`, `isHoliday`, `holidayName`, `daysToNextHoliday`, `isBeforeHoliday`) and `category`.
- `interface LockManager`: Definition for the Web Locks API (in v2/src/types/web-locks.d.ts).
- `class OfflineQueue`: Core manager for PWA offline-first mutation resilience.
- `interface QueuedMutation`: Represents a stalled mutation awaiting network recovery.
- `function applySmartRules()`: Engine for auto-categorization based on historical rules.
- `interface SmartRule`: Pattern-matching rule for automatic merchant categorization.
- `const supabase`: Shared Supabase client instance.
- `interface FunctionSecurityState`: Direct representation of live Postgres security catalog checks.
- `const RPC_GET_SECURITY_STATE`: RPC name for Postgres catalog check function.
- `RPC Function: public.get_function_security_state()`: Secure catalog inspector that queries pg_proc to verify search_path and EXECUTE privileges.
- `RPC Function: public.get_table_privilege_state_v1(table_name)`: Catalog inspector for table-level privilege state per role. Returns anon SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER + RLS status. Used by `db-security-privileges.test.ts`. (supabase/migrations/20260530003)
- `RPC Function: public.check_default_privileges_v1()`: Checks whether ALTER DEFAULT PRIVILEGES grants INSERT to anon for future tables. Used by `db-security-privileges.test.ts`. (supabase/migrations/20260530003)
- `function TenantDataProvider()`: Read-side context provider for tenant data.
- `function useTenantData()`: Hook for consuming shared tenant state.
- `function TenantMutationProvider()`: Write-side context provider for state mutations.
- `function useTenantMutations()`: Hook for firing tenant-level global mutations.
- `Zod Schema: Unified Validation Registry`: Centralized schemas for `Category`, `EkasaDate`, and `ReceiptMeta` to ensure cross-module data integrity.
- `Zod Schema: API Request Schemas`: Strictly typed payloads for `Ekasa`, `Forecast`, `Statement`, and `DocumentParse` routes.

## UI & Navigation
- `function useNavigation()`: Headless Viewport Controller that manages fiscal calendar logic, module switching, and URL synchronization.
- `function useSwipeable()`: Headless hook for managing horizontal swipe gestures (Swipe-to-Reveal) across platform lists.
- `interface NavigationMonth`: Represents a selectable fiscal month in the platform viewport.
- `interface ModuleDescriptor`: Canonical configuration for platform domain modules (Finance, Logistics, Identity).
- `const MODULE_REGISTRY`: Single Source of Truth for available platform modules and their metadata.
- `function NavBar()`: Hollow shell orchestrator for the navigation system; implements Suspense boundary for static safety.
- `function NavBarContent()`: Dynamic navigation component; consumes useNavigation and renders module/fiscal controls.
- `function MonthSelector()`: Modular UI component for fiscal month switching.
- `function ModuleSwitcher()`: Modular UI component for domain navigation.
- `function ProfileMenu()`: Modular UI component for user session actions (Export, Logout).
- `function FilterBar()`: Modular UI for financial transaction filtering and search.
- `function TransactionRow()`: Modular UI for a single transaction with swipe-to-reveal gestures.
- `function CalendarGrid()`: Modular UI for the fiscal spend heatmap.

## WhatsApp & Sidecar
- `Package: @synculariti/whatsapp-client`: Shared package at `packages/whatsapp-client/`. Exports `signHmacPayload(payload, secret)`, `verifyWebhookSignature(body, signature, secret)`. Declared via `file:../packages/whatsapp-client` in `v2/package.json`. All signing operations (sidecar dispatch, server action dispatch, external webhook verification) MUST use this package — never re-implement the algorithm inline.
- `Table: public.api_keys`: Secure storage for third-party integration tokens mapped to tenants. Service-level keys (`tenant_id IS NULL`) used for IMS↔ET cross-app communication.
- `Table: public.whatsapp_outbox`: Audit ledger (Who, What, When) for outbound messaging events. Carries `idempotency_key` for deduplication, `webhook_url` / `webhook_secret` for two-way flow callbacks. IMS does NOT write here — uses `/api/whatsapp/notify`.
- `Table: public.whatsapp_inbox`: Secure storage for HMAC-verified inbound messages mapped to tenants and outbox items.
- `RPC Function: public.purge_expired_whatsapp_logs(days_to_keep INT)`: Revoked-execution routine that deletes both outbox and inbox records older than 30 days.
- `type InboundWhatsAppEvent`: Discriminated union for incoming webhook events (text vs. poll_vote).
- `interface OutboundMessageContext`: The mapping context used by the sidecar to link WhatsApp message stanzas to outbox records.
- `class SessionCache`: TTL-based memory cache used by the Sidecar to route inbound replies back to the initiating application.
- `class WebhookDispatcher`: Sidecar utility that generates Web Crypto HMAC-SHA256 signatures and fires event payloads to webhooks.
- `interface WhatsAppSession`: Canonical interface for OpenWA gateway session state.
- `interface WhatsAppNotificationPayload`: Interface for outbound notification dispatch payloads.
- `interface WhatsAppInboundCommand`: Type enum for two-way keyword command actions.
- `class OpenWAClient`: Shared headless REST API client for the OpenWA sidecar.
- `function signHmacPayload(payload, secret)`: **Canonical shared HMAC-SHA256 signing primitive** exported from `@synculariti/whatsapp-client`. Used by both the GCP Sidecar (`WebhookDispatcher`) and the Next.js `dispatchDecision` Server Action. Never re-implement inline — always import from this package.
- `function getErrorMessage()`: Type-safe utility to parse and format unknown caught errors safely without using `any`.
- `API Route: POST /api/whatsapp/notify`: Edge-runtime API for queuing Outbox delivery to WhatsApp. Uses `WashedPayload` Zod transform for nullable metadata normalization. Authenticates via `X-Api-Key` against `api_keys` table (service-role client). Supports per-tenant keys (auto-resolve tenant) and service-level keys (require `tenant_id` + `source` in body). Injects `source` into payload metadata for audit trail. **This is the ONLY integration point for IMS** to send WhatsApp messages.
- `API Route: POST /api/whatsapp/webhook` (55 lines): Thin orchestrator delegating to `verify-webhook.ts` (sig check), `resolve-outbox.ts` (tenant/outbox context), `insert-inbox.ts` (inbox RPC), `decision-router.ts` (handler registry). Routes decisions via DecisionHandler registry: `poId` → DefaultPOApprovalService, `transactionId` → DefaultFinanceAuditService, `amount+locationId` → DefaultPOSDiscrepancyService. (V-54 split)
- `API Route: GET /api/whatsapp/session`: Edge-runtime API for checking gateway session connection state.
- `function processOutboxQueue(supabase, client, baseUrl, records?)`: Shared queue processor in `modules/whatsapp/lib/processOutboxQueue.ts`. Used by BOTH the DB webhook route and the GCP crontab safety net. Claims PENDING/FAILED records, delivers via OpenWAClient (fallback: action link text message for poll payloads since sidecar lacks `/api/sendPoll`), updates status to SENT/FAILED.
- `API Route: POST /api/whatsapp/process-outbox`: **Serverless** (Node.js) runtime — receives Supabase Database Webhook on INSERT to whatsapp_outbox. Calls processOutboxQueue() with the single record. Primary delivery path. Must NOT be Edge runtime because it `fetch()`s the sidecar at a raw IP address.
- `API Route: GET /api/cron/process-outbox`: **Serverless** (Node.js) runtime — GCP Crontab target (every 60s). Authenticates via `x-cron-secret` header matching `CRON_SECRET` env var (not spoofable `x-vercel-cron`). Calls processOutboxQueue() with no records (claims batch via `claim_whatsapp_outbox_batch` RPC). Safety net path.
- `RPC Function: public.claim_whatsapp_outbox_batch(p_batch_size)`: Atomic batch claim with `FOR UPDATE SKIP LOCKED`. Transitions PENDING/FAILED → PROCESSING. Includes retry backoff (max 5 retries). Granted `EXECUTE TO service_role` only.
- `RPC Function: public.complete_whatsapp_action_v1(p_outbox_id, p_decision)`: Atomic action completion. Marks COMPLETED and returns webhook_url + webhook_secret + payload in a single transaction. Fixes ACID V-49 split-brain. **Uses table alias `wo.` in RETURNING clause to avoid ambiguity with RETURNS TABLE output column `status`.** Granted `EXECUTE TO authenticated` only.
- `Server Action: dispatchDecision()` (52 lines): Thin orchestrator completing interactive actions. Delegates to `complete-action.ts` (RPC wrapper) and `fire-webhook.ts` (signing + dispatch). Uses `complete_whatsapp_action_v1()` RPC for atomic status update. Uses `getAll()`/`setAll()` Supabase SSR cookie API (NOT legacy `get()`/`set()`/`remove()`). (V-90 split)
- `Utility: complete-action.ts`: `CompleteActionResult` type + `completeAction()` wrapper around `complete_whatsapp_action_v1()` RPC.
- `Utility: fire-webhook.ts`: `fireWebhook()` function that signs payloads with `signHmacPayload()` and dispatches to webhook URLs. Handles both success and failure callbacks.
- `Server Action: notifyLargeInvoice()`: Triggers WhatsApp notification for invoices exceeding configurable threshold. Writes to `whatsapp_outbox` directly rather than calling the sidecar directly.
- `Route Page: /action/[actionId]`: Dynamic App Router page that loads context and renders the web-bridge interactive interface for WhatsApp action links. Generates OG meta tags for WhatsApp link previews.
- `Component: ActionClient`: Client component implementing user selection buttons, loading states, and submitting decisions to the server action.
- `interface POApprovalService`: Service contract for handling Purchase Order approval decisions from WhatsApp/web. Conforms to LSP: returns standard failure/success objects instead of throwing raw exceptions.
- `class DefaultPOApprovalService`: Implementation of POApprovalService mapping Approve/Reject/Modify decisions to receive_purchase_order_v1 RPC and table mutations. Returns standard success/failure structures.
- `interface FinanceAuditService`: Service contract for processing audit anomaly decisions (Approve Anyway, Request Re-upload, Reject Expense). Conforms to LSP.
- `class DefaultFinanceAuditService`: Implementation of FinanceAuditService. Accepts optional `supabaseClient` constructor param. Returns standard success/failure structures.
- `interface POSDiscrepancyService`: Service contract for resolving POS cash discrepancy actions (Log as Shrinkage, Recount Required, Deduct from Register). Conforms to LSP.
- `class DefaultPOSDiscrepancyService`: Implementation of POSDiscrepancyService logging ledger adjustments. Accepts optional `supabaseClient` constructor param. Returns standard success/failure structures.

- `Script: trigger_workflow.ts`: CLI development utility for queueing test WhatsApp workflows. Usage: `npx tsx src/scripts/trigger_workflow.ts <po|audit|pos> [phone_number]`. Creates real DB entities (POs, transactions, discrepancies) and inserts outbox records for end-to-end testing without a live UI flow.
- `interface WorkflowConfig`: Per-workflow configuration shape in `tenants.config.workflows`. Fields: `enabled: boolean`, `threshold?: number` (bill_approval), `threshold_pct?: number` (low_stock_alert), `time?: string` (daily_summary), `recipients: ('owner'|'manager')[]`. (modules/whatsapp/types.ts)
- `type WorkflowKey`: Union type `'bill_approval' | 'low_stock_alert' | 'daily_summary'` identifying supported automated workflows. (modules/whatsapp/types.ts)
- `interface WorkflowsConfig`: Map of `WorkflowKey` to `WorkflowConfig`. (modules/whatsapp/types.ts)
- `interface TriggerParams`: Input to `triggerWorkflow()`: `{ tenantId, workflowKey, amount?, stockLevel?, metadata }`. (modules/whatsapp/types.ts)
- `interface TriggerResult`: Return from `triggerWorkflow()`: `{ fired: boolean, reason?: string, outboxIds: string[] }`. (modules/whatsapp/types.ts)
- `interface TenantConfig`: Top-level type for `tenants.config` JSONB: `{ phones?: Record<string, string>, workflows?: WorkflowsConfig }`. (modules/whatsapp/types.ts)
- `function triggerWorkflow(supabase, params)`: **ET-internal utility only**. Reads `tenants.config.workflows`, checks thresholds via `strategies` registry (keyed by `WorkflowKey` — replaces dual if-else chains), and queues `whatsapp_outbox` records via `insert_whatsapp_outbox_v2` RPC. Uses `service_role` client. No SSR/cookie dependency. IMS must NOT call this — uses `POST /api/whatsapp/notify` instead. (modules/whatsapp/lib/triggerWorkflow.ts) (V-86 + V-77)
- `API Route: GET /api/tenant/workflows`: Edge-runtime read-only endpoint returning per-tenant workflow thresholds from `tenants.config.workflows`. Authenticates via `X-Api-Key`. Service-level keys require `tenant_id` query param. Returns `{ workflows: { [key]: WorkflowConfig } }`. (api/tenant/workflows/route.ts)
- `Migration: sql/b2b_evolution/31_service_api_keys.sql`: Makes `api_keys.tenant_id` nullable, enabling shared service-level keys for multi-tenant external apps (IMS, Login Service).

## IMS Integration (Cross-App Contracts)
- `API Contract: GET /api/ims/recipes?tenant_id={uuid}`: IMS endpoint returning menu items with ingredient compositions. ET calls this (service API key), caches locally for 24h. Returns `{ menu_items: [{ id, name, selling_price, is_active, ingredients: [{ ingredient_id, ingredient_name, grams_per_portion, cost_per_gram }], total_ingredient_cost, food_cost_pct }], ingredients: [{ id, canonical_name, category, base_unit, perishability_days, cost_per_gram, current_stock_grams }] }`.
- `API Contract: GET /api/ims/pos-sales?tenant_id={uuid}&from={date}&to={date}`: IMS endpoint returning processed POS receipts. ET polls this for the Food Cost Variance pipeline. Returns `{ receipts: [{ transaction_time, till_id, receipt_number, total_revenue, currency, is_void, is_comp, items: [{ menu_item_id, menu_item_name, quantity, revenue, modifiers }] }] }`. Supports pagination via `&page=N&per_page=1000`.
- `Table: public.pos_transaction_staging`: ET's own staging table for incoming POS data. NOT shared with IMS. Raw payload from IMS API lands here, passes through anomaly quarantine, then moves to graph_sync_queue.
- `Table: public.pos_batch_uploads`: ET's metadata table tracking incoming POS batches from IMS API.
- `Table: public.pos_data_gaps`: ET's gap detection — tracks calendar days where POS data was expected but not received. Triggers WhatsApp alert via the existing notification pipeline.
- `function fetchRecipesFromIMS(tenantId)`: ET utility that calls IMS recipe API and caches results locally in `cached_recipes` table with 24h TTL.
- `function fetchPOSSalesFromIMS(tenantId, from, to)`: ET utility that calls IMS POS API, pages through results, and writes to `pos_transaction_staging`.
- `Table: public.cached_recipes`: ET's local cache of IMS recipe data. Refreshed every 24h. Not the source of truth — IMS is.
- `Table: public.cached_ingredients`: ET's local cache of IMS ingredient data (cost, stock levels). Refreshed every 24h.

## Food Cost Variance Pipeline (Postgres-based)
- `Table: public.pos_transaction_staging`: Staging table for POS data from IMS. Carries `flag` (PENDING/APPROVED/QUARANTINED), `recipe_found` (boolean indexing flag for enrichment status), `theoretical_grams` (JSONB of per-ingredient consumption). Lazy-enriched by the FCV route on read.
- `Table: public.pos_batch_uploads`: Metadata per IMS POS data pull. Tracks status (STAGED/PROCESSING/COMPLETED/FAILED), receipt counts, period covered.
- `Table: public.pos_data_gaps`: Tracks calendar days without POS data.
- `Table: public.cached_recipes`: Local cache of IMS recipe data. Menu item → ingredient composition in grams. Populated by `refreshRecipeCache()`.
- `Table: public.cached_ingredients`: Local cache of IMS ingredient data. Tracks cost_per_gram, perishability_days, current_stock_grams.
- `Table: public.purchases`: Ingredient-linked purchase records. Carries `quarantine_status` (PENDING/APPROVED/REJECTED/AUTO_RELEASED/RELEASED), `ingredient_id`, `ingredient_name`. Source of actual spend.
- `Table: public.purchase_anomaly_queue`: Anomaly flags triggered during batch processing. Carries `status` (OPEN/DISMISSED/ESCALATED/RESOLVED), `purchase_id`, `check_type`, `severity`.
- `RPC Function: public.process_batch_v1(p_batch_id)`: Iterates staging rows, computes Z-scores against 90-day rolling baseline, flags outliers.
- `RPC Function: public.release_expired_quarantines_v1()`: Releases purchases older than 30 days. Uses `GET DIAGNOSTICS ROW_COUNT` for multi-tenant accumulation. Called by cron route.
- `RPC Function: public.resolve_purchase_quarantine_v1(p_purchase_id UUID, p_status TEXT)`: Directly resolves a purchase quarantine. Bulk-updates anomaly queue rows by `purchase_id`. SECURITY DEFINER. Called by `resolvePurchaseAction` server action.
- `function refreshRecipeCache(supabase, tenantId)`: Exists in `src/lib/ims-client.ts`. 24h TTL + 3-day stale grace. Fetches from IMS API, uses `onConflict: 'tenant_id, menu_item_id'` for idempotent upserts. Degrades gracefully (no-op) if IMS is offline but cache is within stale grace.
- `function enrichStagingRow(supabase, tenantId, row)`: Exists in `src/lib/ims-client.ts`. Pure transformation — reads from `cached_recipes`, maps `menu_item_id` + `quantity` → `theoretical_grams` ingredient array. Returns enriched row. Caller writes to DB.
- `function resolveConsumption(posItem, recipes)`: Exists in `src/lib/ims-client.ts`. Pure function that resolves a POS item's menu_item_id against a `Map<string, CachedRecipe>`. Returns `{ consumptions, status }` where status is RESOLVED/PARTIAL/UNKNOWN.
- `API Route: GET /api/analytics/food-cost-variance`: Returns the FCV Report for the authenticated tenant's selected period. **Lazy enrichment**: calls `refreshRecipeCache`, iterates `pos_transaction_staging` rows where `recipe_found IS NULL`, enriches via `enrichStagingRow`, writes back `theoretical_grams` + `recipe_found`. Non-idempotent on first request per date range. Per-row try/catch isolation.
- `API Route: GET /api/cron/release-quarantines`: Serverless (nodejs) cron route. Authenticates via `x-cron-secret` with `timingSafeEqual`. Calls `release_expired_quarantines_v1` RPC.
- `function computeFCVReport({ purchases, posStaging, period })`: Exists in `src/lib/food-cost-variance.ts`. SRP-extracted into `computeAggregates`, `computePerIngredient`, `computeTemporalAnalysis`.
- `Server Action: resolvePurchaseAction(purchaseId, decision)`: Exists in `src/modules/finance/actions/resolvePurchaseAction.ts`. `'use server'` action. Calls `resolve_purchase_quarantine_v1` RPC, uses `createClient()` from `@/lib/supabase-server`, logs via `ServerLogger`, revalidates paths.
- `Component: VarianceSpikeDetail`: Exists in `src/modules/finance/components/VarianceSpikeDetail.tsx`. Pure render — receives `spikes: FCVSpike[]` as prop. Renders last 3 non-NORMAL spikes with `↑ Spike` / `↓ Dip` indicators. No `useNavigation`, no data fetching.
- `Component: NeedsAttentionCard`: Exists in `src/modules/finance/components/NeedsAttentionCard.tsx`. Pending purchases chip opens review modal. Modal fetches rows from `purchases WHERE quarantine_status = 'PENDING'`. Approve/Reject buttons call `resolvePurchaseAction`.
- `Component: ItemAnalytics`: Exists in `src/modules/finance/components/ItemAnalytics.tsx`. Queries `supabase.from('receipt_items')` joined with `transactions` — top 5 items by total spend. Browser-side Supabase client. No category filter — shows all items regardless of OPEX/COGS.
- `interface FoodCostVarianceReport`: `{ period, dataCoverage, headline: { totalRevenue, theoreticalCOGS, actualSpend, gap, gapPct, confidenceBands, direction }, byIngredient, weeklyTrend, varianceSpikes }`.
- `Migration: 20260601003_fix_pos_rls_policies.sql`: Adds missing RLS policies for `pos_transaction_staging`, `pos_batch_uploads`, `pos_data_gaps`. All three had `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` but zero policies → default-deny for authenticated users. (Phase 4 Corrigendum §11.2)
- `Migration: 20260601004_copy_fcv_seed_data_to_user_tenant.sql`: Copies FCV seed data (POS staging, purchases, cached recipes, ingredients, chart of accounts, locations) from seed tenant `@demo-2026` (e3b20277) to user's tenant `demo-2026` (f039714b). Clears stale `ai_insight` cache. (Phase 4 Corrigendum §11.1)

## Shared Utilities
- `function getErrorMessage(e: unknown): string`: Single error-to-string function used across the entire codebase. Defined in `src/lib/utils.ts`. Replaces 30+ inline `e instanceof Error ? e.message : String(e)` duplications. Also exported from `@synculariti/whatsapp-client` but ET-internal code must use `@/lib/utils`.
- `function formatCurrency(amount: number, currency = 'EUR'): string`: Locale-aware currency formatting (`sk-SK` locale, EUR default). Defined in `src/lib/utils.ts`. Used across 17+ components and modules — single source of truth for all monetary display.
- `function safeAmount(val: unknown, fallback = 0): number`: Safe number parser for financial amounts. Handles `null`, `undefined`, `NaN`, and non-numeric values. Replaces 28 inline `Number(x.amount)` calls across 19 files. Defined in `src/lib/utils.ts`. (V-79)
- `function createServiceClient(): SupabaseClient`: Factory for `service_role` Supabase clients. Uses `@supabase/supabase-js` `createClient` with `autoRefreshToken: false, persistSession: false`. Centralizes env var access. Defined in `src/lib/supabase-server.ts`. Replaces 12 inline `createClient(URL, KEY)` boilerplate calls. (V-81)
- `function createOpenWAClient(): OpenWAClient`: Factory for OpenWA gateway clients. Centralizes `baseUrl`, `apiKey`, `sessionId` config. Defined in `src/lib/create-openwa-client.ts`. Replaces 3 inline `new OpenWAClient({...})` instantiations. (V-84)
- `function withTestHandler(handler: SecureHandler)`: Extracts the `process.env.NODE_ENV === 'test' ? handler : withAuth(handler)` guard pattern. Defined in `src/lib/withTestHandler.ts`. Used by all 12 internal API routes. (V-49 fix)
- `function buildMerchantId(name: string): string`: Slugifies a merchant name into a Neo4j-safe merchant ID (`merchant-{lowercase-hyphenated}`). Defined in `src/lib/neo4j-ontology.ts`. Eliminates 4 inline duplications. (V-46 fix)
- `function buildSyncPayload(txRow, items, options?): TransactionSyncPayload`: Constructs a `TransactionSyncPayload` from a database transaction row and its receipt items. Handles vendor name extraction, merchant ID building, item mapping via `mapToOntologyItem()`, date enrichment via `enrichDate()`, and optional category inference. Defined in `src/lib/neo4j-ontology.ts`. Eliminates 3 near-identical blocks. (V-47 fix)
- `Zod Schema: BaseDecisionSchema`: Shared base Zod schema for webhook callback payloads (`type`, `outboxId`, `recipientPhone`, `tenantId`, `timestamp`). Extended by `POApprovalWebhookSchema`, `AuditWebhookSchema`, `POSDiscrepancyWebhookSchema` with domain-specific `decision` enums. Defined in `src/modules/whatsapp/lib/webhook-payloads.ts`. (V-48 fix)
- `interface BaseDecisionPayload`: Inferred type from `BaseDecisionSchema`. Used by `dispatchDecision` server action for its constructed payload. (V-48 fix)

## Phase 1-2 Security Hardening & Route Standardization (Test Files)
- `Test File: src/lib/db-security-privileges.test.ts` (7 tests): Verifies anon privilege lockdown on 6 tables (`api_keys`, `current_inventory`, `graph_sync_queue`, `rate_limits`, `whatsapp_inbox`, `whatsapp_outbox`) + ALTER DEFAULT PRIVILEGES does not grant INSERT to anon. Uses `get_table_privilege_state_v1` and `check_default_privileges_v1` RPCs.
- `Test File: src/app/api/health/route.test.ts` (1 test): Verifies health endpoint returns `{ status: 'ok' }` without exposing Supabase or Neo4j infrastructure details.
- `Test File: src/app/api/cron/process-outbox/route.test.ts` (2 tests): Verifies CRON_SECRET uses timing-safe comparison (not `!==`) and returns 401 when CRON_SECRET is missing.
- `Test File: src/app/api/whatsapp/session/route.test.ts` (2 tests): Verifies session status returns connected/disconnected state and handles gateway failure (500).
- `Test File: src/app/api/whatsapp/process-outbox/route.test.ts` (5 tests): Valid INSERT auth, missing auth (401), wrong token (401), non-INSERT skip, exception handling (500).
- `Test File: src/app/api/whatsapp/webhook/route.test.ts` (4 tests): Invalid HMAC (403), missing HMAC (401), valid poll vote with decision routing (200), missing outbox context (400).
- `Test File: src/app/api/analytics/food-cost-variance/route.test.ts` (3 tests): Report generation with computeFCVReport, query params, error handling (500).
- `function timingSafeEqual(a, b)`: Custom constant-time string comparison defined in `src/lib/utils.ts`. XOR-based loop prevents timing side-channel attacks on secret comparison. Used by `cron/process-outbox/route.ts` (CRON_SECRET) and `whatsapp/process-outbox/route.ts` (webhook secret) via import. Replaces 2 inline duplications.

## Phase 3: Code Quality Hardening (Test Files)
- `Test File: src/app/api/auth/pin/route.test.ts` (7 tests): PIN auth endpoint — invalid PIN format, rate limit failure (503), rate limited (429), tenant not found (401), PIN mismatch (401), successful auth with tokens (200).
- `Test File: src/app/api/groq/route.test.ts` (6 tests): Groq AI proxy — missing/non-array messages (400), successful response with custom/default model (200), Groq API failure (500).
- `Test File: src/app/api/debug/backfill-neo4j/route.test.ts` (4 tests): Neo4j backfill — missing session (401), driver uninitialized (500), empty transactions (200), merge failure (500).
- `Test File: src/app/api/debug/sync-neo4j/route.test.ts` (3 tests): Outbox sync — missing session (401), driver uninitialized (500), no pending events (200).
- `Test File: src/app/api/ai/statement/route.test.ts` (4 tests): Bank statement parsing — missing/non-string text (400), successful extraction (200), Groq failure (500).
- `Test File: src/app/api/ai/parse-receipt/route.test.ts` (4 tests): eKasa receipt enrichment — missing data (400), AI store inference (200), known store bypass (200), Groq failure (500).
- `Test File: src/app/api/ai/parse-invoice/route.test.ts` (4 tests): AI invoice parsing — missing/non-string image (400), rejected triage (200), successful extraction (200), Groq failure (500).
- `Test File: src/app/api/ai/forecast/route.test.ts` (5 tests): AI budget forecasting — missing field (400), early return with zero days (200), Zod negative validation (400), successful forecast (200), Groq failure (500).

## Shared Constants (`src/lib/constants.ts`)
- `CONTENT_TYPE_JSON`: `'application/json'` — replaces 14 inline occurrences.
- `HEADER_CONTENT_TYPE`: `'Content-Type'` — replaces 14 inline occurrences.
- `HEADER_API_KEY`: `'X-Api-Key'` — replaces 7 inline occurrences.
- `QUEUE_SAVE_RECEIPT`: `'SAVE_RECEIPT'` — replaces 4 inline occurrences.
- `DEFAULT_CURRENCY`: `'EUR'` — default for currency formatting.
- `PAGE_SIZE = 1000`: Supabase pagination limit.
- `SCANNER_TIMEOUT_MS = 15_000`: Scanner fetch timeout.
- `NEO4J_BATCH_SIZE = 100`: AuraDB free tier batch limit.
- `INSIGHT_CACHE_TTL_MS = 86_400_000`: 24h AI insight cache TTL.
- Environment variable name constants: `ENV_GROQ_API_KEY`, `ENV_SUPABASE_URL`, `ENV_SUPABASE_ANON_KEY`, `ENV_SUPABASE_SERVICE_KEY`, `ENV_CRON_SECRET`, `ENV_BASE_URL`, `ENV_OPENWA_SESSION_ID`, `ENV_OPENWA_BASE_URL`, `ENV_OPENWA_API_KEY`, `ENV_OPENWA_WEBHOOK_SECRET`, `ENV_SUPABASE_WEBHOOK_SECRET`, `ENV_IMS_API_BASE_URL`, `ENV_IMS_API_KEY`, `ENV_SYNC_SECRET_KEY`, `ENV_PIN_DERIVATION_SECRET`, `ENV_ENABLE_BANKING_APP_ID`, `ENV_ENABLE_BANKING_APP_SECRET`, `ENV_ENABLE_BANKING_BASE_URL`, `ENV_NEXT_PUBLIC_APP_URL`.

## WhatsApp Types
- `interface OutboxRecord`: Full type for `whatsapp_outbox` rows. Properties: `id`, `tenant_id`, `recipient_phone`, `payload` (`{ type: 'text' | 'poll', text?, name?, options?, metadata? }`), `webhook_url?`. Exported from `src/modules/whatsapp/types.ts`.

## Event Log (Phase 5 Refactoring)
- `Module: src/lib/event-log-types.ts` (82 lines): Type definitions — `EVENT_ACTIONS` const (26 actions: `transaction.created`, `transaction.updated`, `transaction.deleted`, `expense.created`, `category.created`, `ingestion.failed`, `workflow.triggered`, `workflow.skipped`, `anomaly.detected`, `anomaly.resolved`, `purchase.approved`, `purchase.rejected`, `purchase.auto_released`, `whatsapp.notification.sent`, `whatsapp.delivered`, `whatsapp.delivery_failed`, `whatsapp.response.received`, `report.generated`, `insight.updated`, `ai.forecasted`, `pin.verified`, `auth.logged_in`, `auth.logged_out`, `export.performed`, `settings.updated`, `system.error`). `EventAction`, `WhoType`, `BaseEventPayload` (shared: `action`, `whoId?`, `whoType?`, `entityType?`, `entityId?`, `description?`, `metadata?`, `source?`), `RecordEventPayload` (client — no `tenantId`), `RecordEventServerPayload` (server — requires `tenantId: string`).
- `Module: src/lib/event-log.ts` (35 lines): `recordEvent(payload: RecordEventPayload): Promise<void>` — client-side write wrapper. Uses browser Supabase client. Resolves `tenant_id` server-side via `record_event_v1` RPC (`get_my_tenant()`). Fire-and-forget — errors logged internally via `Logger.system('ERROR')`.
- `Module: src/lib/event-log-read.ts` (59 lines): `useEventLog(entityType?, entityId?, limit = 50)` — read hook extracted from `event-log.ts` (SRP split). Fetches from `event_log` table via browser Supabase client. Handles permission-denied errors (silent empty array). Returns `{ events, loading, error }`.
- `Module: src/lib/event-log-server.ts` (28 lines): `recordEventServer(payload: RecordEventServerPayload): Promise<void>` — service-role write wrapper. Uses `createServiceClient()`. Requires explicit `tenantId`. Logs errors via `ServerLogger`.
- `Module: src/lib/event-log-display.ts` (82 lines): `ACTION_DISPLAY` — single shared registry of `{label, color, icon}` per `EventAction`. `resolveActorName(event, actorMap?)` — shared actor resolution (used by EventTimeline, EventFeed, EventByline). `getActionDisplay(action)` — returns `{label, color, icon}` fallback for unknown actions. Merged across 3 components (B1/B2a fix).
- `Test File: src/lib/event-log-client.test.ts` (104 lines): 6 tests — positive RPC invocation with correct params (client + server), NEGATIVE error logging without crashing, type safety for tenantId.
- `Test File: src/lib/formatRelativeTime.test.ts` (50 lines): 9 tests — seconds ago, minutes ago, hours ago, days ago, edge boundaries (60s, 60min, 24h), future dates.
- `Test File: src/lib/logger-deprecation.test.ts` (98 lines): 4 tests — `Logger.user` redirects to `recordEvent`, `ServerLogger.user` redirects to `recordEventServer`, proper parameter mapping, error handling.
- `Test File: src/lib/event_log.test.ts` (291 lines): 7 BDD scenarios (Gherkin via jest-cucumber) — live DB integration. Direct INSERT rejection, immutability, RPC recording, server actions, metadata validation, unknown action rejection, query performance. All queries now filter by `tenant_id` to prevent parallel-test pollution.
- `Migration: sql/b2b_evolution/46_remove_event_log_action_check.sql`: Drops `valid_event_action` CHECK constraint on `event_log.action`. Sole write path is `record_event_v1` SECURITY DEFINER RPC — TypeScript compile-time check on `EVENT_ACTIONS` is the real guard. (D1 fix)

## Database RPCs
- `RPC Function: public.insert_whatsapp_inbox_v1(p_tenant_id, p_outbox_id, p_sender_phone, p_message_id, p_message_type, p_content)`: ACID-compliant inbox insert with `updated_at` propagation. Replaces direct `whatsapp_inbox.insert()` in webhook/route.ts (V-71 fix). SQL in `sql/b2b_evolution/32_insert_whatsapp_inbox_v1.sql`.
- `RPC Function: public.set_outbox_delivery_result_v1(p_outbox_id, p_success, p_error_message)`: ACID-compliant outbox delivery result update. Atomically sets `status = SENT/FAILED`, `processed_at`, and increments `retry_count`. Replaces direct `whatsapp_outbox.update()` in processOutboxQueue.ts (V-70 fix). SQL in `sql/b2b_evolution/33_set_outbox_delivery_result_v1.sql`.
- `RPC Function: public.insert_whatsapp_outbox_v2(p_tenant_id, p_recipient_phone, p_payload, p_api_key_id, p_webhook_url, p_webhook_secret, p_idempotency_key)`: ACID-compliant outbox insert with api_key_id tracking. Replaces direct `whatsapp_outbox.insert()` in `notify/route.ts` (V-78) and `triggerWorkflow.ts` (V-77). v1 (no api_key_id param) is legacy — all callers use v2. SQL in `sql/b2b_evolution/37_insert_whatsapp_outbox_v2.sql`.
- `RPC Function: public.complete_whatsapp_action_v1(p_outbox_id, p_decision)`: Existing ACID-compliant RPC that atomically marks an outbox record COMPLETED and returns webhook config. Used by webhook/route.ts (V-71 fix).
- `Utility: verify-webhook.ts`: HMAC-SHA256 signature verification using native Web Crypto API. Validates `X-OpenWA-Signature` header. (V-54 extract)
- `Utility: resolve-outbox.ts`: Resolves tenant and outbox context from webhook payload body (`outboxId`, `pollMessageId`, `sender`). Returns complete context for decision routing. (V-54 extract)
- `Utility: insert-inbox.ts`: Inserts inbound message audit record via `insert_whatsapp_inbox_v1()` RPC. (V-54 extract)
- `Utility: decision-router.ts`: Open/Closed Principle registry of `DecisionHandler` implementations. Supports `canHandle()` / `process()` per handler. Handlers register via `router.register(handler)`. No if-else chains. Service contracts inject dependencies via constructor (DIP). (V-54 extract, resolves V-87 + V-85)
