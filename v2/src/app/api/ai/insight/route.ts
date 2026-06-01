import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { withTestHandler } from '@/lib/withTestHandler';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';
import { getErrorMessage } from '@/lib/utils';
import { queryPriceIntelligence, queryTimingPatterns, queryWasteRisk } from '@/lib/insight-queries';
import type { InsightFinding } from '@/lib/insight-queries';

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

    // Skip LLM narration for low-impact timing-only findings
    const isTrivialTiming = best.type === 'timing' && best.impact < 50;

    // Try LLM narration; fall back to template articulation
    if (!isTrivialTiming) {
      try {
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
          const result = await callGroq('llama-3.3-70b-versatile', [
            {
              role: 'system',
              content: `You are a restaurant consultant advising a Slovak restaurant owner — direct and practical.

Given ONE structured finding below, write 1-2 sentences of actionable advice.

RULES:
- Lead with the action, never with a day name ("On Saturday...")
- Use specific numbers only to drive the point home
- Never ask rhetorical questions
- For price: "You're overpaying for [X] at [vendor]. Switch to [cheaper vendor] to save €[Y]/unit."
- For timing: "Biggest opportunity: [weekend vs weekday difference]. Schedule purchases on [cheaper day] to save ~€[Z]/trip."
- For waste: "Spoilage alert: [ingredient] (bought on [day]) has high waste risk. Reduce order by 30% or buy earlier in the week."
- Sound like you're across the table giving advice, not reading a spreadsheet`
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
            temperature: 0.7,
            max_tokens: 200,
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
          error: getErrorMessage(apiErr)
        });
      }
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
      error: getErrorMessage(e)
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

export const GET = withTestHandler(handler);
