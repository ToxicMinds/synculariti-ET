import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';

export async function GET(req: Request) {
  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  const session = driver.session();
  try {
    // Pull ALL merchants (no LIMIT), plus category distribution and time patterns
    const merchantResult = await session.run(`
      MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction)
      WITH m.name AS merchant, count(t) AS visits, sum(t.amount) AS total
      ORDER BY visits DESC
      LIMIT 15
      RETURN collect({merchant: merchant, visits: toInteger(visits), total: total}) AS topMerchants
    `);
    
    const categoryResult = await session.run(`
      MATCH (t:Transaction)
      WHERE t.category IS NOT NULL
      WITH t.category AS category, count(t) AS count, sum(t.amount) AS total
      ORDER BY total DESC
      RETURN collect({category: category, count: toInteger(count), total: total}) AS categories
    `);

    const facts = merchantResult.records[0]?.get('topMerchants') || [];
    const categories = categoryResult.records[0]?.get('categories') || [];

    // Build a rich context string for Groq — all merchants + category breakdown
    const merchantSummary = facts
      .map((f: any) => {
        const visits = typeof f.visits === 'object' && f.visits !== null ? f.visits.low : f.visits;
        return `${f.merchant}: ${visits} visits, €${Number(f.total).toFixed(2)}`;
      })
      .join('; ');

    const categorySummary = categories
      .slice(0, 6)
      .map((c: any) => {
        return `${c.category}: €${Number(c.total).toFixed(2)}`;
      })
      .join('; ');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a sharp, witty, and caring financial advisor for a Slovak-based family household. 
You analyze spending patterns across ALL merchants and categories — not just the top 3.
Give ONE focused, actionable insight in 2 sentences max. Be specific with amounts where useful.
Avoid generic advice like "consider saving more." Focus on patterns visible in the data.`
          },
          {
            role: "user",
            content: `Full merchant history: ${merchantSummary || 'No data yet'}.
Category breakdown: ${categorySummary || 'No data yet'}.
Give us one sharp insight.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    const aiData = await groqRes.json();
    const insightText = aiData.choices?.[0]?.message?.content || 
      "Your spending patterns are being analyzed. Sync your transactions to see personalized insights.";

    return NextResponse.json({ 
      success: true, 
      insight: insightText,
      facts,
      categories
    });

  } catch (e: any) {
    console.error("AI Insight Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await session.close();
  }
}
