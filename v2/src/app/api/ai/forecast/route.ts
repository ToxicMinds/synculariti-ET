import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';

export const POST = withAuth(async (req, { tenantId }) => {
  const { spent, budget, daysElapsed, daysInMonth, history } = await req.json();
  
  try {
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
            content: "You are a financial forecasting expert. Calculate an AI-adjusted forecast based on current spend and historical patterns. Be concise."
          },
          {
            role: "user",
            content: `Month so far: Spent €${spent} out of €${budget} budget. Days elapsed: ${daysElapsed}/${daysInMonth}. Recent history summary: ${JSON.stringify(history)}. Predict the end-of-month total and tell us if we are safe or in danger.`
          }
        ],
        temperature: 0.5
      })
    });

    const aiData = await groqRes.json();
    const prediction = aiData.choices?.[0]?.message?.content || "";
    
    // Simple math fallback
    const mathForecast = (spent / daysElapsed) * daysInMonth;

    return NextResponse.json({ 
      success: true, 
      aiForecast: prediction,
      mathForecast: mathForecast
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
});
