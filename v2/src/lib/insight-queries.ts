import { Session } from 'neo4j-driver';

export interface InsightFinding {
  type: 'price' | 'timing' | 'waste';
  impact: number;
  summary: string;
  detail: string;
  recommendation: string;
  data: Record<string, unknown>;
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const o = v as { low?: number; high?: number };
    if (typeof o.low === 'number') return o.low;
  }
  return Number(v) || 0;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ──────────────────────────────────────────────
// Class A: Price Intelligence
// ──────────────────────────────────────────────
export async function queryPriceIntelligence(
  session: Session,
  tenantId: string
): Promise<InsightFinding | null> {
  const result = await session.run(`
    MATCH (ing:Ingredient)<-[:IS_INSTANCE_OF]-(sku:MerchantSKU)<-[c:CONTAINS]-(t:Transaction {tenant_id: $tid})
    MATCH (sku)-[:SUPPLIED_BY]->(m:Merchant)
    WHERE c.unit_price IS NOT NULL AND c.unit_price > 0
    WITH ing.name AS ingredient, m.name AS merchant, avg(c.unit_price) AS avgPrice, count(DISTINCT t) AS purchases
    WHERE purchases >= 2
    WITH ingredient, collect({merchant: merchant, avgPrice: avgPrice, purchases: purchases}) AS merchants
    WHERE size(merchants) >= 2
    RETURN ingredient, merchants
    ORDER BY size(merchants) DESC
    LIMIT 3
  `, { tid: tenantId });

  if (result.records.length === 0) return null;

  const record = result.records[0];
  const ingredient = toStr(record.get('ingredient'));
  const merchants = record.get('merchants') as Array<{ merchant: string; avgPrice: unknown; purchases: unknown }>;

  if (!merchants || merchants.length < 2) return null;

  const sorted = merchants
    .map(m => ({ merchant: toStr(m.merchant), avgPrice: toNum(m.avgPrice), purchases: toNum(m.purchases) }))
    .sort((a, b) => a.avgPrice - b.avgPrice);

  const cheapest = sorted[0];
  const dearest = sorted[sorted.length - 1];
  const diff = dearest.avgPrice - cheapest.avgPrice;
  const pctDiff = cheapest.avgPrice > 0 ? (diff / cheapest.avgPrice) * 100 : 0;

  if (pctDiff < 5) return null;

  return {
    type: 'price',
    impact: Math.round(pctDiff * 10),
    summary: `${ingredient} costs ${pctDiff.toFixed(0)}% more at ${dearest.merchant} than ${cheapest.merchant}`,
    detail: `${ingredient}: €${cheapest.avgPrice.toFixed(2)} at ${cheapest.merchant} vs €${dearest.avgPrice.toFixed(2)} at ${dearest.merchant} (${diff.toFixed(2)}/unit difference across ${sorted.length} suppliers)`,
    recommendation: `Switch ${ingredient} procurement to ${cheapest.merchant} to save ~€${diff.toFixed(2)} per unit`,
    data: { ingredient, merchants: sorted, savingsPerUnit: diff, pctDifference: pctDiff }
  };
}

// ──────────────────────────────────────────────
// Class B: Timing Analysis
// ──────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function queryTimingPatterns(
  session: Session,
  tenantId: string
): Promise<InsightFinding | null> {
  const result = await session.run(`
    MATCH (t:Transaction {tenant_id: $tid})
    WHERE t.day_of_week IS NOT NULL
    WITH t.day_of_week AS dow, t.is_weekend AS weekend, avg(t.amount) AS avgSpend, count(t) AS count, sum(t.amount) AS total
    RETURN dow, weekend, round(avgSpend * 100) / 100 AS avgSpend, count, round(total * 100) / 100 AS total
    ORDER BY avgSpend DESC
  `, { tid: tenantId });

  if (result.records.length < 2) return null;

  const rows = result.records.map(r => ({
    dow: toNum(r.get('dow')),
    weekend: r.get('weekend') === true,
    avgSpend: toNum(r.get('avgSpend')),
    count: toNum(r.get('count')),
    total: toNum(r.get('total')),
  }));

  const sorted = [...rows].sort((a, b) => b.avgSpend - a.avgSpend);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const diff = highest.avgSpend - lowest.avgSpend;
  const pctDiff = lowest.avgSpend > 0 ? (diff / lowest.avgSpend) * 100 : 0;

  if (pctDiff < 10) return null;

  // Check if weekend vs weekday pattern
  const weekday = rows.filter(r => !r.weekend);
  const weekend = rows.filter(r => r.weekend);
  const weekdayAvg = weekday.length > 0 ? weekday.reduce((s, r) => s + r.avgSpend, 0) / weekday.length : 0;
  const weekendAvg = weekend.length > 0 ? weekend.reduce((s, r) => s + r.avgSpend, 0) / weekend.length : 0;

  if (weekend.length > 0 && weekday.length > 0 && Math.abs(weekdayAvg - weekendAvg) / Math.max(weekdayAvg, 1) > 0.15) {
    const direction = weekendAvg > weekdayAvg ? 'higher' : 'lower';
    const pct = Math.abs((weekendAvg - weekdayAvg) / weekdayAvg * 100);
    return {
      type: 'timing',
      impact: Math.round(pct * 2),
      summary: `Weekend purchases average ${pct.toFixed(0)}% ${direction} than weekdays (€${weekendAvg.toFixed(2)} vs €${weekdayAvg.toFixed(2)})`,
      detail: `Weekday avg: €${weekdayAvg.toFixed(2)} over ${weekday.reduce((s, r) => s + r.count, 0)} purchases. Weekend avg: €${weekendAvg.toFixed(2)} over ${weekend.reduce((s, r) => s + r.count, 0)} purchases.`,
      recommendation: direction === 'higher'
        ? `Schedule major purchases on weekdays to save ~€${(weekendAvg - weekdayAvg).toFixed(2)} per trip`
        : `Consider weekend purchasing patterns are actually more cost-effective`,
      data: { weekdayAvg, weekendAvg, days: rows }
    };
  }

  return {
    type: 'timing',
    impact: Math.round(pctDiff),
    summary: `${DAY_NAMES[highest.dow]} has the highest avg spend at €${highest.avgSpend.toFixed(2)} — ${pctDiff.toFixed(0)}% more than ${DAY_NAMES[lowest.dow]} (€${lowest.avgSpend.toFixed(2)})`,
    detail: `Your most expensive shopping day is ${DAY_NAMES[highest.dow]} (avg €${highest.avgSpend.toFixed(2)}, ${highest.count} purchases). Cheapest is ${DAY_NAMES[lowest.dow]} (avg €${lowest.avgSpend.toFixed(2)}).`,
    recommendation: `Shift non-urgent purchases from ${DAY_NAMES[highest.dow]} to ${DAY_NAMES[lowest.dow]} to reduce average spend by ~€${diff.toFixed(2)} per trip`,
    data: { highest: { day: DAY_NAMES[highest.dow], ...highest }, lowest: { day: DAY_NAMES[lowest.dow], ...lowest }, days: rows }
  };
}

