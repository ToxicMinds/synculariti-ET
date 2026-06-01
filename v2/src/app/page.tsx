'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BentoCard } from '@/components/BentoCard';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { useTransactions } from '@/modules/finance/hooks/useTransactions';
import { useSync } from '@/modules/finance/hooks/useSync';
import { ReceiptData } from '@/modules/finance/hooks/useScannerState';
import { OrgAccessForm } from '@/components/OrgAccessForm';
import { ReceiptScanner } from '@/modules/finance/components/ReceiptScanner';
import { StatementScanner } from '@/modules/finance/components/StatementScanner';
import { ItemAnalytics } from '@/modules/finance/components/ItemAnalytics';
import { FoodCostVarianceCard } from '@/modules/finance/components/FoodCostVarianceCard';
import { NeedsAttentionCard } from '@/modules/finance/components/NeedsAttentionCard';
import { CommandCenter } from '@/modules/finance/components/CommandCenter';
import { MonthlyPerformance } from '@/modules/finance/components/MonthlyPerformance';
import { AIInsights } from '@/modules/finance/components/AIInsights';
import { ExpenseList } from '@/modules/finance/components/ExpenseList';
import { ManualEntryModal, ManualEntryPayload } from '@/modules/finance/components/ManualEntryModal';
import { ParsedTransaction } from '@/modules/finance/hooks/useStatementScanner';
import { useCategories } from '@/modules/finance/hooks/useCategories';
import { safeAmount } from '@/lib/utils';

