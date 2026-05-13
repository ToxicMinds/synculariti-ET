'use client';

import { useState, useEffect, useRef } from 'react';
import { BentoCard } from '@/components/BentoCard';
import { AppState } from '@/modules/identity/hooks/useTenant';

export function AIInsights({
  tenantId,
  transactionCount,
  dataHash,
  updateState,
  tenant,
  isDemo = false
}: {
  tenantId: string | undefined;
  transactionCount?: number;
  dataHash?: string;
  updateState?: (s: Partial<AppState>) => Promise<void>;
  tenant?: AppState | null;
  isDemo?: boolean;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [source, setSource] = useState<'cache' | 'live' | 'error' | 'demo'>('live');

  // Track the last hash we fetched for — prevents re-fetching on unrelated re-renders
  const lastFetchedHash = useRef<string | null>(null);
  const isFetching = useRef(false);

  // Stable cache key: only changes when tenant or transaction count/totals change
  const cacheHash = tenantId ? (dataHash || `${tenantId}_${transactionCount ?? 0}`) : null;

  useEffect(() => {
    if (isDemo) {
      setInsight('📊 Trend Detected: Bulk produce costs (Coffee Beans) have decreased by 5.2% over the last 30 days. Recommend increasing inventory buffer while prices are low.');
      setSource('demo');
      setLoading(false);
      return;
    }

    if (!tenantId || !tenant || !cacheHash) return;

    // 1. Serve from Supabase-backed cache if valid AND < 24h old
    const cached = tenant?.ai_insight;
    const isHashMatch = cached?.hash === cacheHash;
    const isFresh = cached?.timestamp && (Date.now() - new Date(cached.timestamp).getTime() < 24 * 60 * 60 * 1000);

    if (isHashMatch && isFresh && cached?.insight) {
      setInsight(cached.insight);
      setSource('cache');
      setLoading(false);
      lastFetchedHash.current = cacheHash;
      return;
    }

    // 2. Don't re-fetch if we already tried this exact hash in this session
    if (lastFetchedHash.current === cacheHash) return;

    // 3. Don't fire concurrent fetches
    if (isFetching.current) return;

    fetchInsight(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, cacheHash]);

  async function fetchInsight(forceRefresh = false) {
    if (isFetching.current) return;

    if (!forceRefresh && lastFetchedHash.current === cacheHash) return;

    isFetching.current = true;
    setLoading(true);

    try {
      const response = await fetch('/api/ai/insight');
      const data = await response.json();

      if (data.success && data.insight) {
        setInsight(data.insight);
        setSource('live');
        lastFetchedHash.current = cacheHash;
        
        // Persist to Supabase with timestamp so other devices get it from cache
        if (updateState && cacheHash) {
          updateState({ 
            ai_insight: { 
              insight: data.insight, 
              hash: cacheHash,
              timestamp: new Date().toISOString()
            } 
          }).catch(() => {});
        }
      } else {
        // API returned 200 but no meaningful insight — show a soft message, don't retry
        setInsight('💡 Your spending patterns are being analyzed. Add more transactions and sync to see AI-powered insights.');
        setSource('error');
        lastFetchedHash.current = cacheHash; // Mark as fetched so we don't loop
      }
    } catch (e: unknown) {
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
        <div className="flex-row items-center gap-3" style={{ minHeight: 56 }}>
          <div className="spinner-small" />
          <span className="card-subtitle">Querying your spending graph…</span>
        </div>
      ) : (
        <div className="flex-row items-start gap-4">
          <div className="flex-center" style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            fontSize: 22, flexShrink: 0
          }}>
            💡
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex-row items-center gap-2" style={{ marginBottom: 4 }}>
              <p className="card-title" style={{ marginBottom: 0 }}>Graph & AI Insight</p>
              {source === 'cache' && (
                <span className="status-badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  cached
                </span>
              )}
            </div>
            <p className="card-subtitle" style={{ lineHeight: 1.6 }}>
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
