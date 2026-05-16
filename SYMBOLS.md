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
- `function useScannerState()`: Headless hook managing ReceiptScanner UI state and AI/eKasa extraction pipelines.
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
- `interface ReceiptData`: Canonical payload for scanned receipt data (in useTransactionSync). Extended by useScannerState with a `source` field.
- `interface ReceiptItem`: Canonical line item for a receipt (in useTransactionSync). Optional category during scan, required at save time.
- `function calcBudgetStatus()`: Calculates budget vs. actual spend variance.
- `function calcCategoryTotals()`: Aggregates transaction totals grouped by category.
- `function calcForecast()`: Predicts end-of-month spend based on current burn rate.
- `function calcMonthDelta()`: Calculates the financial difference between current and previous months.
- `function calcNetSavings()`: Computes total net savings (income minus expenses).
- `function calcPerUserSpend()`: Computes spending distribution across team members.
- `function calcTotals()`: Calculates absolute aggregate transaction totals.
- `function isAdjustment()`: Utility to flag balance-adjustment transactions.
- `function isSavings()`: Utility to flag savings-related transactions.
- `interface Transaction`: Core ledger entity representing a financial event.
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
- `function neo4jBulkMerge()`: Unified utility for atomic, sequential transaction syncing to the graph.
- `function neo4jDeleteTransaction()`: Removes a transaction node and its relationships from the graph.
- `interface LockManager`: Definition for the Web Locks API (in v2/src/types/web-locks.d.ts).
- `class OfflineQueue`: Core manager for PWA offline-first mutation resilience.
- `interface QueuedMutation`: Represents a stalled mutation awaiting network recovery.
- `function applySmartRules()`: Engine for auto-categorization based on historical rules.
- `interface SmartRule`: Pattern-matching rule for automatic merchant categorization.
- `const supabase`: Shared Supabase client instance.
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
