import { NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(req: Request) {
  try {
    const { ekasaData, categories } = await req.json();

    if (!ekasaData) {
      return NextResponse.json({ error: 'Missing eKasa data' }, { status: 400 });
    }

    // 1. EXTRACT GROUND TRUTH FROM EKASA JSON (DO NOT LET AI TOUCH FINANCIALS)
    const receipt = ekasaData.receipt || ekasaData;
    const store = receipt.organizationName || receipt.merchantName || receipt.name || 'Slovak Receipt';
    
    let date = null;
    const rawDate = receipt.createDate || receipt.issueDate || receipt.date || '';
    const dateMatch = String(rawDate).match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) date = dateMatch[0];

    const rawItems = receipt.items || receipt.receiptItems || receipt.lines || [];
    const items = rawItems.map((it: any) => ({
      originalName: it.name || it.itemName || it.description || 'Unknown Item',
      amount: Number(it.itemTotalPrice || it.lineTotal || it.price || it.amount || 0)
    }));

    const total = Number(receipt.totalPrice || receipt.total || items.reduce((acc: number, curr: any) => acc + curr.amount, 0));

    // 2. ASK AI ONLY FOR CATEGORIZATION AND NAME NORMALIZATION
    const systemPrompt = `
      You are a specialized categorizer for a financial app.
      I will provide a list of item names from a Slovak shopping receipt.
      Your job is to:
      1. Normalize the name (e.g., "Kup. sunka 100g" -> "Šunka").
      2. Assign a CATEGORY from this list: ${categories?.join(', ') || 'Groceries, Food, Transport, Shopping, Health, Utilities, Others'}.
      
      RULES:
      - DO NOT add prices.
      - DO NOT change the order of items.
      - Use "Groceries" for supermarket food.
      - Use "Food" for restaurants.
      
      RETURN JSON:
      {
        "items": [
          { "name": "Normalized Name", "category": "Category" }
        ]
      }
    `;

    const userPrompt = `Categorize these items: ${items.map((i: any) => i.originalName).join(', ')}`;

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

    // 3. MERGE AI CATEGORIES WITH ORIGINAL PRICES (GROUND TRUTH)
    const mergedItems = items.map((orig: any, idx: number) => ({
      name: aiItems[idx]?.name || orig.originalName,
      amount: orig.amount,
      category: aiItems[idx]?.category || 'Others'
    }));

    return NextResponse.json({
      store,
      date,
      total,
      items: mergedItems
    });

  } catch (error: any) {
    console.error('Receipt AI Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
