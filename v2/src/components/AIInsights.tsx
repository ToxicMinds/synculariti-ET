'use client';

import { useState, useEffect } from 'react';
import { BentoCard } from './BentoCard';

export function AIInsights({ householdId }: { householdId: string | undefined }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRealAIInsight();
  }, [householdId]);

  async function fetchRealAIInsight() {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/insight');
      const data = await response.json();
      
      if (data.success) {
        setInsight(data.insight);
      } else {
        setInsight("Your graph is populating. Soon I'll be able to tell you more about your habits!");
      }
    } catch (e) {
      console.error("Failed to fetch AI insights:", e);
      setInsight("I'm having trouble connecting to the graph right now, but I'll keep watching your spending.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <BentoCard title="AI Intelligence" colSpan={8}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48 }}>
        <div className="spinner-small" />
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Analyzing your Graph patterns...</span>
      </div>
    </BentoCard>
  );

  return (
    <BentoCard title="AI Intelligence" colSpan={8}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          width: 48, 
          height: 48, 
          borderRadius: 12, 
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0
        }}>
          💡
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            Graph & AI Insight
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{insight}"
          </p>
        </div>
      </div>
    </BentoCard>
  );
}
