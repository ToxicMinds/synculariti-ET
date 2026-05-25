import { ServerLogger } from './logger-server';
import { GROQ_ERRORS } from './types';

type GroqVisionContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqVisionContent[];
}

export interface GroqUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface GroqResult {
  content: string;
  usage: GroqUsage;
  model: string;
}

export interface GroqOptions {
  temperature?: number;
  max_tokens?: number;
  cacheKey?: string;
}

/**
 * Standardized AI Call with usage tracking
 * Ensures architectural consistency across all AI routes.
 */
export async function callGroq(
  model: string,
  messages: GroqMessage[],
  options: GroqOptions = {}
): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(GROQ_ERRORS.MISSING_API_KEY);
  }

  // Future-proofing: Here we would check the cacheKey against Redis/In-memory
  // if (options.cacheKey && await cache.has(options.cacheKey)) ...

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.max_tokens,
        stream: false
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error?.message || `Groq API Error: ${response.status}`);
    }

    const data = await response.json();
    
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined || content === null || content === '') {
      throw new Error(GROQ_ERRORS.EMPTY_RESPONSE);
    }
    
    const result: GroqResult = {
      content,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0
      },
      model: data.model || model
    };

    // Log high-fidelity usage data for Batch L-M audits
    await ServerLogger.system('INFO', 'Usage', `Model: ${result.model}`, {
      usage: result.usage,
      cacheKey: options.cacheKey
    });

    return result;
  } catch (err) {
    // We re-throw so that the route's apiError handler can catch and format it
    throw err;
  }
}
