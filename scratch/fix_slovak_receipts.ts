
import { createClient } from '@supabase/supabase-js';
import { Groq } from 'groq-sdk';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env from v2/.env.local
dotenv.config({ path: path.resolve(process.cwd(), 'v2/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const groqKey = process.env.GROQ_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const groq = new Groq({ apiKey: groqKey });

async function fixRetroactively() {
  console.log('🚀 Starting Retroactive Fix for "Slovak Receipt" entries...');

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, description')
    .eq('description', 'Slovak Receipt');

  if (error) {
    console.error('Failed to fetch expenses:', error);
    return;
  }

  console.log(`🔍 Found ${expenses.length} entries to fix.`);

  for (const expense of expenses) {
    // Fetch items for this expense
    const { data: items, error: itemError } = await supabase
      .from('receipt_items')
      .select('name')
      .eq('expense_id', expense.id);

    if (itemError || !items || items.length === 0) {
      console.log(`⚠️  No items found for expense ${expense.id}, skipping.`);
      continue;
    }

    const itemNames = items.map(i => i.name).join(', ');
    
    // Ask Groq to infer the store
    const prompt = `Based on these items from a Slovak receipt: "${itemNames}", what is the most likely store name (e.g., Lidl, Tesco, Billa, Shell, Pharmacy)? Return ONLY the name.`;
    
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
    });

    const inferredStore = completion.choices[0]?.message?.content?.trim();
    if (inferredStore && inferredStore.length < 50) {
      console.log(`✅ Fixed: "${itemNames.substring(0, 30)}..." -> ${inferredStore}`);
      
      await supabase
        .from('expenses')
        .update({ description: inferredStore })
        .eq('id', expense.id);
    }
  }

  console.log('✨ Retroactive fix complete!');
}

fixRetroactively();
