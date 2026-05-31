import { GET } from './route';

describe('GET /api/health — Phase 1 Security Hardening', () => {
  it('should return 200 status ok without exposing Supabase or Neo4j details', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();

    // Should NOT expose internal infrastructure details
    expect(body).not.toHaveProperty('checks.supabase');
    expect(body).not.toHaveProperty('checks.neo4j');
    expect(body).not.toHaveProperty('checks');
  });
});
