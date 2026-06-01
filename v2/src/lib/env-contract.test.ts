import fs from 'fs';
import path from 'path';

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'GROQ_API_KEY',
  'NEO4J_URI',
  'NEO4J_USER',
  'NEO4J_PASSWORD',
  'CRON_SECRET',
  'OPENWA_API_KEY',
  'OPENWA_GATEWAY_URL',
  'SIDEARM_HMAC_SECRET',
  'ENABLE_BANKING_APP_ID',
  'ENABLE_BANKING_APP_SECRET',
  'ENABLE_BANKING_BASE_URL',
];

describe('Environment Variables Contract', () => {
  test('every required env var is declared in .env.example', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../.env.example'),
      'utf-8',
    );
    for (const v of REQUIRED_ENV_VARS) {
      expect(content).toMatch(new RegExp(`^#?${v}=`, 'm'));
    }
  });
});
