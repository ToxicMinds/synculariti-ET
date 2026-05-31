import fs from 'fs';
import path from 'path';

const ROUTE_PATH = path.resolve(__dirname, './route.ts');

describe('GET /api/cron/process-outbox — Phase 1 Security Hardening', () => {
  it('should use timingSafeEqual instead of !== for CRON_SECRET comparison', () => {
    const source = fs.readFileSync(ROUTE_PATH, 'utf8');
    // Must NOT use naive string comparison (timing attack)
    expect(source).not.toMatch(/x-cron-secret.*!==.*cronSecret/);
    // Must use timingSafeEqual (either custom loop or crypto import)
    expect(source).toMatch(/timingSafeEqual/);
  });

  it('should return 401 when CRON_SECRET is missing', async () => {
    const oldSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    // Re-import fresh without mocking heavy deps — just test the auth gate
    jest.resetModules();
    const { GET } = await import('./route');
    const req = new Request('http://localhost/api/cron/process-outbox', {
      headers: { 'x-cron-secret': 'any-secret' },
    });
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');

    process.env.CRON_SECRET = oldSecret;
  });
});
