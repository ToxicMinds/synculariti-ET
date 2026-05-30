import './load-env';
import { createServiceClient } from '../lib/supabase-server';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createServiceClient();

const TENANT_ID = 'f039714b-8276-4733-8172-58b049bd9163';

const USERS = [
  { name: 'Nik', phone: '421904855155', email: 'nikshanbhag@gmail.com' },
  { name: 'Prasanth', phone: '421944016820', email: 'prasanth.k.ramesh@gmail.com' },
  { name: 'Yoki', phone: '421951153761', email: 'yokheshraja@gmail.com' },
];

const SCENARIOS = [
  { name: 'Approve PO #PO-2026-042 for EUR 1,250 from Metro', options: ['Approve', 'Reject', 'Request Changes'] },
  { name: 'Audit Alert: Transaction #TXN-123 anomaly detected (EUR 221.47)', options: ['Approve Anyway', 'Request Re-upload', 'Reject Expense'] },
  { name: 'POS Alert: Cash discrepancy EUR 75 at Košice - Hlavná', options: ['Log as Shrinkage', 'Recount Required', 'Deduct from Register'] },
];

async function run() {
  // 1. Delete all existing test records for this tenant
  const { data: deleted, error: deleteError } = await supabase
    .from('whatsapp_outbox')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .in('status', ['PENDING', 'SENT', 'COMPLETED'])
    .select('id');
  if (deleteError) {
    console.error('Failed to delete old records:', deleteError.message);
    process.exit(1);
  }
  console.log(`Deleted ${deleted?.length || 0} old outbox records for tenant ${TENANT_ID}.`);

  // 2. Fetch API key
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

  // 3. Insert new records with recipient_email
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
            source: 'live-test',
          },
        },
        p_api_key_id: apiKey.id,
        p_webhook_url: null,
        p_webhook_secret: null,
        p_recipient_email: user.email,
      });

      if (error) {
        console.error(`Failed for ${user.name} / ${scenario.name}: ${error.message}`);
      } else {
        inserted++;
        const outboxId = data?.[0]?.id ?? 'unknown';
        console.log(`${user.name} (${user.email}): ${scenario.name} (outbox: ${outboxId})`);
      }
    }
  }

  console.log(`\nDone. Inserted ${inserted} outbox records.`);

  // 4. Prove it: query via get_pending_approvals_v1 as each user
  // We can't auth as each user from here, but we can show raw counts per email
  const { data: byEmail } = await supabase
    .from('whatsapp_outbox')
    .select('id, recipient_email, recipient_phone, status, payload->>name')
    .eq('tenant_id', TENANT_ID)
    .in('status', ['PENDING', 'SENT']);
  const grouped: Record<string, any[]> = {};
  (byEmail || []).forEach(r => {
    const key = r.recipient_email || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  console.log('\nProof: Records per recipient_email:');
  for (const [email, records] of Object.entries(grouped)) {
    console.log(`  ${email || '<null>'}: ${records.length} pending`);
    records.forEach(r => console.log(`    - ${r.name} (${r.status})`));
  }
}

run().catch(console.error);
