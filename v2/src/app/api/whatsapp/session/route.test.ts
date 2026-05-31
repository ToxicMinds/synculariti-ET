import { GET } from './route';

const mockGetSessionStatus = jest.fn();

jest.mock('@/lib/create-openwa-client', () => ({
  createOpenWAClient: jest.fn(() => ({
    getSessionStatus: mockGetSessionStatus,
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

describe('WhatsApp Session API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionStatus.mockReset();
  });

  it('returns session status when gateway is connected', async () => {
    mockGetSessionStatus.mockResolvedValue({ status: 'CONNECTED' });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.status).toBe('CONNECTED');
    expect(body.session.id).toBe('synculariti-bot');
  });

  it('returns 500 when gateway check fails', async () => {
    mockGetSessionStatus.mockRejectedValue(new Error('Gateway unreachable'));
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Session check failed');
  });
});
