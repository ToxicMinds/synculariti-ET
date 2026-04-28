import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';

/**
 * AI Insight Engine: 
 * 1. Pulls raw facts from Neo4j Graph
 * 2. Processes them via Groq AI
 * 3. Returns a "human" insight
 */
export async function GET(req: Request) {
  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  const session = driver.session();
  try {
    // 1. Fetch "Interesting Facts" from the Graph
    const result = await session.run(`
      MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction)
      WITH m.name AS merchant, count(t) AS visits, sum(t.amount) AS total
      ORDER BY visits DESC
      LIMIT 3
      RETURN collect({merchant: merchant, visits: visits, total: total}) AS topMerchants
    `);

    const facts = result.records[0].get('topMerchants');
    
    // 2. Format for Groq
    const factString = facts.map((f: any) => 
      `${f.merchant}: ${f.visits} visits, total €${f.total.toFixed(2)}`
    ).join('; ');

    // 3. Call Groq for "Human Interpretation"
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
            content: "You are a professional, witty, and concise financial advisor for a family household. You look at spending facts and give one punchy insight (1-2 sentences). Be specific and helpful. Language: English."
          },
          {
            role: "user",
            content: `Here are the top spending locations this month from our Neo4j graph: ${factString}. Give us one smart insight.`
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });

    const aiData = await groqRes.json();
    const insightText = aiData.choices?.[0]?.message?.content || "The graph shows stable spending patterns. Keep it up!";

    return NextResponse.json({ 
      success: true, 
      insight: insightText,
      facts: facts // Send back raw facts for the UI if needed
    });

  } catch (e: any) {
    console.error("AI Insight Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await session.close();
  }
}
