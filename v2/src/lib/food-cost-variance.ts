export interface FCVPurchaseRow {
  ingredient_id: string;
  ingredient_name: string;
  total_amount: number;
  purchase_date: string;
  location_id: string | null;
}

export interface FCVPOSRow {
  ingredient_id: string;
  ingredient_name: string;
  grams: number;
  cost: number;
  transaction_time: string;
  revenue: number;
  location_id: string | null;
}

export interface FCVHeadline {
  totalRevenue: number;
  theoreticalCOGS: number;
  actualSpend: number;
  gap: number;
  gapPct: number | null;
  confidenceBands: { gapLower: number; gapUpper: number };
  direction: 'BLEEDING' | 'PROFITABLE' | 'NEUTRAL';
}

export interface FCVIngredient {
  ingredient: string;
  theoreticalCost: number;
  actualCost: number;
  gap: number;
  gapPct: number | null;
  shareOfTotalGap: number;
}

export interface FCVWeeklyTrend {
  week: string;
  revenue: number;
  theoreticalCOGS: number;
  actualSpend: number;
  gap: number;
}

export interface FCVSpike {
  date: string;
  gap: number;
  flag: 'HIGH_VARIANCE' | 'NEGATIVE_VARIANCE' | 'NORMAL';
  likelyCause: string | null;
}

export interface FCVReport {
  direction: 'BLEEDING' | 'PROFITABLE' | 'NEUTRAL';
  period: { start: string; end: string };
  dataCoverage: {
    daysWithPOSData: number;
    daysInPeriod: number;
    pctCovered: number;
    warning: string | null;
  };
  headline: FCVHeadline;
  byIngredient: FCVIngredient[];
  weeklyTrend: FCVWeeklyTrend[];
  varianceSpikes: FCVSpike[];
}

