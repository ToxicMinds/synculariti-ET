'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BentoCard } from '@/components/BentoCard';
import { ExpenseList } from '@/components/ExpenseList';
import { useHousehold } from '@/hooks/useHousehold';
import { useExpenses, ReceiptData } from '@/hooks/useExpenses';
import { calcTotals, calcPerUserSpend } from '@/lib/finance';
import { AuthScreen } from '@/components/AuthScreen';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { ItemAnalytics } from '@/components/ItemAnalytics';
import { SpendingBreakdown, DailyTrend } from '@/components/FinanceCharts';
import { AIInsights } from '@/components/AIInsights';
import { WealthBuilder } from '@/components/WealthBuilder';
import { BudgetHealth } from '@/components/BudgetHealth';
import { FamilySpends } from '@/components/FamilySpends';
import { CommandCenter } from '@/components/CommandCenter';
import { MarketTrends } from '@/components/MarketTrends';

function DashboardContent() {
  const searchParams = useSearchParams();
  const { session, household, loading: hLoading } = useHousehold();
  const { expenses, loading: eLoading, softDeleteExpense, saveReceipt } = useExpenses(household?.household_id);
  const [showScanner, setShowScanner] = useState(false);

  const selectedUser = searchParams.get('u') || (household ? Object.keys(household.names)[0] : null);
  const loading = hLoading || (household && eLoading);

  const handleSaveReceipt = async (data: ReceiptData) => {
    if (!selectedUser || !household) return;
    try {
      await saveReceipt(data, selectedUser, household.names[selectedUser]);
      setShowScanner(false);
    } catch (e) {
      alert("Failed to save receipt: " + (e as Error).message);
    }
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

  return (
    <main>
      <div className="bento-grid">
        {showScanner ? (
          <>
            <div style={{ gridColumn: 'span 12' }}>
              <ReceiptScanner onSave={handleSaveReceipt} />
              <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowScanner(false)}>
                ← Back to Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ROW 1: Brains + Hands */}
            <AIInsights householdId={household.household_id} />
            <CommandCenter onScan={() => setShowScanner(true)} onManual={(item) => alert("Opening entry for: " + item)} />

            {/* ROW 2: Financial Foundation with "i" Tooltips */}
            <WealthBuilder income={totalIncome} spent={totals.spent} goal={monthlySavingsGoal} />
            <BudgetHealth spent={totals.spent} totalBudget={totalBudget} />
            <FamilySpends expenses={expenses} names={household.names} />

            {/* ROW 3: Overview + Trends */}
            <BentoCard
              colSpan={4}
              title="Total Spent"
              tooltip={{
                title: "Total Spent",
                explanation: "The sum of all non-Savings, non-Adjustment expenses for your household in the last 4 months. 'Savings' and 'Adjustment' category entries are excluded from this number.",
                formula: "Total Spent = Σ(expenses) WHERE category ≠ 'Savings' AND category ≠ 'Adjustment' AND is_deleted = false"
              }}
            >
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                €{totals.spent.toFixed(2)}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>This month's variable spending</p>
              <div style={{ marginTop: 20 }}><DailyTrend expenses={expenses} /></div>
            </BentoCard>

            <MarketTrends expenses={expenses} />

            {/* ROW 4: Expense List + Categories */}
            <BentoCard colSpan={8} rowSpan={2} title="Recent Expenses">
              <div className="scroll-area" style={{ maxHeight: 560 }}>
                <ExpenseList expenses={expenses} onDelete={softDeleteExpense} />
              </div>
            </BentoCard>

            <BentoCard colSpan={4} title="Categories">
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
