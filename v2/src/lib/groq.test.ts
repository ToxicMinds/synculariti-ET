import { callGroq, GroqMessage } from './groq';

const mockCreate = jest.fn();

// Mock the groq-sdk
jest.mock('groq-sdk', () => {
    return jest.fn().mockImplementation(() => {
        return {
            chat: {
                completions: {
                    create: mockCreate
                }
            }
        };
    });
});

describe('callGroq (Phase 2: Contract Revision)', () => {
    beforeEach(() => {
        mockCreate.mockReset();
        process.env.GROQ_API_KEY = 'test-api-key';
    });

    const mockMessages: GroqMessage[] = [
        { role: 'user', content: 'Hello' }
    ];

    it('returns clean string content on success', async () => {
        mockCreate.mockResolvedValueOnce({
            choices: [{ message: { content: 'Hi there!' } }]
        });

        const result = await callGroq('llama-3.3-70b-versatile', mockMessages);
        
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            model: 'llama-3.3-70b-versatile',
            messages: mockMessages,
        }));
        expect(result).toBe('Hi there!');
    });

    it('passes options and json mode correctly', async () => {
        mockCreate.mockResolvedValueOnce({
            choices: [{ message: { content: '{"status":"ok"}' } }]
        });

        const options = {
            temperature: 0.1,
            response_format: { type: 'json_object' as const }
        };

        const result = await callGroq('llama-3.3-70b-versatile', mockMessages, options);
        
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            response_format: { type: 'json_object' }
        }));
        expect(result).toBe('{"status":"ok"}');
    });

    it('throws a descriptive error on API failure', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

        await expect(callGroq('llama-3.3-70b-versatile', mockMessages))
            .rejects
            .toThrow('Rate limit exceeded');
    });

    it('throws an error if GROQ_API_KEY is not set', async () => {
        delete process.env.GROQ_API_KEY;

        await expect(callGroq('llama-3.3-70b-versatile', mockMessages))
            .rejects
            .toThrow('GROQ_API_KEY not configured');
    });

    it('throws an error if the response content is empty', async () => {
        mockCreate.mockResolvedValueOnce({
            choices: [{ message: { content: '' } }]
        });

        await expect(callGroq('llama-3.3-70b-versatile', mockMessages))
            .rejects
            .toThrow('Empty response from Groq');
    });
});
