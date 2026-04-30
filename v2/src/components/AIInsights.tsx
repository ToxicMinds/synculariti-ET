'use client';

import { useState, useEffect, useRef } from 'react';
import { BentoCard } from './BentoCard';

export function AIInsights({
  householdId,
  expenseCount,
  dataHash,
  updateState,
  household
}: {
  householdId: string | undefined;
  expenseCount?: number;
  dataHash?: string;
  updateState?: (s: any) => Promise<void>;
  household?: any;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'cache' | 'live' | 'error'>('live');

  // Track the last hash we fetched for — prevents re-fetching on unrelated re-renders
  const lastFetchedHash = useRef<string | null>(null);
  const isFetching = useRef(false);

  // Stable cache key: only changes when household or expense count/totals change
  const cacheHash = householdId ? (dataHash || `${householdId}_${expenseCount ?? 0}`) : null;

  useEffect(() => {
    if (!householdId || !household || !cacheHash) return;

    // 1. Serve from Supabase-backed cache if hash matches — no API call needed
    if (household?.config?.ai_insight?.hash === cacheHash) {
      setInsight(household.config.ai_insight.insight);
      setSource('cache');
      setLoading(false);
      lastFetchedHash.current = cacheHash;
      return;
    }

    // 2. Don't re-fetch if we already fetched this exact hash
    if (lastFetchedHash.current === cacheHash) return;

    // 3. Don't fire concurrent fetches
    if (isFetching.current) return;

    fetchInsight(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, cacheHash]);

  async function fetchInsight(forceRefresh = false) {
    if (!householdId || isFetching.current) return;

    if (!forceRefresh && lastFetchedHash.current === cacheHash) return;

    isFetching.current = true;
    setLoading(true);

    try {
      const response = await fetch(`/api/ai/insight?householdId=${encodeURIComponent(householdId)}`);
      const data = await response.json();

      if (data.success && data.insight) {
        setInsight(data.insight);
        setSource('live');
        lastFetchedHash.current = cacheHash;
        // Persist to Supabase so other devices get it from cache
        if (updateState && cacheHash) {
          updateState({ ai_insight: { insight: data.insight, hash: cacheHash } }).catch(() => {});
        }
      } else {
        // API returned 200 but no meaningful insight — show a soft message, don't retry
        setInsight('💡 Your spending patterns are being analyzed. Add more expenses and sync to see AI-powered insights.');
        setSource('error');
        lastFetchedHash.current = cacheHash; // Mark as fetched so we don't loop
      }
    } catch (e: any) {
      setInsight('⚠️ Could not reach the AI service. Check your connection and try again.');
      setSource('error');
      // Do NOT mark lastFetchedHash on network error — allow manual refresh
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }

  return (
    <BentoCard title="AI Intelligence" colSpan={8}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
          <div className="spinner-small" />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Querying your spending graph…</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0
          }}>
            💡
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Graph & AI Insight</p>
              {source === 'cache' && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, fontWeight: 500, flexShrink: 0 }}>
                  cached
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, wordBreak: 'break-word' }}>
              {insight}
            </p>
            <button
              onClick={() => fetchInsight(true)}
              style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              ↻ Refresh insight
            </button>
          </div>
        </div>
      )}
    </BentoCard>
  );
}
