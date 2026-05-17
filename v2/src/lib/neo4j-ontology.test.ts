import { Session, ManagedTransaction } from 'neo4j-driver';
import { neo4jBulkMerge, processOutboxSync } from './neo4j';
import { TransactionSyncPayload } from './types';

// 1. Mock the Logger to keep stdout clean
jest.mock('./logger', () => ({
  Logger: {
    system: jest.fn(),
    user: jest.fn(),
  },
}));

// 2. Mock the Neo4j Driver, Session, and ManagedTransaction
const mockRun = jest.fn();
const mockExecuteWrite = jest.fn();
const mockSession = {
  executeWrite: mockExecuteWrite,
  close: jest.fn(),
} as unknown as Session;

describe('B2B Graph Ontology Sync (Phase 2 - RED Contracts)', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockExecuteWrite.mockReset();
    // Default implementation to simulate Neo4j session executeWrite
    mockExecuteWrite.mockImplementation(async (callback: (tx: ManagedTransaction) => Promise<unknown>) => {
      const mockTx = { run: mockRun } as unknown as ManagedTransaction;
      return callback(mockTx);
    });
  });

  const mockBatchPayload = (size: number): TransactionSyncPayload[] => {
    return Array.from({ length: size }, (_, i) => ({
      txId: `tx-${i}`,
      tenantId: `tenant-abc`,
      amount: 100 + i,
      date: '2026-05-17',
      vendorName: 'Metro Cash & Carry SR',
      merchantId: 'merchant-metro-id',
      items: [
        {
          itemId: `item-${i}-1`,
          itemName: 'Mlieko 1L',
          itemAmount: 1.5,
          itemCategory: 'Dairy',
          skuId: `sku-mlieko-metro-hash`,
          currency: 'EUR',
          canonicalIngredientId: 'ing-milk-hash',
          canonicalName: 'Milk 1L',
          baseUnit: 'L',
          perishability: 7,
        },
        {
          itemId: `item-${i}-2`,
          itemName: 'Maslo 250g',
          itemAmount: 2.9,
          itemCategory: 'Dairy',
          skuId: `sku-maslo-metro-hash`,
          currency: 'EUR',
          canonicalIngredientId: 'ing-butter-hash',
          canonicalName: 'Butter 250g',
          baseUnit: 'g',
          perishability: 21,
        }
      ],
    }));
  };

  it('CONTRACT #1: processOutboxSync correctly chunks large arrays using clean flat-memory cursor sliding', async () => {
    const hugePayload = mockBatchPayload(1500); // 1500 items to force chunking
    
    // We expect processOutboxSync to divide this 1500 array into 3 chunks of 500, calling neo4jBulkMerge 3 times
    const processedCount = await processOutboxSync(hugePayload, mockSession);

    expect(processedCount).toBe(1500);
    expect(mockExecuteWrite).toHaveBeenCalledTimes(3); // EXACTLY 3 chunks of 500
  });

  it('CONTRACT #2: neo4jBulkMerge executes the highly optimized 3-Phase Lock-Safe Cypher Query', async () => {
    const payload = mockBatchPayload(5);
    
    await neo4jBulkMerge(payload, mockSession);

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
    
    // Assert Phase 1: Ingest parent entities
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('Phase 1: Ingest and isolate all Parent entities'),
      expect.objectContaining({ batch: payload })
    );

    // Assert Phase 2: Deduplicate Ingredient nodes (Eager Aggregation)
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('WITH DISTINCT item.canonicalIngredientId AS ingId, item'),
      expect.objectContaining({ batch: payload })
    );

    // Assert Phase 3: Construct SKUs and relationships
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('Phase 3: Construct SKUs and relationships using clean context'),
      expect.objectContaining({ batch: payload })
    );
  });

  it('CONTRACT #3: Sourced currency is fetched directly from item layover inside Phase 3 query context', async () => {
    const payload = mockBatchPayload(1);
    
    await neo4jBulkMerge(payload, mockSession);

    // Cypher query must explicitly set sku.currency from the unwound item layover currency
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('sku.currency = item.currency'),
      expect.any(Object)
    );
  });

  it('CONTRACT #4: Self-heals by running MERGE on parent transactions before merging SKUs and ingredients', async () => {
    const payload = mockBatchPayload(1);

    await neo4jBulkMerge(payload, mockSession);

    // Assert self-healing and index lookup calls
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (t:Transaction {id: txData.txId})'),
      expect.any(Object)
    );
  });
});
