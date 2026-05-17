import { callGroq, GroqMessage } from './groq';
import { GROQ_ERRORS } from './types';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the server-side logger to prevent writing actual telemetry during unit tests
jest.mock('./logger-server', () => {
  return {
    ServerLogger: {
      system: jest.fn().mockResolvedValue(undefined)
    }
  };
});

describe('callGroq (Phase 2: Contract Revision)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.GROQ_API_KEY = 'test-api-key';
  });

  const mockMessages: GroqMessage[] = [
    { role: 'user', content: 'Hello' }
  ];

  it('returns clean string content on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hi there!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'llama-3.3-70b-versatile'
      })
    });

    const result = await callGroq('llama-3.3-70b-versatile', mockMessages);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        },
        body: expect.any(String)
      })
    );
    expect(result.content).toBe('Hi there!');
    expect(result.usage.total_tokens).toBe(15);
  });

  it('passes options and json mode correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"status":"ok"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        model: 'llama-3.3-70b-versatile'
      })
    });

    const options = {
      temperature: 0.1,
      max_tokens: 100
    };

    const result = await callGroq('llama-3.3-70b-versatile', mockMessages, options);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"temperature":0.1')
      })
    );
    expect(result.content).toBe('{"status":"ok"}');
  });

  it('throws a descriptive error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'Rate limit exceeded' }
      })
    });

    await expect(callGroq('llama-3.3-70b-versatile', mockMessages))
      .rejects
      .toThrow('Rate limit exceeded');
  });

  it('throws an error if GROQ_API_KEY is not set', async () => {
    delete process.env.GROQ_API_KEY;

    let error: Error | null = null;
    try {
      await callGroq('llama-3.3-70b-versatile', mockMessages);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toBe(GROQ_ERRORS.MISSING_API_KEY);
  });

  it('throws an error if the response content is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      })
    });

    let error: Error | null = null;
    try {
      await callGroq('llama-3.3-70b-versatile', mockMessages);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toBe(GROQ_ERRORS.EMPTY_RESPONSE);
  });
});
