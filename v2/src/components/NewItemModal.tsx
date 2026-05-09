'use client';

import { useState } from 'react';
import { InventoryCategory } from '@/types/logistics';

export function NewItemModal({ 
  categories, 
  onSave, 
  onClose 
}: { 
  categories: InventoryCategory[], 
  onSave: (item: any) => Promise<void>,
  onClose: () => void 
}) {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category_id: categories[0]?.id || '',
    type: 'RAW' as 'RAW' | 'PREP' | 'SERVICE',
    purchasing_uom: '',
    inventory_uom: '',
    conversion_factor: 1,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave(formData);
    setLoading(false);
    onClose();
  };

  return (
    <div className="tooltip-overlay" style={{ alignItems: 'center' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 500, borderRadius: 24, padding: 32, boxShadow: 'var(--shadow-md)' }}>
        <div className="flex-between" style={{ marginBottom: 24 }}>
          <h2 className="card-title" style={{ fontSize: 20 }}>Register New Item</h2>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: 0, width: 32, height: 32, borderRadius: '50%' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="flex-col gap-1">
            <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>ITEM NAME</label>
            <input 
              required
              className="btn btn-secondary" 
              style={{ textAlign: 'left', width: '100%' }}
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. Tomato Sauce"
            />
          </div>

          <div className="flex-row gap-3">
            <div className="flex-col gap-1" style={{ flex: 1 }}>
              <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>SKU / CODE</label>
              <input 
                required
                className="btn btn-secondary" 
                style={{ textAlign: 'left', width: '100%' }}
                value={formData.sku}
                onChange={e => setFormData({...formData, sku: e.target.value})}
                placeholder="SKU-123"
              />
            </div>
            <div className="flex-col gap-1" style={{ flex: 1 }}>
              <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>TYPE</label>
              <select 
                className="btn btn-secondary" 
                style={{ width: '100%' }}
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
              >
                <option value="RAW">RAW MATERIAL</option>
                <option value="PREP">PREPARED</option>
                <option value="SERVICE">SERVICE</option>
              </select>
            </div>
          </div>

          <div className="flex-col gap-1">
            <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>CATEGORY</label>
            <select 
              className="btn btn-secondary" 
              style={{ width: '100%' }}
              value={formData.category_id}
              onChange={e => setFormData({...formData, category_id: e.target.value})}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              {categories.length === 0 && <option value="">No categories defined</option>}
            </select>
          </div>

          <div className="flex-row gap-3">
            <div className="flex-col gap-1" style={{ flex: 1 }}>
              <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>PURCHASING UOM</label>
              <input 
                required
                className="btn btn-secondary" 
                style={{ textAlign: 'left', width: '100%' }}
                value={formData.purchasing_uom}
                onChange={e => setFormData({...formData, purchasing_uom: e.target.value})}
                placeholder="CASE"
              />
            </div>
            <div className="flex-col gap-1" style={{ flex: 1 }}>
              <label className="card-subtitle" style={{ fontSize: 11, fontWeight: 700 }}>INVENTORY UOM</label>
              <input 
                required
                className="btn btn-secondary" 
                style={{ textAlign: 'left', width: '100%' }}
                value={formData.inventory_uom}
                onChange={e => setFormData({...formData, inventory_uom: e.target.value})}
                placeholder="EACH"
              />
            </div>
          </div>

          <div className="flex-col gap-1">
            <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>CONVERSION FACTOR (Purchasing &rarr; Inventory)</label>
            <input 
              required
              type="number"
              step="0.0001"
              className="btn btn-secondary" 
              style={{ textAlign: 'left', width: '100%' }}
              value={formData.conversion_factor}
              onChange={e => setFormData({...formData, conversion_factor: parseFloat(e.target.value)})}
            />
            <p className="card-subtitle" style={{ fontSize: 10 }}>1 {formData.purchasing_uom || 'Unit'} = {formData.conversion_factor} {formData.inventory_uom || 'Units'}</p>
          </div>

          <div className="flex-row gap-3" style={{ marginTop: 12 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 2 }}>
              {loading ? 'Registering...' : 'Register Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
