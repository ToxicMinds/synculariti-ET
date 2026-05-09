'use client';

import { useTenant } from '@/hooks/useTenant';
import { useLogistics } from '@/hooks/useLogistics';
import { BentoCard } from '@/components/BentoCard';
import { AuthScreen } from '@/components/AuthScreen';
import { Suspense, useState } from 'react';
import { ItemCatalog } from '@/components/ItemCatalog';
import { NewItemModal } from '@/components/NewItemModal';

function LogisticsDashboard() {
  const { session, tenant, loading: hLoading } = useTenant();
  const { items, categories, stock, loading: lLoading, addItem } = useLogistics(tenant?.tenant_id);
  const [showNewItem, setShowNewItem] = useState(false);

  const loading = hLoading || lLoading;

  if (loading) return (
    <div className="flex-center" style={{ padding: 64 }}>
      <div className="spinner-small" />
    </div>
  );

  if (!tenant) return <AuthScreen session={session} />;

  return (
    <main>
      {showNewItem && (
        <NewItemModal 
          categories={categories} 
          onClose={() => setShowNewItem(false)} 
          onSave={addItem} 
        />
      )}

      <header className="flex-between" style={{ padding: '24px 0' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: 28, fontWeight: 800 }}>Logistics & Inventory</h1>
          <p className="card-subtitle">Manage catalog, stock levels, and procurement.</p>
        </div>
        <div className="flex-row gap-2">
          <button className="btn btn-primary" onClick={() => setShowNewItem(true)}>➕ New Item</button>
          <button className="btn btn-secondary">📦 Create PO</button>
        </div>
      </header>

      <div className="bento-grid">
        {/* Item Catalog */}
        <ItemCatalog 
          items={items} 
          categories={categories} 
          onAddItem={() => setShowNewItem(true)} 
        />

        {/* Quick Stats */}
        <BentoCard colSpan={4} title="Inventory Health">
          <div className="flex-col gap-4">
            <div className="flex-between">
              <span className="card-subtitle">Total Items</span>
              <span className="card-title">{items.length}</span>
            </div>
            <div className="flex-between">
              <span className="card-subtitle">Low Stock Items</span>
              <span className="status-badge status-danger">
                {items.filter(item => {
                  const s = stock.find(s => s.item_id === item.id);
                  return (s?.stock_level || 0) < 10;
                }).length}
              </span>
            </div>
            <div className="glass-card p-3 rounded-xl">
              <p className="card-subtitle" style={{ fontSize: 11 }}>PRO TIP: Use the "Create PO" button to restock items that are trending low.</p>
            </div>
          </div>
        </BentoCard>

        {/* Active Procurement */}
        <BentoCard colSpan={12} title="Active Procurement">
           <div className="flex-center" style={{ padding: 48 }}>
             <div className="flex-col items-center gap-3">
               <span style={{ fontSize: 48 }}>📑</span>
               <p className="card-subtitle">No active purchase orders.</p>
               <button className="btn btn-secondary">View History</button>
             </div>
           </div>
        </BentoCard>
      </div>
    </main>
  );
}

export default function LogisticsPage() {
  return (
    <Suspense fallback={<div className="flex-center" style={{ padding: 64 }}>Loading…</div>}>
      <LogisticsDashboard />
    </Suspense>
  );
}
