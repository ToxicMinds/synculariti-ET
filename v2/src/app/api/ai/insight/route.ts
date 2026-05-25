import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';
import { queryPriceIntelligence, queryTimingPatterns, queryWasteRisk, InsightFinding } from '@/lib/insight-queries';

function articulateFinding(f: InsightFinding): string {
  return `${f.summary}. ${f.recommendation}.`;
}

const handler: SecureHandler = async (_req, context) => {
  const { tenantId } = context.auth || { tenantId: 'fallback' };

  await ServerLogger.system('INFO', 'AI', 'Analytical insight request started', { tenantId });

  const driver = getNeo4jDriver();
  if (!driver) {
    return apiError('Neo4j not configured', 'Sync', 'Graph driver missing', { status: 500 });
  }

  // Use separate sessions to allow concurrent queries
  const session1 = driver.session();
  const session2 = driver.session();
  const session3 = driver.session();

  try {
    const [priceResult, timingResult, wasteResult] = await Promise.all([
      queryPriceIntelligence(session1, tenantId),
      queryTimingPatterns(session2, tenantId),
      queryWasteRisk(session3, tenantId),
    ]);

    const findings: InsightFinding[] = [priceResult, timingResult, wasteResult].filter(Boolean) as InsightFinding[];

    if (findings.length === 0) {
      return NextResponse.json({
        success: true,
        insight: '💡 System Intelligence: Analyzing your spending patterns. Add more transactions to unlock deeper B2B insights.',
        findings: [],
        category: 'empty'
      });
    }

    // Pick the finding with highest impact score
    findings.sort((a, b) => b.impact - a.impact);
    const best = findings[0];
    const category = best.type;

    // Try LLM narration; fall back to template articulation
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        const result = await callGroq('llama-3.3-70b-versatile', [
          {
            role: 'system',
            content: `You are a sharp, specific financial analyst for a Slovak restaurant.
Given ONE structured finding below, articulate it in exactly 2 sentences.
Be specific with numbers. Do NOT add generic advice. Do NOT mention unrelated categories.
Just state the finding naturally as if talking to the restaurant owner.`
          },
          {
            role: 'user',
            content: JSON.stringify({
              type: best.type,
              summary: best.summary,
              detail: best.detail,
              recommendation: best.recommendation,
              data: best.data
            })
          }
        ], {
          temperature: 0.4,
          max_tokens: 250,
          cacheKey: `analytical-insight-${tenantId}-${best.type}-${Math.round(best.impact)}`
        });

        return NextResponse.json({
          success: true,
          insight: result.content,
          findings: findings.map(f => ({ type: f.type, impact: f.impact, summary: f.summary })),
          category,
          usage: result.usage
        });
      }
    } catch (apiErr: unknown) {
      await ServerLogger.system('WARN', 'AI', 'Groq narration failed, using template', {
        tenantId,
        error: apiErr instanceof Error ? apiErr.message : String(apiErr)
      });
    }

    // Fallback: template articulation
    return NextResponse.json({
      success: true,
      insight: articulateFinding(best),
      findings: findings.map(f => ({ type: f.type, impact: f.impact, summary: f.summary })),
      category
    });

  } catch (e: unknown) {
    await ServerLogger.system('ERROR', 'AI', 'Analytical insight Neo4j queries failed', {
      tenantId,
      error: e instanceof Error ? e.message : String(e)
    });
    return NextResponse.json({
      success: true,
      insight: '💡 Intelligence Hub: Syncing your financial graph. Insights will appear shortly.',
      findings: [],
      category: 'empty'
    });
  } finally {
    await Promise.all([
      session1.close(),
      session2.close(),
      session3.close()
    ]);
  }
};

export const GET = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
