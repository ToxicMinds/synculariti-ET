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
- `function useCamera()`: Hardware-isolated headless hook managing MediaStream lifecycle, client-side compression, and idempotency hashing.
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
- `function processScannerInput(input, categories?, timeoutMs?)`: Unified entry point in `scanner-client.ts`. Routes string → eKasa QR, File → AI Vision. Returns `ScannerResult`. Manages idempotency (SHA-256 cache), timeout (15s AbortController), offline queue fallback, image preprocessing, eKasa enrichment, and confidence scoring.
- `type ScannerResult`: `{ status: 'SUCCESS' | 'ERROR' | 'QUEUED', source: 'EKASA' | 'AI_VISION' | 'MANUAL' | 'OFFLINE_QUEUE', cacheKey?: string, data?: ReceiptData, error?: string }`. Returned by `processScannerInput()`.
- `function clearScannerCache()`: Clears the in-memory idempotency `resultCache` map (used in tests).
- `function preprocessImage(imageDataUrl, signal)`: Client-side call to `POST /api/ai/preprocess-image`. Returns preprocessed WebP data URL, falls back to original on failure. (scanner-client.ts)
- `Scanner service: src/lib/scanner-client.ts`: Stateless service with SHA-256 idempotency cache, AbortController 15s timeout, offline queue integration, eKasa→parse-receipt enrichment wiring, and two-button→one-pipeline UI architecture.
- `function preprocessImageWithSharp(imageDataUrl)`: Server-side sharp pipeline in `image-preprocessor.ts`. Resizes to max 2000px, transcodes to WebP quality 80. Returns `{ image, width, height, originalSize, compressedSize, originalFormat }`.
- `API Route: POST /api/ai/preprocess-image`: Serverless endpoint accepting `{ image: dataUrl }`, runs `preprocessImageWithSharp()`, returns compressed WebP data URL. Logs compression ratio via ServerLogger.
- `interface ReceiptScannerProps`: Props interface for the `ReceiptScanner` component: `{ onSave, onAddCategory?, categories?, names? }`.
- `type ScannerStep`: `'scan' | 'processing' | 'review'` — step state for `useScannerState`.
- `interface UseScannerStateReturn`: Contract for useScannerState: `{ step, receipt, payerId, isProcessing, isSaving, isVerified, error, setPayerId, updateReceiptItem, process, confirmAndSave, reset }`.
- `function useScannerState()`: Simplified hook in `modules/finance/hooks/useScannerState.ts`. Single `process(input: string | File)` method routes internally via `processScannerInput()`. State-only — no intelligence logic.
- `function calcBudgetStatus()`: Calculates budget vs. actual spend variance.
- `function calcCategoryTotals()`: Aggregates transaction totals grouped by category.
- `function calcForecast()`: Predicts end-of-month spend based on current burn rate.
- `function calcMonthDelta()`: Calculates the financial difference between current and previous months.
- `function calcNetSavings()`: Computes total net savings (income minus expenses).
- `function calcOperatingMargin()`: Calculates a mathematically sound B2B Operating Margin against benchmarks.
- `function calcPerUserSpend()`: Computes spending distribution across team members.
- `function calcTimeBoundForecast()`: Calculates a time-aware velocity projection forecast with zero budget safety constraints.
- `function calcTotals()`: Calculates absolute aggregate transaction totals.
- `function isAdjustment()`: Utility to flag balance-adjustment transactions.
- `function isSavings()`: Utility to flag savings-related transactions.
- `function normalizeUserId()`: Normalizes user IDs, casting light mock IDs (like 'u2') to mock UUIDs.
- `interface Transaction`: Core ledger entity representing a financial event. Includes strict `created_at` and `updated_at` audit trails.
- `type Expense`: Legacy alias for Transaction (deprecated in V2).

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
- `interface Finding`: Structured insight finding with `type`, `title`, `description`, `impact`, and `data` fields. Returned by all 3 analytical query classes. (lib/insight-queries.ts)
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
- `function useWhatsAppNotifier()`: Headless React hook for dispatching outbound notifications via Edge API.
- `function useWhatsAppSession()`: Headless React hook for tracking sidecar gateway session status.
- `API Route: POST /api/whatsapp/notify`: Edge-runtime API for queuing Outbox delivery to WhatsApp. Uses `WashedPayload` Zod transform for nullable metadata normalization. Authenticates via `X-Api-Key` against `api_keys` table (service-role client). Supports per-tenant keys (auto-resolve tenant) and service-level keys (require `tenant_id` + `source` in body). Injects `source` into payload metadata for audit trail. **This is the ONLY integration point for IMS** to send WhatsApp messages.
- `API Route: POST /api/whatsapp/webhook`: Edge-runtime API for receiving HMAC-verified inbound messages. Resolves outbox context via `body.outboxId` (action-link bridge), `body.pollMessageId` (native WhatsApp poll), or `body.sender` (fallback). Automatically routes decisions to the correct service based on outbox payload metadata: `poId` → DefaultPOApprovalService, `transactionId` → DefaultFinanceAuditService, `amount+locationId` → DefaultPOSDiscrepancyService. Marks outbox records as `COMPLETED` after successful processing.
- `API Route: GET /api/whatsapp/session`: Edge-runtime API for checking gateway session connection state.
- `function processOutboxQueue(supabase, client, baseUrl, records?)`: Shared queue processor in `modules/whatsapp/lib/processOutboxQueue.ts`. Used by BOTH the DB webhook route and the GCP crontab safety net. Claims PENDING/FAILED records, delivers via OpenWAClient (fallback: action link text message for poll payloads since sidecar lacks `/api/sendPoll`), updates status to SENT/FAILED.
- `API Route: POST /api/whatsapp/process-outbox`: **Serverless** (Node.js) runtime — receives Supabase Database Webhook on INSERT to whatsapp_outbox. Calls processOutboxQueue() with the single record. Primary delivery path. Must NOT be Edge runtime because it `fetch()`s the sidecar at a raw IP address.
- `API Route: GET /api/cron/process-outbox`: **Serverless** (Node.js) runtime — GCP Crontab target (every 60s). Authenticates via `x-cron-secret` header matching `CRON_SECRET` env var (not spoofable `x-vercel-cron`). Calls processOutboxQueue() with no records (claims batch via `claim_whatsapp_outbox_batch` RPC). Safety net path.
- `RPC Function: public.claim_whatsapp_outbox_batch(p_batch_size)`: Atomic batch claim with `FOR UPDATE SKIP LOCKED`. Transitions PENDING/FAILED → PROCESSING. Includes retry backoff (max 5 retries). Granted `EXECUTE TO service_role` only.
- `RPC Function: public.complete_whatsapp_action_v1(p_outbox_id, p_decision)`: Atomic action completion. Marks COMPLETED and returns webhook_url + webhook_secret + payload in a single transaction. Fixes ACID V-49 split-brain. **Uses table alias `wo.` in RETURNING clause to avoid ambiguity with RETURNS TABLE output column `status`.** Granted `EXECUTE TO authenticated` only.
- `Server Action: dispatchDecision()`: Next.js server action that completes interactive actions, signs votes with HMAC-SHA256, and dispatches them back to target webhooks. Uses `complete_whatsapp_action_v1()` RPC for atomic status update. Uses `getAll()`/`setAll()` Supabase SSR cookie API (NOT legacy `get()`/`set()`/`remove()`).
- `Server Action: notifyLargeInvoice()`: Triggers WhatsApp notification for invoices exceeding configurable threshold. Writes to `whatsapp_outbox` directly rather than calling the sidecar directly.
- `Route Page: /action/[actionId]`: Dynamic App Router page that loads context and renders the web-bridge interactive interface for WhatsApp action links. Generates OG meta tags for WhatsApp link previews.
- `Component: ActionClient`: Client component implementing user selection buttons, loading states, and submitting decisions to the server action.
- `interface POApprovalService`: Service contract for handling Purchase Order approval decisions from WhatsApp/web.
- `class DefaultPOApprovalService`: Implementation of POApprovalService mapping Approve/Reject/Modify decisions to receive_purchase_order_v1 RPC and table mutations.
- `interface FinanceAuditService`: Service contract for processing audit anomaly decisions (Approve Anyway, Request Re-upload, Reject Expense).
- `class DefaultFinanceAuditService`: Implementation of FinanceAuditService. Accepts optional `supabaseClient` constructor param (defaults to browser client, pass service-role client to bypass RLS in API/script context).
- `interface POSDiscrepancyService`: Service contract for resolving POS cash discrepancy actions (Log as Shrinkage, Recount Required, Deduct from Register).
- `class DefaultPOSDiscrepancyService`: Implementation of POSDiscrepancyService logging ledger adjustments via add_transaction_v3 RPC. Accepts optional `supabaseClient` constructor param.
- `Script: trigger_workflow.ts`: CLI development utility for queueing test WhatsApp workflows. Usage: `npx tsx src/scripts/trigger_workflow.ts <po|audit|pos> [phone_number]`. Creates real DB entities (POs, transactions, discrepancies) and inserts outbox records for end-to-end testing without a live UI flow.
- `interface WorkflowConfig`: Per-workflow configuration shape in `tenants.config.workflows`. Fields: `enabled: boolean`, `threshold?: number` (bill_approval), `threshold_pct?: number` (low_stock_alert), `time?: string` (daily_summary), `recipients: ('owner'|'manager')[]`. (modules/whatsapp/types.ts)
- `type WorkflowKey`: Union type `'bill_approval' | 'low_stock_alert' | 'daily_summary'` identifying supported automated workflows. (modules/whatsapp/types.ts)
- `interface WorkflowsConfig`: Map of `WorkflowKey` to `WorkflowConfig`. (modules/whatsapp/types.ts)
- `interface TriggerParams`: Input to `triggerWorkflow()`: `{ tenantId, workflowKey, amount?, stockLevel?, metadata }`. (modules/whatsapp/types.ts)
- `interface TriggerResult`: Return from `triggerWorkflow()`: `{ fired: boolean, reason?: string, outboxIds: string[] }`. (modules/whatsapp/types.ts)
- `interface TenantConfig`: Top-level type for `tenants.config` JSONB: `{ phones?: Record<string, string>, workflows?: WorkflowsConfig }`. (modules/whatsapp/types.ts)
- `function triggerWorkflow(supabase, params)`: **ET-internal utility only**. Reads `tenants.config.workflows`, checks thresholds, and queues `whatsapp_outbox` records via `service_role` client. No SSR/cookie dependency. IMS must NOT call this — uses `POST /api/whatsapp/notify` instead. (modules/whatsapp/lib/triggerWorkflow.ts)
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

