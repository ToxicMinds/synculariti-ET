import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  
  // 1. Verify Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Resolve Tenant ID (Server-Side Secure)
  // We call our hardened RPC to get the memoized tenant ID
  const { data: tenantId, error: hError } = await supabase.rpc('get_my_tenant');
  
  if (hError || !tenantId) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

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

    const facts = merchantResult.records[0]?.get('topMerchants') || [];
    const categories = categoryResult.records[0]?.get('categories') || [];

    // Build context for Groq
    const merchantSummary = facts
      .map((f: any) => {
        const visits = typeof f.visits === 'object' && f.visits !== null ? f.visits.low : f.visits;
        return `${f.merchant}: ${visits} visits, €${Number(f.total).toFixed(2)}`;
      })
      .join('; ');

    const categorySummary = categories
      .slice(0, 6)
      .map((c: any) => `${c.category}: €${Number(c.total).toFixed(2)}`)
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

    const aiData = await groqRes.json();
    const insightText = aiData.choices?.[0]?.message?.content || "Your spending patterns are being analyzed.";

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
