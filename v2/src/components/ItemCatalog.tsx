'use client';

import { useState } from 'react';
import { BentoCard } from './BentoCard';
import { InventoryItem, InventoryCategory } from '@/types/logistics';

export function ItemCatalog({ items, categories, onAddItem }: { 
  items: InventoryItem[], 
  categories: InventoryCategory[],
  onAddItem: () => void 
}) {
  const [search, setSearch] = useState('');

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <BentoCard colSpan={8} title="Item Catalog">
      <div className="flex-col gap-4">
        <div className="flex-between">
          <div className="flex-row items-center gap-2" style={{ flex: 1, maxWidth: 300 }}>
            <input 
              type="text" 
              placeholder="Search items or SKU..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="btn btn-secondary"
              style={{ width: '100%', textAlign: 'left', padding: '10px 16px' }}
            />
          </div>
          <button onClick={onAddItem} className="btn btn-primary">➕ Add Item</button>
        </div>

        <div className="scroll-area" style={{ maxHeight: 500 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="card-subtitle" style={{ textAlign: 'left', padding: '12px 8px' }}>ITEM / SKU</th>
                <th className="card-subtitle" style={{ textAlign: 'left', padding: '12px 8px' }}>TYPE</th>
                <th className="card-subtitle" style={{ textAlign: 'left', padding: '12px 8px' }}>UOM (PURCH/INV)</th>
                <th className="card-subtitle" style={{ textAlign: 'left', padding: '12px 8px' }}>FACTOR</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color-subtle)' }}>
                  <td style={{ padding: '12px 8px' }}>
                    <div className="flex-col">
                      <span className="card-title" style={{ fontSize: 14 }}>{item.name}</span>
                      <span className="card-subtitle" style={{ fontSize: 11 }}>{item.sku}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span className={`status-badge ${item.type === 'RAW' ? 'status-info' : item.type === 'PREP' ? 'status-warning' : 'status-danger'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div className="flex-row items-center gap-1">
                      <span className="card-title" style={{ fontSize: 13 }}>{item.purchasing_uom}</span>
                      <span className="card-subtitle">/</span>
                      <span className="card-title" style={{ fontSize: 13 }}>{item.inventory_uom}</span>
                    </div>
                  </td>
                  <td className="card-title" style={{ padding: '12px 8px', fontSize: 13 }}>
                    x{item.conversion_factor}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="card-subtitle" style={{ textAlign: 'center', padding: 48 }}>
                    No items found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </BentoCard>
  );
}
