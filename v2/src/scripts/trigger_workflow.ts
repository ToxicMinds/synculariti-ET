import './load-env';
import { createServiceClient } from '../lib/supabase-server';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createServiceClient();

const DEMO_TENANT_ID = 'f039714b-8276-4733-8172-58b049bd9163';
const MANAGER_PHONE = '421904855155'; // Wife's phone
const SENDER_PHONE = '421904855155';  // Husband's phone

async function run() {
  const type = process.argv[2];
  const targetPhone = process.argv[3] || MANAGER_PHONE;

  if (!type || !['po', 'audit', 'pos'].includes(type)) {
    console.log('Usage: npx tsx src/scripts/trigger_workflow.ts <po|audit|pos> [phone_number]');
    console.log(`Default phone number (Wife/Manager): ${MANAGER_PHONE}`);
    console.log(`Alternative phone number (Husband/Sender): ${SENDER_PHONE}`);
    process.exit(1);
  }

  console.log(`Initializing trigger for workflow: ${type.toUpperCase()} to ${targetPhone}...`);

  // Fetch API key for the tenant to link to the outbox record
  const { data: apiKey, error: apiKeyError } = await supabase
    .from('api_keys')
    .select('id')
    .eq('tenant_id', DEMO_TENANT_ID)
    .limit(1)
    .single();

  if (apiKeyError || !apiKey) {
    console.error('❌ Could not find API key for demo tenant.');
    process.exit(1);
  }

  interface WorkflowPayload {
    type: string;
    name: string;
    options: string[];
    metadata: Record<string, string | number | undefined>;
  }

  let payload: WorkflowPayload = {} as WorkflowPayload;
  let webhookUrl = 'https://synculariti-et.vercel.app/api/whatsapp/webhook';
  let webhookSecret = 'local-development-secret-key-12345';

  if (type === 'po') {
    // 1. Create a dummy PO
    const { data: location } = await supabase
      .from('locations')
      .select('id')
      .eq('tenant_id', DEMO_TENANT_ID)
      .limit(1)
      .single();

    if (!location) {
      console.error('❌ Location not found for tenant.');
      process.exit(1);
    }

    const { data: newPo, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        tenant_id: DEMO_TENANT_ID,
        location_id: location.id,
        status: 'SUBMITTED',
        total_amount: 1250,
        currency: 'EUR'
      })
      .select('id')
      .single();

    if (poError || !newPo) {
      console.error('❌ Failed to create dummy Purchase Order:', poError?.message);
      process.exit(1);
    }

    payload = {
      type: 'poll',
      name: `Approve Purchase Order for EUR 1,250?`,
      options: ['Approve', 'Reject', 'Modify'],
      metadata: {
        poId: newPo.id
      }
    };
    console.log(`Created dummy PO with ID: ${newPo.id}`);

  } else if (type === 'audit') {
    // 2. Fetch a transaction to audit
    const { data: tx } = await supabase
      .from('transactions')
      .select('id, amount, category')
      .eq('tenant_id', DEMO_TENANT_ID)
      .limit(1)
      .single();

    if (!tx) {
      console.error('❌ No transactions found to audit.');
      process.exit(1);
    }

    payload = {
      type: 'poll',
      name: `Audit Alert: Transaction for EUR ${tx.amount} (${tx.category}) has category anomaly. Proceed?`,
      options: ['Approve Anyway', 'Request Re-upload', 'Reject Expense'],
      metadata: {
        transactionId: tx.id
      }
    };
    console.log(`Using transaction ID: ${tx.id}`);

  } else if (type === 'pos') {
    // 3. Fetch location
    const { data: location } = await supabase
      .from('locations')
      .select('id, name')
      .eq('tenant_id', DEMO_TENANT_ID)
      .limit(1)
      .single();

    if (!location) {
      console.error('❌ Location not found.');
      process.exit(1);
    }

    payload = {
      type: 'poll',
      name: `POS Alert: Cash register discrepancy of EUR 150 detected at ${location.name}. Resolve?`,
      options: ['Log as Shrinkage', 'Recount Required', 'Deduct from Register'],
      metadata: {
        amount: 150,
        locationId: location.id
      }
    };
    console.log(`Using location ID: ${location.id} (${location.name})`);
  }

  // Insert PENDING record into outbox
  const { data: outbox, error: outboxError } = await supabase
    .from('whatsapp_outbox')
    .insert({
      tenant_id: DEMO_TENANT_ID,
      api_key_id: apiKey.id,
      recipient_phone: targetPhone,
      payload,
      status: 'PENDING',
      webhook_url: webhookUrl,
      webhook_secret: webhookSecret
    })
    .select('id')
    .single();

  if (outboxError || !outbox) {
    console.error('❌ Failed to insert outbox record:', outboxError?.message);
    process.exit(1);
  }

  console.log(`\n🎉 Workflow queued successfully!`);
  console.log(`Outbox ID: ${outbox.id}`);
  console.log(`Recipient: ${targetPhone}`);
  console.log(`Payload:`, JSON.stringify(payload, null, 2));
  console.log(`\nIf the Supabase process-outbox edge function is listening, the WhatsApp message will be sent immediately.`);
  console.log(`You can view the action-link web bridge at:`);
  console.log(`http://localhost:3000/action/${outbox.id}`);
}

run().catch(console.error);