## Food Cost Variance Pipeline
- `Table: public.pos_transaction_staging`: Staging table for unverified POS data from IMS. Carries `flag` (PENDING/APPROVED/QUARANTINED), `anomaly_score`, `anomaly_reason`. Quarantined rows visible in `v_quarantine_audit`.
- `Table: public.pos_batch_uploads`: Metadata per IMS POS data pull. Tracks status (STAGED/PROCESSING/COMPLETED/FAILED), receipt counts, period covered.
- `Table: public.pos_data_gaps`: Tracks calendar days without POS data. Detected by comparing IMS API responses against expected days. Triggers WhatsApp alert after 12h.
- `Table: public.cached_recipes`: Local cache of IMS recipe data. Menu item → ingredient composition in grams.
- `RPC Function: public.process_batch_v1(p_batch_id)`: Iterates staging rows, computes Z-scores against 90-day rolling baseline per item_sku, flags outliers as QUARANTINED. Auto-approves when baseline < 5 samples.
- `View: public.v_quarantine_audit`: Human-readable view of all QUARANTINED rows across all batches. Used by operators to review and manually override.
- `Neo4j Node: :Sale`: Represents a POS sale receipt. Properties: id, tenant_id, transaction_time, receipt_number, till_id, total_revenue, is_void, is_comp.
- `Neo4j Node: :ConsumptionEstimate`: Represents theoretical ingredient consumption derived from POS sales × recipes. Properties: id, tenant_id, grams_consumed, cost_at_latest_price. Linked to `:Sale` via `[:ESTIMATES]` and to `:Ingredient` via `[:OF_INGREDIENT]`.
- `Neo4j Relationship: [:ESTIMATES]`: Links a `:Sale` to its `:ConsumptionEstimate` nodes.
- `Neo4j Relationship: [:OF_INGREDIENT]`: Links a `:ConsumptionEstimate` to the `:Ingredient` it consumed.
- `function syncSalesWithConsumption(sales, tx)`: Neo4j sync function (Phase 4) that creates `:Sale` and `:ConsumptionEstimate` nodes after the existing 3-phase bulk merge. (lib/neo4j-temporal.ts, to be built)
- `function generateFoodCostVarianceReport(tenantId, startDate, endDate)`: Generates the Food Cost Variance Report by querying Neo4j for Revenue (Sale), Theoretical COGS (ConsumptionEstimate × cost), and Actual Spend (Transaction). Returns `FoodCostVarianceReport` interface. (lib/food-cost-variance.ts, to be built)
- `interface FoodCostVarianceReport`: Full report shape: `{ period, dataCoverage, headline: { totalRevenue, theoreticalCOGS, actualSpend, gap, gapPct, confidenceBands, direction }, topIngredients, weeklyTrend, varianceSpikes, recommendation }`.
- `API Route: GET /api/analytics/food-cost-variance`: Returns the Food Cost Variance Report for the authenticated tenant's selected period. Cached server-side for 1 hour.

