import { render, screen } from '@testing-library/react';
import { VarianceSpikeDetail } from '../VarianceSpikeDetail';
import type { FCVSpike } from '@/lib/food-cost-variance';

describe('VarianceSpikeDetail', () => {
  test('renders nothing when spikes array is empty', () => {
    const { container } = render(<VarianceSpikeDetail spikes={[]} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders nothing when all spikes are NORMAL', () => {
    const spikes: FCVSpike[] = [
      { date: '2026-05-01', gap: 10, flag: 'NORMAL', likelyCause: null },
      { date: '2026-05-02', gap: -5, flag: 'NORMAL', likelyCause: null },
    ];
    const { container } = render(<VarianceSpikeDetail spikes={spikes} />);
    expect(container.innerHTML).toBe('');
  });

  test('shows spike indicator for HIGH_VARIANCE and dip for NEGATIVE_VARIANCE', () => {
    const spikes: FCVSpike[] = [
      { date: '2026-05-10', gap: 150, flag: 'HIGH_VARIANCE', likelyCause: 'Price spike' },
      { date: '2026-05-11', gap: -80, flag: 'NEGATIVE_VARIANCE', likelyCause: 'Bulk discount' },
    ];
    render(<VarianceSpikeDetail spikes={spikes} />);

    expect(screen.getByText('↑ Spike')).toBeTruthy();
    expect(screen.getByText('↓ Dip')).toBeTruthy();
  });

  test('limits rendering to the last 3 non-NORMAL spikes', () => {
    const spikes: FCVSpike[] = [
      { date: '2026-05-01', gap: 10, flag: 'HIGH_VARIANCE', likelyCause: null },
      { date: '2026-05-02', gap: 20, flag: 'HIGH_VARIANCE', likelyCause: null },
      { date: '2026-05-03', gap: 30, flag: 'HIGH_VARIANCE', likelyCause: null },
      { date: '2026-05-04', gap: 40, flag: 'HIGH_VARIANCE', likelyCause: null },
      { date: '2026-05-05', gap: 50, flag: 'HIGH_VARIANCE', likelyCause: null },
    ];
    render(<VarianceSpikeDetail spikes={spikes} />);

    const spikeIndicators = screen.getAllByText('↑ Spike');
    expect(spikeIndicators).toHaveLength(3);
  });
});
