'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BentoCard } from '@/components/BentoCard';
import { ExpenseList } from '@/components/ExpenseList';
import { useTenant } from '@/hooks/useTenant';
import { useTransactions } from '@/hooks/useTransactions';
import { useSync, ReceiptData } from '@/hooks/useSync';
import { calcTotals } from '@/lib/finance';
import { AuthScreen } from '@/components/AuthScreen';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { StatementScanner } from '@/components/StatementScanner';
import { ItemAnalytics } from '@/components/ItemAnalytics';
import { SpendingBreakdown, DailyTrend } from '@/components/FinanceCharts';
import { AIInsights } from '@/components/AIInsights';
import { WealthBuilder } from '@/components/WealthBuilder';
import { BudgetHealth } from '@/components/BudgetHealth';
import { FamilySpends } from '@/components/FamilySpends';
import { CommandCenter } from '@/components/CommandCenter';
import { MarketTrends } from '@/components/MarketTrends';
import { ManualEntryModal } from '@/components/ManualEntryModal';
import { MonthlyPerformance } from '@/components/MonthlyPerformance';

function DashboardContent() {
  const searchParams = useSearchParams();
  const { session, tenant, loading: hLoading, updateState, addCategory } = useTenant();
  const now = new Date();
  const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = searchParams.get('m') || currentMonthISO;
  
  // SOLID Split: Transactions for Read, Sync for Write
  const { transactions, loading: eLoading } = useTransactions(tenant?.tenant_id, selectedMonth);
  const { softDeleteTransaction, saveReceipt, addTransaction, updateTransaction } = useSync(tenant?.tenant_id);
  const [showScanner, setShowScanner] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [manualEntry, setManualEntry] = useState<any | null>(null);

  const selectedUser = searchParams.get('u') || (tenant ? Object.keys(tenant.names)[0] : null);
  const loading = hLoading || (tenant && eLoading);

  const handleSaveReceipt = async (data: ReceiptData, whoId?: string) => {
    const finalWhoId = whoId || selectedUser;
    if (!finalWhoId || !tenant) return;
    await saveReceipt(data, finalWhoId, tenant.names[finalWhoId]);
    setShowScanner(false);
  };

  const handleSaveStatement = async (newTransactions: any[], whoId: string, whoName: string) => {
    const payload = newTransactions.map(tx => ({
      ...tx,
      who_id: whoId,
      who: whoName,
      date: tx.date || new Date().toISOString().slice(0, 10),
    }));
    await addTransaction(payload);
  };

  const handleManualSave = async (entry: any) => {
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

  if (!tenant) return <AuthScreen session={session} />;

  // Filter transactions for current month components
  const displayTransactions = transactions.filter(t => t.date?.startsWith(selectedMonth));
  const totals = calcTotals(displayTransactions);
  const totalIncome = Object.values(tenant.income || {}).reduce((a: number, b: unknown) => a + Number(b), 0);
  const totalBudget = Object.values(tenant.budgets || {}).reduce((a: number, b: unknown) => a + Number(b), 0);
  const monthlySavingsGoal = tenant.goals?.monthly_savings || 500;

  if (Object.keys(tenant.names || {}).length === 0) {
    return (
      <main style={{ padding: '48px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <BentoCard colSpan={12} title="Welcome to Synculariti!">
          <div style={{ padding: '32px 0' }}>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>Let's set up your tenant</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
              It looks like you don't have any members in your tenant yet. 
              Before you can start tracking transactions, you need to add yourself (and anyone else) to the tenant.
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
      {/* Statement Scanner Modal */}
      {showStatement && (
        <StatementScanner
          names={tenant.names}
          categories={tenant.categories}
          selectedUser={selectedUser || Object.keys(tenant.names)[0]}
          onSave={handleSaveStatement}
          onClose={() => setShowStatement(false)}
        />
      )}

      {/* Manual Entry Modal */}
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
            {/* ROW 1: ACTION & PERFORMANCE */}
            <MonthlyPerformance transactions={transactions} selectedMonth={selectedMonth} colSpan={8} />
            <CommandCenter
              onScan={() => setShowScanner(true)}
              onManual={(prefill) => setManualEntry({ ...prefill, who_id: selectedUser })}
              onStatement={() => setShowStatement(true)}
            />

            {/* ROW 2: FAMILY & BUDGET */}
            <FamilySpends transactions={displayTransactions} names={tenant.names} colSpan={6} />
            <BudgetHealth spent={totals.spent} totalBudget={totalBudget} colSpan={6} />

            {/* ROW 3: STATUS & INTELLIGENCE */}
            <WealthBuilder income={totalIncome} spent={totals.spent} goal={monthlySavingsGoal} />
            <AIInsights 
              tenantId={tenant.tenant_id} 
              transactionCount={transactions.length} 
              dataHash={transactions.length + '_' + totals.spent.toFixed(0)}
              updateState={updateState} 
              tenant={tenant} 
            />

            {/* ROW 5: TRENDS & CONTEXT */}
            <BentoCard
              colSpan={4}
              title={`Total Spent (${selectedMonth})`}
              tooltip={{
                title: "Total Spent",
                explanation: "Sum of all non-Savings, non-Adjustment transactions for your tenant for the selected month.",
                formula: "Σ(amount) WHERE category ≠ 'Savings' AND is_deleted = false"
              }}
            >
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em' }}>
                €{totals.spent.toFixed(2)}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Spending for {selectedMonth}</p>
              <div style={{ marginTop: 20 }}><DailyTrend transactions={displayTransactions} /></div>
            </BentoCard>

            <MarketTrends transactions={transactions} selectedMonth={selectedMonth} colSpan={8} />

            {/* ROW 6: LIST & BREAKDOWN */}
            <BentoCard colSpan={8} rowSpan={2} title="All Transactions">
              <div className="scroll-area" style={{ maxHeight: 560 }}>
                <ExpenseList 
                   expenses={displayTransactions} 
                  onDelete={softDeleteTransaction} 
                  onEdit={(tx) => setManualEntry(tx)}
                />
              </div>
            </BentoCard>

            <BentoCard colSpan={4} title="Category Breakdown">
              <SpendingBreakdown transactions={displayTransactions} />
            </BentoCard>

            {/* ROW 7: DEEP ANALYTICS */}
            <BentoCard colSpan={12} title="Top Items (Deep Analytics)">
              <ItemAnalytics tenantId={tenant.tenant_id} />
            </BentoCard>

            {displayTransactions.length === 0 && (
              <BentoCard colSpan={12} title="Timeframe Status">
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🗓️</div>
                  <h3 style={{ fontSize: 20, marginBottom: 8 }}>No data for {selectedMonth}</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
                    There are no recorded transactions for this month. 
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