function DashboardContent() {
  const searchParams = useSearchParams();
  const { session, tenant, loading: hLoading, updateState } = useTenant();
  const { addCategory } = useCategories();
  const now = new Date();
  const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = searchParams.get('m') || currentMonthISO;
  
  const { transactions, loading: eLoading } = useTransactions(tenant?.tenant_id, selectedMonth);
  const { softDeleteTransaction, saveReceipt, addTransaction, updateTransaction } = useSync(tenant?.tenant_id);
  const [showScanner, setShowScanner] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [manualEntry, setManualEntry] = useState<Partial<ManualEntryPayload> | null>(null);

  const selectedUser = searchParams.get('u') || (tenant ? Object.keys(tenant.names)[0] : null);
  const loading = hLoading || (tenant && eLoading);

  const handleSaveReceipt = async (data: ReceiptData, whoId: string) => {
    const finalWhoId = whoId || selectedUser;
    if (!finalWhoId || !tenant) return;
    await saveReceipt(data, finalWhoId, tenant.names[finalWhoId]);
    setShowScanner(false);
  };

  const handleSaveStatement = async (newTransactions: ParsedTransaction[], whoId: string, whoName: string) => {
    const payload = newTransactions.map(tx => ({
      ...tx,
      who_id: whoId,
      who: whoName,
      date: tx.date || new Date().toISOString().slice(0, 10),
    }));
    await addTransaction(payload);
  };

  const handleManualSave = async (entry: ManualEntryPayload) => {
    if (entry.id) {
      await updateTransaction(entry.id, entry);
    } else {
      await addTransaction(entry);
    }
    setManualEntry(null);
  };

  if (loading) return (
    <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div className="spinner-small" style={{ margin: '0 auto 12px' }} />
      <p style={{ fontSize: 14 }}>Loading your tenant data…</p>
    </div>
  );

  if (!tenant) return <OrgAccessForm session={session} />;

  const isDemo = transactions.length === 0;
  const demoTransactions = isDemo ? [
    { id: 'd1', amount: 450.00, category: 'Food Costs', who: 'System', date: selectedMonth + '-01', note: 'Demo: Bulk Produce' },
    { id: 'd2', amount: 1200.00, category: 'Labor & Wages', who: 'System', date: selectedMonth + '-05', note: 'Demo: Payroll' },
    { id: 'd3', amount: 200.00, category: 'Utilities', who: 'System', date: selectedMonth + '-10', note: 'Demo: Electricity' }
  ] : [];

  const activeTransactions = isDemo ? demoTransactions : transactions;
  const displayTransactions = activeTransactions.filter(t => t.date?.startsWith(selectedMonth));

  if (Object.keys(tenant.names || {}).length === 0) {
    return (
      <main style={{ padding: '48px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <BentoCard colSpan={12} title="Welcome to Synculariti!">
          <div style={{ padding: '32px 0' }}>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>Let's set up your tenant</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
              It looks like you don't have any members in your tenant yet.
            </p>
            <a href="/settings" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: 16, textDecoration: 'none', display: 'inline-block' }}>
              Go to Settings →
            </a>
          </div>
        </BentoCard>
      </main>
    );
  }

  return (
    <main>
      {showStatement && (
        <StatementScanner
          names={tenant.names}
          categories={tenant.categories}
          selectedUser={selectedUser || Object.keys(tenant.names)[0]}
          onSave={handleSaveStatement}
          onClose={() => setShowStatement(false)}
        />
      )}

      {manualEntry !== null && (
        <ManualEntryModal
          prefill={manualEntry}
          tenant={tenant}
          selectedUser={selectedUser || Object.keys(tenant.names)[0]}
          onSave={handleManualSave}
          onAddCategory={addCategory}
          onClose={() => setManualEntry(null)}
        />
      )}

      <NeedsAttentionCard tenantId={tenant.tenant_id} selectedMonth={selectedMonth} />

      <div className="bento-grid">
        {showScanner ? (
          <div style={{ gridColumn: 'span 12' }}>
            <ReceiptScanner 
              onSave={handleSaveReceipt} 
              onAddCategory={addCategory}
              categories={tenant.categories}
              names={tenant.names}
            />
            <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowScanner(false)}>
              ← Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            {isDemo && (
              <div style={{ gridColumn: 'span 12', padding: '12px 24px', borderRadius: 16, background: 'var(--bg-hover)', border: '1px solid var(--border-color)', marginBottom: -16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Demo Mode Active:</strong> Sample operating data for {selectedMonth}.
                  Scan your first invoice to replace this.
                </p>
              </div>
            )}

            {/* ROW 1: DIAGNOSTICS + ACTION */}
            <FoodCostVarianceCard selectedMonth={selectedMonth} colSpan={8} />
            <CommandCenter
              onScan={() => setShowScanner(true)}
              onManual={(prefill) => setManualEntry({ ...prefill, who_id: selectedUser || undefined })}
              onStatement={() => setShowStatement(true)}
            />

            {/* ROW 2: SPEND COMPARISON + TOP ITEMS */}
            <MonthlyPerformance transactions={activeTransactions} selectedMonth={selectedMonth} colSpan={8} />
            <BentoCard colSpan={4} title="Top Purchased Items">
              <ItemAnalytics tenantId={tenant.tenant_id} selectedMonth={selectedMonth} isDemo={isDemo} />
            </BentoCard>

            {/* ROW 3: GRAPH INTELLIGENCE */}
            <AIInsights
              tenantId={tenant.tenant_id}
              transactionCount={transactions.length}
              dataHash={transactions.length + '_' + displayTransactions.reduce((s, t) => s + safeAmount(t.amount), 0).toFixed(0)}
              updateState={updateState}
              tenant={tenant}
              isDemo={isDemo}
            />

            {/* ROW 4: ALL TRANSACTIONS */}
            <BentoCard colSpan={12} rowSpan={2} title="All Transactions">
              <div className="scroll-area" style={{ maxHeight: 560 }}>
                <ExpenseList 
                  transactions={displayTransactions} 
                  onDelete={softDeleteTransaction} 
                  onEdit={(tx) => setManualEntry({ ...tx, amount: safeAmount(tx.amount) })}
                />
              </div>
            </BentoCard>

            {displayTransactions.length === 0 && (
              <BentoCard colSpan={12} title="Timeframe Status">
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🗓️</div>
                  <h3 style={{ fontSize: 20, marginBottom: 8 }}>No data for {selectedMonth}</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
                    Scan a receipt or add a manual entry to start tracking your {selectedMonth} spending.
                  </p>
                </div>
              </BentoCard>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
