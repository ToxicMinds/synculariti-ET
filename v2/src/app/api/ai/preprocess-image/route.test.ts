import { POST } from './route';
import { createMockAuthContext } from '@/lib/test-utils';

jest.mock('@/lib/image-preprocessor', () => ({
  preprocessImage: jest.fn(),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

import { preprocessImage } from '@/lib/image-preprocessor';

const mockContext = createMockAuthContext();

describe('POST /api/ai/preprocess-image', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for missing image field', async () => {
    const req = new Request('http://localhost/api/ai/preprocess-image', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(req, mockContext);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Validation failed');
  });

  it('returns 422 when preprocessing fails', async () => {
    (preprocessImage as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Invalid image data',
    });

    const req = new Request('http://localhost/api/ai/preprocess-image', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/png;base64,bad-data' }),
    });

    const response = await POST(req, mockContext);
    expect(response.status).toBe(422);
  });

  it('returns 200 with processed image data on success', async () => {
    (preprocessImage as jest.Mock).mockResolvedValue({
      success: true,
      image: 'data:image/webp;base64,processed',
      width: 800,
      height: 600,
      originalSize: 100000,
      compressedSize: 25000,
      originalFormat: 'jpeg',
    });

    const req = new Request('http://localhost/api/ai/preprocess-image', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQ...' }),
    });

    const response = await POST(req, mockContext);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.image).toContain('image/webp');
    expect(body.width).toBe(800);
    expect(body.compressedSize).toBe(25000);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new Request('http://localhost/api/ai/preprocess-image', {
      method: 'POST',
      body: 'not-json',
    });

    const response = await POST(req, mockContext);
    expect(response.status).toBe(500);
  });
});
