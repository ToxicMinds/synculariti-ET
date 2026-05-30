import './load-env';
import { createServiceClient } from '../lib/supabase-server';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createServiceClient();

const TENANT_ID = 'e3b20277-a2c2-4bee-a69d-aa9f945486d3';

const USERS = [
  { name: 'Nik', phone: '421904855155' },
  { name: 'Prasanth', phone: '421944016820' },
  { name: 'Yoki', phone: '421951153761' },
];

const SCENARIOS = [
  { name: 'Approve PO #PO-2026-042 for EUR 1,250 from Metro', options: ['Approve', 'Reject', 'Request Changes'] },
  { name: 'Audit Alert: Transaction #TXN-123 anomaly detected (EUR 221.47)', options: ['Approve Anyway', 'Request Re-upload', 'Reject Expense'] },
  { name: 'POS Alert: Cash discrepancy EUR 75 at Košice - Hlavná', options: ['Log as Shrinkage', 'Recount Required', 'Deduct from Register'] },
];

async function run() {
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .limit(1)
    .single();

  if (!apiKey) {
    console.error('No API key found for tenant');
    process.exit(1);
  }

  let inserted = 0;
  for (const user of USERS) {
    for (const scenario of SCENARIOS) {
      const { data, error } = await supabase.rpc('insert_whatsapp_outbox_v2', {
        p_tenant_id: TENANT_ID,
        p_recipient_phone: user.phone,
        p_payload: {
          type: 'poll',
          name: scenario.name,
          options: scenario.options,
          metadata: {
            recipientName: user.name,
            source: 'seed-test',
          },
        },
        p_api_key_id: apiKey.id,
        p_webhook_url: null,
        p_webhook_secret: null,
      });

      if (error) {
        console.error(`Failed for ${user.name} / ${scenario.name}: ${error.message}`);
      } else {
        inserted++;
        const outboxId = data?.[0]?.id ?? 'unknown';
        console.log(`${user.name}: ${scenario.name} (outbox: ${outboxId})`);
      }
    }
  }

  console.log(`\nDone. Inserted ${inserted} outbox records.`);
}

run().catch(console.error);
