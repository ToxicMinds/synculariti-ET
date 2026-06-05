import { FCVSpike } from '@/lib/food-cost-variance';
import { formatCurrency, formatDate } from '@/lib/utils';

export function VarianceSpikeDetail({ spikes }: { spikes: FCVSpike[] }) {
  const activeSpikes = spikes.filter(s => s.flag !== 'NORMAL');
  
  if (activeSpikes.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border-color)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Recent Spikes
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {activeSpikes.slice(-3).map((spike, i) => (
          <div key={spike.date + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {formatDate(spike.date)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {spike.flag === 'HIGH_VARIANCE' ? (
                <span style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>↑ Spike</span>
              ) : (
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>↓ Dip</span>
              )}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {formatCurrency(Math.abs(spike.gap))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
