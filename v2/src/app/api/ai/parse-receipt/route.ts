import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { parseEkasaMetadata } from '@/lib/ekasa-parser';
import { getCategoryPrompt } from '@/lib/ai-categories';
import { ReceiptParseRequestSchema, ResilientReceiptSchema } from '@/lib/validations/schemas';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';

interface EkasaItem {
  originalName: string;
  amount: number;
}

const handler: SecureHandler = async (req, context) => {
  const { tenantId } = context.auth || { tenantId: 'fallback' };
  
  try {
    const body = await req.json();
    
    // 1. Validation: 400 Bad Request for the main payload
    const parsedRequest = ReceiptParseRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return apiError('Validation failed', 'AI', 'Invalid receipt parse request', {
        status: 400,
        details: parsedRequest.error.issues
      });
    }

    const { ekasaData, categories } = parsedRequest.data;

    // 2. EXTRACT GROUND TRUTH FROM EKASA JSON
    const rawMetadata = parseEkasaMetadata(ekasaData);

    // 3. THE WASHER: Guarantee type safety for AI and caching
    const metadata = ResilientReceiptSchema.parse(rawMetadata);

    // 4. ASK AI FOR CATEGORIZATION AND STORE INFERENCE
    const needsStoreInference = metadata.store === 'Slovak Receipt';
    const systemPrompt = `
      You are a specialized financial analyst for the Slovak market.
      I will provide a list of items from a receipt.
      ${needsStoreInference ? 'IDENTIFY THE SPECIFIC STORE BRAND from these items. Look for store-brand products or item names to "fingerprint" the retailer.' : ''}
      Normalize item names (e.g., "Kup. sunka 100g" -> "Šunka").
      ${getCategoryPrompt(categories)}
      
      RETURN JSON:
      {
        ${needsStoreInference ? '"inferredStore": "Specific Brand Name",' : ''}
        "items": [
          { "name": "Normalized Name", "category": "Category" }
        ]
      }
    `;

    const userPrompt = `Analyze these items: ${metadata.items.map((i: EkasaItem) => i.originalName).join(', ')}`;

    const result = await callGroq('llama-3.3-70b-versatile', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { 
      temperature: 0.1,
      // Date is now guaranteed to be a string by the ResilientReceiptSchema washer
      cacheKey: `receipt-${metadata.total}-${metadata.items.length}-${metadata.date}`
    });

    const aiParsed = JSON.parse(result.content);
    const aiItems = aiParsed.items || [];
    const finalStore = (needsStoreInference && aiParsed.inferredStore) 
      ? aiParsed.inferredStore 
      : metadata.store;

    // Log for auditing
    ServerLogger.system('INFO', 'AI', 'Merchant Extraction Detail', {
      rawStore: metadata.store,
      inferredStore: aiParsed.inferredStore,
      finalStore,
      itemCount: metadata.items.length
    });

    // 5. MERGE AI CATEGORIES WITH ORIGINAL PRICES (GROUND TRUTH)
    const mergedItems = metadata.items.map((orig: EkasaItem, idx: number) => ({
      name: aiItems[idx]?.name || orig.originalName,
      amount: orig.amount,
      category: aiItems[idx]?.category || 'Others'
    }));

    return NextResponse.json({
      success: true,
      store: finalStore,
      date: metadata.date,
      total: metadata.total,
      items: mergedItems,
      usage: result.usage
    });

  } catch (error: unknown) {
    return apiError(error, 'AI', 'Receipt AI parse error', { retryable: true });
  }
};

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
