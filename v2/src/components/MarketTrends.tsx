'use client';

import { BentoCard } from './BentoCard';
import { Line } from 'react-chartjs-2';
import { Transaction } from '@/lib/finance';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function MarketTrends({ transactions, selectedMonth, colSpan = 8, isDemo = false }: { transactions: Transaction[], selectedMonth: string, colSpan?: number, isDemo?: boolean }) {
  // Logic: Group transactions by month for the last 6 months
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = selectedMonth.split('-');
  const baseDate = new Date(parseInt(y), parseInt(m) - 1, 1);
  
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - (5 - i), 1);
    return { name: months[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
  });

  const dataPoints = last6Months.map(m => {
    return transactions
      .filter(t => {
        const d = new Date(t.date || '');
        return d.getMonth() === m.month && d.getFullYear() === m.year;
      })
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
  });

  const data = {
    labels: last6Months.map(m => m.name),
    datasets: [
      {
        label: 'Monthly Spend',
        data: dataPoints,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `€${context.parsed.y.toFixed(2)}`
        }
      }
    },
    scales: {
      y: { display: false },
      x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
    }
  };

  return (
    <BentoCard title="Cash Flow Trends" colSpan={colSpan}>
      <div style={{ height: 200, width: '100%' }}>
        <Line data={data} options={options} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ 
          padding: '4px 8px', 
          borderRadius: 6, 
          background: 'rgba(99, 102, 241, 0.1)', 
          color: '#6366f1', 
          fontSize: 11, 
          fontWeight: 600 
        }}>
          💡 Insight
        </span>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Your spending peaked in {last6Months[dataPoints.indexOf(Math.max(...dataPoints))].name} due to higher transactional activity.
        </p>
      </div>
    </BentoCard>
  );
}
