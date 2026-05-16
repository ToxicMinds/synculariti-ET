import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { ForecastRequestSchema } from '@/lib/validations/schemas';
import { SecureHandler } from '@/lib/types/api';

const handler: SecureHandler = async (req, context) => {
  try {
    const body = await req.json();
    
    // Validation: 400 Bad Request
    const parsed = ForecastRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Validation failed', 'AI', 'Invalid forecast request', {
        status: 400,
        details: parsed.error.issues
      });
    }

    const { spent, budget, daysElapsed, daysInMonth, history } = parsed.data;

    // Early return for insufficient data (avoid divide-by-zero or low-fidelity AI)
    if (daysElapsed <= 0) {
      return NextResponse.json({ 
        success: true, 
        aiForecast: "Insufficient data for AI forecast. Please wait at least 24 hours.",
        mathForecast: spent 
      });
    }
    
    // Mathematical baseline
    const mathForecast = (spent / daysElapsed) * daysInMonth;

    // AI Refinement
    const result = await callGroq("llama-3.3-70b-versatile", [
      {
        role: "system",
        content: "You are a financial forecasting expert. Calculate an AI-adjusted forecast based on current spend and historical patterns. Be concise."
      },
      {
        role: "user",
        content: `Month so far: Spent €${spent} out of €${budget} budget. Days elapsed: ${daysElapsed}/${daysInMonth}. Recent history summary: ${JSON.stringify(history)}. Predict the end-of-month total and tell us if we are safe or in danger.`
      }
    ], { 
      temperature: 0.3,
      cacheKey: `forecast-${spent}-${daysElapsed}-${daysInMonth}` 
    });

    return NextResponse.json({ 
      success: true, 
      aiForecast: result.content,
      mathForecast: mathForecast,
      usage: result.usage
    });

  } catch (e: unknown) {
    return apiError(e, 'AI', 'Forecasting route failed', { retryable: true });
  }
};

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
