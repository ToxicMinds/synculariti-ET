import { useState } from 'react';
import { useLogistics } from '../hooks/useLogistics';

export function CreatePOModal({ onClose }: { onClose: () => void }) {
  // Stub for Phase 4: Logistics PO Modal
  // Real implementation pending IMS boundary design
  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-card p-6 rounded-2xl flex-col gap-4" style={{ maxWidth: 500, width: '100%' }}>
        <header className="flex-between">
          <h2 className="text-gradient" style={{ fontSize: 24, fontWeight: 700 }}>Create Purchase Order</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </header>

        <div className="card-subtitle text-center py-8">
          <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>🚧</span>
          Procurement module is currently locked in read-only mode while we upgrade our IMS integration.
        </div>

        <footer className="flex-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