// ──────────────────────────────────────────────
// Class C: Waste Prediction (Perishability + Timing)
// ──────────────────────────────────────────────
export async function queryWasteRisk(
  session: Session,
  tenantId: string
): Promise<InsightFinding | null> {
  const result = await session.run(`
    MATCH (t:Transaction {tenant_id: $tid})-[c:CONTAINS]->(sku:MerchantSKU)-[:IS_INSTANCE_OF]->(ing:Ingredient)
    WHERE ing.perishability_days IS NOT NULL AND ing.perishability_days < 14
      AND t.day_of_week IS NOT NULL
    WITH ing.name AS ingredient, ing.perishability_days AS shelfLife,
         t.date AS purchased, t.day_of_week AS dow,
         t.is_weekend AS isWeekend, t.is_before_holiday AS beforeHoliday,
         t.holiday_name AS holidayName, t.days_to_next_holiday AS daysToNext,
         c.quantity AS qty, c.unit_price AS price
    WHERE qty > 0 AND price > 0
    RETURN ingredient, shelfLife, purchased, dow, qty, price, isWeekend, beforeHoliday, holidayName, daysToNext
    ORDER BY shelfLife ASC
    LIMIT 5
  `, { tid: tenantId });

  if (result.records.length === 0) return null;

  const risks: Array<{
    ingredient: string;
    shelfLife: number;
    purchased: string;
    dow: number;
    qty: number;
    price: number;
    isWeekend: boolean;
    beforeHoliday: boolean;
    holidayName: string | null;
    daysToNext: number;
  }> = result.records.map(r => ({
    ingredient: toStr(r.get('ingredient')),
    shelfLife: toNum(r.get('shelfLife')),
    purchased: toStr(r.get('purchased')),
    dow: toNum(r.get('dow')),
    qty: toNum(r.get('qty')),
    price: toNum(r.get('price')),
    isWeekend: r.get('isWeekend') === true,
    beforeHoliday: r.get('beforeHoliday') === true,
    holidayName: r.get('holidayName') as string | null,
    daysToNext: toNum(r.get('daysToNext')),
  }));

  // Score each: higher = more risky
  const scored = risks.map(r => {
    let score = 0;
    if (r.dow >= 5) score += 20;
    if (r.beforeHoliday) score += 30;
    if (r.shelfLife <= 3) score += 25;
    else if (r.shelfLife <= 7) score += 15;
    if (r.daysToNext <= 2) score += 25;
    return { ...r, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top.score < 30) return null;

  const dayName = DAY_NAMES[top.dow];
  const riskFactors: string[] = [];
  if (top.dow >= 5) riskFactors.push(`purchased on ${dayName}`);
  if (top.beforeHoliday) riskFactors.push(top.holidayName ? `before ${top.holidayName}` : 'approaching a holiday');
  if (top.shelfLife <= 3) riskFactors.push(`very short shelf life (${top.shelfLife}d)`);

  return {
    type: 'waste',
    impact: top.score,
    summary: `${top.ingredient} (${top.shelfLife}-day shelf life) bought ${riskFactors.join(', ')} — high spoilage risk`,
    detail: `${top.qty.toFixed(1)} units of ${top.ingredient} at €${top.price.toFixed(2)}/unit purchased on ${top.purchased}. With ${top.shelfLife}-day shelf life and closure risk, ~${Math.round(top.qty * 0.3 * 100) / 100} units (€${(top.qty * top.price * 0.3).toFixed(2)}) may spoil.`,
    recommendation: `When buying ${top.ingredient} ${top.dow >= 5 ? 'late-week' : ''}, reduce order by 30% or shift purchase to earlier in the week`,
    data: { topRisk: top, allRisks: scored }
  };
}

export type QueryRunner<T> = (session: Session, tenantId: string) => Promise<T | null>;
