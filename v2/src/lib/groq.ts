import Groq from 'groq-sdk';

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GroqOptions {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    response_format?: { type: 'json_object' };
}

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
    if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured');
    }

    if (!groqClient) {
        groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groqClient;
}

/**
 * Unified Groq API caller using the `groq-sdk`.
 * Abstracts SDK initialization and payload unwrapping.
 * 
 * @returns The generated string content.
 * @throws An Error with a descriptive message if the request fails or returns empty.
 */
export async function callGroq(
    model: string,
    messages: GroqMessage[],
    options?: GroqOptions
): Promise<string> {
    const client = getGroqClient();

    const payload: any = {
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
    };

    if (options?.max_tokens !== undefined) payload.max_tokens = options.max_tokens;
    if (options?.stream !== undefined) payload.stream = options.stream;
    if (options?.response_format !== undefined) payload.response_format = options.response_format;

    const response = await client.chat.completions.create(payload);
    
    const content = response?.choices?.[0]?.message?.content;
    
    if (!content) {
        throw new Error('Empty response from Groq');
    }

    return content;
}
