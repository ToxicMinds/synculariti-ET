import { ServerLogger } from '@/lib/logger-server';
import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';

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

export const GET = withAuth(async (req, { tenantId }) => {
  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  const session = driver.session();
  try {
    const merchantResult = await session.run(`
      MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction {tenant_id: $tenantId})
      WITH m.name AS merchant, count(t) AS visits, sum(t.amount) AS total
      ORDER BY visits DESC
      LIMIT 15
      RETURN collect({merchant: merchant, visits: toInteger(visits), total: total}) AS topMerchants
    `, { tenantId });
    
    const categoryResult = await session.run(`
      MATCH (t:Transaction {tenant_id: $tenantId})
      WHERE t.category IS NOT NULL
      WITH t.category AS category, count(t) AS count, sum(t.amount) AS total
      ORDER BY total DESC
      RETURN collect({category: category, count: toInteger(count), total: total}) AS categories
    `, { tenantId });

    const facts = (merchantResult.records[0]?.get('topMerchants') || []) as Neo4jMerchantFact[];
    const categories = (categoryResult.records[0]?.get('categories') || []) as Neo4jCategoryFact[];

    // Fallback logic if Groq is missing or fails
    const generateFallbackInsight = () => {
      if (categories.length > 0) {
        const topCat = categories[0];
        return `💡 Financial Insight: Your highest operating expense is ${topCat.category} at €${Number(topCat.total).toFixed(2)}. ${facts.length > 0 ? `You have high frequency with ${facts[0].merchant}.` : 'Consider auditing this category for optimization.'}`;
      }
      return "💡 System Intelligence: Analyzing your spending patterns. Add more transactions to unlock deeper B2B insights.";
    };

    if (!process.env.GROQ_API_KEY) {
      ServerLogger.system('WARN', 'AI', 'GROQ_API_KEY missing 2014 using deterministic fallback', {});
      return NextResponse.json({ 
        success: true, 
        insight: generateFallbackInsight(),
        facts,
        categories
      });
    }

    // Build context for Groq
    const merchantSummary = facts
      .map((f: Neo4jMerchantFact) => {
        const visits = typeof f.visits === 'object' && f.visits !== null ? (f.visits as { low: number }).low : f.visits;
        return `${f.merchant}: ${visits} visits, €${Number(f.total).toFixed(2)}`;
      })
      .join('; ');

    const categorySummary = categories
      .slice(0, 6)
      .map((c: Neo4jCategoryFact) => `${c.category}: €${Number(c.total).toFixed(2)}`)
      .join('; ');

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are a sharp, caring financial advisor for a Slovak-based tenant.
  Give ONE focused, actionable insight in 2 sentences max. Be specific with category amounts. Avoid generic advice.`
            },
            {
              role: "user",
              content: `Category breakdown: ${categorySummary || 'No data'}.
  Top merchants: ${merchantSummary || 'No data'}.`
            }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      });

      if (!groqRes.ok) throw new Error("Groq API error");

      const aiData = await groqRes.json();
      const insightText = aiData.choices?.[0]?.message?.content || generateFallbackInsight();

      return NextResponse.json({ 
        success: true, 
        insight: insightText,
        facts,
        categories
      });
    } catch (apiErr: unknown) {
      ServerLogger.system('ERROR', 'AI', 'Groq API error 2014 using fallback', { error: apiErr instanceof Error ? apiErr.message : String(apiErr) });
      return NextResponse.json({ 
        success: true, 
        insight: generateFallbackInsight(),
        facts,
        categories
      });
    }

  } catch (e: unknown) {
    ServerLogger.system('ERROR', 'AI', 'AI Insight core error', { error: e instanceof Error ? e.message : String(e) });
    // Even if Neo4j fails, we try a soft fallback if possible, or a clean error
    return NextResponse.json({ 
      success: true, 
      insight: "💡 Intelligence Hub: Syncing your financial graph. Insights will appear shortly.",
      facts: [],
      categories: []
    });
  } finally {
    await session.close();
  }
});
