import { ServerLogger } from '@/lib/logger-server';
import { NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';
import { createClient } from '@/lib/supabase-server';
import { parseEkasaMetadata } from '@/lib/ekasa-parser';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(req: Request) {
  const supabase = await createClient();
  
  // 1. Verify Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ekasaData, categories } = await req.json();

    if (!ekasaData) {
      return NextResponse.json({ error: 'Missing eKasa data' }, { status: 400 });
    }

    // 1. EXTRACT GROUND TRUTH FROM EKASA JSON (DO NOT LET AI TOUCH FINANCIALS)
    const metadata = parseEkasaMetadata(ekasaData);

    // 2. ASK AI FOR CATEGORIZATION AND STORE INFERENCE (IF NEEDED)
    const needsStoreInference = metadata.store === 'Slovak Receipt';
    const systemPrompt = `
      You are a specialized financial analyst for the Slovak market.
      I will provide a list of items from a receipt.
      ${needsStoreInference ? 'IDENTIFY THE SPECIFIC STORE BRAND from these items. Look for store-brand products or item names to "fingerprint" the retailer (e.g., "Dr.Max" instead of just "Pharmacy", "Lidl" instead of "Groceries").' : ''}
      Normalize item names (e.g., "Kup. sunka 100g" -> "Šunka").
      Assign a CATEGORY from this list: ${categories?.join(', ') || 'Groceries, Dining Out, Transport, Other'}.
      
      RETURN JSON:
      {
        ${needsStoreInference ? '"inferredStore": "Specific Brand Name",' : ''}
        "items": [
          { "name": "Normalized Name", "category": "Category" }
        ]
      }
    `;

    const userPrompt = `Analyze these items: ${metadata.items.map((i: any) => i.originalName).join(', ')}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const aiParsed = JSON.parse(content);
    const aiItems = aiParsed.items || [];
    const finalStore = (needsStoreInference && aiParsed.inferredStore) 
      ? aiParsed.inferredStore 
      : metadata.store;

    // Log for auditing (The "Black Site" Standard)
    const { Logger } = await import('@/lib/logger');
    Logger.system('INFO', 'AI', 'Merchant Extraction Detail', {
      dic: metadata.dic,
      rawStore: metadata.store,
      inferredStore: aiParsed.inferredStore,
      finalStore,
      itemCount: metadata.items.length
    });

    // 3. MERGE AI CATEGORIES WITH ORIGINAL PRICES (GROUND TRUTH)
    const mergedItems = metadata.items.map((orig: any, idx: number) => ({
      name: aiItems[idx]?.name || orig.originalName,
      amount: orig.amount,
      category: aiItems[idx]?.category || 'Others'
    }));

    return NextResponse.json({
      store: finalStore,
      date: metadata.date,
      total: metadata.total,
      items: mergedItems,
      ico: metadata.ico,
      receiptNumber: metadata.receiptNumber,
      transactedAt: metadata.transactedAt,
      vatDetail: metadata.vatDetail
    });

  } catch (error: any) {
    ServerLogger.system('ERROR', 'AI', 'Receipt AI parse error', { error: String(error) });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