interface Input {
  purchases: FCVPurchaseRow[];
  posStaging: FCVPOSRow[];
  period: { start: string; end: string };
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function daysInPeriod(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function computeFCVReport(input: Input): FCVReport {
  const { purchases, posStaging, period } = input;
  const { start, end } = period;
  const totalDays = daysInPeriod(start, end);

  const filteredPurchases = purchases.filter(p => {
    const pd = p.purchase_date;
    return pd >= start && pd <= end;
  });

  const filteredPOS = posStaging.filter(p => {
    const pd = dateOnly(p.transaction_time);
    return pd >= start && pd <= end;
  });

  // Actual spend
  const actualSpend = filteredPurchases.reduce((sum, p) => sum + p.total_amount, 0);

  // Theoretical COGS and revenue
  const theoreticalCOGS = filteredPOS.reduce((sum, p) => sum + p.cost, 0);
  const totalRevenue = filteredPOS.reduce((sum, p) => sum + p.revenue, 0);

  // Gap
  const gap = actualSpend - theoreticalCOGS;
  const gapPct = theoreticalCOGS > 0 ? ((gap / theoreticalCOGS) * 100) : null;

  // Direction
  const threshold = totalRevenue * 0.05;
  let direction: FCVHeadline['direction'] = 'NEUTRAL';
  if (gap > threshold) direction = 'BLEEDING';
  else if (gap < -threshold) direction = 'PROFITABLE';

  // Data coverage
  const uniqueDays = new Set(filteredPOS.map(p => dateOnly(p.transaction_time)));
  const daysWithPOSData = uniqueDays.size;
  const pctCovered = totalDays > 0 ? (daysWithPOSData / totalDays) * 100 : 0;
  let warning: string | null = null;
  if (daysWithPOSData < totalDays) {
    warning = `POS data missing for ${totalDays - daysWithPOSData} day(s) this period`;
  }

  // Confidence bands
  const uncertaintyPct = Math.max(0, 1 - pctCovered / 100) * 0.5;
  const gapLower = gap * (1 - uncertaintyPct);
  const gapUpper = gap * (1 + uncertaintyPct);

  // Per-ingredient
  const ingMap = new Map<string, { theoreticalCost: number; actualCost: number }>();

  for (const p of filteredPurchases) {
    const key = p.ingredient_id;
    const entry = ingMap.get(key) || { theoreticalCost: 0, actualCost: 0 };
    entry.actualCost += p.total_amount;
    ingMap.set(key, entry);
  }

  for (const p of filteredPOS) {
    const key = p.ingredient_id;
    const entry = ingMap.get(key) || { theoreticalCost: 0, actualCost: 0 };
    entry.theoreticalCost += p.cost;
    ingMap.set(key, entry);
  }

  const totalAbsoluteGap = Array.from(ingMap.values())
    .reduce((sum, e) => sum + Math.abs(e.actualCost - e.theoreticalCost), 0);

  const byIngredient: FCVIngredient[] = Array.from(ingMap.entries())
    .map(([ingId, entry]) => {
      const ingGap = entry.actualCost - entry.theoreticalCost;
      const ingGapPct = entry.theoreticalCost > 0 ? ((ingGap / entry.theoreticalCost) * 100) : null;
      const ingredientName = filteredPurchases.find(p => p.ingredient_id === ingId)?.ingredient_name
        || filteredPOS.find(p => p.ingredient_id === ingId)?.ingredient_name
        || ingId;
      return {
        ingredient: ingredientName,
        theoreticalCost: entry.theoreticalCost,
        actualCost: entry.actualCost,
        gap: ingGap,
        gapPct: ingGapPct,
        shareOfTotalGap: totalAbsoluteGap > 0 ? Math.abs(ingGap) / totalAbsoluteGap : 0,
      };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  // Weekly trend
  const weekMap = new Map<string, { revenue: number; theoreticalCOGS: number; actualSpend: number }>();

  for (const p of filteredPOS) {
    const wk = isoWeekKey(dateOnly(p.transaction_time));
    const entry = weekMap.get(wk) || { revenue: 0, theoreticalCOGS: 0, actualSpend: 0 };
    entry.revenue += p.revenue;
    entry.theoreticalCOGS += p.cost;
    weekMap.set(wk, entry);
  }

  for (const p of filteredPurchases) {
    const wk = isoWeekKey(p.purchase_date);
    const entry = weekMap.get(wk) || { revenue: 0, theoreticalCOGS: 0, actualSpend: 0 };
    entry.actualSpend += p.total_amount;
    weekMap.set(wk, entry);
  }

  const weeklyTrend: FCVWeeklyTrend[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, entry]) => ({
      week,
      ...entry,
      gap: entry.actualSpend - entry.theoreticalCOGS,
    }));

  // Variance spikes (per day)
  const dayMap = new Map<string, { actualSpend: number; theoreticalCOGS: number }>();

  for (const p of filteredPOS) {
    const day = dateOnly(p.transaction_time);
    const entry = dayMap.get(day) || { actualSpend: 0, theoreticalCOGS: 0 };
    entry.theoreticalCOGS += p.cost;
    dayMap.set(day, entry);
  }

  for (const p of filteredPurchases) {
    const day = p.purchase_date;
    const entry = dayMap.get(day) || { actualSpend: 0, theoreticalCOGS: 0 };
    entry.actualSpend += p.total_amount;
    dayMap.set(day, entry);
  }

  const varianceSpikes: FCVSpike[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => {
      const dayGap = entry.actualSpend - entry.theoreticalCOGS;
      let flag: FCVSpike['flag'] = 'NORMAL';
      if (entry.theoreticalCOGS > 0) {
        if (entry.actualSpend > entry.theoreticalCOGS * 1.3) flag = 'HIGH_VARIANCE';
        else if (entry.actualSpend < entry.theoreticalCOGS * 0.7) flag = 'NEGATIVE_VARIANCE';
      } else if (entry.actualSpend > 0) {
        flag = 'HIGH_VARIANCE';
      }
      return { date, gap: dayGap, flag, likelyCause: null };
    });

  return {
    direction,
    period: { start, end },
    dataCoverage: {
      daysWithPOSData,
      daysInPeriod: totalDays,
      pctCovered: Math.round(pctCovered * 10) / 10,
      warning,
    },
    headline: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      theoreticalCOGS: Math.round(theoreticalCOGS * 100) / 100,
      actualSpend: Math.round(actualSpend * 100) / 100,
      gap: Math.round(gap * 100) / 100,
      gapPct: gapPct !== null ? Math.round(gapPct * 100) / 100 : null,
      confidenceBands: {
        gapLower: Math.round(gapLower * 100) / 100,
        gapUpper: Math.round(gapUpper * 100) / 100,
      },
      direction,
    },
    byIngredient,
    weeklyTrend,
    varianceSpikes,
  };
}
