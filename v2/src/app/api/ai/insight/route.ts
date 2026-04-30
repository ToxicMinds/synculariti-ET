import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('householdId');
  
  if (!householdId) {
    return NextResponse.json({ error: 'householdId is required' }, { status: 400 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  const session = driver.session();
  try {
    const merchantResult = await session.run(`
      MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction {household_id: $householdId})
      WITH m.name AS merchant, count(t) AS visits, sum(t.amount) AS total
      ORDER BY visits DESC
      LIMIT 15
      RETURN collect({merchant: merchant, visits: toInteger(visits), total: total}) AS topMerchants
    `, { householdId });
    
    const categoryResult = await session.run(`
      MATCH (t:Transaction {household_id: $householdId})
      WHERE t.category IS NOT NULL
      WITH t.category AS category, count(t) AS count, sum(t.amount) AS total
      ORDER BY total DESC
      RETURN collect({category: category, count: toInteger(count), total: total}) AS categories
    `, { householdId });

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
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a sharp, caring financial advisor for a Slovak-based household.
IMPORTANT CONTEXT: The merchant data may be unreliable — many expenses are manually entered with product names (e.g. "Kuracia šunka") instead of store names. Treat the CATEGORY breakdown as the ground truth for spending patterns. Use merchant names only for anecdotes, never for totals.
Give ONE focused, actionable insight in 2 sentences max. Be specific with category amounts. Avoid generic advice.`
          },
          {
            role: "user",
            content: `Category breakdown (USE THIS AS GROUND TRUTH): ${categorySummary || 'No category data yet'}.
Top merchants by visits (treat as anecdotal only — names may be product descriptions, not stores): ${merchantSummary || 'No merchant data'}.
Give one sharp, category-focused insight.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    const aiData = await groqRes.json();
    if (aiData.error) {
      console.error("Groq API Error:", aiData.error);
    }
    const insightText = aiData.choices?.[0]?.message?.content || 
      (aiData.error ? `Groq Error: ${aiData.error.message}` : "Your spending patterns are being analyzed. Sync your transactions to see personalized insights.");

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
