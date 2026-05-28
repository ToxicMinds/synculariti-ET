import { Session } from 'neo4j-driver';

export interface InsightFinding {
  type: 'price' | 'timing' | 'waste';
  impact: number;
  summary: string;
  detail: string;
  recommendation: string;
  data: Record<string, unknown>;
}

export type QueryRunner<T> = (session: Session, tenantId: string) => Promise<T | null>;

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const o = v as { low?: number; high?: number };
    if (typeof o.low === 'number') return o.low;
  }
  return Number(v) || 0;
}

export function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}
