import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { ServerLogger } from '@/lib/logger-server';

export const POST = withAuth(async (req: Request) => {
  const { spent, budget, daysElapsed, daysInMonth, history } = await req.json();
  
  // V-24: Input Validation
  if (!daysInMonth || daysElapsed === undefined || spent === undefined) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  if (daysElapsed <= 0) {
    // Return early or provide a safe default for math forecast
    return NextResponse.json({ 
      success: true, 
      aiForecast: "Insufficient data for AI forecast. Please wait at least 24 hours.",
      mathForecast: spent 
    });
  }
  
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
            content: "You are a financial forecasting expert. Calculate an AI-adjusted forecast based on current spend and historical patterns. Be concise."
          },
          {
            role: "user",
            content: `Month so far: Spent €${spent} out of €${budget} budget. Days elapsed: ${daysElapsed}/${daysInMonth}. Recent history summary: ${JSON.stringify(history)}. Predict the end-of-month total and tell us if we are safe or in danger.`
          }
        ],
        temperature: 0.3
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

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Forecasting failed';
    ServerLogger.system('ERROR', 'AI', 'Forecasting route failed', { error: errorMsg });
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
});
