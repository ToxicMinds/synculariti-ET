'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BentoCard } from '@/components/BentoCard';
import { ExpenseList } from '@/components/ExpenseList';
import { useHousehold } from '@/hooks/useHousehold';
import { useExpenses, ReceiptData } from '@/hooks/useExpenses';
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

function DashboardContent() {
  const searchParams = useSearchParams();
  const { session, household, loading: hLoading, updateState } = useHousehold();
  const { expenses, loading: eLoading, softDeleteExpense, saveReceipt, addExpense, updateExpense } = useExpenses(household?.household_id);
  const [showScanner, setShowScanner] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [manualEntry, setManualEntry] = useState<any | null>(null);

  const selectedUser = searchParams.get('u') || (household ? Object.keys(household.names)[0] : null);
  const loading = hLoading || (household && eLoading);

  const handleSaveReceipt = async (data: ReceiptData) => {
    if (!selectedUser || !household) return;
    await saveReceipt(data, selectedUser, household.names[selectedUser]);
    setShowScanner(false);
  };

  const handleSaveStatement = async (transactions: any[], whoId: string, whoName: string) => {
    const payload = transactions.map(tx => ({
      ...tx,
      who_id: whoId,
      who: whoName,
      date: tx.date || new Date().toISOString().slice(0, 10),
    }));
    await addExpense(payload);
  };

  const handleManualSave = async (entry: any) => {
    if (entry.id) {
      await updateExpense(entry.id, entry);
    } else {
      await addExpense(entry);
    }
    setManualEntry(null);
  };

  if (loading) return (
    <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div className="spinner-small" style={{ margin: '0 auto 12px' }} />
      <p style={{ fontSize: 14 }}>Loading your household data…</p>
    </div>
  );

  if (!household) return <AuthScreen session={session} />;

  const totals = calcTotals(expenses);
  const totalIncome = Object.values(household.income || {}).reduce((a: number, b: unknown) => a + Number(b), 0);
  const totalBudget = Object.values(household.budgets || {}).reduce((a: number, b: unknown) => a + Number(b), 0);
  const monthlySavingsGoal = household.goals?.monthly_savings || 500;

  if (Object.keys(household.names || {}).length === 0) {
    return (
      <main style={{ padding: '48px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <BentoCard colSpan={12} title="Welcome to Synculariti!">
          <div style={{ padding: '32px 0' }}>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>Let's set up your household</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
              It looks like you don't have any members in your household yet. 
              Before you can start tracking expenses, you need to add yourself (and anyone else) to the household.
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
          names={household.names}
          selectedUser={selectedUser || Object.keys(household.names)[0]}
          onSave={handleSaveStatement}
          onClose={() => setShowStatement(false)}
        />
      )}

      {/* Manual Entry Modal */}
      {manualEntry !== null && (
        <ManualEntryModal
          prefill={manualEntry}
          household={household}
          selectedUser={selectedUser || Object.keys(household.names)[0]}
          onSave={handleManualSave}
          onClose={() => setManualEntry(null)}
        />
      )}

      <div className="bento-grid">
        {showScanner ? (
          <div style={{ gridColumn: 'span 12' }}>
            <ReceiptScanner onSave={handleSaveReceipt} />
            <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowScanner(false)}>
              ← Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            {/* ROW 1: Brains + Command */}
            <AIInsights householdId={household.household_id} expenseCount={expenses.length} updateState={updateState} household={household} />
            <CommandCenter
              onScan={() => setShowScanner(true)}
              onManual={(prefill) => setManualEntry({ ...prefill, who_id: selectedUser })}
              onStatement={() => setShowStatement(true)}
            />

            {/* ROW 2: Financial Foundation */}
            <WealthBuilder income={totalIncome} spent={totals.spent} goal={monthlySavingsGoal} />
            <BudgetHealth spent={totals.spent} totalBudget={totalBudget} />
            <FamilySpends expenses={expenses} names={household.names} />

            {/* ROW 3: Trends & Overview */}
            <BentoCard
              colSpan={4}
              title="Total Spent"
              tooltip={{
                title: "Total Spent",
                explanation: "Sum of all non-Savings, non-Adjustment expenses for your household over the last 4 months.",
                formula: "Σ(amount) WHERE category ≠ 'Savings' AND is_deleted = false"
              }}
            >
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em' }}>
                €{totals.spent.toFixed(2)}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Variable spending (4 months)</p>
              <div style={{ marginTop: 20 }}><DailyTrend expenses={expenses} /></div>
            </BentoCard>

            <MarketTrends expenses={expenses} />

            {/* ROW 4: Expense List + Categories */}
            <BentoCard colSpan={8} rowSpan={2} title="All Expenses">
              <div className="scroll-area" style={{ maxHeight: 560 }}>
                <ExpenseList 
                  expenses={expenses} 
                  onDelete={softDeleteExpense} 
                  onEdit={(exp) => setManualEntry(exp)}
                />
              </div>
            </BentoCard>

            <BentoCard colSpan={4} title="Category Breakdown">
              <SpendingBreakdown expenses={expenses} />
            </BentoCard>

            {/* ROW 5: Deep Analytics */}
            <BentoCard colSpan={12} title="Top Items (Deep Analytics)">
              <ItemAnalytics householdId={household.household_id} />
            </BentoCard>
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
