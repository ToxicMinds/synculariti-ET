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
- `function useReceiptProcessor()`: Headless intelligence pipeline for receipt parsing (eKasa + AI). Enforces offline resilience and idempotency.
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
- `interface ReceiptItem`: Canonical line item for a receipt (in useTransactionSync). Optional category during scan, required at save time.
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
- `API Route: GET /api/debug/sync-neo4j`: Manually triggers outbox processing for the current authenticated tenant's pending graph sync queue.
- `API Route: GET /api/debug/backfill-neo4j`: Manually rebuilds and backfills the entire Neo4j graph from historical Postgres ledgers for the current tenant.
- `interface Ingredient`: Defines a canonical, deduplicated ingredient category in the restaurant graph ontology.
- `interface MerchantSKU`: Defines a merchant-specific, compound-hashed store item linked to a parent Ingredient.
- `interface ReceiptItemSyncPayload`: Canonical interface for receipt line items during background outbox replication.
- `interface TransactionSyncPayload`: Canonical interface for transactional outbox replication payloads.
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
- `Table: public.api_keys`: Secure storage for third-party integration tokens mapped to tenants.
- `Table: public.whatsapp_outbox`: Audit ledger (Who, What, When) for outbound messaging events.
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
- `function getErrorMessage()`: Type-safe utility to parse and format unknown caught errors safely without using `any`.
- `function useWhatsAppNotifier()`: Headless React hook for dispatching outbound notifications via Edge API.
- `function useWhatsAppSession()`: Headless React hook for tracking sidecar gateway session status.
- `API Route: POST /api/whatsapp/notify`: Edge-runtime API for queuing Outbox delivery to WhatsApp.
- `API Route: POST /api/whatsapp/webhook`: Edge-runtime API for receiving HMAC-verified inbound messages.
- `API Route: GET /api/whatsapp/session`: Edge-runtime API for checking gateway session connection state.
- `Edge Function: processOutboxEvent`: Supabase Edge Function handler that listens to database webhooks for `whatsapp_outbox` inserts and pushes them to the Sidecar VM via OpenWAClient.

