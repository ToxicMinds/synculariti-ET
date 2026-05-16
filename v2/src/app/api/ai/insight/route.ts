import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { SecureHandler } from '@/lib/types/api';

interface Neo4jMerchantFact {
  merchant: string;
  visits: number | { low: number };
  total: number;
}

interface Neo4jCategoryFact {
  category: string;
  count: number | { low: number };
  total: number;
}

const getVisits = (v: number | { low: number }): number => {
  return typeof v === 'object' && v !== null ? v.low : v;
};

const handler: SecureHandler = async (_req, context) => {
  const { tenantId } = context.auth || { tenantId: 'fallback' };
  
  const driver = getNeo4jDriver();
  if (!driver) {
    return apiError('Neo4j not configured', 'Sync', 'Graph driver missing', { status: 500 });
  }

  const session = driver.session();
  try {
    const [merchantResult, categoryResult] = await Promise.all([
      session.run(`
        MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction {tenant_id: $tenantId})
        WITH m.name AS merchant, count(t) AS visits, sum(t.amount) AS total
        ORDER BY visits DESC
        LIMIT 15
        RETURN collect({merchant: merchant, visits: toInteger(visits), total: total}) AS topMerchants
      `, { tenantId }),
      session.run(`
        MATCH (t:Transaction {tenant_id: $tenantId})
        WHERE t.category IS NOT NULL
        WITH t.category AS category, count(t) AS count, sum(t.amount) AS total
        ORDER BY total DESC
        RETURN collect({category: category, count: toInteger(count), total: total}) AS categories
      `, { tenantId })
    ]);
    
    const facts = (merchantResult.records[0]?.get('topMerchants') || []) as Neo4jMerchantFact[];
    const categories = (categoryResult.records[0]?.get('categories') || []) as Neo4jCategoryFact[];

    const generateFallbackInsight = () => {
      if (categories.length > 0) {
        const topCat = categories[0];
        const total = typeof topCat.total === 'object' ? 0 : topCat.total;
        return `💡 Financial Insight: Your highest operating expense is ${topCat.category} at €${Number(total).toFixed(2)}. ${facts.length > 0 ? `You have high frequency with ${facts[0].merchant}.` : 'Consider auditing this category for optimization.'}`;
      }
      return "💡 System Intelligence: Analyzing your spending patterns. Add more transactions to unlock deeper B2B insights.";
    };

    // Build context for Groq
    const merchantSummary = facts
      .map((f: Neo4jMerchantFact) => `${f.merchant}: ${getVisits(f.visits)} visits, €${Number(f.total).toFixed(2)}`)
      .join('; ');

    const categorySummary = categories
      .slice(0, 6)
      .map((c: Neo4jCategoryFact) => `${c.category}: €${Number(c.total).toFixed(2)}`)
      .join('; ');

    try {
      const result = await callGroq("llama-3.3-70b-versatile", [
        {
          role: "system",
          content: `You are a sharp, caring financial advisor for a Slovak-based tenant.
Give ONE focused, actionable insight in 2 sentences max. Be specific with category amounts. Avoid generic advice.`
        },
        {
          role: "user",
          content: `Category breakdown: ${categorySummary || 'No data'}. Top merchants: ${merchantSummary || 'No data'}.`
        }
      ], { 
        temperature: 0.7, 
        max_tokens: 200,
        cacheKey: `insight-${tenantId}-${facts.length}-${categories.length}`
      });

      return NextResponse.json({ 
        success: true, 
        insight: result.content,
        facts,
        categories,
        usage: result.usage
      });
    } catch (apiErr: unknown) {
      return NextResponse.json({ 
        success: true, 
        insight: generateFallbackInsight(),
        facts,
        categories
      });
    }

  } catch (e: unknown) {
    return NextResponse.json({ 
      success: true, 
      insight: "💡 Intelligence Hub: Syncing your financial graph. Insights will appear shortly.",
      facts: [],
      categories: []
    });
  } finally {
    await session.close();
  }
};

export const GET = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