## Shared Utilities
- `function getErrorMessage(e: unknown): string`: Single error-to-string function used across the entire codebase. Defined in `src/lib/utils.ts`. Replaces 30+ inline `e instanceof Error ? e.message : String(e)` duplications. Also exported from `@synculariti/whatsapp-client` but ET-internal code must use `@/lib/utils`.
- `function formatCurrency(amount: number, currency = 'EUR'): string`: Locale-aware currency formatting (`sk-SK` locale, EUR default). Defined in `src/lib/utils.ts`.

## WhatsApp Types
- `interface OutboxRecord`: Full type for `whatsapp_outbox` rows. Properties: `id`, `tenant_id`, `recipient_phone`, `payload` (`{ type: 'text' | 'poll', text?, name?, options?, metadata? }`), `webhook_url?`. Exported from `src/modules/whatsapp/types.ts`.

## Database RPCs
- `RPC Function: public.insert_whatsapp_inbox_v1(p_tenant_id, p_outbox_id, p_sender_phone, p_message_id, p_message_type, p_content)`: ACID-compliant inbox insert with `updated_at` propagation. Replaces direct `whatsapp_inbox.insert()` in webhook/route.ts (V-71 fix). SQL in `sql/b2b_evolution/32_insert_whatsapp_inbox_v1.sql`.
- `RPC Function: public.complete_whatsapp_action_v1(p_outbox_id, p_decision)`: Existing ACID-compliant RPC that atomically marks an outbox record COMPLETED and returns webhook config. Used by webhook/route.ts (V-71 fix).
